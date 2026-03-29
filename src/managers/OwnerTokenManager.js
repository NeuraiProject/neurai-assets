/**
 * Owner Token Manager
 * CRITICAL: Manages owner token UTXOs and ensures they are properly returned
 *
 * Owner tokens (ASSET!) are required for:
 * - Reissuing assets
 * - Creating sub-assets
 * - Managing restricted assets (freeze/unfreeze)
 *
 * WARNING: If an owner token is not included in transaction outputs,
 * it will be PERMANENTLY LOST and the asset can never be reissued or managed.
 */

const { AssetNameParser } = require('../utils');
const {
  OwnerTokenNotFoundError,
  OwnerTokenNotReturnedError,
  AssetError
} = require('../errors');

class OwnerTokenManager {
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
   * Find owner token UTXO in wallet addresses
   * @param {string} ownerTokenName - Owner token name (e.g., 'MYTOKEN!')
   * @param {string[]} addresses - Array of wallet addresses
   * @returns {Promise<object>} Owner token UTXO
   * @throws {OwnerTokenNotFoundError} If owner token not found
   */
  async findOwnerTokenUTXO(ownerTokenName, addresses) {
    if (!ownerTokenName || !ownerTokenName.endsWith('!')) {
      throw new Error('Owner token name must end with !');
    }

    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new Error('Addresses array is required');
    }

    try {
      // Request UTXOs for the specific owner token via assetName param
      const utxos = await this.rpc('getaddressutxos', [{ addresses, assetName: ownerTokenName }]);

      // Filter for the specific owner token
      const ownerTokenUTXOs = utxos.filter(utxo => utxo.assetName === ownerTokenName);

      if (ownerTokenUTXOs.length === 0) {
        throw new OwnerTokenNotFoundError(
          `Owner token ${ownerTokenName} not found in wallet addresses. ` +
          `You must own the owner token to perform this operation.`,
          ownerTokenName
        );
      }

      // Owner tokens should be indivisible (only 1 UTXO typically)
      // But if split, return the first one found
      return ownerTokenUTXOs[0];
    } catch (error) {
      if (error instanceof OwnerTokenNotFoundError) {
        throw error;
      }

      throw new AssetError(
        `Failed to find owner token ${ownerTokenName}: ${error.message}`
      );
    }
  }

  /**
   * Find owner token UTXO by base asset name
   * @param {string} assetName - Base asset name (without !)
   * @param {string[]} addresses - Array of wallet addresses
   * @returns {Promise<object>} Owner token UTXO
   */
  async findOwnerTokenByAssetName(assetName, addresses) {
    const ownerTokenName = AssetNameParser.getOwnerTokenName(assetName);
    return this.findOwnerTokenUTXO(ownerTokenName, addresses);
  }

  /**
   * Create owner token return output
   * Owner tokens must always be returned to an address or they're lost forever
   *
   * @param {string} ownerTokenName - Owner token name (e.g., 'MYTOKEN!')
   * @param {string} returnAddress - Address to return owner token to
   * @returns {object} Output object for owner token transfer
   */
  createOwnerTokenReturnOutput(ownerTokenName, returnAddress) {
    if (!ownerTokenName || !ownerTokenName.endsWith('!')) {
      throw new Error('Owner token name must end with !');
    }

    if (!returnAddress) {
      throw new Error('Return address is required');
    }

    // Owner tokens are always exactly 1.0
    return {
      [returnAddress]: {
        transfer: {
          [ownerTokenName]: 1.0
        }
      }
    };
  }

  /**
   * Validate that owner token inputs are properly returned in outputs
   * CRITICAL: This prevents permanent loss of owner tokens
   *
   * @param {Array} inputs - Transaction inputs
   * @param {object} outputs - Transaction outputs
   * @returns {boolean} True if valid
   * @throws {OwnerTokenNotReturnedError} If owner token not returned
   */
  validateOwnerTokenReturn(inputs, outputs) {
    // Find all owner token inputs
    const ownerTokenInputs = inputs.filter(input => {
      return input.assetName && input.assetName.endsWith('!');
    });

    // If no owner tokens in inputs, validation passes
    if (ownerTokenInputs.length === 0) {
      return true;
    }

    // Check each owner token is in outputs
    const outputEntries = Array.isArray(outputs)
      ? outputs.map(obj => Object.entries(obj)[0])
      : Object.entries(outputs);

    for (const ownerInput of ownerTokenInputs) {
      const ownerTokenName = ownerInput.assetName;
      let foundInOutputs = false;

      // Check all outputs for owner token
      for (const [address, output] of outputEntries) {
        // Check if output has transfer field
        if (output && typeof output === 'object' && output.transfer) {
          // Check if owner token is in the transfer
          if (output.transfer[ownerTokenName]) {
            foundInOutputs = true;
            break;
          }
        }
      }

      if (!foundInOutputs) {
        throw new OwnerTokenNotReturnedError(
          `CRITICAL: Owner token ${ownerTokenName} is not returned in outputs! ` +
          `This will result in PERMANENT LOSS of the owner token and you will ` +
          `never be able to reissue or manage this asset again. ` +
          `The owner token MUST be included in the transaction outputs.`,
          ownerTokenName
        );
      }
    }

    return true;
  }

  /**
   * Check if wallet owns an owner token
   * @param {string} ownerTokenName - Owner token name (e.g., 'MYTOKEN!')
   * @param {string[]} addresses - Array of wallet addresses
   * @returns {Promise<boolean>} True if wallet owns the owner token
   */
  async hasOwnerToken(ownerTokenName, addresses) {
    try {
      await this.findOwnerTokenUTXO(ownerTokenName, addresses);
      return true;
    } catch (error) {
      if (error instanceof OwnerTokenNotFoundError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get all owner tokens in wallet
   * @param {string[]} addresses - Array of wallet addresses
   * @returns {Promise<Array>} Array of owner token UTXOs
   */
  async getAllOwnerTokens(addresses) {
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new Error('Addresses array is required');
    }

    try {
      // Request all asset UTXOs with assetName='*'
      const utxos = await this.rpc('getaddressutxos', [{ addresses, assetName: '*' }]);

      // Filter for owner tokens (asset names ending with !)
      const ownerTokenUTXOs = utxos.filter(utxo => {
        return utxo.assetName && utxo.assetName.endsWith('!');
      });

      return ownerTokenUTXOs;
    } catch (error) {
      throw new AssetError(
        `Failed to get owner tokens: ${error.message}`
      );
    }
  }

  /**
   * Verify owner token quantity is correct (always 1)
   * @param {object} ownerTokenUTXO - Owner token UTXO
   * @returns {boolean} True if valid
   * @throws {Error} If quantity is not 1
   */
  validateOwnerTokenQuantity(ownerTokenUTXO) {
    // Owner tokens should always have satoshis = 100000000 (1.0 with 8 decimals)
    const expectedSatoshis = 100000000;

    if (ownerTokenUTXO.satoshis !== expectedSatoshis) {
      throw new Error(
        `Invalid owner token quantity. Expected ${expectedSatoshis} satoshis, ` +
        `got ${ownerTokenUTXO.satoshis}. Owner tokens must always be exactly 1.0`
      );
    }

    return true;
  }

  /**
   * Add owner token input and output to transaction
   * Convenience method that handles both finding and returning owner token
   *
   * @param {string} assetName - Base asset name (without !)
   * @param {string[]} addresses - Wallet addresses
   * @param {string} returnAddress - Address to return owner token to
   * @returns {Promise<object>} { input, output }
   */
  async prepareOwnerTokenForTransaction(assetName, addresses, returnAddress) {
    // Find owner token UTXO
    const ownerTokenUTXO = await this.findOwnerTokenByAssetName(assetName, addresses);

    // Validate quantity
    this.validateOwnerTokenQuantity(ownerTokenUTXO);

    // Create input
    const input = {
      txid: ownerTokenUTXO.txid,
      vout: ownerTokenUTXO.outputIndex,
      address: ownerTokenUTXO.address,
      assetName: ownerTokenUTXO.assetName,
      satoshis: ownerTokenUTXO.satoshis
    };

    // Create output
    const output = this.createOwnerTokenReturnOutput(
      ownerTokenUTXO.assetName,
      returnAddress
    );

    return { input, output, utxo: ownerTokenUTXO };
  }
}

module.exports = OwnerTokenManager;
