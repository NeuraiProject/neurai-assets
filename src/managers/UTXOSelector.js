/**
 * UTXO Selector
 * Selects appropriate UTXOs for asset transactions
 *
 * Handles selection of:
 * - Base currency (XNA) UTXOs for fees and burns
 * - Asset UTXOs for transfers and operations
 * - Mempool filtering to prevent double-spending
 */

const { InsufficientFundsError } = require('../errors');
const { estimateTransactionVbytes } = require('../utils/feeSizing');

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
      throw new Error(`Failed to get UTXOs: ${error.message}`);
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
   * Select UTXOs for base currency (XNA)
   * Uses greedy algorithm: selects UTXOs until sum >= required amount
   *
   * @param {string[]} addresses - Wallet addresses
   * @param {number} requiredAmount - Required amount in XNA
   * @param {number} buffer - Safety buffer percentage (default: 0.1 = 10%)
   * @returns {Promise<object>} { utxos, totalAmount }
   * @throws {InsufficientFundsError} If not enough funds
   */
  async selectBaseCurrencyUTXOs(addresses, requiredAmount, buffer = 0.1) {
    // Get all XNA UTXOs
    const allUTXOs = await this.getUTXOs(addresses, null);

    // Get mempool and filter
    const mempool = await this.getMempoolEntries(addresses);
    const availableUTXOs = this.filterMempoolSpentUTXOs(allUTXOs, mempool);

    // Sort by value (largest first) for efficiency
    const sortedUTXOs = availableUTXOs.sort((a, b) => b.satoshis - a.satoshis);

    // Add buffer to required amount
    const requiredWithBuffer = requiredAmount * (1 + buffer);

    // Select UTXOs greedily
    const selected = [];
    let totalSatoshis = 0;
    const requiredSatoshis = Math.ceil(requiredWithBuffer * 100000000); // Convert XNA to satoshis

    for (const utxo of sortedUTXOs) {
      selected.push(utxo);
      totalSatoshis += utxo.satoshis;

      if (totalSatoshis >= requiredSatoshis) {
        break;
      }
    }

    // Check if we have enough
    if (totalSatoshis < requiredSatoshis) {
      const available = totalSatoshis / 100000000;
      throw new InsufficientFundsError(
        `Insufficient XNA balance. Required: ${requiredAmount.toFixed(8)} XNA (+ ${(buffer * 100).toFixed(0)}% buffer), ` +
        `Available: ${available.toFixed(8)} XNA`,
        requiredAmount,
        available
      );
    }

    return {
      utxos: selected,
      totalAmount: totalSatoshis / 100000000
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
  async selectAssetUTXOs(addresses, assetName, requiredAmount) {
    if (!assetName) {
      throw new Error('Asset name is required');
    }

    // Get all asset UTXOs
    const allUTXOs = await this.getUTXOs(addresses, assetName);

    // Get mempool and filter
    const mempool = await this.getMempoolEntries(addresses);
    const availableUTXOs = this.filterMempoolSpentUTXOs(allUTXOs, mempool);

    // Sort by value (largest first)
    const sortedUTXOs = availableUTXOs.sort((a, b) => b.satoshis - a.satoshis);

    // Select UTXOs greedily
    const selected = [];
    let totalSatoshis = 0;
    const requiredSatoshis = Math.ceil(requiredAmount * 100000000); // Assuming 8 decimals

    for (const utxo of sortedUTXOs) {
      selected.push(utxo);
      totalSatoshis += utxo.satoshis;

      if (totalSatoshis >= requiredSatoshis) {
        break;
      }
    }

    // Check if we have enough
    if (totalSatoshis < requiredSatoshis) {
      const available = totalSatoshis / 100000000;
      throw new InsufficientFundsError(
        `Insufficient ${assetName} balance. Required: ${requiredAmount}, Available: ${available}`,
        requiredAmount,
        available
      );
    }

    return {
      utxos: selected,
      totalAmount: totalSatoshis / 100000000
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
  async selectMixedUTXOs(addresses, xnaAmount, assetName = null, assetAmount = 0) {
    const result = {
      xnaUTXOs: [],
      assetUTXOs: [],
      totalXNA: 0,
      totalAsset: 0
    };

    // Select XNA UTXOs if needed
    if (xnaAmount > 0) {
      const xnaSelection = await this.selectBaseCurrencyUTXOs(addresses, xnaAmount);
      result.xnaUTXOs = xnaSelection.utxos;
      result.totalXNA = xnaSelection.totalAmount;
    }

    // Select asset UTXOs if needed
    if (assetName && assetAmount > 0) {
      const assetSelection = await this.selectAssetUTXOs(addresses, assetName, assetAmount);
      result.assetUTXOs = assetSelection.utxos;
      result.totalAsset = assetSelection.totalAmount;
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
    const utxos = await this.getUTXOs(addresses, assetName);
    const mempool = await this.getMempoolEntries(addresses);
    const availableUTXOs = this.filterMempoolSpentUTXOs(utxos, mempool);

    const totalSatoshis = availableUTXOs.reduce((sum, utxo) => sum + utxo.satoshis, 0);
    return totalSatoshis / 100000000;
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
    const sizeVbytes = this.estimateTransactionSize(inputs, outputs);
    const sizeKB = sizeVbytes / 1000;
    const fee = sizeKB * feeRate;

    // Round up to 8 decimals
    return Math.ceil(fee * 100000000) / 100000000;
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

module.exports = UTXOSelector;
