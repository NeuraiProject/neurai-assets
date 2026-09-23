/**
 * Tests for UTXOSelector fee/size estimation.
 *
 * The estimator must distinguish PQ AuthScript inputs/outputs from legacy
 * P2PKH ones — PQ inputs are roughly six times larger than legacy and would
 * otherwise underflow the node's `min relay fee`.
 */

const { expect } = require('chai');
const UTXOSelector = require('../../../src/managers/UTXOSelector');
const FeeSizing = require('../../../src/utils/feeSizing');
const { VBYTES } = FeeSizing;
const { ADDR, PQ_ADDR, STRICT_PQ_ADDR, STRICT_PQ_SCRIPT, ECDSA_ADDR, ECDSA_SCRIPT } = require('../../fixtures/addresses');

const PQ_SCRIPT = '5120f58c1feb865f6127897834ad6f3b7ac8cff224cdbfa21d96c59b944c3311104a';
const LEGACY_SCRIPT = '76a91409f2017224efdaf3633d26b1cf11a1df418496f688ac';
const LEGACY_ADDRESS = ADDR[0];
const PQ_ADDRESS = PQ_ADDR[0];

describe('UTXOSelector — fee estimation', () => {
  const selector = new UTXOSelector(() => Promise.resolve(null));

  describe('estimateTransactionSize', () => {
    it('returns the legacy estimate when given counts', () => {
      const size = selector.estimateTransactionSize(1, 3);
      const expected =
        VBYTES.baseTxOverheadBytes +
        VBYTES.legacyInputVbytes +
        3 * VBYTES.legacyOutputBytes;
      expect(size).to.equal(expected);
    });

    it('uses the PQ vbytes when an input UTXO has a PQ script', () => {
      const size = selector.estimateTransactionSize(
        [{ script: PQ_SCRIPT }],
        [LEGACY_ADDRESS, LEGACY_ADDRESS, LEGACY_ADDRESS]
      );
      const expected =
        VBYTES.baseTxOverheadBytes +
        VBYTES.pqInputVbytes +
        3 * VBYTES.legacyOutputBytes +
        VBYTES.segwitMarkerVbytes;
      expect(size).to.equal(expected);
    });

    it('grows linearly with the number of PQ inputs', () => {
      const out = [LEGACY_ADDRESS, LEGACY_ADDRESS, LEGACY_ADDRESS];
      const onePQ = selector.estimateTransactionSize([{ script: PQ_SCRIPT }], out);
      const twoPQ = selector.estimateTransactionSize(
        [{ script: PQ_SCRIPT }, { script: PQ_SCRIPT }],
        out
      );
      const threePQ = selector.estimateTransactionSize(
        [{ script: PQ_SCRIPT }, { script: PQ_SCRIPT }, { script: PQ_SCRIPT }],
        out
      );
      expect(twoPQ - onePQ).to.equal(VBYTES.pqInputVbytes);
      expect(threePQ - twoPQ).to.equal(VBYTES.pqInputVbytes);
    });

    it('falls back to the input address when no script is present', () => {
      const size = selector.estimateTransactionSize(
        [{ address: PQ_ADDRESS }],
        [LEGACY_ADDRESS]
      );
      const expected =
        VBYTES.baseTxOverheadBytes +
        VBYTES.pqInputVbytes +
        VBYTES.legacyOutputBytes +
        VBYTES.segwitMarkerVbytes;
      expect(size).to.equal(expected);
    });

    it('counts a PQ output address as a PQ output', () => {
      const legacyOnly = selector.estimateTransactionSize(
        [{ script: LEGACY_SCRIPT }],
        [LEGACY_ADDRESS]
      );
      const withPQOutput = selector.estimateTransactionSize(
        [{ script: LEGACY_SCRIPT }],
        [PQ_ADDRESS]
      );
      expect(withPQOutput - legacyOnly).to.equal(
        VBYTES.pqOutputBytes - VBYTES.legacyOutputBytes
      );
    });
  });

  describe('address types of neurai-key 5', () => {
    it('sizes a strict PQ v2 input as a PQ spend (was 148 vB before 1.7.0)', () => {
      expect(FeeSizing.estimateInputVbytes({ script: STRICT_PQ_SCRIPT })).to.equal(VBYTES.pqInputVbytes);
      expect(FeeSizing.estimateInputVbytes({ address: STRICT_PQ_ADDR })).to.equal(VBYTES.pqInputVbytes);
    });

    it('sizes a strict ECDSA v3 input with its own constant', () => {
      expect(FeeSizing.estimateInputVbytes({ script: ECDSA_SCRIPT })).to.equal(VBYTES.ecdsaWitnessInputVbytes);
      expect(FeeSizing.estimateInputVbytes({ address: ECDSA_ADDR })).to.equal(VBYTES.ecdsaWitnessInputVbytes);
      // Asset-wrapped v3 prevout.
      expect(FeeSizing.estimateInputVbytes({ script: ECDSA_SCRIPT + 'c00a72766e74054142434445' })).to.equal(
        VBYTES.ecdsaWitnessInputVbytes
      );
    });

    it('counts every witness output as 43 bytes', () => {
      for (const address of [PQ_ADDRESS, STRICT_PQ_ADDR, ECDSA_ADDR]) {
        expect(FeeSizing.estimateOutputBytes(address), address).to.equal(VBYTES.witnessOutputBytes);
      }
      expect(FeeSizing.estimateOutputBytes(LEGACY_ADDRESS)).to.equal(VBYTES.legacyOutputBytes);
    });

    it('sizes asset outputs to v2 / v3 destinations on the 34-byte witness base', () => {
      const legacy = FeeSizing.estimateOutputBytes({ address: LEGACY_ADDRESS, assetName: 'TOKEN' });
      for (const address of [STRICT_PQ_ADDR, ECDSA_ADDR]) {
        expect(FeeSizing.estimateOutputBytes({ address, assetName: 'TOKEN' }) - legacy, address).to.equal(9);
        expect(FeeSizing.assetPayloadBytes({ address, assetName: 'TOKEN' })).to.equal(
          FeeSizing.assetPayloadBytes({ address: LEGACY_ADDRESS, assetName: 'TOKEN' })
        );
      }
    });

    it('adds the segwit marker for any witness input, ECDSA included', () => {
      const size = selector.estimateTransactionSize([{ script: ECDSA_SCRIPT }], [LEGACY_ADDRESS]);
      expect(size).to.equal(
        VBYTES.baseTxOverheadBytes + VBYTES.ecdsaWitnessInputVbytes + VBYTES.legacyOutputBytes + VBYTES.segwitMarkerVbytes
      );
    });

    it('classifies addresses and scripts like the signer', () => {
      expect(FeeSizing.getAddressKind(LEGACY_ADDRESS)).to.equal('p2pkh');
      expect(FeeSizing.getAddressKind(PQ_ADDRESS)).to.equal('authscript');
      expect(FeeSizing.getAddressKind(STRICT_PQ_ADDR)).to.equal('pq');
      expect(FeeSizing.getAddressKind(ECDSA_ADDR)).to.equal('ecdsa');
      expect(FeeSizing.getAddressKind('tnq1qabcdefghijklmnopqrstuvwxyz')).to.equal('unknown');
      expect(FeeSizing.getScriptKind(STRICT_PQ_SCRIPT)).to.equal('pq');
      expect(FeeSizing.isPQAddress(ECDSA_ADDR)).to.equal(false);
      expect(FeeSizing.isPQAddress(STRICT_PQ_ADDR)).to.equal(true);
      expect(FeeSizing.isPQScript(ECDSA_SCRIPT)).to.equal(false);
      expect(FeeSizing.isPQScript(STRICT_PQ_SCRIPT)).to.equal(true);
    });

    it('is published through utils.FeeSizing', () => {
      expect(require('../../../src/utils').FeeSizing).to.equal(FeeSizing);
    });
  });

  describe('estimateFee', () => {
    it('charges substantially more for a PQ input than a legacy one at the same fee rate', () => {
      const out = [LEGACY_ADDRESS, LEGACY_ADDRESS, LEGACY_ADDRESS];
      const feeLegacy = selector.estimateFee([{ script: LEGACY_SCRIPT }], out, 0.015);
      const feePQ = selector.estimateFee([{ script: PQ_SCRIPT }], out, 0.015);
      // PQ inputs are >5x bigger than legacy, so the PQ fee must dominate.
      expect(feePQ).to.be.greaterThan(feeLegacy * 4);
    });

    it('rounds the fee up to 8 decimals', () => {
      const fee = selector.estimateFee(1, 3, 0.015);
      const sats = Math.round(fee * 1e8);
      // No fractional satoshi remains.
      expect(sats / 1e8).to.equal(fee);
    });

    it('matches the legacy 1-input/3-output baseline at the default rate', () => {
      // Catches accidental swings of the legacy heuristic — the previous
      // hardcoded 180/34/10 layout produced this fee at 0.015 XNA/KB.
      const fee = selector.estimateFee(1, 3, 0.015);
      expect(fee).to.be.greaterThan(0);
      // Sanity: the legacy estimate stays well below the PQ estimate.
      const feePQ = selector.estimateFee([{ script: PQ_SCRIPT }], 3, 0.015);
      expect(feePQ).to.be.greaterThan(fee);
    });
  });
});


describe('UTXOSelector — exact insufficient funds errors', () => {
  const { InsufficientFundsError } = require('../../../src/errors');
  for (const asset of [false, true]) {
    for (const scenario of [
      { values: ['10000000000000000', '1'], required: 10000000000000002n,
        availableDisplay: '100000000.00000001', requiredDisplay: '100000000.00000002' },
      { values: ['100000000'], required: 200000000n, availableDisplay: 1, requiredDisplay: 2 },
      { values: [], required: 100000000n, availableDisplay: 0, requiredDisplay: 1 }
    ]) {
      it(`preserves ${asset ? 'asset' : 'XNA'} error fields for ${scenario.required}`, async () => {
        const selector = new UTXOSelector(async () => []);
        selector.getUTXOs = async () => scenario.values.map((satoshis, i) => ({ satoshis, txid: String(i), outputIndex: 0 }));
        selector.getMempoolEntries = async () => [];
        let error;
        try {
          if (asset) await selector.selectAssetUTXOs(['address'], 'TOKEN', undefined, { requiredRaw: scenario.required });
          else await selector.selectBaseCurrencyUTXOs(['address'], undefined, 0, { requiredSats: scenario.required });
        } catch (caught) { error = caught; }
        expect(error).to.be.instanceOf(InsufficientFundsError);
        expect(error.code).to.equal('INSUFFICIENT_FUNDS');
        expect(error.required).to.equal(scenario.requiredDisplay);
        expect(error.available).to.equal(scenario.availableDisplay);
        expect(error.message).to.include(`Required: ${scenario.requiredDisplay}`);
        expect(error.message).to.include(`Available: ${scenario.availableDisplay}`);
      });
    }
  }
  it('reports the original requirement when only the buffer is unfunded', async () => {
    const selector = new UTXOSelector(async () => []);
    selector.getUTXOs = async () => [{ satoshis: '100000000', txid: 'one', outputIndex: 0 }];
    selector.getMempoolEntries = async () => [];
    let error;
    try { await selector.selectBaseCurrencyUTXOs(['address'], 1, 0.1); }
    catch (caught) { error = caught; }
    expect(error).to.be.instanceOf(InsufficientFundsError);
    expect(error.required).to.equal(1);
    expect(error.available).to.equal(1);
    expect(error.message).to.include('+ 10% buffer');
  });
});
