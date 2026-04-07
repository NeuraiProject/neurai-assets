/**
 * Burn Manager
 * Manages burn addresses and amounts for asset operations
 *
 * Each asset operation requires burning XNA to specific addresses.
 * This manager ensures correct burn addresses and amounts are used
 * based on network (mainnet/testnet) and operation type.
 */

const { getBurnAddress, getAssetCost } = require('../constants');
const { InsufficientBurnAmountError, InvalidBurnAddressError } = require('../errors');

class BurnManager {
  /**
   * @param {string} network - Network type ('xna' or 'xna-test')
   */
  constructor(network) {
    if (!network) {
      throw new Error('Network is required');
    }
    this.network = network;
  }

  /**
   * Get burn address for an operation
   * @param {string} operationType - Operation type (e.g., 'ISSUE_ROOT')
   * @returns {string} Burn address for the network
   */
  getBurnAddress(operationType) {
    return getBurnAddress(operationType, this.network);
  }

  /**
   * Get burn amount for an operation
   * @param {string} operationType - Operation type (e.g., 'ISSUE_ROOT')
   * @param {number} multiplier - Multiplier for operations like UNIQUE (default: 1)
   * @returns {number} Burn amount in XNA
   */
  getBurnAmount(operationType, multiplier = 1) {
    const baseCost = getAssetCost(operationType);
    return baseCost * multiplier;
  }

  /**
   * Get burn info (address + amount) for an operation
   * @param {string} operationType - Operation type
   * @param {number} multiplier - Multiplier (default: 1)
   * @returns {object} { address, amount }
   */
  getBurnInfo(operationType, multiplier = 1) {
    return {
      address: this.getBurnAddress(operationType),
      amount: this.getBurnAmount(operationType, multiplier)
    };
  }

  /**
   * Get burn info for ROOT asset issuance
   * @returns {object} { address, amount }
   */
  getIssueRootBurn() {
    return this.getBurnInfo('ISSUE_ROOT');
  }

  /**
   * Get burn info for SUB asset issuance
   * @returns {object} { address, amount }
   */
  getIssueSubBurn() {
    return this.getBurnInfo('ISSUE_SUB');
  }

  /**
   * Get burn info for UNIQUE asset issuance
   * @param {number} count - Number of unique assets to create
   * @returns {object} { address, amount }
   */
  getIssueUniqueBurn(count) {
    return this.getBurnInfo('ISSUE_UNIQUE', count);
  }

  /**
   * Get burn info for DEPIN asset issuance
   * DEPIN assets reuse the UNIQUE burn amount/address.
   * @returns {object} { address, amount }
   */
  getIssueDepinBurn() {
    return this.getIssueUniqueBurn(1);
  }

  /**
   * Get burn info for QUALIFIER asset issuance
   * @returns {object} { address, amount }
   */
  getIssueQualifierBurn() {
    return this.getBurnInfo('ISSUE_QUALIFIER');
  }

  /**
   * Get burn info for SUB_QUALIFIER asset issuance
   * @returns {object} { address, amount }
   */
  getIssueSubQualifierBurn() {
    return this.getBurnInfo('ISSUE_SUB_QUALIFIER');
  }

  /**
   * Get burn info for RESTRICTED asset issuance
   * @returns {object} { address, amount }
   */
  getIssueRestrictedBurn() {
    return this.getBurnInfo('ISSUE_RESTRICTED');
  }

  /**
   * Get burn info for REISSUE operation
   * @returns {object} { address, amount }
   */
  getReissueBurn() {
    return this.getBurnInfo('REISSUE');
  }

  /**
   * Get burn info for TAG_ADDRESS operation
   * @param {number} addressCount - Number of addresses to tag
   * @returns {object} { address, amount }
   */
  getTagAddressBurn(addressCount) {
    return this.getBurnInfo('TAG_ADDRESS', addressCount);
  }

  /**
   * Get burn info for UNTAG_ADDRESS operation
   * @param {number} addressCount - Number of addresses to untag
   * @returns {object} { address, amount }
   */
  getUntagAddressBurn(addressCount) {
    return this.getBurnInfo('UNTAG_ADDRESS', addressCount);
  }

  /**
   * Validate that burn output is correct
   * @param {object} outputs - Transaction outputs
   * @param {string} operationType - Expected operation type
   * @param {number} multiplier - Expected multiplier (default: 1)
   * @returns {boolean} True if valid
   * @throws {Error} If burn is invalid
   */
  validateBurnOutput(outputs, operationType, multiplier = 1) {
    const expectedBurn = this.getBurnInfo(operationType, multiplier);

    // Check if burn address exists in outputs
    const burnAmount = outputs[expectedBurn.address];
    if (burnAmount === undefined) {
      throw new InvalidBurnAddressError(
        `Expected burn to ${expectedBurn.address} not found in outputs`,
        expectedBurn.address,
        null
      );
    }

    // Check if burn amount is correct
    if (burnAmount !== expectedBurn.amount) {
      throw new InsufficientBurnAmountError(
        `Incorrect burn amount. Expected ${expectedBurn.amount} XNA, got ${burnAmount} XNA`,
        expectedBurn.amount,
        burnAmount
      );
    }

    return true;
  }

  /**
   * Check if an address is a burn address for this network
   * @param {string} address - Address to check
   * @returns {boolean} True if it's a burn address
   */
  isBurnAddress(address) {
    const burnTypes = [
      'ISSUE_ROOT',
      'ISSUE_SUB',
      'ISSUE_UNIQUE',
      'ISSUE_MSGCHANNEL',
      'REISSUE',
      'ISSUE_RESTRICTED',
      'ISSUE_QUALIFIER',
      'ISSUE_SUB_QUALIFIER',
      'TAG_ADDRESS',
      'UNTAG_ADDRESS'
    ];

    for (const type of burnTypes) {
      if (this.getBurnAddress(type) === address) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get operation type from burn address
   * @param {string} address - Burn address
   * @returns {string|null} Operation type or null if not a burn address
   */
  getOperationTypeFromBurnAddress(address) {
    const burnTypes = [
      'ISSUE_ROOT',
      'ISSUE_SUB',
      'ISSUE_UNIQUE',
      'ISSUE_MSGCHANNEL',
      'REISSUE',
      'ISSUE_RESTRICTED',
      'ISSUE_QUALIFIER',
      'ISSUE_SUB_QUALIFIER',
      'TAG_ADDRESS',
      'UNTAG_ADDRESS'
    ];

    for (const type of burnTypes) {
      if (this.getBurnAddress(type) === address) {
        return type;
      }
    }

    return null;
  }
}

module.exports = BurnManager;
