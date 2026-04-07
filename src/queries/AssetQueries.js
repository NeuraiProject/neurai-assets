/**
 * Asset Queries
 * Wrapper methods for querying asset information from the blockchain
 *
 * Provides convenient access to all asset-related RPC query methods:
 * - Asset metadata (getassetdata)
 * - Asset listings (listassets, listmyassets)
 * - Holder information (listaddressesbyasset)
 * - Balance queries (listassetbalancesbyaddress)
 * - Qualifier checks (checkaddresstag, listtagsforaddress)
 * - Restriction checks (checkaddressrestriction, checkglobalrestriction)
 * - Verifier validation (isvalidverifierstring)
 */

const { AssetNotFoundError, InvalidAddressError } = require('../errors');

class AssetQueries {
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
   * Get asset metadata
   * @param {string} assetName - Asset name
   * @returns {Promise<object>} Asset data
   * @throws {AssetNotFoundError} If asset doesn't exist
   */
  async getAssetData(assetName) {
    if (!assetName) {
      throw new Error('Asset name is required');
    }

    try {
      const assetData = await this.rpc('getassetdata', [assetName]);

      if (!assetData) {
        throw new AssetNotFoundError(
          `Asset ${assetName} not found on blockchain`,
          assetName
        );
      }

      return assetData;
    } catch (error) {
      if (error instanceof AssetNotFoundError) {
        throw error;
      }

      // RPC error - likely asset doesn't exist
      if (error.message && error.message.includes('not found')) {
        throw new AssetNotFoundError(
          `Asset ${assetName} not found on blockchain`,
          assetName
        );
      }

      throw new Error(`Failed to get asset data: ${error.message}`);
    }
  }

  /**
   * List all assets on the blockchain
   * @param {string} filter - Filter pattern (e.g., 'MY*' for all assets starting with MY)
   * @param {boolean} verbose - Include detailed information
   * @param {number} count - Maximum number to return
   * @param {number} start - Starting index (for pagination)
   * @returns {Promise<Array|object>} Array of asset names or detailed objects
   */
  async listAssets(filter = '*', verbose = false, count = 100, start = 0) {
    try {
      const assets = await this.rpc('listassets', [filter, verbose, count, start]);
      return assets || [];
    } catch (error) {
      throw new Error(`Failed to list assets: ${error.message}`);
    }
  }

  /**
   * List assets owned by wallet
   * @param {string} assetName - Filter by asset name (default: '*' for all)
   * @param {boolean} verbose - Include detailed information
   * @param {number} count - Maximum number to return
   * @param {number} start - Starting index (for pagination)
   * @param {number} confs - Minimum confirmations (default: 1)
   * @returns {Promise<object>} Object with asset names as keys and amounts as values
   */
  async listMyAssets(assetName = '*', verbose = false, count = 100, start = 0, confs = 1) {
    try {
      const myAssets = await this.rpc('listmyassets', [assetName, verbose, count, start, confs]);
      return myAssets || {};
    } catch (error) {
      throw new Error(`Failed to list my assets: ${error.message}`);
    }
  }

  /**
   * List all addresses holding a specific asset
   * @param {string} assetName - Asset name
   * @param {boolean} onlyCount - Return only count instead of full list
   * @param {number} count - Maximum number to return
   * @param {number} start - Starting index (for pagination)
   * @returns {Promise<Array|number>} Array of {address, amount} or count
   */
  async listAddressesByAsset(assetName, onlyCount = false, count = 100, start = 0) {
    if (!assetName) {
      throw new Error('Asset name is required');
    }

    try {
      const result = await this.rpc('listaddressesbyasset', [assetName, onlyCount, count, start]);
      return result || (onlyCount ? 0 : []);
    } catch (error) {
      if (error.message && error.message.includes('not found')) {
        throw new AssetNotFoundError(
          `Asset ${assetName} not found on blockchain`,
          assetName
        );
      }
      throw new Error(`Failed to list addresses by asset: ${error.message}`);
    }
  }

  /**
   * List asset balances for a specific address
   * @param {string} address - Address to query
   * @param {boolean} onlyTotal - Return only count instead of full list
   * @param {number} count - Maximum number to return
   * @param {number} start - Starting index (for pagination)
   * @returns {Promise<Array|number>} Array of {asset, amount} or count
   */
  async listAssetBalancesByAddress(address, onlyTotal = false, count = 100, start = 0) {
    if (!address) {
      throw new Error('Address is required');
    }

    try {
      const result = await this.rpc('listassetbalancesbyaddress', [address, onlyTotal, count, start]);
      return result || (onlyTotal ? 0 : []);
    } catch (error) {
      throw new Error(`Failed to list asset balances by address: ${error.message}`);
    }
  }

  /**
   * Check if an address has a specific qualifier tag
   * @param {string} address - Address to check
   * @param {string} qualifierName - Qualifier name (e.g., '#KYC_VERIFIED')
   * @returns {Promise<boolean>} True if address has the tag
   */
  async checkAddressTag(address, qualifierName) {
    if (!address) {
      throw new Error('Address is required');
    }

    if (!qualifierName) {
      throw new Error('Qualifier name is required');
    }

    try {
      const result = await this.rpc('checkaddresstag', [address, qualifierName]);
      return result === true || result === 1;
    } catch (error) {
      // If tag doesn't exist or address doesn't have it, return false
      if (error.message && (error.message.includes('not found') || error.message.includes('does not have'))) {
        return false;
      }
      throw new Error(`Failed to check address tag: ${error.message}`);
    }
  }

  /**
   * List all qualifiers assigned to an address
   * @param {string} address - Address to query
   * @returns {Promise<Array>} Array of qualifier names
   */
  async listTagsForAddress(address) {
    if (!address) {
      throw new Error('Address is required');
    }

    try {
      const tags = await this.rpc('listtagsforaddress', [address]);
      return tags || [];
    } catch (error) {
      // If no tags found, return empty array
      if (error.message && error.message.includes('not found')) {
        return [];
      }
      throw new Error(`Failed to list tags for address: ${error.message}`);
    }
  }

  /**
   * List all addresses with a specific qualifier tag
   * @param {string} qualifierName - Qualifier name
   * @returns {Promise<Array>} Array of addresses
   */
  async listAddressesForTag(qualifierName) {
    if (!qualifierName) {
      throw new Error('Qualifier name is required');
    }

    try {
      const addresses = await this.rpc('listaddressesfortag', [qualifierName]);
      return addresses || [];
    } catch (error) {
      if (error.message && error.message.includes('not found')) {
        throw new AssetNotFoundError(
          `Qualifier ${qualifierName} not found on blockchain`,
          qualifierName
        );
      }
      throw new Error(`Failed to list addresses for tag: ${error.message}`);
    }
  }

  /**
   * Check if an address can hold a restricted asset
   * @param {string} address - Address to check
   * @param {string} restrictedAssetName - Restricted asset name (e.g., '$SECURITY')
   * @returns {Promise<boolean>} True if address meets verifier requirements
   */
  async checkAddressRestriction(address, restrictedAssetName) {
    if (!address) {
      throw new Error('Address is required');
    }

    if (!restrictedAssetName) {
      throw new Error('Restricted asset name is required');
    }

    try {
      const result = await this.rpc('checkaddressrestriction', [address, restrictedAssetName]);
      return result === true || result === 1;
    } catch (error) {
      // If address doesn't meet requirements, return false
      if (error.message && (error.message.includes('not found') || error.message.includes('does not meet'))) {
        return false;
      }
      throw new Error(`Failed to check address restriction: ${error.message}`);
    }
  }

  /**
   * Check if an address is frozen for a restricted asset
   * @param {string} address - Address to check
   * @param {string} restrictedAssetName - Restricted asset name
   * @returns {Promise<boolean>} True if address is frozen
   */
  async isAddressFrozen(address, restrictedAssetName) {
    if (!address) {
      throw new Error('Address is required');
    }

    if (!restrictedAssetName) {
      throw new Error('Restricted asset name is required');
    }

    try {
      const result = await this.rpc('checkaddressrestriction', [address, restrictedAssetName]);
      // If result has frozen property, check it
      if (typeof result === 'object' && result.frozen !== undefined) {
        return result.frozen === true || result.frozen === 1;
      }
      return false;
    } catch (error) {
      throw new Error(`Failed to check if address is frozen: ${error.message}`);
    }
  }

  /**
   * Check if an asset is globally frozen
   * @param {string} restrictedAssetName - Restricted asset name
   * @returns {Promise<boolean>} True if asset is globally frozen
   */
  async checkGlobalRestriction(restrictedAssetName) {
    if (!restrictedAssetName) {
      throw new Error('Restricted asset name is required');
    }

    try {
      const result = await this.rpc('checkglobalrestriction', [restrictedAssetName]);
      return result === true || result === 1;
    } catch (error) {
      if (error.message && error.message.includes('not found')) {
        throw new AssetNotFoundError(
          `Restricted asset ${restrictedAssetName} not found on blockchain`,
          restrictedAssetName
        );
      }
      throw new Error(`Failed to check global restriction: ${error.message}`);
    }
  }

  /**
   * Get verifier string for a restricted asset
   * @param {string} restrictedAssetName - Restricted asset name
   * @returns {Promise<string>} Verifier string
   */
  async getVerifierString(restrictedAssetName) {
    if (!restrictedAssetName) {
      throw new Error('Restricted asset name is required');
    }

    try {
      const result = await this.rpc('getverifierstring', [restrictedAssetName]);
      return result || '';
    } catch (error) {
      if (error.message && error.message.includes('not found')) {
        throw new AssetNotFoundError(
          `Restricted asset ${restrictedAssetName} not found on blockchain`,
          restrictedAssetName
        );
      }
      throw new Error(`Failed to get verifier string: ${error.message}`);
    }
  }

  /**
   * Validate verifier string syntax
   * @param {string} verifierString - Verifier string to validate
   * @returns {Promise<boolean>} True if valid
   */
  async isValidVerifierString(verifierString) {
    if (!verifierString) {
      throw new Error('Verifier string is required');
    }

    try {
      const result = await this.rpc('isvalidverifierstring', [verifierString]);
      return result === true || result === 1;
    } catch (error) {
      // If validation fails, return false
      return false;
    }
  }

  /**
   * Get snapshot of asset ownership at a specific block
   * @param {string} assetName - Asset name
   * @param {number} blockHeight - Block height for snapshot
   * @returns {Promise<object>} Snapshot request result
   */
  async getSnapshotRequest(assetName, blockHeight) {
    if (!assetName) {
      throw new Error('Asset name is required');
    }

    if (!blockHeight || typeof blockHeight !== 'number') {
      throw new Error('Block height must be a number');
    }

    try {
      const result = await this.rpc('getsnapshotrequest', [assetName, blockHeight]);
      return result;
    } catch (error) {
      throw new Error(`Failed to get snapshot request: ${error.message}`);
    }
  }

  /**
   * Cancel a snapshot request
   * @param {string} assetName - Asset name
   * @param {number} blockHeight - Block height of snapshot to cancel
   * @returns {Promise<boolean>} True if cancelled successfully
   */
  async cancelSnapshotRequest(assetName, blockHeight) {
    if (!assetName) {
      throw new Error('Asset name is required');
    }

    if (!blockHeight || typeof blockHeight !== 'number') {
      throw new Error('Block height must be a number');
    }

    try {
      const result = await this.rpc('cancelsnapshotrequest', [assetName, blockHeight]);
      return result === true || result === 1;
    } catch (error) {
      throw new Error(`Failed to cancel snapshot request: ${error.message}`);
    }
  }

  /**
   * List DEPIN holders with validity status
   * @param {string} assetName - DEPIN asset name
   * @returns {Promise<Array>} Array of holder objects
   */
  async listDepinHolders(assetName) {
    if (!assetName) {
      throw new Error('DEPIN asset name is required');
    }

    try {
      const result = await this.rpc('listdepinholders', [assetName]);
      return result || [];
    } catch (error) {
      if (error.message && error.message.includes('not found')) {
        throw new AssetNotFoundError(
          `DEPIN asset ${assetName} not found on blockchain`,
          assetName
        );
      }
      throw new Error(`Failed to list DEPIN holders: ${error.message}`);
    }
  }

  /**
   * Check DEPIN validity for a specific address
   * @param {string} assetName - DEPIN asset name
   * @param {string} address - Address to query
   * @returns {Promise<object>} Validity information
   */
  async checkDepinValidity(assetName, address) {
    if (!assetName) {
      throw new Error('DEPIN asset name is required');
    }

    if (!address) {
      throw new Error('Address is required');
    }

    try {
      const result = await this.rpc('checkdepinvalidity', [assetName, address]);
      return result || { has_asset: false };
    } catch (error) {
      throw new Error(`Failed to check DEPIN validity: ${error.message}`);
    }
  }

  /**
   * Get total count of assets on blockchain
   * @returns {Promise<number>} Total asset count
   */
  async getAssetCount() {
    try {
      // List all assets with count only
      const assets = await this.listAssets('*', false, 1, 0);
      return Array.isArray(assets) ? assets.length : 0;
    } catch (error) {
      throw new Error(`Failed to get asset count: ${error.message}`);
    }
  }

  /**
   * Check if asset exists
   * @param {string} assetName - Asset name
   * @returns {Promise<boolean>} True if asset exists
   */
  async assetExists(assetName) {
    try {
      await this.getAssetData(assetName);
      return true;
    } catch (error) {
      if (error instanceof AssetNotFoundError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get asset type from name
   * @param {string} assetName - Asset name
   * @returns {string} Asset type ('ROOT', 'SUB', 'UNIQUE', 'QUALIFIER', 'RESTRICTED', 'DEPIN', 'OWNER')
   */
  getAssetType(assetName) {
    if (!assetName) {
      throw new Error('Asset name is required');
    }

    if (assetName.endsWith('!')) {
      return 'OWNER';
    } else if (assetName.startsWith('#')) {
      return assetName.includes('/') ? 'SUB_QUALIFIER' : 'QUALIFIER';
    } else if (assetName.startsWith('$')) {
      return 'RESTRICTED';
    } else if (assetName.startsWith('&')) {
      return 'DEPIN';
    } else if (assetName.includes('#')) {
      return 'UNIQUE';
    } else if (assetName.includes('/')) {
      return 'SUB';
    } else {
      return 'ROOT';
    }
  }
}

module.exports = AssetQueries;
