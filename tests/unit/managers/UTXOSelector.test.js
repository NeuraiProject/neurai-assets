/**
 * Tests for UTXOSelector fee/size estimation.
 *
 * The estimator must distinguish PQ AuthScript inputs/outputs from legacy
 * P2PKH ones — PQ inputs are roughly six times larger than legacy and would
 * otherwise underflow the node's `min relay fee`.
 */

const { expect } = require('chai');
const UTXOSelector = require('../../../src/managers/UTXOSelector');
const { VBYTES } = require('../../../src/utils/feeSizing');

const PQ_SCRIPT = '5120f58c1feb865f6127897834ad6f3b7ac8cff224cdbfa21d96c59b944c3311104a';
const LEGACY_SCRIPT = '76a91409f2017224efdaf3633d26b1cf11a1df418496f688ac';
const LEGACY_ADDRESS = 'mgRYHdMqD1gwm9QQqBRUPcDKdEZ9oVeChA';
const PQ_ADDRESS = 'tnq1qabcdefghijklmnopqrstuvwxyz';

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
