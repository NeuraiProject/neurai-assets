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
      actualAddresses = networkOrParams.walletAddresses || networkOrParams.addresses;
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

    // `estimatesmartfee` is called twice per build (pre-selection guess and
    // post-selection recompute). The fee rate is stable for the duration of
    // a single build, so cache the first lookup and reuse it.
    this._feeRatePromise = null;
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
   * Estimate transaction fee.
   *
   * Both arguments accept either a count (legacy) or an array of descriptors
   * that lets the underlying estimator distinguish PQ AuthScript inputs/outputs
   * from legacy P2PKH ones. Pass arrays whenever you have actual UTXOs and
   * output addresses on hand — counts produce a legacy-only estimate.
   *
   * @param {number|Array} inputs - Input count or array of UTXO-like descriptors
   * @param {number|Array} outputs - Output count or array of address-like descriptors
   * @returns {Promise<number>} Estimated fee in XNA
   */
  async estimateFee(inputs, outputs) {
    if (!this._feeRatePromise) {
      this._feeRatePromise = this.utxoSelector.getFeeRate();
    }
    const feeRate = await this._feeRatePromise;
    return this.utxoSelector.estimateFee(inputs, outputs, feeRate);
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
        AssetNameValidator.validateRoot(assetName, this.network);
        break;
      case 'SUB':
        AssetNameValidator.validateSub(assetName, this.network);
        break;
      case 'UNIQUE':
        AssetNameValidator.validateUnique(assetName, this.network);
        break;
      case 'QUALIFIER':
        AssetNameValidator.validateQualifier(assetName, this.network);
        break;
      case 'RESTRICTED':
        AssetNameValidator.validateRestricted(assetName, this.network);
        break;
      case 'DEPIN':
        AssetNameValidator.validateDepin(assetName, this.network);
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
   * Build the JSON `asset_quantity` value for a `createrawtransaction`
   * output (issue / reissue / tag change_quantity / etc.).
   *
   * The chain parses this field with `AmountFromValue()` (Bitcoin-style
   * decimal-XNA → 10^8 sats), then validates that the resulting CAmount
   * is a multiple of `10^(8 - units)` via `CheckAmountWithUnits`
   * (assets.cpp). So:
   *
   *   - The JSON value MUST be the user-facing display amount
   *     (e.g. "1" for one token, "1.5" for one and a half tokens).
   *   - The lib must NOT pre-multiply by 10^8 or 10^units; the daemon
   *     does the 10^8 scaling itself, and any extra factor here lands
   *     duplicated and inflates the minted supply (or trips the
   *     ParseFixedPoint `exponent >= 18` cap → "Invalid amount (3)").
   *
   * History: pre-1.2.2 multiplied by 10^units (correct only for units=0
   * assets, inflated everything else by 10^units). v1.2.2 changed to
   * always 10^8 (correct only for units=8, inflated everything else by
   * 10^8 — e.g. reissuing 1 token of a units=0 asset minted 100,000,000).
   * The right answer is to send the value untouched.
   *
   * The `units` parameter is kept for API compatibility but is unused.
   *
   * @param {number} amount - User-facing asset amount
   * @param {number} units - Asset decimal places (unused; kept for API)
   * @returns {number} The user-facing amount, ready for the JSON output
   */
  toSatoshis(amount, units) {
    void units;
    return amount;
  }

  /**
   * Convert a chain-side asset balance / UTXO satoshis value back to a
   * user-facing amount. The chain consistently encodes asset balances
   * in 10^8 sats (because everything goes through AmountFromValue on
   * the way in), so the divisor is always 10^8 — independent of the
   * asset's `units`.
   *
   * @param {number} satoshis - Chain value in 10^8 sats
   * @param {number} units - Asset decimal places (unused; kept for API)
   * @returns {number} User-facing asset amount
   */
  fromSatoshis(satoshis, units) {
    void units;
    return satoshis / 100000000;
  }

  /**
   * Normalize builder inputs to raw transaction inputs
   * @param {Array} inputs - Builder inputs
   * @returns {Array<{txid: string, vout: number}>} Raw transaction inputs
   */
  toRawTxInputs(inputs) {
    return (inputs || []).map(input => ({
      txid: input.txid,
      vout: input.vout !== undefined ? input.vout : input.outputIndex
    }));
  }

  /**
   * Convert XNA amount to satoshis
   * @param {number|null|undefined} amount - Amount in XNA
   * @returns {number|undefined} Amount in satoshis
   */
  xnaToSatoshis(amount) {
    if (amount === undefined || amount === null) {
      return undefined;
    }

    return Math.round(amount * 100000000);
  }

  /**
   * Build a typed local raw build payload compatible with
   * @neuraiproject/neurai-create-transaction createFromOperation(...)
   *
   * @param {string} operationType - Operation type
   * @param {Array} inputs - Builder inputs
   * @param {object|null} burnInfo - Burn metadata
   * @param {string|null} changeAddress - XNA change address
   * @param {number|null} changeAmount - XNA change amount in XNA
   * @param {object} operationParams - Operation-specific params
   * @returns {{ operationType: string, params: object }} Local raw build
   */
  buildLocalRawBuild(
    operationType,
    inputs,
    burnInfo = null,
    changeAddress = null,
    changeAmount = null,
    operationParams = {}
  ) {
    const params = {
      inputs: this.toRawTxInputs(inputs),
      ...operationParams
    };

    if (burnInfo && burnInfo.address && burnInfo.amount !== undefined && burnInfo.amount !== null) {
      params.burnAddress = burnInfo.address;
      params.burnAmountSats = this.xnaToSatoshis(burnInfo.amount);
    }

    if (changeAddress && changeAmount !== undefined && changeAmount !== null) {
      params.xnaChangeAddress = changeAddress;
      params.xnaChangeSats = this.xnaToSatoshis(changeAmount);
    }

    return {
      operationType,
      params
    };
  }

  /**
   * Normalize ordered outputs into flat entries
   * @param {Array|object} outputs - Transaction outputs
   * @returns {Array<{address: string, value: unknown}>} Output entries
   */
  getOutputEntries(outputs) {
    if (Array.isArray(outputs)) {
      return outputs.map(output => {
        const [address, value] = Object.entries(output)[0];
        return { address, value };
      });
    }

    if (outputs && typeof outputs === 'object') {
      return Object.entries(outputs).map(([address, value]) => ({ address, value }));
    }

    return [];
  }

  /**
   * Extract burn metadata from outputs
   * @param {Array<{address: string, value: unknown}>} entries - Output entries
   * @param {number} burnAmount - Burn amount in XNA
   * @returns {{ burnAddress: string|null, burnAmount: number }}
   */
  extractBurnMetadata(entries, burnAmount) {
    if (!burnAmount || burnAmount <= 0) {
      return {
        burnAddress: null,
        burnAmount: 0
      };
    }

    const burnEntry = entries.find(({ address, value }) => {
      return typeof value === 'number' &&
        value === burnAmount &&
        this.burnManager.isBurnAddress(address);
    });

    return {
      burnAddress: burnEntry ? burnEntry.address : null,
      burnAmount
    };
  }

  /**
   * Extract XNA change metadata from outputs
   * @param {Array<{address: string, value: unknown}>} entries - Output entries
   * @param {string|null} burnAddress - Burn address if present
   * @returns {{ changeAddress: string|null, changeAmount: number|null }}
   */
  extractChangeMetadata(entries, burnAddress = null) {
    const xnaOutputs = entries.filter(({ address, value }) => {
      return typeof value === 'number' && address !== burnAddress;
    });

    if (xnaOutputs.length !== 1) {
      return {
        changeAddress: null,
        changeAmount: null
      };
    }

    return {
      changeAddress: xnaOutputs[0].address,
      changeAmount: xnaOutputs[0].value
    };
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
    const outputEntries = this.getOutputEntries(outputs);
    const burnMetadata = this.extractBurnMetadata(outputEntries, burnAmount);
    const changeMetadata = this.extractChangeMetadata(outputEntries, burnMetadata.burnAddress);

    return {
      rawTx,
      utxos,
      inputs,
      outputs,
      fee,
      burnAmount: burnMetadata.burnAmount,
      network: this.network,
      buildStrategy: 'rpc-node',
      burnAddress: burnMetadata.burnAddress,
      changeAddress: extra.changeAddress !== undefined
        ? extra.changeAddress
        : changeMetadata.changeAddress,
      changeAmount: extra.changeAmount !== undefined
        ? extra.changeAmount
        : changeMetadata.changeAmount,
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
