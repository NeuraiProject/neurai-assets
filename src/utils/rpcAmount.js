/**
 * Asset amounts as `createrawtransaction` must receive them.
 *
 * The node reads `asset_quantity` (issue, issue_restricted, issue_qualifier,
 * reissue, reissue_restricted) and `change_quantity` (qualifier and tag
 * operations) only from JSON numbers: a quoted value fails `isNum()` and the
 * call is rejected with "missing asset data for key: asset_quantity". The
 * builders accept these amounts as decimal strings, which keep every digit the
 * caller wrote, so they are turned into JSON numbers here, on the copy of the
 * outputs sent to the node. The outputs returned to the caller keep the value
 * as it was given.
 */

const {
  expandScientificNotation,
  formatRawAsDecimal,
  normalizeDecimalText,
  scaleDecimalText
} = require('./assetAmount');

/** Fields the node parses with `isNum()` inside an asset operation object. */
const NUMERIC_OPERATION_FIELDS = ['asset_quantity', 'change_quantity'];

/** The largest magnitude whose 8-decimal values a double still names exactly. */
const MAX_EXACT_FRACTIONAL = Number.MAX_SAFE_INTEGER / 1e8;

/**
 * An exact decimal serialized as a bare JSON number token.
 *
 * Same shape as `rpcNumber()` from @neuraiproject/neurai-rpc: its
 * `stringifyRpcJson` (lossless-json) writes any object flagged
 * `isLosslessNumber` through `toString()`. It is defined here instead of
 * imported because the bundles inline every dependency and neurai-rpc carries
 * its whole RPC reference. With another serializer it stays an object, which
 * the node rejects: it can never become a different amount.
 */
class RpcDecimal {
  /**
   * @param {string} text - Plain decimal text
   */
  constructor(text) {
    this.isLosslessNumber = true;
    this.value = text;
  }

  toString() {
    return this.value;
  }
}

/**
 * Convert an amount into a JSON-number value for `createrawtransaction`.
 *
 * Numbers pass through, as before. A decimal string becomes a JavaScript
 * number when that number writes back the same decimal (every JSON serializer
 * handles it), and an {@link RpcDecimal} otherwise, so no digit is rounded.
 *
 * @param {string|number} value - Display amount
 * @param {string} [label] - Field name, for error messages
 * @returns {number|RpcDecimal} JSON-number value
 * @throws {InvalidAmountError} If a string is not an exact 8-decimal amount
 */
function toRpcAmount(value, label = 'amount') {
  if (typeof value !== 'string') {
    return value;
  }
  const text = formatRawAsDecimal(scaleDecimalText(normalizeDecimalText(value, label), 8, label));
  const number = Number(text);
  const exact = Number.isFinite(number) &&
    expandScientificNotation(String(number)) === text &&
    (Number.isInteger(number) ? Number.isSafeInteger(number) : Math.abs(number) <= MAX_EXACT_FRACTIONAL);
  return exact ? number : new RpcDecimal(text);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Copy of `createrawtransaction` outputs with the numeric asset fields
 * converted by {@link toRpcAmount}. XNA amounts and every other field are left
 * as they are: the node reads those with `AmountFromValue`, which also accepts
 * strings.
 *
 * @param {Array<object>|object} outputs - Outputs as built (array of single-key objects, or one object)
 * @returns {Array<object>|object} Outputs to send, same shape
 */
function prepareOutputsForRpc(outputs) {
  const convertPayload = (payload) => {
    if (!isPlainObject(payload)) {
      return payload;
    }
    const converted = {};
    for (const [operation, params] of Object.entries(payload)) {
      if (!isPlainObject(params)) {
        converted[operation] = params;
        continue;
      }
      const copy = { ...params };
      for (const field of NUMERIC_OPERATION_FIELDS) {
        if (copy[field] !== undefined && copy[field] !== null) {
          copy[field] = toRpcAmount(copy[field], field);
        }
      }
      converted[operation] = copy;
    }
    return converted;
  };

  const convertOutput = (output) => {
    const converted = {};
    for (const [address, payload] of Object.entries(output)) {
      converted[address] = convertPayload(payload);
    }
    return converted;
  };

  return Array.isArray(outputs) ? outputs.map(convertOutput) : convertOutput(outputs);
}

module.exports = {
  RpcDecimal,
  toRpcAmount,
  prepareOutputsForRpc
};
