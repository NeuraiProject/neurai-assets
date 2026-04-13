/**
 * Network Configuration for Neurai
 */

const MAINNET_NETWORKS = ['xna', 'mainnet', 'xna-pq', 'mainnet-pq'];
const TESTNET_NETWORKS = ['xna-test', 'testnet', 'regtest', 'xna-pq-test', 'testnet-pq'];

const NETWORKS = {
  MAINNET: {
    name: 'xna',
    displayName: 'Neurai Mainnet',
    addressPrefix: 'N',
    authScriptAddressPrefix: 'nq1',
    pqAddressPrefix: 'nq1',
    assetNameMaxLength: 32,
    defaultRPCPort: 19001,
    coin: 'XNA',
    baseNetwork: 'xna'
  },
  TESTNET: {
    name: 'xna-test',
    displayName: 'Neurai Testnet',
    addressPrefix: 't',
    authScriptAddressPrefix: 'tnq1',
    pqAddressPrefix: 'tnq1',
    assetNameMaxLength: 32,  // Same as mainnet
    defaultRPCPort: 19101,
    coin: 'TXNA',
    baseNetwork: 'xna-test'
  },
  MAINNET_PQ: {
    name: 'xna-pq',
    displayName: 'Neurai Mainnet AuthScript',
    addressPrefix: 'N',
    authScriptAddressPrefix: 'nq1',
    pqAddressPrefix: 'nq1',
    assetNameMaxLength: 32,
    defaultRPCPort: 19001,
    coin: 'XNA',
    baseNetwork: 'xna'
  },
  TESTNET_PQ: {
    name: 'xna-pq-test',
    displayName: 'Neurai Testnet AuthScript',
    addressPrefix: 't',
    authScriptAddressPrefix: 'tnq1',
    pqAddressPrefix: 'tnq1',
    assetNameMaxLength: 32,
    defaultRPCPort: 19101,
    coin: 'TXNA',
    baseNetwork: 'xna-test'
  }
};

/**
 * Asset naming helpers.
 * Network-specific maximum lengths are enforced in AssetNameValidator.
 */
const ASSET_NAME_RULES = {
  ROOT: {
    minLength: 3,
    maxLength: 31,
    pattern: /^[A-Z0-9_.]+$/,
    reserved: ['XNA', 'NEURAI', 'NEURAICOIN']
  },
  SUB: {
    minLength: 1,
    maxLength: 31,
    pattern: /^[A-Z0-9_.]+$/,
    separator: '/',
    maxDepth: null
  },
  UNIQUE: {
    minLength: 1,
    maxLength: 32,
    pattern: /^[-A-Za-z0-9@$%&*()[\]{}_.?:]+$/,
    separator: '#'
  },
  QUALIFIER: {
    minLength: 3,
    maxLength: 32,
    pattern: /^[A-Z0-9_.]+$/,
    prefix: '#',
    separator: '/'
  },
  RESTRICTED: {
    minLength: 3,
    maxLength: 32,
    pattern: /^[A-Z0-9_.]+$/,
    prefix: '$'
  },
  DEPIN: {
    minLength: 3,
    maxLength: 121,
    pattern: /^[A-Z0-9_.]+$/,
    prefix: '&',
    separator: '/'
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
 * `xna-pq` / `xna-pq-test` are preserved as compatibility aliases for
 * AuthScript address flows on the same mainnet/testnet families.
 *
 * @param {string} networkName - Network name ('xna', 'xna-test', 'xna-pq', or 'xna-pq-test')
 * @returns {object} Network configuration
 */
function getNetworkConfig(networkName) {
  if (MAINNET_NETWORKS.includes(networkName)) {
    return networkName === 'xna-pq' || networkName === 'mainnet-pq'
      ? NETWORKS.MAINNET_PQ
      : NETWORKS.MAINNET;
  } else if (TESTNET_NETWORKS.includes(networkName)) {
    return networkName === 'xna-pq-test' || networkName === 'testnet-pq'
      ? NETWORKS.TESTNET_PQ
      : NETWORKS.TESTNET;
  } else {
    throw new Error(`Unknown network: ${networkName}`);
  }
}

/**
 * Resolve a network name to its chain family.
 * AuthScript aliases share the same family as legacy addresses.
 *
 * @param {string} networkName - Network name
 * @returns {'mainnet'|'testnet'} Network family
 */
function resolveAddressNetworkFamily(networkName) {
  if (MAINNET_NETWORKS.includes(networkName)) {
    return 'mainnet';
  }

  if (TESTNET_NETWORKS.includes(networkName)) {
    return 'testnet';
  }

  throw new Error(`Unknown network: ${networkName}`);
}

/**
 * Determine whether two network labels are compatible for address use.
 * This treats legacy and AuthScript labels on the same chain as compatible.
 *
 * @param {string} left - First network name
 * @param {string} right - Second network name
 * @returns {boolean} True if both belong to the same chain family
 */
function areAddressNetworksCompatible(left, right) {
  return resolveAddressNetworkFamily(left) === resolveAddressNetworkFamily(right);
}

/**
 * Detect network from address prefix.
 * `nq1...` / `tnq1...` are AuthScript witness-v1 destinations.
 *
 * @param {string} address - Neurai address
 * @returns {string} Network name ('xna', 'xna-test', 'xna-pq', or 'xna-pq-test')
 */
function detectNetworkFromAddress(address) {
  if (address.startsWith(NETWORKS.MAINNET_PQ.authScriptAddressPrefix)) {
    return 'xna-pq';
  } else if (address.startsWith(NETWORKS.TESTNET_PQ.authScriptAddressPrefix)) {
    return 'xna-pq-test';
  } else if (address.startsWith('N')) {
    return 'xna';
  } else if (address.startsWith('t')) {
    return 'xna-test';
  } else {
    throw new Error(`Cannot detect network from address: ${address}`);
  }
}

module.exports = {
  NETWORKS,
  MAINNET_NETWORKS,
  TESTNET_NETWORKS,
  ASSET_NAME_RULES,
  ASSET_LIMITS,
  getNetworkConfig,
  resolveAddressNetworkFamily,
  areAddressNetworksCompatible,
  detectNetworkFromAddress
};
