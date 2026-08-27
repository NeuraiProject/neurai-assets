/**
 * Burn Addresses for Asset Operations
 * Different addresses for mainnet and testnet
 */

const MAINNET_NETWORKS = ['xna', 'mainnet', 'xna-pq', 'mainnet-pq'];
const TESTNET_NETWORKS = ['xna-test', 'testnet', 'regtest', 'xna-pq-test', 'testnet-pq'];

function resolveNetworkFamily(network) {
  if (MAINNET_NETWORKS.includes(network)) {
    return 'mainnet';
  }

  if (TESTNET_NETWORKS.includes(network)) {
    return 'testnet';
  }

  throw new Error(`Unknown network: ${network}`);
}

const MAINNET_BURN_ADDRESSES = {
  ISSUE_ROOT: 'NbURNXXXXXXXXXXXXXXXXXXXXXXXT65Gdr',
  ISSUE_SUB: 'NXissueSubAssetXXXXXXXXXXXXXX6B2JF',
  ISSUE_UNIQUE: 'NXissueUniqueAssetXXXXXXXXXXUBzP4Z',
  ISSUE_MSGCHANNEL: 'NXissueMsgChanneLAssetXXXXXXTUzrtJ',
  REISSUE: 'NXReissueAssetXXXXXXXXXXXXXXWLe4Ao',
  ISSUE_RESTRICTED: 'NXissueRestrictedXXXXXXXXXXXWpXx4H',
  ISSUE_QUALIFIER: 'NXissueQuaLifierXXXXXXXXXXXXWurNcU',
  ISSUE_SUB_QUALIFIER: 'NXissueSubQuaLifierXXXXXXXXXV71vM3',
  TAG_ADDRESS: 'NXaddTagBurnXXXXXXXXXXXXXXXXWucUTr',
  UNTAG_ADDRESS: 'NXaddTagBurnXXXXXXXXXXXXXXXXWucUTr'
};

const TESTNET_BURN_ADDRESSES = {
  ISSUE_ROOT: 'tBURNXXXXXXXXXXXXXXXXXXXXXXXVZLroy',
  ISSUE_SUB: 'tSubAssetXXXXXXXXXXXXXXXXXXXXGTvF4',
  ISSUE_UNIQUE: 'tUniqueAssetXXXXXXXXXXXXXXXXVCgpLs',
  ISSUE_MSGCHANNEL: 'tMsgChanneLAssetXXXXXXXXXXXXVsJoya',
  REISSUE: 'tAssetXXXXXXXXXXXXXXXXXXXXXXas6pz8',
  ISSUE_RESTRICTED: 'tRestrictedXXXXXXXXXXXXXXXXXVyPBEK',
  ISSUE_QUALIFIER: 'tQuaLifierXXXXXXXXXXXXXXXXXXT5czoV',
  ISSUE_SUB_QUALIFIER: 'tSubQuaLifierXXXXXXXXXXXXXXXW5MmGk',
  TAG_ADDRESS: 'tTagBurnXXXXXXXXXXXXXXXXXXXXYm6pxA',
  UNTAG_ADDRESS: 'tTagBurnXXXXXXXXXXXXXXXXXXXXYm6pxA'
};

/**
 * Regtest chainparams define ONE burn address for every asset operation
 * (`strGlobalBurnAddress` in the node's chainparams.cpp), unlike mainnet and
 * testnet which have a distinct address per operation.
 *
 * Regtest shares testnet's address prefix, so it was previously resolved to
 * the testnet table. That works only for ISSUE_ROOT — whose testnet address
 * happens to BE the regtest global one — and every other operation is
 * rejected by consensus with `bad-txns-*-burn-not-found`, because the burn
 * output pays an address the chain does not recognise for that operation.
 */
const REGTEST_GLOBAL_BURN_ADDRESS = 'tBURNXXXXXXXXXXXXXXXXXXXXXXXVZLroy';

/**
 * Whether a network label means regtest specifically, rather than the wider
 * testnet family it shares an address prefix with.
 *
 * @param {string} network - Network label
 * @returns {boolean} True for regtest
 */
function isRegtest(network) {
  return network === 'regtest';
}

/**
 * Get burn address for an operation and network
 * @param {string} operationType - Operation type (e.g., 'ISSUE_ROOT')
 * @param {string} network - Network type ('xna', 'xna-test', 'regtest', 'xna-pq', or 'xna-pq-test')
 * @returns {string} Burn address
 */
function getBurnAddress(operationType, network) {
  const family = resolveNetworkFamily(network);
  const addresses = family === 'mainnet' ? MAINNET_BURN_ADDRESSES : TESTNET_BURN_ADDRESSES;

  const address = addresses[operationType];
  if (!address) {
    throw new Error(`Unknown operation type: ${operationType} for network: ${network}`);
  }

  return isRegtest(network) ? REGTEST_GLOBAL_BURN_ADDRESS : address;
}

/**
 * Check if an address is a burn address
 * @param {string} address - Address to check
 * @param {string} network - Network type ('xna', 'xna-test', 'regtest', 'xna-pq', or 'xna-pq-test')
 * @returns {boolean} True if it's a burn address
 */
function isBurnAddress(address, network) {
  const family = resolveNetworkFamily(network);
  const addresses = family === 'mainnet' ? MAINNET_BURN_ADDRESSES : TESTNET_BURN_ADDRESSES;
  if (isRegtest(network) && address === REGTEST_GLOBAL_BURN_ADDRESS) {
    return true;
  }
  return Object.values(addresses).includes(address);
}

module.exports = {
  MAINNET_BURN_ADDRESSES,
  TESTNET_BURN_ADDRESSES,
  REGTEST_GLOBAL_BURN_ADDRESS,
  resolveNetworkFamily,
  isRegtest,
  getBurnAddress,
  isBurnAddress
};
