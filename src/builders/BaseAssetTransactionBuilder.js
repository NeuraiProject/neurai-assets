/**
 * Base Asset Transaction Builder
 * Abstract base class for all transaction builders
 *
 * Provides common functionality:
 * - UTXO selection
 * - Fee estimation
 * - Output ordering
 * - Raw transaction creation
 * - Validation
 *
 * Subclasses must implement:
 * - validateParams(params)
 * - build()
 */

const { BurnManager, OwnerTokenManager, UTXOSelector, OutputOrderer } = require('../managers');
const { AssetNameValidator, AmountValidator } = require('../validators');

class BaseAssetTransactionBuilder {
  /**
   * @param {Function} rpc - RPC function
   * @param {string} network - Network type ('xna' or 'xna-test')
   * @param {string[]|Function} addresses - Wallet addresses or function that returns addresses
   * @param {object} params - Transaction parameters
   */
  constructor(rpc, networkOrParams, addresses, params) {
    if (!rpc || typeof rpc !== 'function') {
      throw new Error('RPC function is required');
    }

    // Support both (rpc, network, addresses, params) and (rpc, params) calling forms.
    // NeuraiAssets passes a single merged params object as the second argument.
    let network, actualAddresses, actualParams;
    if (
      typeof networkOrParams === 'object' &&
      networkOrParams !== null &&
      !Array.isArray(networkOrParams) &&
      addresses === undefined
    ) {
      network = networkOrParams.network;
      actualAddresses = networkOrParams.addresses;
      actualParams = networkOrParams;
    } else {
      network = networkOrParams;
      actualAddresses = addresses;
      actualParams = params;
    }

    if (!network) {
      throw new Error('Network is required');
    }

    // Addresses can be an array or a function that returns addresses
    if (typeof actualAddresses === 'function') {
      this.getAddresses = actualAddresses;
    } else if (Array.isArray(actualAddresses)) {
      this.getAddresses = () => actualAddresses;
    } else {
      throw new Error('Addresses must be an array or a function');
    }

    this.rpc = rpc;
    this.network = network;
    this.params = actualParams || {};

    // Initialize managers
    this.burnManager = new BurnManager(network);
    this.ownerTokenManager = new OwnerTokenManager(rpc);
    this.utxoSelector = new UTXOSelector(rpc);
    this.outputOrderer = new OutputOrderer();
  }

  /**
   * Get wallet addresses
   * @returns {string[]} Array of addresses
   */
  async _getAddresses() {
    const addresses = await this.getAddresses();
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new Error('No addresses available');
    }
    return addresses;
  }

  /**
   * Validate transaction parameters
   * Must be implemented by subclasses
   * @param {object} params - Parameters to validate
   * @throws {Error} If validation fails
   */
  validateParams(params) {
    throw new Error('validateParams must be implemented by subclass');
  }

  /**
   * Build the transaction
   * Must be implemented by subclasses
   * @returns {Promise<object>} Transaction result
   */
  async build() {
    throw new Error('build must be implemented by subclass');
  }

  /**
   * Estimate transaction fee
   * @param {number} inputCount - Number of inputs
   * @param {number} outputCount - Number of outputs
   * @returns {Promise<number>} Estimated fee in XNA
   */
  async estimateFee(inputCount, outputCount) {
    const feeRate = await this.utxoSelector.getFeeRate();
    return this.utxoSelector.estimateFee(inputCount, outputCount, feeRate);
  }

  /**
   * Select UTXOs for transaction
   * @param {number} xnaAmount - Required XNA amount (for fees + burn)
   * @param {string|null} assetName - Asset name if needed
   * @param {number} assetAmount - Asset amount if needed
   * @returns {Promise<object>} Selected UTXOs
   */
  async selectUTXOs(xnaAmount, assetName = null, assetAmount = 0) {
    const addresses = await this._getAddresses();
    return this.utxoSelector.selectMixedUTXOs(
      addresses,
      xnaAmount,
      assetName,
      assetAmount
    );
  }

  /**
   * Build raw transaction using RPC
   * @param {Array} inputs - Transaction inputs
   * @param {object} outputs - Transaction outputs (must be ordered)
   * @returns {Promise<string>} Raw transaction hex
   */
  async buildRawTransaction(inputs, outputs) {
    try {
      // Format inputs for createrawtransaction
      const formattedInputs = inputs.map(input => ({
        txid: input.txid,
        vout: input.vout !== undefined ? input.vout : input.outputIndex
      }));

      // Call createrawtransaction
      const rawTx = await this.rpc('createrawtransaction', [
        formattedInputs,
        outputs
      ]);

      return rawTx;
    } catch (error) {
      throw new Error(`Failed to create raw transaction: ${error.message}`);
    }
  }

  /**
   * Calculate change amount
   * @param {number} totalInput - Total input amount
   * @param {number} totalOutput - Total output amount (including fee)
   * @returns {number} Change amount
   */
  calculateChange(totalInput, totalOutput) {
    const change = totalInput - totalOutput;
    if (change < 0) {
      throw new Error('Insufficient funds: inputs < outputs');
    }
    return change;
  }

  /**
   * Get change address
   * Uses first address from wallet by default
   * Can be overridden by params.changeAddress
   * @returns {Promise<string>} Change address
   */
  async getChangeAddress() {
    if (this.params.changeAddress) {
      return this.params.changeAddress;
    }

    const addresses = await this._getAddresses();
    return addresses[0];
  }

  /**
   * Get recipient address
   * Uses first address from wallet if not specified
   * @returns {Promise<string>} Recipient address
   */
  async getToAddress() {
    if (this.params.toAddress) {
      return this.params.toAddress;
    }

    const addresses = await this._getAddresses();
    return addresses[0];
  }

  /**
   * Common validation for asset name
   * @param {string} assetName - Asset name to validate
   * @param {string} type - Expected type ('ROOT', 'SUB', etc.)
   */
  validateAssetName(assetName, type) {
    if (!assetName) {
      throw new Error('Asset name is required');
    }

    switch (type) {
      case 'ROOT':
        AssetNameValidator.validateRoot(assetName);
        break;
      case 'SUB':
        AssetNameValidator.validateSub(assetName);
        break;
      case 'UNIQUE':
        AssetNameValidator.validateUnique(assetName);
        break;
      case 'QUALIFIER':
        AssetNameValidator.validateQualifier(assetName);
        break;
      case 'RESTRICTED':
        AssetNameValidator.validateRestricted(assetName);
        break;
      default:
        throw new Error(`Unknown asset type: ${type}`);
    }
  }

  /**
   * Common validation for amount and units
   * @param {number} quantity - Quantity to validate
   * @param {number} units - Units (decimal places)
   */
  validateAmount(quantity, units) {
    AmountValidator.validate(quantity, units);
  }

  /**
   * Convert amount to satoshis
   * @param {number} amount - Amount in asset units
   * @param {number} units - Decimal places
   * @returns {number} Amount in satoshis
   */
  toSatoshis(amount, units) {
    return Math.round(amount * Math.pow(10, units));
  }

  /**
   * Convert satoshis to amount
   * @param {number} satoshis - Amount in satoshis
   * @param {number} units - Decimal places
   * @returns {number} Amount in asset units
   */
  fromSatoshis(satoshis, units) {
    return satoshis / Math.pow(10, units);
  }

  /**
   * Format transaction result
   * @param {string} rawTx - Raw transaction hex
   * @param {Array} utxos - UTXOs used
   * @param {Array} inputs - Transaction inputs
   * @param {object} outputs - Transaction outputs
   * @param {number} fee - Transaction fee
   * @param {number} burnAmount - Burn amount
   * @param {object} extra - Extra information
   * @returns {object} Formatted result
   */
  formatResult(rawTx, utxos, inputs, outputs, fee, burnAmount, extra = {}) {
    return {
      rawTx,
      utxos,
      inputs,
      outputs,
      fee,
      burnAmount,
      ...extra
    };
  }

  /**
   * Check if asset exists (to prevent creating duplicates)
   * @param {string} assetName - Asset name to check
   * @returns {Promise<boolean>} True if exists
   */
  async assetExists(assetName) {
    try {
      const assetData = await this.rpc('getassetdata', [assetName]);
      return assetData !== null && assetData !== undefined;
    } catch (error) {
      // If asset doesn't exist, RPC will throw error
      if (error.message && error.message.includes('not found')) {
        return false;
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Get asset data from blockchain
   * @param {string} assetName - Asset name
   * @returns {Promise<object|null>} Asset data or null if not found
   */
  async getAssetData(assetName) {
    try {
      return await this.rpc('getassetdata', [assetName]);
    } catch (error) {
      if (error.message && error.message.includes('not found')) {
        return null;
      }
      throw error;
    }
  }
}

module.exports = BaseAssetTransactionBuilder;
