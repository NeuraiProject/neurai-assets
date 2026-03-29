/**
 * Network Configuration for Neurai
 */

const NETWORKS = {
  MAINNET: {
    name: 'xna',
    displayName: 'Neurai Mainnet',
    addressPrefix: 'N',
    assetNameMaxLength: 32,
    defaultRPCPort: 19001,
    coin: 'XNA'
  },
  TESTNET: {
    name: 'xna-test',
    displayName: 'Neurai Testnet',
    addressPrefix: 'm',
    assetNameMaxLength: 32,  // Same as mainnet
    defaultRPCPort: 19101,
    coin: 'TXNA'
  }
};

/**
 * Asset naming rules (same for all networks)
 */
const ASSET_NAME_RULES = {
  ROOT: {
    minLength: 3,
    maxLength: 30,
    pattern: /^[A-Z0-9_.]+$/,
    cannotStartWith: ['.', 'A', 'Z'],
    reserved: ['XNA', 'NEURAI']
  },
  SUB: {
    minLength: 1,
    maxLength: 30,
    pattern: /^[A-Z0-9_.]+$/,
    separator: '/',
    maxDepth: 1  // Only one level of sub-assets
  },
  UNIQUE: {
    minLength: 1,
    maxLength: 30,
    pattern: /^[A-Z0-9_.]+$/,
    separator: '#'
  },
  QUALIFIER: {
    minLength: 3,
    maxLength: 30,
    pattern: /^[A-Z0-9_]+$/,
    prefix: '#',
    separator: '/'
  },
  RESTRICTED: {
    minLength: 3,
    maxLength: 30,
    pattern: /^[A-Z0-9_.]+$/,
    prefix: '$'
  }
};

/**
 * Asset quantity limits
 */
const ASSET_LIMITS = {
  MIN_QUANTITY: 1,
  MAX_QUANTITY: 21000000000,  // 21 billion (same as Bitcoin's 21M with 3 extra decimals)
  MIN_UNITS: 0,
  MAX_UNITS: 8,
  OWNER_TOKEN_QUANTITY: 1,    // Owner tokens are always exactly 1
  QUALIFIER_MIN_QUANTITY: 1,
  QUALIFIER_MAX_QUANTITY: 10  // Qualifiers are limited to 1-10 units
};

/**
 * Get network configuration
 * @param {string} networkName - Network name ('xna' or 'xna-test')
 * @returns {object} Network configuration
 */
function getNetworkConfig(networkName) {
  if (networkName === 'xna' || networkName === 'mainnet') {
    return NETWORKS.MAINNET;
  } else if (networkName === 'xna-test' || networkName === 'testnet') {
    return NETWORKS.TESTNET;
  } else {
    throw new Error(`Unknown network: ${networkName}`);
  }
}

/**
 * Detect network from address prefix
 * @param {string} address - Neurai address
 * @returns {string} Network name ('xna' or 'xna-test')
 */
function detectNetworkFromAddress(address) {
  if (address.startsWith('N')) {
    return 'xna';
  } else if (address.startsWith('m') || address.startsWith('n')) {
    return 'xna-test';
  } else {
    throw new Error(`Cannot detect network from address: ${address}`);
  }
}

module.exports = {
  NETWORKS,
  ASSET_NAME_RULES,
  ASSET_LIMITS,
  getNetworkConfig,
  detectNetworkFromAddress
};
