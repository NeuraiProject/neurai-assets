/**
 * NeuraiAssets - Main API Class
 * Unified interface for all Neurai asset operations
 *
 * Usage:
 * const assets = new NeuraiAssets(rpc, {
 *   network: 'xna',
 *   addresses: ['N...'],
 *   changeAddress: 'N...',
 *   toAddress: 'N...'
 * });
 *
 * // Create asset
 * const result = await assets.createRootAsset({
 *   assetName: 'MYTOKEN',
 *   quantity: 1000000,
 *   units: 2
 * });
 *
 * // Query asset
 * const assetData = await assets.getAssetData('MYTOKEN');
 */

const { AssetQueries } = require('./queries');
const {
  IssueRootBuilder,
  IssueSubBuilder,
  IssueDepinBuilder,
  IssueUniqueBuilder,
  IssueQualifierBuilder,
  IssueRestrictedBuilder,
  ReissueBuilder,
  ReissueRestrictedBuilder,
  TagAddressBuilder,
  FreezeAddressBuilder
} = require('./builders');

class NeuraiAssets {
  /**
   * @param {Function} rpc - RPC function to call Neurai node
   * @param {object} config - Configuration options
   * @param {string} config.network - Network identifier ('xna' or 'xna-test')
   * @param {Array<string>} config.addresses - Wallet addresses
   * @param {string} config.changeAddress - Default change address
   * @param {string} config.toAddress - Default receiving address
   */
  constructor(rpc, config = {}) {
    if (!rpc || typeof rpc !== 'function') {
      throw new Error('RPC function is required');
    }

    this.rpc = rpc;
    this.config = {
      network: config.network || 'xna',
      addresses: config.addresses || [],
      changeAddress: config.changeAddress || null,
      toAddress: config.toAddress || null
    };

    // Initialize query interface
    this.queries = new AssetQueries(rpc);
  }

  /**
   * Update configuration
   * @param {object} config - New configuration
   */
  updateConfig(config) {
    Object.assign(this.config, config);
  }

  /**
   * Build transaction parameters object
   * @param {object} params - Operation-specific parameters
   * @returns {object} Complete parameters with config
   */
  _buildParams(params) {
    return {
      ...params,
      network: this.config.network,
      addresses: this.config.addresses,
      changeAddress: params.changeAddress || this.config.changeAddress,
      toAddress: params.toAddress || this.config.toAddress
    };
  }

  // ========================================
  // ROOT ASSET OPERATIONS
  // ========================================

  /**
   * Create a ROOT asset
   * @param {object} params - Asset creation parameters
   * @param {string} params.assetName - Asset name (3-30 chars, A-Z 0-9 _ .)
   * @param {number} params.quantity - Total supply
   * @param {number} [params.units=0] - Decimal places (0-8)
   * @param {boolean} [params.reissuable=true] - Can mint more later
   * @param {boolean} [params.hasIpfs=false] - Has IPFS metadata
   * @param {string} [params.ipfsHash] - IPFS hash (if hasIpfs=true)
   * @returns {Promise<object>} Transaction data
   */
  async createRootAsset(params) {
    const builder = new IssueRootBuilder(this.rpc, this._buildParams(params));
    return await builder.build();
  }

  /**
   * Create a SUB asset
   * @param {object} params - Sub-asset creation parameters
   * @param {string} params.assetName - Asset name (ROOT/SUB format)
   * @param {number} params.quantity - Total supply
   * @param {number} [params.units=0] - Decimal places (0-8)
   * @param {boolean} [params.reissuable=true] - Can mint more later
   * @param {boolean} [params.hasIpfs=false] - Has IPFS metadata
   * @param {string} [params.ipfsHash] - IPFS hash (if hasIpfs=true)
   * @returns {Promise<object>} Transaction data
   */
  async createSubAsset(params) {
    const builder = new IssueSubBuilder(this.rpc, this._buildParams(params));
    return await builder.build();
  }

  /**
   * Create a DEPIN asset
   * @param {object} params - DEPIN creation parameters
   * @param {string} params.assetName - Asset name (&NAME or &NAME/SUB)
   * @param {number} params.quantity - Total supply
   * @param {boolean} [params.reissuable=true] - Can mint more later
   * @param {boolean} [params.hasIpfs=false] - Has IPFS metadata
   * @param {string} [params.ipfsHash] - IPFS hash
   * @returns {Promise<object>} Transaction data
   */
  async createDepinAsset(params) {
    const builder = new IssueDepinBuilder(this.rpc, this._buildParams(params));
    return await builder.build();
  }

  /**
   * Reissue (mint more) of a ROOT or SUB asset
   * @param {object} params - Reissue parameters
   * @param {string} params.assetName - Asset name
   * @param {number} params.quantity - Amount to mint
   * @param {boolean} [params.reissuable] - Lock supply if false
   * @param {string} [params.newIpfs] - Update IPFS hash
   * @returns {Promise<object>} Transaction data
   */
  async reissueAsset(params) {
    const builder = new ReissueBuilder(this.rpc, this._buildParams(params));
    return await builder.build();
  }

  // ========================================
  // UNIQUE ASSET (NFT) OPERATIONS
  // ========================================

  /**
   * Create UNIQUE assets (NFTs)
   * @param {object} params - NFT creation parameters
   * @param {string} params.rootAssetName - Root asset name
   * @param {Array<object>} params.assetTags - NFT tags and metadata
   * @param {string} params.assetTags[].tag - Unique identifier for this NFT
   * @param {boolean} [params.assetTags[].hasIpfs=false] - Has IPFS metadata
   * @param {string} [params.assetTags[].ipfsHash] - IPFS hash for this NFT
   * @returns {Promise<object>} Transaction data
   */
  async createUniqueAssets(params) {
    const builder = new IssueUniqueBuilder(this.rpc, this._buildParams(params));
    return await builder.build();
  }

  // ========================================
  // QUALIFIER OPERATIONS (KYC Tags)
  // ========================================

  /**
   * Create a QUALIFIER (root or sub)
   * @param {object} params - Qualifier creation parameters
   * @param {string} params.qualifierName - Qualifier name (#NAME or #ROOT/#SUB)
   * @param {number} [params.quantity=1] - Quantity (1-10)
   * @param {boolean} [params.hasIpfs=false] - Has IPFS metadata
   * @param {string} [params.ipfsHash] - IPFS hash
   * @param {string} [params.changeAddress] - Override change address
   * @returns {Promise<object>} Transaction data
   */
  async createQualifier(params) {
    const normalized = { ...params, assetName: params.assetName || params.qualifierName };
    const builder = new IssueQualifierBuilder(this.rpc, this._buildParams(normalized));
    return await builder.build();
  }

  /**
   * Assign qualifier tag(s) to address(es)
   * @param {object} params - Tag assignment parameters
   * @param {string} params.qualifierName - Qualifier name (#NAME)
   * @param {Array<string>} params.addresses - Addresses to tag
   * @param {string} [params.assetData=''] - Optional data
   * @returns {Promise<object>} Transaction data
   */
  async tagAddresses(params) {
    const builder = new TagAddressBuilder(this.rpc, this._buildParams(params));
    return await builder.build();
  }

  /**
   * Remove qualifier tag(s) from address(es)
   * @param {object} params - Tag removal parameters
   * @param {string} params.qualifierName - Qualifier name (#NAME)
   * @param {Array<string>} params.addresses - Addresses to untag
   * @returns {Promise<object>} Transaction data
   */
  async untagAddresses(params) {
    const builder = new TagAddressBuilder(this.rpc, this._buildParams(params));
    return await builder.buildUntag();
  }

  // ========================================
  // RESTRICTED ASSET OPERATIONS (Security Tokens)
  // ========================================

  /**
   * Create a RESTRICTED asset (security token)
   * @param {object} params - Restricted asset creation parameters
   * @param {string} params.assetName - Asset name ($NAME format)
   * @param {number} params.quantity - Total supply
   * @param {string} params.verifierString - Boolean logic for compliance (e.g., "#KYC & #ACCREDITED")
   * @param {number} [params.units=0] - Decimal places (0-8)
   * @param {boolean} [params.reissuable=true] - Can mint more later
   * @param {boolean} [params.hasIpfs=false] - Has IPFS metadata
   * @param {string} [params.ipfsHash] - IPFS hash
   * @returns {Promise<object>} Transaction data
   */
  async createRestrictedAsset(params) {
    const builder = new IssueRestrictedBuilder(this.rpc, this._buildParams(params));
    return await builder.build();
  }

  /**
   * Reissue (mint more) of a RESTRICTED asset
   * @param {object} params - Reissue parameters
   * @param {string} params.assetName - Restricted asset name ($NAME)
   * @param {number} params.quantity - Amount to mint
   * @param {boolean} [params.changeVerifier=false] - Update verifier string
   * @param {string} [params.newVerifier] - New verifier string (if changeVerifier=true)
   * @param {boolean} [params.reissuable] - Lock supply if false
   * @param {string} [params.newIpfs] - Update IPFS hash
   * @returns {Promise<object>} Transaction data
   */
  async reissueRestrictedAsset(params) {
    const builder = new ReissueRestrictedBuilder(this.rpc, this._buildParams(params));
    return await builder.build();
  }

  /**
   * Freeze specific addresses for a restricted asset
   * @param {object} params - Freeze parameters
   * @param {string} params.assetName - Restricted asset name ($NAME)
   * @param {Array<string>} params.addresses - Addresses to freeze
   * @returns {Promise<object>} Transaction data
   */
  async freezeAddresses(params) {
    const builder = new FreezeAddressBuilder(this.rpc, this._buildParams(params));
    return await builder.build();
  }

  /**
   * Unfreeze specific addresses for a restricted asset
   * @param {object} params - Unfreeze parameters
   * @param {string} params.assetName - Restricted asset name ($NAME)
   * @param {Array<string>} params.addresses - Addresses to unfreeze
   * @returns {Promise<object>} Transaction data
   */
  async unfreezeAddresses(params) {
    const builder = new FreezeAddressBuilder(this.rpc, this._buildParams(params));
    return await builder.buildUnfreeze();
  }

  /**
   * Freeze entire restricted asset globally
   * @param {object} params - Global freeze parameters
   * @param {string} params.assetName - Restricted asset name ($NAME)
   * @returns {Promise<object>} Transaction data
   */
  async freezeAssetGlobally(params) {
    const builder = new FreezeAddressBuilder(this.rpc, this._buildParams(params));
    return await builder.buildGlobalFreeze();
  }

  /**
   * Unfreeze entire restricted asset globally
   * @param {object} params - Global unfreeze parameters
   * @param {string} params.assetName - Restricted asset name ($NAME)
   * @returns {Promise<object>} Transaction data
   */
  async unfreezeAssetGlobally(params) {
    const builder = new FreezeAddressBuilder(this.rpc, this._buildParams(params));
    return await builder.buildGlobalUnfreeze();
  }

  // ========================================
  // QUERY OPERATIONS
  // Delegates to AssetQueries instance
  // ========================================
  // Note: Asset transfers are handled by neurai-jswallet

  /**
   * Get asset metadata
   * @param {string} assetName - Asset name
   * @returns {Promise<object>} Asset data
   */
  async getAssetData(assetName) {
    return await this.queries.getAssetData(assetName);
  }

  /**
   * List all assets on blockchain
   * @param {string} [filter='*'] - Filter pattern (e.g., 'MY*')
   * @param {boolean} [verbose=false] - Include detailed information
   * @param {number} [count=100] - Maximum number to return
   * @param {number} [start=0] - Starting index for pagination
   * @returns {Promise<Array|object>} Array of asset names or detailed objects
   */
  async listAssets(filter = '*', verbose = false, count = 100, start = 0) {
    return await this.queries.listAssets(filter, verbose, count, start);
  }

  /**
   * List assets owned by wallet
   * @param {string} [assetName='*'] - Filter by asset name
   * @param {boolean} [verbose=false] - Include detailed information
   * @param {number} [count=100] - Maximum number to return
   * @param {number} [start=0] - Starting index
   * @param {number} [confs=1] - Minimum confirmations
   * @returns {Promise<object>} Object with asset names as keys and amounts as values
   */
  async listMyAssets(assetName = '*', verbose = false, count = 100, start = 0, confs = 1) {
    return await this.queries.listMyAssets(assetName, verbose, count, start, confs);
  }

  /**
   * List all addresses holding a specific asset
   * @param {string} assetName - Asset name
   * @param {boolean} [onlyCount=false] - Return only count instead of full list
   * @param {number} [count=100] - Maximum number to return
   * @param {number} [start=0] - Starting index
   * @returns {Promise<Array|number>} Array of {address, amount} or count
   */
  async listAddressesByAsset(assetName, onlyCount = false, count = 100, start = 0) {
    return await this.queries.listAddressesByAsset(assetName, onlyCount, count, start);
  }

  /**
   * List asset balances for a specific address
   * @param {string} address - Address to query
   * @param {boolean} [onlyTotal=false] - Return only count instead of full list
   * @param {number} [count=100] - Maximum number to return
   * @param {number} [start=0] - Starting index
   * @returns {Promise<Array|number>} Array of {asset, amount} or count
   */
  async listAssetBalancesByAddress(address, onlyTotal = false, count = 100, start = 0) {
    return await this.queries.listAssetBalancesByAddress(address, onlyTotal, count, start);
  }

  /**
   * Check if an address has a specific qualifier tag
   * @param {string} address - Address to check
   * @param {string} qualifierName - Qualifier name (e.g., '#KYC_VERIFIED')
   * @returns {Promise<boolean>} True if address has the tag
   */
  async checkAddressTag(address, qualifierName) {
    return await this.queries.checkAddressTag(address, qualifierName);
  }

  /**
   * List all qualifiers assigned to an address
   * @param {string} address - Address to query
   * @returns {Promise<Array>} Array of qualifier names
   */
  async listTagsForAddress(address) {
    return await this.queries.listTagsForAddress(address);
  }

  /**
   * List all addresses with a specific qualifier tag
   * @param {string} qualifierName - Qualifier name
   * @returns {Promise<Array>} Array of addresses
   */
  async listAddressesForTag(qualifierName) {
    return await this.queries.listAddressesForTag(qualifierName);
  }

  /**
   * Check if an address can hold a restricted asset
   * @param {string} address - Address to check
   * @param {string} restrictedAssetName - Restricted asset name (e.g., '$SECURITY')
   * @returns {Promise<boolean>} True if address meets verifier requirements
   */
  async checkAddressRestriction(address, restrictedAssetName) {
    return await this.queries.checkAddressRestriction(address, restrictedAssetName);
  }

  /**
   * Check if an address is frozen for a restricted asset
   * @param {string} address - Address to check
   * @param {string} restrictedAssetName - Restricted asset name
   * @returns {Promise<boolean>} True if address is frozen
   */
  async isAddressFrozen(address, restrictedAssetName) {
    return await this.queries.isAddressFrozen(address, restrictedAssetName);
  }

  /**
   * Check if an asset is globally frozen
   * @param {string} restrictedAssetName - Restricted asset name
   * @returns {Promise<boolean>} True if asset is globally frozen
   */
  async checkGlobalRestriction(restrictedAssetName) {
    return await this.queries.checkGlobalRestriction(restrictedAssetName);
  }

  /**
   * Get verifier string for a restricted asset
   * @param {string} restrictedAssetName - Restricted asset name
   * @returns {Promise<string>} Verifier string
   */
  async getVerifierString(restrictedAssetName) {
    return await this.queries.getVerifierString(restrictedAssetName);
  }

  /**
   * Validate verifier string syntax
   * @param {string} verifierString - Verifier string to validate
   * @returns {Promise<boolean>} True if valid
   */
  async isValidVerifierString(verifierString) {
    return await this.queries.isValidVerifierString(verifierString);
  }

  /**
   * Get snapshot of asset ownership at a specific block
   * @param {string} assetName - Asset name
   * @param {number} blockHeight - Block height for snapshot
   * @returns {Promise<object>} Snapshot request result
   */
  async getSnapshotRequest(assetName, blockHeight) {
    return await this.queries.getSnapshotRequest(assetName, blockHeight);
  }

  /**
   * Cancel a snapshot request
   * @param {string} assetName - Asset name
   * @param {number} blockHeight - Block height of snapshot to cancel
   * @returns {Promise<boolean>} True if cancelled successfully
   */
  async cancelSnapshotRequest(assetName, blockHeight) {
    return await this.queries.cancelSnapshotRequest(assetName, blockHeight);
  }

  /**
   * List DEPIN holders with validity status
   * @param {string} assetName - DEPIN asset name
   * @returns {Promise<Array>} Holder entries
   */
  async listDepinHolders(assetName) {
    return await this.queries.listDepinHolders(assetName);
  }

  /**
   * Check DEPIN validity for an address
   * @param {string} assetName - DEPIN asset name
   * @param {string} address - Address to query
   * @returns {Promise<object>} Validity details
   */
  async checkDepinValidity(assetName, address) {
    return await this.queries.checkDepinValidity(assetName, address);
  }

  /**
   * Check if asset exists
   * @param {string} assetName - Asset name
   * @returns {Promise<boolean>} True if asset exists
   */
  async assetExists(assetName) {
    return await this.queries.assetExists(assetName);
  }

  /**
   * Get asset type from name
   * @param {string} assetName - Asset name
   * @returns {string} Asset type ('ROOT', 'SUB', 'UNIQUE', 'QUALIFIER', 'RESTRICTED', 'DEPIN', 'OWNER')
   */
  getAssetType(assetName) {
    return this.queries.getAssetType(assetName);
  }

  /**
   * Get total count of assets on blockchain
   * @returns {Promise<number>} Total asset count
   */
  async getAssetCount() {
    return await this.queries.getAssetCount();
  }
}

module.exports = NeuraiAssets;
