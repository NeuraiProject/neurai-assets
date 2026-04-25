const { expect } = require('chai');
const { bech32m } = require('bech32');
const ReissueBuilder = require('../../../src/builders/ReissueBuilder');

const TEST_ADDRESS = bech32m.encode('tnq', [1, ...bech32m.toWords(Buffer.alloc(32, 7))]);

/**
 * Build an in-memory RPC stub for ReissueBuilder tests.
 *
 * @param {object} options
 * @param {object} options.assetData - what `getassetdata <name>` returns
 * @param {string} options.assetName - the asset being reissued
 * @param {number} options.ownerUtxoSatoshis - satoshis on the owner-token UTXO
 *   (chain encodes asset balances in 10^8-sats, so 100000000 = 1 owner token)
 * @returns {{ rpc: Function, getCapturedOutputs: () => any }}
 */
function buildRpc({ assetData, assetName, ownerUtxoSatoshis = 100000000 }) {
  let captured;

  const rpc = async (method, params = []) => {
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

      case 'createrawtransaction':
        captured = params[1];
        return 'deadbeef';

      default:
        throw new Error(`Unexpected RPC method: ${method} (${JSON.stringify(params)})`);
    }
  };

  return { rpc, getCapturedOutputs: () => captured };
}

function findReissueOutput(capturedOutputs) {
  return capturedOutputs.find(output => {
    const value = Object.values(output)[0];
    return value && typeof value === 'object' && value.reissue;
  });
}

describe('ReissueBuilder', () => {
  // Regression for the v1.2.2 bug: `toSatoshis` was hardcoded to ×10^8, so
  // reissuing 1 token of a units=0 asset asked the daemon to mint 100,000,000.
  // The chain parses asset_quantity with AmountFromValue (which already does
  // the ×10^8 scaling), so the JSON value must be the user-facing display
  // amount, not pre-multiplied.
  it('should mint exactly N tokens for a units=0 asset (no ×10^8 inflation)', async () => {
    const { rpc, getCapturedOutputs } = buildRpc({
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

    await builder.build();

    const reissueOutput = findReissueOutput(getCapturedOutputs());
    expect(reissueOutput, 'createrawtransaction must include a reissue output').to.not.equal(undefined);
    expect(reissueOutput[TEST_ADDRESS].reissue).to.deep.include({
      asset_name: 'ROOT',
      asset_quantity: 1, // not 100000000 — that was the v1.2.2 bug
    });
  });

  it('should send the user-facing display value for a units=8 asset', async () => {
    const { rpc, getCapturedOutputs } = buildRpc({
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

    await builder.build();

    const reissueOutput = findReissueOutput(getCapturedOutputs());
    expect(reissueOutput[TEST_ADDRESS].reissue).to.deep.include({
      asset_name: 'PRECISE',
      asset_quantity: 1.5,
    });
  });

  it('should send the user-facing display value for an intermediate-units asset', async () => {
    const { rpc, getCapturedOutputs } = buildRpc({
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

    await builder.build();

    const reissueOutput = findReissueOutput(getCapturedOutputs());
    expect(reissueOutput[TEST_ADDRESS].reissue).to.deep.include({
      asset_name: 'MID',
      asset_quantity: 1000, // not 100000 (×10^units) and not 100000000000 (×10^8)
    });
  });

  it('should reject a non-reissuable asset', async () => {
    const { rpc } = buildRpc({
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
    const { rpc } = buildRpc({
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
