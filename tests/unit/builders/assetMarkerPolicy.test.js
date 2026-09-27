/**
 * NIP-040 marker resolution: precedence, failure policy, and the guarantee
 * that a build asks the node exactly once.
 */

const { expect } = require('chai');
const NeuraiAssets = require('../../../src/NeuraiAssets');
const { ADDR } = require('../../fixtures/addresses');
const { createAssetRpc } = require('../../fixtures/assetRpc');

function wallet(extra = {}) {
  return createAssetRpc({
    assetMap: { ROOTX: { amount: 1000, units: 0, reissuable: 1 } },
    xnaUtxos: [{ txid: 'a1'.repeat(32), outputIndex: 0, address: ADDR[0], satoshis: 500000 * 1e8 }],
    ownerUtxos: [{ txid: 'b2'.repeat(32), outputIndex: 1, address: ADDR[0], assetName: 'ROOTX!', satoshis: 1e8 }],
    ...extra
  });
}

function assets(rpc, config = {}) {
  return new NeuraiAssets(rpc, {
    network: 'xna-test',
    addresses: [ADDR[0]],
    changeAddress: ADDR[0],
    toAddress: ADDR[1],
    ...config
  });
}

const REISSUE = { assetName: 'ROOTX', quantity: 4 };

describe('asset marker precedence', () => {
  it('uses the marker the node reports', async () => {
    const result = await assets(wallet({ assetMarker: 'xna' })).reissueAsset(REISSUE);
    expect(result.createTransactionBuild.params.assetMarker).to.equal('xna');
  });

  it('lets config override the node', async () => {
    const result = await assets(wallet({ assetMarker: 'xna' }), { assetMarker: 'rvn' })
      .reissueAsset(REISSUE);
    expect(result.createTransactionBuild.params.assetMarker).to.equal('rvn');
  });

  it('lets the operation override config and node', async () => {
    const result = await assets(wallet({ assetMarker: 'rvn' }), { assetMarker: 'rvn' })
      .reissueAsset({ ...REISSUE, assetMarker: 'xna' });
    expect(result.createTransactionBuild.params.assetMarker).to.equal('xna');
  });

  it('rejects a testnet node that predates the field', async () => {
    const failed = await assets(wallet({ omitAssetMarker: true })).reissueAsset(REISSUE)
      .then(() => null, error => error);
    expect(failed.message).to.match(/did not report asset_marker/);
  });

  it('rejects a null marker from a testnet node', async () => {
    const rpc = async (method, params) => {
      if (method === 'getblockchaininfo') return { chain: 'test', asset_marker: null };
      return wallet()(method, params);
    };
    const failed = await assets(rpc).reissueAsset(REISSUE).then(() => null, error => error);
    expect(failed.message).to.match(/did not report asset_marker/);
  });

  it('rejects an unknown value reported by the node, under both policies', async () => {
    for (const assetMarkerPolicy of ['legacy-fallback', 'strict']) {
      const rpc = async (method, params) => {
        if (method === 'getblockchaininfo') return { chain: 'test', asset_marker: 'RVN' };
        return wallet()(method, params);
      };
      let failed = null;
      try {
        await assets(rpc, { assetMarkerPolicy }).reissueAsset(REISSUE);
      } catch (error) {
        failed = error;
      }
      expect(failed, `policy ${assetMarkerPolicy} must reject`).to.not.equal(null);
      expect(failed.message).to.match(/unknown asset_marker/);
    }
  });

  it('rejects an invalid override before touching the node', async () => {
    const calls = [];
    let failed = null;
    try {
      await assets(wallet({ calls, assetMarker: 'xna' })).reissueAsset({ ...REISSUE, assetMarker: 'XNA' });
    } catch (error) {
      failed = error;
    }
    expect(failed).to.not.equal(null);
    expect(failed.message).to.match(/Invalid assetMarker/);
    expect(calls).to.not.include('getblockchaininfo');
  });
});

describe('assetMarkerPolicy on RPC failure', () => {
  const rpcFailure = { blockchainInfoError: new Error('connection refused') };

  it('legacy-fallback resolves rvn, preserving 1.4.x behaviour', async () => {
    const result = await assets(wallet(rpcFailure), { assetMarkerPolicy: 'legacy-fallback' })
      .reissueAsset(REISSUE);
    expect(result.createTransactionBuild.params.assetMarker).to.equal('rvn');
  });

  it('strict is the default on testnet', async () => {
    const failed = await assets(wallet(rpcFailure)).reissueAsset(REISSUE)
      .then(() => null, error => error);
    expect(failed.message).to.match(/Cannot resolve the NIP-040 asset marker/);
  });

  it('strict propagates the failure out of build(), with no partial result', async () => {
    let failed = null;
    let result;
    try {
      result = await assets(wallet(rpcFailure), { assetMarkerPolicy: 'strict' }).reissueAsset(REISSUE);
    } catch (error) {
      failed = error;
    }
    expect(result, 'no partial result may be returned').to.equal(undefined);
    expect(failed).to.not.equal(null);
    expect(failed.message).to.match(/Cannot resolve the NIP-040 asset marker/);
    expect(failed.message).to.match(/connection refused/);
  });

  it('strict rejects a testnet node that lacks the field', async () => {
    const failed = await assets(wallet({ omitAssetMarker: true }), { assetMarkerPolicy: 'strict' })
      .reissueAsset(REISSUE).then(() => null, error => error);
    expect(failed.message).to.match(/did not report asset_marker/);
  });

  it('an operation-level policy overrides the config', async () => {
    let failed = null;
    try {
      await assets(wallet(rpcFailure), { assetMarkerPolicy: 'legacy-fallback' })
        .reissueAsset({ ...REISSUE, assetMarkerPolicy: 'strict' });
    } catch (error) {
      failed = error;
    }
    expect(failed).to.not.equal(null);
    expect(failed.message).to.match(/Cannot resolve the NIP-040 asset marker/);
  });

  it('rejects an unknown policy value', async () => {
    let failed = null;
    try {
      await assets(wallet({ assetMarker: 'xna' }), { assetMarkerPolicy: 'lenient' }).reissueAsset(REISSUE);
    } catch (error) {
      failed = error;
    }
    expect(failed).to.not.equal(null);
    expect(failed.message).to.match(/Invalid assetMarkerPolicy/);
  });
});

describe('one marker query per build', () => {
  it('asks the node once even though metadata is built twice', async () => {
    const calls = [];
    await assets(wallet({ calls, assetMarker: 'xna' })).reissueAsset(REISSUE);
    const queries = calls.filter(method => method === 'getblockchaininfo');
    expect(queries).to.have.length(1);
  });

  it('memoizes the rejection too, so strict fails once', async () => {
    let attempts = 0;
    const base = wallet();
    const rpc = async (method, params) => {
      if (method === 'getblockchaininfo') {
        attempts += 1;
        throw new Error('connection refused');
      }
      return base(method, params);
    };

    try {
      await assets(rpc, { assetMarkerPolicy: 'strict' }).reissueAsset(REISSUE);
    } catch (error) {
      // expected
    }
    expect(attempts).to.equal(1);
  });
});
