/**
 * Output Orderer
 * Orders transaction outputs according to Neurai protocol requirements
 *
 * CRITICAL: Output ordering is mandatory for asset transactions
 *
 * Correct order:
 * 1. All XNA outputs (burn addresses + change) FIRST
 * 2. Owner token change outputs SECOND
 * 3. Asset operations (issue, reissue, transfer, etc.) LAST
 *
 * Incorrect ordering will cause transaction rejection by the network.
 */

const { AssetNameParser } = require('../utils');

class OutputOrderer {
  /**
   * Order outputs according to protocol requirements
   * @param {object|Array} outputs - Unordered outputs object or array of single-key objects
   * @returns {Array} Ordered array of single-key output objects
   */
  order(outputs) {
    // Normalize to array of {address, value} pairs
    let pairs;
    if (Array.isArray(outputs)) {
      pairs = outputs.map(obj => {
        const [address, value] = Object.entries(obj)[0];
        return { address, value };
      });
    } else if (outputs && typeof outputs === 'object') {
      pairs = Object.entries(outputs).map(([address, value]) => ({ address, value }));
    } else {
      throw new Error('Outputs must be an object or array');
    }

    // Categorize
    const xnaOutputs = [];
    const ownerOutputs = [];
    const assetOutputs = [];

    for (const { address, value } of pairs) {
      if (typeof value === 'number') {
        xnaOutputs.push({ address, value });
      } else if (typeof value === 'object') {
        if (value.transfer && this.isOwnerTokenTransfer(value.transfer)) {
          ownerOutputs.push({ address, value });
        } else {
          assetOutputs.push({ address, value });
        }
      }
    }

    // Return ordered array of single-key objects
    return [
      ...xnaOutputs.map(({ address, value }) => ({ [address]: value })),
      ...ownerOutputs.map(({ address, value }) => ({ [address]: value })),
      ...assetOutputs.map(({ address, value }) => ({ [address]: value })),
    ];
  }

  /**
   * Check if a transfer output contains an owner token
   * @param {object} transfer - Transfer object
   * @returns {boolean} True if contains owner token
   */
  isOwnerTokenTransfer(transfer) {
    if (!transfer || typeof transfer !== 'object') {
      return false;
    }

    // Check if any asset name in transfer ends with '!'
    return Object.keys(transfer).some(assetName => {
      return AssetNameParser.isOwnerToken(assetName);
    });
  }

  /**
   * Validate output ordering
   * Ensures outputs are in correct order
   *
   * @param {object} outputs - Outputs to validate
   * @returns {boolean} True if valid
   * @throws {Error} If ordering is invalid
   */
  validateOrdering(outputs) {
    const entries = Array.isArray(outputs)
      ? outputs.map(obj => Object.entries(obj)[0])
      : Object.entries(outputs);
    let currentCategory = 0; // 0 = not started, 1 = XNA, 2 = owner, 3 = assets

    for (const [address, value] of entries) {
      let category;

      if (typeof value === 'number') {
        category = 1; // XNA
      } else if (value.transfer && this.isOwnerTokenTransfer(value.transfer)) {
        category = 2; // Owner token
      } else {
        category = 3; // Asset operation/transfer
      }

      // Check if we're going backwards in category order
      if (category < currentCategory) {
        throw new Error(
          'Invalid output ordering. Outputs must be ordered as: ' +
          '1) XNA outputs, 2) Owner token outputs, 3) Asset operations'
        );
      }

      currentCategory = category;
    }

    return true;
  }

  /**
   * Get output category for debugging
   * @param {*} value - Output value
   * @returns {string} Category name
   */
  getOutputCategory(value) {
    if (typeof value === 'number') {
      return 'XNA';
    } else if (value.transfer && this.isOwnerTokenTransfer(value.transfer)) {
      return 'OWNER_TOKEN';
    } else if (value.transfer) {
      return 'ASSET_TRANSFER';
    } else if (value.issue) {
      return 'ISSUE';
    } else if (value.issue_unique) {
      return 'ISSUE_UNIQUE';
    } else if (value.issue_restricted) {
      return 'ISSUE_RESTRICTED';
    } else if (value.issue_qualifier) {
      return 'ISSUE_QUALIFIER';
    } else if (value.reissue) {
      return 'REISSUE';
    } else if (value.reissue_restricted) {
      return 'REISSUE_RESTRICTED';
    } else if (value.tag_addresses) {
      return 'TAG_ADDRESSES';
    } else if (value.untag_addresses) {
      return 'UNTAG_ADDRESSES';
    } else if (value.freeze_addresses) {
      return 'FREEZE_ADDRESSES';
    } else if (value.unfreeze_addresses) {
      return 'UNFREEZE_ADDRESSES';
    } else if (value.freeze_asset) {
      return 'FREEZE_ASSET';
    } else if (value.unfreeze_asset) {
      return 'UNFREEZE_ASSET';
    } else {
      return 'UNKNOWN';
    }
  }

  /**
   * Debug output ordering
   * Returns detailed information about output categories
   *
   * @param {object} outputs - Outputs to analyze
   * @returns {Array} Array of { address, category, order }
   */
  debugOrdering(outputs) {
    const debug = [];
    const entries = Array.isArray(outputs)
      ? outputs.map(obj => Object.entries(obj)[0])
      : Object.entries(outputs);

    for (const [address, value] of entries) {
      const category = this.getOutputCategory(value);
      let order;

      if (typeof value === 'number') {
        order = 1;
      } else if (value.transfer && this.isOwnerTokenTransfer(value.transfer)) {
        order = 2;
      } else {
        order = 3;
      }

      debug.push({
        address,
        category,
        order,
        value
      });
    }

    return debug;
  }

  /**
   * Merge multiple output objects with proper ordering
   * Useful when building outputs from multiple sources
   *
   * @param {...object} outputObjects - Multiple output objects to merge
   * @returns {object} Merged and ordered outputs
   */
  merge(...outputObjects) {
    const merged = {};

    // Merge all objects
    for (const outputs of outputObjects) {
      if (outputs && typeof outputs === 'object') {
        Object.assign(merged, outputs);
      }
    }

    // Order the merged result
    return this.order(merged);
  }

  /**
   * Add XNA output (convenience method)
   * @param {object} outputs - Existing outputs
   * @param {string} address - Address
   * @param {number} amount - XNA amount
   * @returns {object} Updated outputs (not ordered yet)
   */
  addXNAOutput(outputs, address, amount) {
    return {
      ...outputs,
      [address]: amount
    };
  }

  /**
   * Add owner token output (convenience method)
   * @param {object} outputs - Existing outputs
   * @param {string} address - Address
   * @param {string} ownerTokenName - Owner token name
   * @returns {object} Updated outputs (not ordered yet)
   */
  addOwnerTokenOutput(outputs, address, ownerTokenName) {
    return {
      ...outputs,
      [address]: {
        transfer: {
          [ownerTokenName]: 1.0
        }
      }
    };
  }

  /**
   * Add asset transfer output (convenience method)
   * @param {object} outputs - Existing outputs
   * @param {string} address - Address
   * @param {string} assetName - Asset name
   * @param {number} amount - Amount
   * @returns {object} Updated outputs (not ordered yet)
   */
  addAssetTransferOutput(outputs, address, assetName, amount) {
    return {
      ...outputs,
      [address]: {
        transfer: {
          [assetName]: amount
        }
      }
    };
  }

  /**
   * Add asset operation output (convenience method)
   * @param {object} outputs - Existing outputs
   * @param {string} address - Address
   * @param {object} operation - Operation object (issue, reissue, etc.)
   * @returns {object} Updated outputs (not ordered yet)
   */
  addOperationOutput(outputs, address, operation) {
    return {
      ...outputs,
      [address]: operation
    };
  }
}

module.exports = OutputOrderer;
