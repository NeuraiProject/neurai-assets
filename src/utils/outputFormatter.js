/**
 * Output Formatter
 * Formats outputs for createrawtransaction RPC calls
 */

class OutputFormatter {
  /**
   * Format issue operation output
   * @param {object} params - Issue parameters
   * @returns {object} Formatted output for createrawtransaction
   */
  static formatIssueOutput(params) {
    const {
      asset_name,
      asset_quantity,
      units,
      reissuable,
      has_ipfs,
      ipfs_hash
    } = params;

    return {
      issue: {
        asset_name,
        asset_quantity,
        units,
        reissuable: reissuable ? 1 : 0,
        has_ipfs: has_ipfs ? 1 : 0,
        ipfs_hash: ipfs_hash || ''
      }
    };
  }

  /**
   * Format issue unique operation output
   * @param {object} params - Issue unique parameters
   * @returns {object} Formatted output for createrawtransaction
   */
  static formatIssueUniqueOutput(params) {
    const { root_name, asset_tags, ipfs_hashes } = params;

    const output = {
      issue_unique: {
        root_name,
        asset_tags
      }
    };

    if (ipfs_hashes && ipfs_hashes.length > 0) {
      output.issue_unique.ipfs_hashes = ipfs_hashes;
    }

    return output;
  }

  /**
   * Format issue restricted operation output
   * @param {object} params - Issue restricted parameters
   * @returns {object} Formatted output for createrawtransaction
   */
  static formatIssueRestrictedOutput(params) {
    const {
      asset_name,
      asset_quantity,
      verifier_string,
      units,
      reissuable,
      has_ipfs,
      ipfs_hash,
      owner_change_address
    } = params;

    const output = {
      issue_restricted: {
        asset_name,
        asset_quantity,
        verifier_string,
        units,
        reissuable: reissuable ? 1 : 0,
        has_ipfs: has_ipfs ? 1 : 0,
        ipfs_hash: ipfs_hash || ''
      }
    };

    if (owner_change_address) {
      output.issue_restricted.owner_change_address = owner_change_address;
    }

    return output;
  }

  /**
   * Format issue qualifier operation output
   * @param {object} params - Issue qualifier parameters
   * @returns {object} Formatted output for createrawtransaction
   */
  static formatIssueQualifierOutput(params) {
    const {
      asset_name,
      asset_quantity,
      has_ipfs,
      ipfs_hash,
      root_change_address,
      change_quantity
    } = params;

    const output = {
      issue_qualifier: {
        asset_name,
        asset_quantity,
        has_ipfs: has_ipfs ? 1 : 0,
        ipfs_hash: ipfs_hash || ''
      }
    };

    if (root_change_address) {
      output.issue_qualifier.root_change_address = root_change_address;
    }

    if (change_quantity !== undefined && change_quantity !== null) {
      output.issue_qualifier.change_quantity = change_quantity;
    }

    return output;
  }

  /**
   * Format reissue operation output
   * @param {object} params - Reissue parameters
   * @returns {object} Formatted output for createrawtransaction
   */
  static formatReissueOutput(params) {
    const {
      asset_name,
      asset_quantity,
      reissuable,
      new_ipfs,
      owner_change_address
    } = params;

    const output = {
      reissue: {
        asset_name,
        asset_quantity
      }
    };

    // Optional parameters
    if (reissuable !== undefined) {
      output.reissue.reissuable = reissuable ? 1 : 0;
    }

    if (new_ipfs) {
      output.reissue.ipfs_hash = new_ipfs;
    }

    if (owner_change_address) {
      output.reissue.owner_change_address = owner_change_address;
    }

    return output;
  }

  /**
   * Format reissue restricted operation output
   * @param {object} params - Reissue restricted parameters
   * @returns {object} Formatted output for createrawtransaction
   */
  static formatReissueRestrictedOutput(params) {
    const {
      asset_name,
      asset_quantity,
      change_verifier,
      new_verifier,
      reissuable,
      new_ipfs,
      owner_change_address
    } = params;

    const output = {
      reissue_restricted: {
        asset_name,
        asset_quantity
      }
    };

    // Optional parameters
    if (change_verifier && new_verifier) {
      output.reissue_restricted.verifier_string = new_verifier;
    }

    if (reissuable !== undefined) {
      output.reissue_restricted.reissuable = reissuable ? 1 : 0;
    }

    if (new_ipfs) {
      output.reissue_restricted.ipfs_hash = new_ipfs;
    }

    if (owner_change_address) {
      output.reissue_restricted.owner_change_address = owner_change_address;
    }

    return output;
  }

  /**
   * Format asset transfer output
   * @param {string} assetName - Asset name
   * @param {number} amount - Amount to transfer
   * @returns {object} Formatted transfer output
   */
  static formatTransferOutput(assetName, amount) {
    return {
      transfer: {
        [assetName]: amount
      }
    };
  }

  /**
   * Format tag addresses operation output
   * @param {object} params - Tag addresses parameters
   * @returns {object} Formatted output for createrawtransaction
   */
  static formatTagAddressesOutput(params) {
    const {
      qualifier,
      addresses,
      change_quantity
    } = params;

    const output = {
      tag_addresses: {
        qualifier,
        addresses
      }
    };

    if (change_quantity !== undefined && change_quantity !== null) {
      output.tag_addresses.change_quantity = change_quantity;
    }

    return output;
  }

  /**
   * Format untag addresses operation output
   * @param {object} params - Untag addresses parameters
   * @returns {object} Formatted output for createrawtransaction
   */
  static formatUntagAddressesOutput(params) {
    const {
      qualifier,
      addresses,
      change_quantity
    } = params;

    const output = {
      untag_addresses: {
        qualifier,
        addresses
      }
    };

    if (change_quantity !== undefined && change_quantity !== null) {
      output.untag_addresses.change_quantity = change_quantity;
    }

    return output;
  }

  /**
   * Format freeze addresses operation output
   * @param {object} params - Freeze addresses parameters
   * @returns {object} Formatted output for createrawtransaction
   */
  static formatFreezeAddressesOutput(params) {
    const {
      asset_name,
      addresses
    } = params;

    return {
      freeze_addresses: {
        asset_name,
        addresses
      }
    };
  }

  /**
   * Format unfreeze addresses operation output
   * @param {object} params - Unfreeze addresses parameters
   * @returns {object} Formatted output for createrawtransaction
   */
  static formatUnfreezeAddressesOutput(params) {
    const {
      asset_name,
      addresses
    } = params;

    return {
      unfreeze_addresses: {
        asset_name,
        addresses
      }
    };
  }

  /**
   * Format freeze asset operation output
   * @param {string} assetName - Restricted asset name
   * @returns {object} Formatted output for createrawtransaction
   */
  static formatFreezeAssetOutput(assetName) {
    return {
      freeze_asset: {
        asset_name: assetName
      }
    };
  }

  /**
   * Format unfreeze asset operation output
   * @param {string} assetName - Restricted asset name
   * @returns {object} Formatted output for createrawtransaction
   */
  static formatUnfreezeAssetOutput(assetName) {
    return {
      unfreeze_asset: {
        asset_name: assetName
      }
    };
  }
}

module.exports = OutputFormatter;
