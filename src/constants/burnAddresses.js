/**
 * Burn Addresses for Asset Operations
 * Different addresses for mainnet and testnet
 */

const MAINNET_BURN_ADDRESSES = {
  ISSUE_ROOT: 'NbURNXXXXXXXXXXXXXXXXXXXXXXXT65Gdr',
  ISSUE_SUB: 'NXissueSubAssetXXXXXXXXXXXXXX6B2JF',
  ISSUE_UNIQUE: 'NXissueUniqueAssetXXXXXXXXXXUBzP4Z',
  ISSUE_MSGCHANNEL: 'NXissueMsgChanneLAssetXXXXXXVeF2mU',
  REISSUE: 'NXReissueAssetXXXXXXXXXXXXXXVEFAWu',
  ISSUE_RESTRICTED: 'NXissueRestrictedXXXXXXXXXXXZaQtSE',
  ISSUE_QUALIFIER: 'NXissueQualifierAssetXXXXXXXXWPHpDX',
  ISSUE_SUB_QUALIFIER: 'NXissueSubQualifierAssetXXXXXYWcFp8',
  TAG_ADDRESS: 'NXaddTagBurnXXXXXXXXXXXXXXXXUBL1a5',
  UNTAG_ADDRESS: 'NXaddTagBurnXXXXXXXXXXXXXXXXUBL1a5'
};

const TESTNET_BURN_ADDRESSES = {
  ISSUE_ROOT: 'mbURNXXXXXXXXXXXXXXXXXXXXXXUV9F72',
  ISSUE_SUB: 'mXissueSubAssetXXXXXXXXXXXXXUDJP6N',
  ISSUE_UNIQUE: 'mXissueUniqueAssetXXXXXXXXXXQV8W2V',
  ISSUE_MSGCHANNEL: 'mXissueMsgChanneLAssetXXXXXXX9fhPh',
  REISSUE: 'mXReissueAssetXXXXXXXXXXXXXXTZzJ3c',
  ISSUE_RESTRICTED: 'mXissueRestrictedXXXXXXXXXXXXYHqJY',
  ISSUE_QUALIFIER: 'mXissueQualifierAssetXXXXXXXXZhqiGs',
  ISSUE_SUB_QUALIFIER: 'mXissueSubQualifierAssetXXXXXab7bRN',
  TAG_ADDRESS: 'mXaddTagBurnXXXXXXXXXXXXXXXXWEKFqa',
  UNTAG_ADDRESS: 'mXaddTagBurnXXXXXXXXXXXXXXXXWEKFqa'
};

/**
 * Get burn address for an operation and network
 * @param {string} operationType - Operation type (e.g., 'ISSUE_ROOT')
 * @param {string} network - Network type ('xna' or 'xna-test')
 * @returns {string} Burn address
 */
function getBurnAddress(operationType, network) {
  const addresses = network === 'xna' ? MAINNET_BURN_ADDRESSES : TESTNET_BURN_ADDRESSES;

  const address = addresses[operationType];
  if (!address) {
    throw new Error(`Unknown operation type: ${operationType} for network: ${network}`);
  }

  return address;
}

/**
 * Check if an address is a burn address
 * @param {string} address - Address to check
 * @param {string} network - Network type ('xna' or 'xna-test')
 * @returns {boolean} True if it's a burn address
 */
function isBurnAddress(address, network) {
  const addresses = network === 'xna' ? MAINNET_BURN_ADDRESSES : TESTNET_BURN_ADDRESSES;
  return Object.values(addresses).includes(address);
}

module.exports = {
  MAINNET_BURN_ADDRESSES,
  TESTNET_BURN_ADDRESSES,
  getBurnAddress,
  isBurnAddress
};
