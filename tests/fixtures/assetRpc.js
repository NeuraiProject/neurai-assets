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
 * @param {'rvn'|'xna'} [options.assetMarker='rvn'] - getblockchaininfo.asset_marker
 * @param {boolean} [options.omitAssetMarker=false] - Emulate a node that predates the field
 * @param {number} [options.feeRate] - estimatesmartfee answer in XNA/kB
 * @param {Error} [options.blockchainInfoError] - Make getblockchaininfo fail
 * @param {Array<string>} [options.calls] - Collects every method called
 * @param {Array<Array>} [options.rawTransactionParams] - Collects the params of every createrawtransaction call
 * @returns {Function} RPC function
 */
function createAssetRpc(options = {}) {
  const {
    assetMap = {},
    xnaUtxos = [],
    ownerUtxos = [],
    assetMarker = 'rvn',
    omitAssetMarker = false,
    feeRate = 0.015,
    blockchainInfoError = null,
    calls,
    rawTransactionParams
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
        return omitAssetMarker
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
        if (rawTransactionParams) {
          rawTransactionParams.push(params);
        }
        assertNodeNumericFields(params[1]);
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

/**
 * The node reads these operation fields with `isNum()` (rpc/rawtransaction.cpp)
 * and rejects anything else, a quoted decimal included. A value flagged
 * `isLosslessNumber` counts as a number: neurai-rpc writes it as a bare token.
 */
const NODE_NUMERIC_FIELDS = ['asset_quantity', 'change_quantity'];

function isJsonNumber(value) {
  return typeof value === 'number' || (value !== null && typeof value === 'object' && value.isLosslessNumber === true);
}

function assertNodeNumericFields(outputs) {
  const list = Array.isArray(outputs) ? outputs : [outputs];
  for (const output of list) {
    for (const payload of Object.values(output || {})) {
      if (!payload || typeof payload !== 'object') continue;
      for (const params of Object.values(payload)) {
        if (!params || typeof params !== 'object') continue;
        for (const field of NODE_NUMERIC_FIELDS) {
          if (params[field] !== undefined && !isJsonNumber(params[field])) {
            throw new Error(`Invalid parameter, missing asset data for key: ${field}`);
          }
        }
      }
    }
  }
}

module.exports = { createAssetRpc };
