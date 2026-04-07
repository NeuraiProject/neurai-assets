/**
 * Asset Name Parser
 * Parses and analyzes asset names
 */

const { AssetType } = require('../constants');

class AssetNameParser {
  /**
   * Parse asset name and extract information
   * @param {string} name - Asset name
   * @returns {object} Parsed information
   */
  static parse(name) {
    const isOwner = name.endsWith('!');
    const isRestricted = name.startsWith('$');
    const isQualifier = name.startsWith('#');
    const isDepin = name.startsWith('&');
    const cleanName = isOwner ? name.slice(0, -1) : name;

    let type;
    let parent = null;
    let subName = null;
    let tag = null;
    let prefix = null;

    if (isQualifier) {
      // QUALIFIER or SUB_QUALIFIER: #NAME or #ROOT/SUB
      if (cleanName.includes('/')) {
        type = AssetType.SUB_QUALIFIER;
        const withoutHash = cleanName.substring(1);
        const parts = withoutHash.split('/');
        parent = '#' + parts[0];
        subName = parts[1];
        prefix = '#';
      } else {
        type = AssetType.QUALIFIER;
        prefix = '#';
      }
    } else if (isRestricted) {
      // RESTRICTED: $NAME
      type = AssetType.RESTRICTED;
      prefix = '$';
    } else if (isDepin) {
      // DEPIN: &NAME or &NAME/SUB
      type = AssetType.DEPIN;
      prefix = '&';
      if (cleanName.includes('/')) {
        const parts = cleanName.split('/');
        parent = parts[0];
        subName = parts.slice(1).join('/');
      }
    } else if (cleanName.includes('#')) {
      // UNIQUE: ROOT#TAG
      type = AssetType.UNIQUE;
      const parts = cleanName.split('#');
      parent = parts[0];
      tag = parts[1];
    } else if (cleanName.includes('/')) {
      // SUB: ROOT/SUB
      type = AssetType.SUB;
      const parts = cleanName.split('/');
      parent = parts[0];
      subName = parts[1];
    } else {
      // ROOT
      type = AssetType.ROOT;
    }

    // Override type if owner token
    if (isOwner) {
      const baseType = type;
      type = AssetType.OWNER;
      return {
        type,
        baseType,
        parent,
        name: cleanName,
        subName,
        tag,
        prefix,
        isOwner: true,
        isRestricted: cleanName.startsWith('$'),
        isDepin: cleanName.startsWith('&'),
        isQualifier: false,
        fullName: name,
        baseName: cleanName
      };
    }

    return {
      type,
      parent,
      name: cleanName,
      subName,
      tag,
      prefix,
      isOwner,
      isRestricted,
      isDepin,
      isQualifier,
      fullName: name,
      baseName: cleanName
    };
  }

  /**
   * Get asset type from name
   * @param {string} name - Asset name
   * @returns {number} AssetType enum value
   */
  static getType(name) {
    return this.parse(name).type;
  }

  /**
   * Get parent asset name
   * @param {string} name - Asset name
   * @returns {string|null} Parent asset name or null
   */
  static getParent(name) {
    return this.parse(name).parent;
  }

  /**
   * Check if asset is an owner token
   * @param {string} name - Asset name
   * @returns {boolean} True if owner token
   */
  static isOwnerToken(name) {
    return name.endsWith('!');
  }

  /**
   * Get owner token name for an asset
   * @param {string} assetName - Asset name
   * @returns {string} Owner token name (assetName + '!')
   */
  static getOwnerTokenName(assetName) {
    if (this.isOwnerToken(assetName)) {
      return assetName;
    }
    if (this.isRestricted(assetName)) {
      return assetName.slice(1) + '!';
    }
    return assetName + '!';
  }

  /**
   * Get base asset name from owner token
   * @param {string} ownerTokenName - Owner token name (with !)
   * @returns {string} Base asset name (without !)
   */
  static getBaseAssetName(ownerTokenName) {
    if (this.isOwnerToken(ownerTokenName)) {
      return ownerTokenName.slice(0, -1);
    }
    return ownerTokenName;
  }

  /**
   * Check if asset is restricted
   * @param {string} name - Asset name
   * @returns {boolean} True if restricted
   */
  static isRestricted(name) {
    return name.startsWith('$');
  }

  /**
   * Check if asset is a qualifier
   * @param {string} name - Asset name
   * @returns {boolean} True if qualifier
   */
  static isQualifier(name) {
    return name.startsWith('#');
  }

  /**
   * Check if asset is unique (NFT)
   * @param {string} name - Asset name
   * @returns {boolean} True if unique
   */
  static isUnique(name) {
    return name.includes('#') && !name.startsWith('#');
  }

  /**
   * Check if asset is a sub-asset
   * @param {string} name - Asset name
   * @returns {boolean} True if sub-asset
   */
  static isSub(name) {
    return name.includes('/') && !name.startsWith('#') && !name.startsWith('&');
  }

  /**
   * Check if asset is a DEPIN asset
   * @param {string} name - Asset name
   * @returns {boolean} True if DEPIN
   */
  static isDepin(name) {
    return name.startsWith('&');
  }

  /**
   * Build unique asset name
   * @param {string} rootName - Root asset name
   * @param {string} tag - Unique tag
   * @returns {string} Full unique asset name
   */
  static buildUniqueName(rootName, tag) {
    return `${rootName}#${tag}`;
  }

  /**
   * Build sub-asset name
   * @param {string} rootName - Root asset name
   * @param {string} subName - Sub-asset name
   * @returns {string} Full sub-asset name
   */
  static buildSubName(rootName, subName) {
    return `${rootName}/${subName}`;
  }
}

module.exports = AssetNameParser;
