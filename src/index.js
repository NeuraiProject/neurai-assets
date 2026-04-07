/**
 * @neuraiproject/neurai-assets
 * Non-custodial Neurai asset management library
 *
 * Comprehensive asset management library for Neurai blockchain
 * Supports creation, reissuance, transfers, and queries for all asset types:
 * - ROOT assets (standard tokens)
 * - SUB assets (sub-tokens)
 * - UNIQUE assets (NFTs)
 * - QUALIFIER assets (KYC/compliance tags)
 * - RESTRICTED assets (security tokens with compliance)
 * - DEPIN assets (soulbound assets)
 *
 * @example
 * const NeuraiAssets = require('@neuraiproject/neurai-assets');
 *
 * // Initialize with RPC function
 * const assets = new NeuraiAssets(rpc, {
 *   network: 'xna',
 *   addresses: walletAddresses,
 *   changeAddress: myChangeAddress,
 *   toAddress: myReceivingAddress
 * });
 *
 * // Create a ROOT asset
 * const result = await assets.createRootAsset({
 *   assetName: 'MYTOKEN',
 *   quantity: 1000000,
 *   units: 2,
 *   reissuable: true
 * });
 *
 * // Sign and broadcast
 * const signedTx = await wallet.signTransaction(result.rawTx);
 * const txid = await wallet.broadcastTransaction(signedTx);
 */

// Main API class
const NeuraiAssets = require('./NeuraiAssets');

// Builders
const builders = require('./builders');

// Queries
const { AssetQueries } = require('./queries');

// Constants
const constants = require('./constants');

// Errors
const errors = require('./errors');

// Validators
const validators = require('./validators');

// Utils
const utils = require('./utils');

// Export main class as default
module.exports = NeuraiAssets;

// Export everything as named exports
module.exports.NeuraiAssets = NeuraiAssets;
module.exports.AssetQueries = AssetQueries;
module.exports.builders = builders;
module.exports.constants = constants;
module.exports.errors = errors;
module.exports.validators = validators;
module.exports.utils = utils;
