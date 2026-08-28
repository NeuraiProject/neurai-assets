/**
 * UTXO Selector
 * Selects appropriate UTXOs for asset transactions
 *
 * Handles selection of:
 * - Base currency (XNA) UTXOs for fees and burns
 * - Asset UTXOs for transfers and operations
 * - Mempool filtering to prevent double-spending
 */

const { rpcErrorMessage } = require('../utils/rpcErrorMessage');
const { InsufficientFundsError } = require('../errors');
const { estimateTransactionVbytes } = require('../utils/feeSizing');
const {
  assetAmountToRaw,
  xnaAmountToSats,
  formatRawAsDecimal,
  toProtocolInteger,
  sumProtocolIntegers
} = require('../utils/assetAmount');

/**
 * Identity of an unspent output. `getaddressutxos` reports `outputIndex`;
 * builder-side inputs carry `vout`. Both name the same thing.
 *
 * @param {object} utxo - UTXO or input
 * @returns {string} Stable outpoint key
 */
function outpointKey(utxo) {
  const index = utxo.outputIndex !== undefined ? utxo.outputIndex : utxo.vout;
  return `${utxo.txid}:${index}`;
}

/**
 * Accept an exclusion list as a Set, an array of keys, or an array of
 * UTXO-like objects, and return a Set of keys.
 *
 * @param {Set<string>|Array<string|object>|undefined} exclude - Outpoints to skip
 * @returns {Set<string>} Excluded outpoint keys
 */
function toOutpointSet(exclude) {
  if (!exclude) {
    return new Set();
  }
  if (exclude instanceof Set) {
    return exclude;
  }
  return new Set(
    Array.from(exclude, entry => (typeof entry === 'string' ? entry : outpointKey(entry)))
  );
}

/**
 * Integer division rounding away from zero, for fee thresholds.
 *
 * @param {bigint} numerator - Dividend
 * @param {bigint} denominator - Positive divisor
 * @returns {bigint} Ceiling of the quotient
 */
function ceilDiv(numerator, denominator) {
  if (numerator <= 0n) {
    return numerator / denominator;
  }
  return (numerator + denominator - 1n) / denominator;
}

class UTXOSelector {
  /**
   * @param {Function} rpc - RPC function to call Neurai node
   */
  constructor(rpc) {
    if (!rpc || typeof rpc !== 'function') {
      throw new Error('RPC function is required');
    }
    this.rpc = rpc;
  }

  /**
   * Get all UTXOs for addresses
   * @param {string[]} addresses - Array of wallet addresses
   * @param {string|null} assetName - Filter by asset name (null for XNA)
   * @returns {Promise<Array>} Array of UTXOs
   */
  async getUTXOs(addresses, assetName = null) {
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new Error('Addresses array is required');
    }

    try {
      // assetName goes inside the params object; omit it for XNA UTXOs
      const queryParams = assetName ? { addresses, assetName } : { addresses };
      const utxos = await this.rpc('getaddressutxos', [queryParams]);

      // Filter for specific asset or XNA
      if (assetName) {
        return utxos.filter(utxo => utxo.assetName === assetName);
      } else {
        // XNA UTXOs don't have assetName or have assetName === 'XNA'
        return utxos.filter(utxo => !utxo.assetName || utxo.assetName === 'XNA');
      }
    } catch (error) {
      throw new Error(`Failed to get UTXOs: ${rpcErrorMessage(error)}`);
    }
  }

  /**
   * Get mempool entries for addresses
   * Used to filter out UTXOs that are already being spent
   * @param {string[]} addresses - Array of wallet addresses
   * @returns {Promise<Array>} Array of mempool entries
   */
  async getMempoolEntries(addresses) {
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new Error('Addresses array is required');
    }

    try {
      const mempool = await this.rpc('getaddressmempool', [{ addresses }]);
      return mempool || [];
    } catch (error) {
      // If RPC method not available, return empty array
      return [];
    }
  }

  /**
   * Filter out UTXOs that are being spent in mempool
   * @param {Array} utxos - Array of UTXOs
   * @param {Array} mempoolEntries - Array of mempool entries
   * @returns {Array} Filtered UTXOs
   */
  filterMempoolSpentUTXOs(utxos, mempoolEntries) {
    if (mempoolEntries.length === 0) {
      return utxos;
    }

    return utxos.filter(utxo => {
      // Check if this UTXO is being spent in mempool
      const isSpent = mempoolEntries.some(entry => {
        return entry.prevtxid === utxo.txid && entry.prevout === utxo.outputIndex;
      });

      return !isSpent;
    });
  }

  /**
   * Sort UTXOs by value, largest first, without mutating the input.
   *
   * A bigint comparison is required: `b.satoshis - a.satoshis` throws once
   * satoshis arrive as bigint and compares lexicographically once they arrive
   * as strings, which is how a large-value UTXO ends up sorted as if it were
   * small.
   *
   * @param {Array} utxos - UTXOs to sort
   * @param {string} label - Field description for error messages
   * @returns {Array} New array, sorted by descending value
   */
  sortByValueDesc(utxos, label = 'utxo.satoshis') {
    return [...utxos].sort((a, b) => {
      const left = toProtocolInteger(a.satoshis, label);
      const right = toProtocolInteger(b.satoshis, label);
      if (right > left) return 1;
      if (right < left) return -1;
      return 0;
    });
  }

  /**
   * Select UTXOs for base currency (XNA)
   * Uses greedy algorithm: selects UTXOs until sum >= required amount
   *
   * `options.exclude` is what keeps a second, incremental call from handing
   * back an outpoint the caller already holds: without it this method
   * re-queries the node, re-sorts from the largest value — which is normally
   * the one the first call took — and returns it again, producing a
   * transaction that spends the same outpoint twice.
   *
   * @param {string[]} addresses - Wallet addresses
   * @param {number|string} requiredAmount - Required amount in XNA (ignored when options.requiredSats is given)
   * @param {number} buffer - Safety buffer percentage (default: 0.1 = 10%)
   * @param {object} [options]
   * @param {bigint} [options.requiredSats] - Exact requirement in satoshis; preferred over requiredAmount
   * @param {Set<string>|Array} [options.exclude] - Outpoints that must not be selected
   * @returns {Promise<object>} { utxos, totalAmount, totalSats }
   * @throws {InsufficientFundsError} If not enough funds
   */
  async selectBaseCurrencyUTXOs(addresses, requiredAmount, buffer = 0.1, options = {}) {
    // Both reads describe the same addresses and neither feeds the other: the
    // mempool result only filters the UTXO result afterwards. Awaiting them in
    // sequence spent one extra network round trip per selection, which on a
    // remote RPC proxy is most of the time a wallet spends building anything.
    const [allUTXOs, mempool] = await Promise.all([
      this.getUTXOs(addresses, null),
      this.getMempoolEntries(addresses)
    ]);
    const unspentUTXOs = this.filterMempoolSpentUTXOs(allUTXOs, mempool);

    // Drop outpoints the caller already spends elsewhere in this transaction
    const excluded = toOutpointSet(options.exclude);
    const availableUTXOs = excluded.size === 0
      ? unspentUTXOs
      : unspentUTXOs.filter(utxo => !excluded.has(outpointKey(utxo)));

    // Sort by value (largest first) for efficiency
    const sortedUTXOs = this.sortByValueDesc(availableUTXOs);

    // Requirement and buffer in integer satoshis. The buffer is applied to the
    // integer, not to a float amount that is then re-scaled.
    const requiredSats = options.requiredSats !== undefined
      ? toProtocolInteger(options.requiredSats, 'requiredSats')
      : xnaAmountToSats(requiredAmount, { label: 'required XNA', rounding: 'ceil' });
    const bufferScale = 10000n;
    const bufferFactor = BigInt(Math.round((1 + buffer) * Number(bufferScale)));
    const requiredWithBufferSats = ceilDiv(requiredSats * bufferFactor, bufferScale);

    // Select UTXOs greedily
    const selected = [];
    let totalSatoshis = 0n;

    for (const utxo of sortedUTXOs) {
      selected.push(utxo);
      totalSatoshis += toProtocolInteger(utxo.satoshis, 'utxo.satoshis');

      if (totalSatoshis >= requiredWithBufferSats) {
        break;
      }
    }

    // Check if we have enough
    if (totalSatoshis < requiredWithBufferSats) {
      const available = formatRawAsDecimal(totalSatoshis);
      const required = formatRawAsDecimal(requiredSats);
      throw new InsufficientFundsError(
        `Insufficient XNA balance. Required: ${required} XNA (+ ${(buffer * 100).toFixed(0)}% buffer), ` +
        `Available: ${available} XNA`,
        Number(required),
        Number(available)
      );
    }

    return {
      utxos: selected,
      totalAmount: Number(formatRawAsDecimal(totalSatoshis)),
      totalSats: totalSatoshis
    };
  }

  /**
   * Select UTXOs for asset transfer
   * @param {string[]} addresses - Wallet addresses
   * @param {string} assetName - Asset name
   * @param {number} requiredAmount - Required amount (in asset units)
   * @returns {Promise<object>} { utxos, totalAmount }
   * @throws {InsufficientFundsError} If not enough asset balance
   */
  async selectAssetUTXOs(addresses, assetName, requiredAmount, options = {}) {
    if (!assetName) {
      throw new Error('Asset name is required');
    }

    // Both reads describe the same addresses and neither feeds the other: the
    // mempool result only filters the UTXO result afterwards. Awaiting them in
    // sequence spent one extra network round trip per selection, which on a
    // remote RPC proxy is most of the time a wallet spends building anything.
    const [allUTXOs, mempool] = await Promise.all([
      this.getUTXOs(addresses, assetName),
      this.getMempoolEntries(addresses)
    ]);
    const unspentUTXOs = this.filterMempoolSpentUTXOs(allUTXOs, mempool);

    const excluded = toOutpointSet(options.exclude);
    const availableUTXOs = excluded.size === 0
      ? unspentUTXOs
      : unspentUTXOs.filter(utxo => !excluded.has(outpointKey(utxo)));

    // Sort by value (largest first)
    const sortedUTXOs = this.sortByValueDesc(availableUTXOs);

    // Requirement as an exact protocol integer. `requiredRaw` is the path the
    // canonical builders use: they have already summed the recipients in raw
    // and must not round-trip that total through a display float.
    const requiredRaw = options.requiredRaw !== undefined
      ? toProtocolInteger(options.requiredRaw, 'requiredRaw')
      : assetAmountToRaw(requiredAmount, undefined, { label: `${assetName} amount` });

    // Select UTXOs greedily
    const selected = [];
    let totalSatoshis = 0n;

    for (const utxo of sortedUTXOs) {
      selected.push(utxo);
      totalSatoshis += toProtocolInteger(utxo.satoshis, `${assetName} utxo.satoshis`);

      if (totalSatoshis >= requiredRaw) {
        break;
      }
    }

    // Check if we have enough
    if (totalSatoshis < requiredRaw) {
      const available = formatRawAsDecimal(totalSatoshis);
      const required = formatRawAsDecimal(requiredRaw);
      throw new InsufficientFundsError(
        `Insufficient ${assetName} balance. Required: ${required}, Available: ${available}`,
        Number(required),
        Number(available)
      );
    }

    return {
      utxos: selected,
      totalAmount: Number(formatRawAsDecimal(totalSatoshis)),
      totalRaw: totalSatoshis
    };
  }

  /**
   * Select UTXOs for a transaction requiring both XNA and assets
   * @param {string[]} addresses - Wallet addresses
   * @param {number} xnaAmount - Required XNA amount
   * @param {string|null} assetName - Asset name (null if not needed)
   * @param {number} assetAmount - Required asset amount
   * @returns {Promise<object>} { xnaUTXOs, assetUTXOs, totalXNA, totalAsset }
   */
  async selectMixedUTXOs(addresses, xnaAmount, assetName = null, assetAmount = 0, options = {}) {
    const result = {
      xnaUTXOs: [],
      assetUTXOs: [],
      totalXNA: 0,
      totalAsset: 0,
      totalXNASats: 0n,
      totalAssetRaw: 0n
    };

    const wantsXna = options.requiredSats !== undefined
      ? toProtocolInteger(options.requiredSats, 'requiredSats') > 0n
      : xnaAmount > 0;

    // Select XNA UTXOs if needed
    if (wantsXna) {
      const xnaSelection = await this.selectBaseCurrencyUTXOs(
        addresses,
        xnaAmount,
        options.buffer !== undefined ? options.buffer : 0.1,
        { exclude: options.exclude, requiredSats: options.requiredSats }
      );
      result.xnaUTXOs = xnaSelection.utxos;
      result.totalXNA = xnaSelection.totalAmount;
      result.totalXNASats = xnaSelection.totalSats;
    }

    const wantsAsset = options.requiredRaw !== undefined
      ? toProtocolInteger(options.requiredRaw, 'requiredRaw') > 0n
      : assetAmount > 0;

    // Select asset UTXOs if needed
    if (assetName && wantsAsset) {
      const assetSelection = await this.selectAssetUTXOs(
        addresses,
        assetName,
        assetAmount,
        { exclude: options.exclude, requiredRaw: options.requiredRaw }
      );
      result.assetUTXOs = assetSelection.utxos;
      result.totalAsset = assetSelection.totalAmount;
      result.totalAssetRaw = assetSelection.totalRaw;
    }

    return result;
  }

  /**
   * Get total balance for an asset
   * @param {string[]} addresses - Wallet addresses
   * @param {string|null} assetName - Asset name (null for XNA)
   * @returns {Promise<number>} Total balance
   */
  async getBalance(addresses, assetName = null) {
    return Number(formatRawAsDecimal(await this.getBalanceRaw(addresses, assetName)));
  }

  /**
   * Get total balance for an asset as an exact protocol integer.
   *
   * @param {string[]} addresses - Wallet addresses
   * @param {string|null} assetName - Asset name (null for XNA)
   * @returns {Promise<bigint>} Total balance in 10^8-scaled units
   */
  async getBalanceRaw(addresses, assetName = null) {
    const [utxos, mempool] = await Promise.all([
      this.getUTXOs(addresses, assetName),
      this.getMempoolEntries(addresses)
    ]);
    const availableUTXOs = this.filterMempoolSpentUTXOs(utxos, mempool);

    return sumProtocolIntegers(availableUTXOs, 'satoshis', `${assetName || 'XNA'} utxo.satoshis`);
  }

  /**
   * Estimate transaction size in vbytes for fee calculation.
   *
   * Both arguments accept either a count (legacy callers) or an array of
   * descriptors that allow the estimator to distinguish PQ AuthScript
   * inputs/outputs from legacy P2PKH ones — PQ inputs are roughly six
   * times larger than legacy inputs and would otherwise underflow the
   * node's `min relay fee`.
   *
   * Input descriptors may be UTXO-like objects with `script` and/or
   * `address`. Output descriptors may be address strings or `{ address }`.
   * When a count is provided instead of an array, every input/output is
   * treated as legacy.
   *
   * @param {number|Array} inputs - Input count or array of UTXO-like descriptors
   * @param {number|Array} outputs - Output count or array of address-like descriptors
   * @returns {number} Estimated vbytes
   */
  estimateTransactionSize(inputs, outputs) {
    const inputDescriptors = Array.isArray(inputs)
      ? inputs
      : new Array(inputs).fill({});
    const outputDescriptors = Array.isArray(outputs)
      ? outputs
      : new Array(outputs).fill({});
    return estimateTransactionVbytes(inputDescriptors, outputDescriptors);
  }

  /**
   * Estimate fee for a transaction.
   *
   * @param {number|Array} inputs - Input count or array of UTXO-like descriptors
   * @param {number|Array} outputs - Output count or array of address-like descriptors
   * @param {number} feeRate - Fee rate in XNA per KB (default: 0.015)
   * @returns {number} Estimated fee in XNA
   */
  estimateFee(inputs, outputs, feeRate = 0.015) {
    return Number(formatRawAsDecimal(this.estimateFeeSats(inputs, outputs, feeRate)));
  }

  /**
   * Estimate fee for a transaction, in exact satoshis.
   *
   * This is the form the builders account in: the fee has to be added to a
   * burn and subtracted from an input total, and doing that in XNA floats is
   * what produces one-satoshi drifts in the change output.
   *
   * @param {number|Array} inputs - Input count or array of UTXO-like descriptors
   * @param {number|Array} outputs - Output count or array of address-like descriptors
   * @param {number} feeRate - Fee rate in XNA per KB (default: 0.015)
   * @returns {bigint} Estimated fee in satoshis, rounded up
   */
  estimateFeeSats(inputs, outputs, feeRate = 0.015) {
    const sizeVbytes = BigInt(this.estimateTransactionSize(inputs, outputs));
    const feeRateSats = xnaAmountToSats(feeRate, { label: 'feeRate', rounding: 'ceil' });

    // fee = vbytes / 1000 * feeRate, rounded up to the satoshi
    return ceilDiv(sizeVbytes * feeRateSats, 1000n);
  }

  /**
   * Get fee rate from network
   * @param {number} confirmationTarget - Target confirmations (default: 20)
   * @returns {Promise<number>} Fee rate in XNA per KB
   */
  async getFeeRate(confirmationTarget = 20) {
    try {
      const result = await this.rpc('estimatesmartfee', [confirmationTarget]);

      if (result && result.feerate && result.feerate > 0) {
        return result.feerate;
      }

      // Fallback to default
      return 0.015;
    } catch (error) {
      // Fallback to default if estimation fails
      return 0.015;
    }
  }
}

// Shared with the builders so a transaction's outpoint bookkeeping uses one
// definition of identity.
UTXOSelector.outpointKey = outpointKey;
UTXOSelector.toOutpointSet = toOutpointSet;
UTXOSelector.ceilDiv = ceilDiv;

module.exports = UTXOSelector;
