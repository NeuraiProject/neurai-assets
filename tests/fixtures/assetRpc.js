/**
 * A node stand-in for the builder tests.
 *
 * It answers only what the builders actually ask, and throws on anything else
 * so a new RPC dependency shows up as a failing test rather than as a silent
 * undefined.
 */

/**
 * @param {object} [options]
 * @param {object} [options.assetMap] - getassetdata answers, by asset name
 * @param {Array} [options.xnaUtxos] - XNA UTXOs
 * @param {Array} [options.ownerUtxos] - Asset UTXOs (owner tokens, qualifiers, balances)
 * @param {'rvn'|'xna'} [options.assetMarker] - getblockchaininfo.asset_marker; omit to
 *   emulate a node that predates the field
 * @param {number} [options.feeRate] - estimatesmartfee answer in XNA/kB
 * @param {Error} [options.blockchainInfoError] - Make getblockchaininfo fail
 * @param {Array<string>} [options.calls] - Collects every method called
 * @returns {Function} RPC function
 */
function createAssetRpc(options = {}) {
  const {
    assetMap = {},
    xnaUtxos = [],
    ownerUtxos = [],
    assetMarker,
    feeRate = 0.015,
    blockchainInfoError = null,
    calls
  } = options;

  return async function rpc(method, params = []) {
    if (calls) {
      calls.push(method);
    }

    switch (method) {
      case 'getblockchaininfo': {
        if (blockchainInfoError) {
          throw blockchainInfoError;
        }
        return assetMarker === undefined
          ? { chain: 'test' }
          : { chain: 'test', asset_marker: assetMarker };
      }

      case 'getassetdata': {
        const assetName = params[0];
        if (Object.prototype.hasOwnProperty.call(assetMap, assetName)) {
          return assetMap[assetName];
        }
        throw new Error(`Asset not found: ${assetName}`);
      }

      case 'getaddressutxos': {
        const query = params[0] || {};
        if (query.assetName) {
          return ownerUtxos.filter(utxo => utxo.assetName === query.assetName);
        }
        return xnaUtxos;
      }

      case 'getaddressmempool':
        return [];

      case 'estimatesmartfee':
        return { feerate: feeRate };

      case 'createrawtransaction':
        // The canonical path never uses this; the RPC path only needs a
        // placeholder, since these tests assert on the canonical bytes.
        return 'deadbeef';

      case 'listaddressesbyasset':
        return {};

      default:
        throw new Error(`Unexpected RPC method: ${method} (${JSON.stringify(params)})`);
    }
  };
}

module.exports = { createAssetRpc };
