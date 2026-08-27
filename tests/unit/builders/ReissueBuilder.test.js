const { expect } = require('chai');
const { bech32m } = require('bech32');
const ReissueBuilder = require('../../../src/builders/ReissueBuilder');
const { parseUnsignedOutputs, assetPayloads } = require('../../fixtures/txParser');

const TEST_ADDRESS = bech32m.encode('tnq', [1, ...bech32m.toWords(Buffer.alloc(32, 7))]);

/**
 * Build an in-memory RPC stub for ReissueBuilder tests.
 *
 * `createrawtransaction` is deliberately NOT handled: since 1.5.0 the reissue
 * builders produce the raw transaction locally (the node RPC cannot express
 * "keep the current units" and rejects any asset with units > 0), so a call
 * to it would be a regression and trips the default throw.
 *
 * @param {object} options
 * @param {object} options.assetData - what `getassetdata <name>` returns
 * @param {string} options.assetName - the asset being reissued
 * @param {number} options.ownerUtxoSatoshis - satoshis on the owner-token UTXO
 *   (chain encodes asset balances in 10^8-sats, so 100000000 = 1 owner token)
 * @returns {Function} rpc stub
 */
function buildRpc({ assetData, assetName, ownerUtxoSatoshis = 100000000 }) {
  return async (method, params = []) => {
    switch (method) {
      case 'getassetdata':
        if (params[0] === assetName) return assetData;
        throw new Error(`Unexpected getassetdata for ${params[0]}`);

      case 'getaddressutxos': {
        const query = params[0] || {};
        if (query.assetName === `${assetName}!`) {
          return [
            {
              txid: '02'.repeat(32),
              outputIndex: 1,
              address: TEST_ADDRESS,
              assetName: `${assetName}!`,
              satoshis: ownerUtxoSatoshis,
            },
          ];
        }
        // XNA UTXOs — plenty for the burn + fee
        return [
          {
            txid: '01'.repeat(32),
            outputIndex: 0,
            address: TEST_ADDRESS,
            satoshis: 5000000000000, // 50,000 XNA
          },
        ];
      }

      case 'getaddressmempool':
        return [];

      case 'estimatesmartfee':
        return { feerate: 0.015 };

      case 'getblockchaininfo':
        return { asset_marker: 'xna' };

      default:
        throw new Error(`Unexpected RPC method: ${method} (${JSON.stringify(params)})`);
    }
  };
}

/** The reissue ('r') payload the chain will parse out of the built rawTx. */
function reissuePayloadOf(result, assetName) {
  const payloads = assetPayloads(parseUnsignedOutputs(result.rawTx));
  return payloads.find(p => p.type === 'r' && p.assetName === assetName);
}

describe('ReissueBuilder', () => {
  // Regression for the v1.2.2 bug: `toSatoshis` was hardcoded to ×10^8, so
  // reissuing 1 token of a units=0 asset asked the daemon to mint 100,000,000.
  // The reissue payload carries a protocol-raw (10^8-scaled) u64, so 1 token
  // must encode exactly 10^8 — a double-scaled build would encode 10^16.
  it('should mint exactly N tokens for a units=0 asset (no ×10^8 inflation)', async () => {
    const rpc = buildRpc({
      assetName: 'ROOT',
      assetData: { name: 'ROOT', amount: 10, units: 0, reissuable: 1 },
    });

    const builder = new ReissueBuilder(rpc, {
      network: 'xna-test',
      walletAddresses: [TEST_ADDRESS],
      changeAddress: TEST_ADDRESS,
      toAddress: TEST_ADDRESS,
      assetName: 'ROOT',
      quantity: 1,
    });

    const result = await builder.build();

    expect(result.buildStrategy).to.equal('local-builder');
    const reissue = reissuePayloadOf(result, 'ROOT');
    expect(reissue, 'rawTx must include a reissue payload').to.not.equal(undefined);
    expect(reissue.amountRaw).to.equal(100000000n); // 1 token, not 10^16
  });

  it('should send the user-facing display value for a units=8 asset', async () => {
    const rpc = buildRpc({
      assetName: 'PRECISE',
      assetData: { name: 'PRECISE', amount: 10, units: 8, reissuable: 1 },
    });

    const builder = new ReissueBuilder(rpc, {
      network: 'xna-test',
      walletAddresses: [TEST_ADDRESS],
      changeAddress: TEST_ADDRESS,
      toAddress: TEST_ADDRESS,
      assetName: 'PRECISE',
      quantity: 1.5,
    });

    const result = await builder.build();

    const reissue = reissuePayloadOf(result, 'PRECISE');
    expect(reissue.amountRaw).to.equal(150000000n); // 1.5 tokens
  });

  it('should send the user-facing display value for an intermediate-units asset', async () => {
    const rpc = buildRpc({
      assetName: 'MID',
      assetData: { name: 'MID', amount: 10, units: 2, reissuable: 1 },
    });

    const builder = new ReissueBuilder(rpc, {
      network: 'xna-test',
      walletAddresses: [TEST_ADDRESS],
      changeAddress: TEST_ADDRESS,
      toAddress: TEST_ADDRESS,
      assetName: 'MID',
      quantity: 1000,
    });

    const result = await builder.build();

    const reissue = reissuePayloadOf(result, 'MID');
    // 1000 tokens = 10^11 raw — not ×10^units on top (10^13), not ×10^8 twice
    expect(reissue.amountRaw).to.equal(100000000000n);
  });

  it('should reject a non-reissuable asset', async () => {
    const rpc = buildRpc({
      assetName: 'LOCKED',
      assetData: { name: 'LOCKED', amount: 10, units: 0, reissuable: 0 },
    });

    const builder = new ReissueBuilder(rpc, {
      network: 'xna-test',
      walletAddresses: [TEST_ADDRESS],
      changeAddress: TEST_ADDRESS,
      toAddress: TEST_ADDRESS,
      assetName: 'LOCKED',
      quantity: 1,
    });

    let error;
    try {
      await builder.build();
    } catch (err) {
      error = err;
    }
    expect(error).to.not.equal(undefined);
    expect(error.message).to.include('not reissuable');
  });

  it('should reject quantity <= 0', async () => {
    const rpc = buildRpc({
      assetName: 'ROOT',
      assetData: { name: 'ROOT', amount: 10, units: 0, reissuable: 1 },
    });

    const builder = new ReissueBuilder(rpc, {
      network: 'xna-test',
      walletAddresses: [TEST_ADDRESS],
      changeAddress: TEST_ADDRESS,
      toAddress: TEST_ADDRESS,
      assetName: 'ROOT',
      quantity: 0,
    });

    let error;
    try {
      await builder.build();
    } catch (err) {
      error = err;
    }
    expect(error).to.not.equal(undefined);
    expect(error.message).to.include('greater than 0');
  });
});
