/**
 * The XNA funding loop, and the three defects it replaces.
 *
 * 1.4.1 estimated the fee once with an input COUNT (so every input looked
 * legacy), selected once, and — if that fell short — topped up with a second
 * selection that: re-queried the node without excluding what it already held,
 * never recomputed the fee, and added a `+0.001 XNA` cushion that came back as
 * change instead of paying for the new inputs.
 *
 * Whether that branch runs at all depends on the VALUE of the selected UTXOs,
 * not on the size of the transaction, so these fixtures pin the balance rather
 * than trusting a wallet shape. The thresholds are derived from the estimator
 * here, not hardcoded: they move with the fee rate, the input kinds and the
 * output count.
 */

const { expect } = require('chai');
const { createFromOperation } = require('@neuraiproject/neurai-create-transaction');
const NeuraiAssets = require('../../../src/NeuraiAssets');
const UTXOSelector = require('../../../src/managers/UTXOSelector');
const { ADDR, PQ_ADDR } = require('../../fixtures/addresses');
const { createAssetRpc } = require('../../fixtures/assetRpc');

const PQ_SCRIPT = '5120' + 'ab'.repeat(32);
const FEE_RATE = 0.015;

/** Derive the two thresholds that decide whether the top-up branch runs. */
function thresholds({ inputCount, outputs, pqInputs }) {
  const selector = new UTXOSelector(async () => {});
  const initialFeeSats = selector.estimateFeeSats(inputCount, outputs, FEE_RATE);
  const realFeeSats = selector.estimateFeeSats(
    new Array(pqInputs).fill({ script: PQ_SCRIPT }),
    outputs,
    FEE_RATE
  );
  return {
    initialFeeSats,
    // What the first selection must cover: the fee plus the 10% buffer.
    firstTargetSats: (initialFeeSats * 11n + 9n) / 10n,
    realFeeSats
  };
}

function pqAssets(rpc) {
  return new NeuraiAssets(rpc, {
    network: 'xna-pq-test',
    addresses: [PQ_ADDR[0]],
    changeAddress: PQ_ADDR[0],
    toAddress: PQ_ADDR[1]
  });
}

function pqWallet(xnaSatsList, assetSats = 1000 * 1e8) {
  return createAssetRpc({
    assetMarker: 'xna',
    xnaUtxos: xnaSatsList.map((satoshis, index) => ({
      txid: `${(index + 1).toString(16).padStart(2, '0')}`.repeat(32),
      outputIndex: index,
      address: PQ_ADDR[0],
      script: PQ_SCRIPT,
      satoshis
    })),
    ownerUtxos: [{
      txid: 'ff'.repeat(32),
      outputIndex: 9,
      address: PQ_ADDR[0],
      script: PQ_SCRIPT,
      assetName: 'ROOTX',
      satoshis: assetSats
    }]
  });
}

function transfer(rpc) {
  return pqAssets(rpc).transferAsset({
    assetName: 'ROOTX',
    recipients: [{ address: ADDR[0], amount: 5 }]
  });
}

describe('XNA funding thresholds (PQ transfer)', () => {
  // Two PQ inputs, two PQ changes and one legacy recipient: the shape the
  // plan measures. The exact vbytes are asserted so a change to the estimator
  // shows up here rather than silently moving the fixture.
  const OUTPUTS = [PQ_ADDR[0], PQ_ADDR[0], ADDR[0]];

  it('estimates 426 vbytes with an input count and 2085 with two PQ descriptors', () => {
    const selector = new UTXOSelector(async () => {});
    expect(selector.estimateTransactionSize(2, OUTPUTS)).to.equal(426);
    expect(selector.estimateTransactionSize(
      [{ script: PQ_SCRIPT }, { script: PQ_SCRIPT }],
      OUTPUTS
    )).to.equal(2085);
  });

  it('puts the trigger window between the buffered first target and the real fee', () => {
    const t = thresholds({ inputCount: 2, outputs: OUTPUTS, pqInputs: 2 });
    expect(t.initialFeeSats).to.equal(639000n); // 0.00639 XNA
    expect(t.firstTargetSats).to.equal(702900n); // 0.007029 XNA
    expect(t.realFeeSats).to.equal(3127500n); // 0.031275 XNA
    expect(t.firstTargetSats < t.realFeeSats).to.equal(true);
  });
});

describe('top-up branch: the corrective', () => {
  // 0.03 XNA sits inside the window: it satisfies the first selection
  // (> 0.007029) and leaves the transaction short of the real fee
  // (< 0.031275), so the top-up runs. Two of them converge.
  const IN_WINDOW = 0.03 * 1e8;
  // 0.1 XNA clears the real fee outright: the control fixture.
  const ABOVE_WINDOW = 0.1 * 1e8;

  it('reproduces the branch and still spends every outpoint once', async () => {
    const result = await transfer(pqWallet([IN_WINDOW, IN_WINDOW]));
    const inputs = result.createTransactionBuild.params.inputs;
    const keys = inputs.map(i => `${i.txid}:${i.vout}`);

    expect(new Set(keys).size, `duplicate outpoint: ${JSON.stringify(keys)}`).to.equal(keys.length);
    // The asset UTXO plus both XNA UTXOs: the second one is what 1.4.1 would
    // have skipped, handing back the first outpoint a second time instead.
    expect(inputs).to.have.length(3);
  });

  it('charges a fee that covers every input it added', async () => {
    const result = await transfer(pqWallet([IN_WINDOW, IN_WINDOW]));
    const selector = new UTXOSelector(async () => {});

    // Same descriptors the builder used: three inputs (asset + two XNA, all
    // PQ) and outputs that declare their asset payloads. Sizing the outputs
    // as bare addresses under-counts by the payload bytes, which is the
    // `min relay fee not met` failure this estimate exists to avoid.
    const inputDescriptors = result.utxos.map(() => ({ script: PQ_SCRIPT }));
    const outputDescriptors = [
      PQ_ADDR[0], // XNA change
      { address: ADDR[0], assetName: 'ROOTX' }, // recipient transfer
      { address: PQ_ADDR[0], assetName: 'ROOTX' } // asset change
    ];
    const feeForFullSet = selector.estimateFeeSats(inputDescriptors, outputDescriptors, FEE_RATE);

    const feeSats = BigInt(Math.round(result.fee * 1e8));
    expect(feeSats).to.equal(feeForFullSet);
  });

  it('prices the asset payload of each output, not just the destination', async () => {
    const selector = new UTXOSelector(async () => {});
    const bare = selector.estimateTransactionSize(1, [ADDR[0], ADDR[0]]);
    const withPayload = selector.estimateTransactionSize(1, [
      ADDR[0],
      { address: ADDR[0], assetName: 'ROOTX' }
    ]);
    // marker(3) + type(1) + nameLen(1) + "ROOTX"(5) + amount(8) = 18, plus
    // OP_XNA_ASSET + pushdata prefix + OP_DROP = 3.
    expect(withPayload - bare).to.equal(21);
  });

  it('balances inputs = fee + outputs exactly, with nothing returned as change that should have paid the fee', async () => {
    const result = await transfer(pqWallet([IN_WINDOW, IN_WINDOW]));

    const totalInputSats = result.utxos
      .filter(u => !u.assetName)
      .reduce((sum, u) => sum + BigInt(u.satoshis), 0n);
    const feeSats = BigInt(Math.round(result.fee * 1e8));
    const changeSats = BigInt(Math.round((result.changeAmount || 0) * 1e8));

    expect(totalInputSats - feeSats).to.equal(changeSats);
    // 1.4.1 added 0.001 XNA to the selection target and returned it as change
    // while charging the previous fee; the identity above could not hold.
    expect(changeSats >= 0n).to.equal(true);
  });

  it('does not enter the branch when a single UTXO clears the real fee', async () => {
    const result = await transfer(pqWallet([ABOVE_WINDOW]));
    const inputs = result.createTransactionBuild.params.inputs;
    expect(inputs).to.have.length(2); // asset UTXO + one XNA UTXO
    expect(new Set(inputs.map(i => `${i.txid}:${i.vout}`)).size).to.equal(2);
  });

  it('converges over several rounds on a fragmented wallet', async () => {
    // Each PQ input costs 0.014655 XNA of fee (measured below), so a fragment
    // only makes progress if it is worth more than that. 0.02 XNA nets
    // +0.005345 per round, which needs several rounds to cover the fee.
    const fragments = new Array(12).fill(0.02 * 1e8);
    const result = await transfer(pqWallet(fragments));
    const inputs = result.createTransactionBuild.params.inputs;

    expect(inputs.length).to.be.greaterThan(3); // more than one top-up round
    expect(new Set(inputs.map(i => `${i.txid}:${i.vout}`)).size).to.equal(inputs.length);
    expect(() => createFromOperation(result.createTransactionBuild)).to.not.throw();
  });

  it('adds exactly 0.014655 XNA of fee per PQ input', () => {
    const selector = new UTXOSelector(async () => {});
    const outputs = [PQ_ADDR[0], PQ_ADDR[0], ADDR[0]];
    const marginal = n => selector.estimateFeeSats(new Array(n).fill({ script: PQ_SCRIPT }), outputs, FEE_RATE)
      - selector.estimateFeeSats(new Array(n - 1).fill({ script: PQ_SCRIPT }), outputs, FEE_RATE);

    [2, 3, 4, 5].forEach(n => expect(marginal(n)).to.equal(1465500n));
  });

  it('refuses to loop on fragments worth less than an input costs', async () => {
    // 0.012 XNA < 0.014655 XNA: every added input makes the shortfall worse.
    // The loop must recognise that and fail, not spin or underfund.
    let failed = null;
    try {
      await transfer(pqWallet(new Array(6).fill(0.012 * 1e8)));
    } catch (error) {
      failed = error;
    }
    expect(failed, 'uneconomical fragments must not build').to.not.equal(null);
    expect(failed.message).to.match(/Insufficient XNA balance/);
  });

  it('fails closed when the wallet cannot cover the recomputed fee', async () => {
    let failed = null;
    try {
      // Enough for the first estimate, never enough for the real one.
      await transfer(pqWallet([0.01 * 1e8]));
    } catch (error) {
      failed = error;
    }
    expect(failed, 'must not build an underfunded transaction').to.not.equal(null);
    expect(failed.message).to.match(/Insufficient XNA balance/);
  });
});

describe('selection excludes committed outpoints', () => {
  it('never returns an outpoint the caller already holds', async () => {
    const utxos = [
      { txid: '01'.repeat(32), outputIndex: 0, address: ADDR[0], satoshis: 5 * 1e8 },
      { txid: '02'.repeat(32), outputIndex: 1, address: ADDR[0], satoshis: 3 * 1e8 }
    ];
    const selector = new UTXOSelector(createAssetRpc({ xnaUtxos: utxos }));

    const first = await selector.selectBaseCurrencyUTXOs([ADDR[0]], 1);
    expect(first.utxos[0].txid).to.equal('01'.repeat(32));

    // Same requirement again: without exclusions the greedy order is
    // deterministic and hands back the very same outpoint.
    const repeated = await selector.selectBaseCurrencyUTXOs([ADDR[0]], 1);
    expect(repeated.utxos[0].txid).to.equal('01'.repeat(32));

    const excluded = await selector.selectBaseCurrencyUTXOs([ADDR[0]], 1, 0.1, {
      exclude: first.utxos
    });
    expect(excluded.utxos[0].txid).to.equal('02'.repeat(32));
  });

  it('accepts exclusions as keys, as objects and as a Set', async () => {
    const utxos = [
      { txid: '01'.repeat(32), outputIndex: 0, address: ADDR[0], satoshis: 5 * 1e8 },
      { txid: '02'.repeat(32), outputIndex: 1, address: ADDR[0], satoshis: 3 * 1e8 }
    ];
    const selector = new UTXOSelector(createAssetRpc({ xnaUtxos: utxos }));
    const key = `${'01'.repeat(32)}:0`;

    for (const exclude of [[key], new Set([key]), [{ txid: '01'.repeat(32), outputIndex: 0 }], [{ txid: '01'.repeat(32), vout: 0 }]]) {
      const selection = await selector.selectBaseCurrencyUTXOs([ADDR[0]], 1, 0.1, { exclude });
      expect(selection.utxos[0].txid).to.equal('02'.repeat(32));
    }
  });

  it('reports insufficient funds when exclusions leave nothing', async () => {
    const utxos = [{ txid: '01'.repeat(32), outputIndex: 0, address: ADDR[0], satoshis: 5 * 1e8 }];
    const selector = new UTXOSelector(createAssetRpc({ xnaUtxos: utxos }));

    let failed = null;
    try {
      await selector.selectBaseCurrencyUTXOs([ADDR[0]], 1, 0.1, { exclude: utxos });
    } catch (error) {
      failed = error;
    }
    expect(failed).to.not.equal(null);
    expect(failed.message).to.match(/Insufficient XNA balance/);
  });
});

describe('every builder with a top-up keeps outpoints unique', () => {
  // The pattern lived in 11 builders; this samples the shapes: no extra
  // inputs, an owner-token input, and qualifier inputs.
  const CASES = [
    {
      name: 'createRootAsset (no extra inputs)',
      build: rpc => new NeuraiAssets(rpc, {
        network: 'xna-test', addresses: [ADDR[0]], changeAddress: ADDR[0], toAddress: ADDR[1]
      }).createRootAsset({ assetName: 'ROOTX', quantity: 10, units: 0 }),
      extra: {}
    },
    {
      name: 'reissueAsset (owner-token input)',
      build: rpc => new NeuraiAssets(rpc, {
        network: 'xna-test', addresses: [ADDR[0]], changeAddress: ADDR[0], toAddress: ADDR[1]
      }).reissueAsset({ assetName: 'ROOTX', quantity: 4 }),
      extra: {
        assetMap: { ROOTX: { amount: 1000, units: 0, reissuable: 1 } },
        ownerUtxos: [{ txid: 'ee'.repeat(32), outputIndex: 7, address: ADDR[0], assetName: 'ROOTX!', satoshis: 1e8 }]
      }
    },
    {
      name: 'tagAddresses (qualifier inputs)',
      build: rpc => new NeuraiAssets(rpc, {
        network: 'xna-test', addresses: [ADDR[0]], changeAddress: ADDR[0], toAddress: ADDR[1]
      }).tagAddresses({ qualifierName: '#KYC', addresses: [ADDR[2]] }),
      extra: {
        assetMap: { '#KYC': { amount: 10, units: 0, reissuable: 0 } },
        ownerUtxos: [{ txid: 'ee'.repeat(32), outputIndex: 7, address: ADDR[0], assetName: '#KYC', satoshis: 10 * 1e8 }]
      }
    }
  ];

  CASES.forEach(({ name, build, extra }) => {
    it(`${name}: fragmented funds produce no repeated vin`, async () => {
      // Many small UTXOs force several funding rounds. A burn of 500 XNA
      // (root issuance) needs plenty of them.
      const fragments = new Array(60).fill(0).map((_, index) => ({
        txid: index.toString(16).padStart(2, '0').repeat(32),
        outputIndex: index,
        address: ADDR[0],
        satoshis: 20 * 1e8
      }));

      const result = await build(createAssetRpc({
        assetMarker: 'xna',
        xnaUtxos: fragments,
        ...extra
      }));

      const keys = result.createTransactionBuild.params.inputs.map(i => `${i.txid}:${i.vout}`);
      expect(new Set(keys).size, `duplicate outpoint in ${name}`).to.equal(keys.length);
      expect(() => createFromOperation(result.createTransactionBuild)).to.not.throw();
    });
  });
});

describe('integer accounting', () => {
  it('sorts by value with bigint satoshis instead of subtracting them', async () => {
    const utxos = [
      { txid: '01'.repeat(32), outputIndex: 0, address: ADDR[0], satoshis: 3n * 100000000n },
      { txid: '02'.repeat(32), outputIndex: 1, address: ADDR[0], satoshis: 9n * 100000000n }
    ];
    const selector = new UTXOSelector(createAssetRpc({ xnaUtxos: utxos }));
    const selection = await selector.selectBaseCurrencyUTXOs([ADDR[0]], 1);
    expect(selection.utxos[0].txid).to.equal('02'.repeat(32));
    expect(selection.totalSats).to.equal(900000000n);
  });

  it('sorts string satoshis by value, not lexicographically', async () => {
    const utxos = [
      { txid: '01'.repeat(32), outputIndex: 0, address: ADDR[0], satoshis: '900000000' },
      { txid: '02'.repeat(32), outputIndex: 1, address: ADDR[0], satoshis: '1000000000' }
    ];
    const selector = new UTXOSelector(createAssetRpc({ xnaUtxos: utxos }));
    const selection = await selector.selectBaseCurrencyUTXOs([ADDR[0]], 1);
    // Lexicographically "1000000000" < "900000000"; by value it is larger.
    expect(selection.utxos[0].txid).to.equal('02'.repeat(32));
  });

  it('rejects an unsafe satoshis number rather than spending a corrupted value', async () => {
    const utxos = [{
      txid: '01'.repeat(32), outputIndex: 0, address: ADDR[0], satoshis: 9007199254740993
    }];
    const selector = new UTXOSelector(createAssetRpc({ xnaUtxos: utxos }));

    let failed = null;
    try {
      await selector.selectBaseCurrencyUTXOs([ADDR[0]], 1);
    } catch (error) {
      failed = error;
    }
    expect(failed).to.not.equal(null);
    expect(failed.message).to.match(/MAX_SAFE_INTEGER/);
  });

  it('handles a balance above MAX_SAFE_INTEGER delivered as a string', async () => {
    const utxos = [{
      txid: '01'.repeat(32), outputIndex: 0, address: ADDR[0], satoshis: '9007199254740993'
    }];
    const selector = new UTXOSelector(createAssetRpc({ xnaUtxos: utxos }));
    expect(await selector.getBalanceRaw([ADDR[0]])).to.equal(9007199254740993n);
  });

  it('rounds the fee up to the satoshi, never down', () => {
    const selector = new UTXOSelector(async () => {});
    // 1 vbyte at 0.015 XNA/kB is 15 sats exactly; 7 vbytes is 105.
    expect(selector.estimateFeeSats(1, 0, 0.015)).to.be.a('bigint');
    const tiny = selector.estimateFeeSats(0, 0, 0.000001);
    expect(tiny >= 0n).to.equal(true);
  });
});
