/**
 * Asset Operation Costs (in XNA)
 * These are burn amounts required for each operation
 */

const ASSET_COSTS = {
  ISSUE_ROOT: 1000,
  ISSUE_SUB: 200,
  ISSUE_UNIQUE: 10,  // Per NFT
  ISSUE_MSGCHANNEL: 200,
  ISSUE_QUALIFIER: 2000,
  ISSUE_SUB_QUALIFIER: 200,
  ISSUE_RESTRICTED: 3000,
  REISSUE: 200,
  REISSUE_RESTRICTED: 200,
  TAG_ADDRESS: 0.2,   // Per address
  UNTAG_ADDRESS: 0.2, // Per address
  FREEZE_ADDRESS: 0,  // No cost (requires owner token)
  UNFREEZE_ADDRESS: 0, // No cost (requires owner token)
  FREEZE_ASSET: 0,    // No cost (requires owner token)
  UNFREEZE_ASSET: 0,  // No cost (requires owner token)
  OWNER_TOKEN: 0      // Auto-generated, no cost
};

/**
 * Get cost for a specific operation type
 * @param {string} operationType - Operation type (e.g., 'ISSUE_ROOT')
 * @returns {number} Cost in XNA
 */
function getAssetCost(operationType) {
  const cost = ASSET_COSTS[operationType];
  if (cost === undefined) {
    throw new Error(`Unknown operation type: ${operationType}`);
  }
  return cost;
}

/**
 * Calculate total cost for unique asset issuance
 * @param {number} count - Number of unique assets to create
 * @returns {number} Total cost in XNA
 */
function getUniqueAssetCost(count) {
  return ASSET_COSTS.ISSUE_UNIQUE * count;
}

/**
 * Calculate total cost for tagging multiple addresses
 * @param {number} addressCount - Number of addresses to tag
 * @returns {number} Total cost in XNA
 */
function getTaggingCost(addressCount) {
  return ASSET_COSTS.TAG_ADDRESS * addressCount;
}

module.exports = {
  ASSET_COSTS,
  getAssetCost,
  getUniqueAssetCost,
  getTaggingCost
};
