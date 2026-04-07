/**
 * Constants Module
 * Exports all constant values and configurations
 */

const { AssetType } = require('./assetTypes');
const { ASSET_COSTS, getAssetCost, getUniqueAssetCost, getTaggingCost } = require('./fees');
const {
  MAINNET_BURN_ADDRESSES,
  TESTNET_BURN_ADDRESSES,
  resolveNetworkFamily,
  getBurnAddress,
  isBurnAddress
} = require('./burnAddresses');
const {
  NETWORKS,
  ASSET_NAME_RULES,
  ASSET_LIMITS,
  getNetworkConfig,
  detectNetworkFromAddress
} = require('./networks');

module.exports = {
  // Asset Types
  AssetType,

  // Fees/Costs
  ASSET_COSTS,
  getAssetCost,
  getUniqueAssetCost,
  getTaggingCost,

  // Burn Addresses
  MAINNET_BURN_ADDRESSES,
  TESTNET_BURN_ADDRESSES,
  resolveNetworkFamily,
  getBurnAddress,
  isBurnAddress,

  // Networks
  NETWORKS,
  ASSET_NAME_RULES,
  ASSET_LIMITS,
  getNetworkConfig,
  detectNetworkFromAddress
};
