const { decodeAddress } = require('@neuraiproject/neurai-create-transaction');

/**
 * Network Configuration for Neurai
 *
 * Network labels name a chain family. `xna` / `xna-test` are the canonical
 * labels (legacy address flows) and `xna-pq` / `xna-pq-test` the AuthScript
 * flows. The labels of neurai-key 5 (`xna-legacy[-test]`, `xna-old-legacy`,
 * `xna-authscript[-test]`) are accepted as aliases of their family: in this
 * package a label never selects an address type, the address itself does.
 */

const MAINNET_NETWORKS = [
  'xna', 'mainnet', 'xna-pq', 'mainnet-pq', 'xna-legacy', 'xna-old-legacy', 'xna-authscript'
];
const TESTNET_NETWORKS = [
  'xna-test', 'testnet', 'regtest', 'xna-pq-test', 'testnet-pq', 'xna-legacy-test', 'xna-authscript-test'
];

/** Labels that select the AuthScript configuration of their family. */
const AUTHSCRIPT_NETWORKS = ['xna-pq', 'mainnet-pq', 'xna-authscript', 'xna-pq-test', 'testnet-pq', 'xna-authscript-test'];

/**
 * Address prefixes per chain. Every Bech32m prefix only goes with one witness
 * version (node base58.cpp `DecodeDestination`):
 *   authScript: generic AuthScript witness v1 (nc1p… / tnc1p…)
 *   pq:         strict PQ witness v2 (pq1z… / tpq1z…)
 *   ecdsa:      strict ECDSA witness v3 (nq1r… / tnq1r…)
 */
const MAINNET_PREFIXES = {
  addressPrefix: 'N',
  authScriptAddressPrefix: 'nc1',
  pqAddressPrefix: 'pq1',
  ecdsaAddressPrefix: 'nq1'
};
const TESTNET_PREFIXES = {
  addressPrefix: 't',
  authScriptAddressPrefix: 'tnc1',
  pqAddressPrefix: 'tpq1',
  ecdsaAddressPrefix: 'tnq1'
};

const NETWORKS = {
  MAINNET: {
    name: 'xna',
    displayName: 'Neurai Mainnet',
    ...MAINNET_PREFIXES,
    assetNameMaxLength: 31,
    defaultRPCPort: 19001,
    coin: 'XNA',
    baseNetwork: 'xna'
  },
  TESTNET: {
    name: 'xna-test',
    displayName: 'Neurai Testnet',
    ...TESTNET_PREFIXES,
    assetNameMaxLength: 121, // DePIN networks (testnet/regtest) extend the cap
    defaultRPCPort: 19101,
    coin: 'TXNA',
    baseNetwork: 'xna-test'
  },
  MAINNET_PQ: {
    name: 'xna-pq',
    displayName: 'Neurai Mainnet AuthScript',
    ...MAINNET_PREFIXES,
    assetNameMaxLength: 31,
    defaultRPCPort: 19001,
    coin: 'XNA',
    baseNetwork: 'xna'
  },
  TESTNET_PQ: {
    name: 'xna-pq-test',
    displayName: 'Neurai Testnet AuthScript',
    ...TESTNET_PREFIXES,
    assetNameMaxLength: 121,
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
 * `xna-pq` / `xna-pq-test` (and neurai-key 5's `xna-authscript[-test]`)
 * select the AuthScript configuration of the same mainnet/testnet family.
 *
 * @param {string} networkName - Any label of MAINNET_NETWORKS / TESTNET_NETWORKS
 * @returns {object} Network configuration
 */
function getNetworkConfig(networkName) {
  if (MAINNET_NETWORKS.includes(networkName)) {
    return AUTHSCRIPT_NETWORKS.includes(networkName)
      ? NETWORKS.MAINNET_PQ
      : NETWORKS.MAINNET;
  } else if (TESTNET_NETWORKS.includes(networkName)) {
    return AUTHSCRIPT_NETWORKS.includes(networkName)
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
 * Detect the network family of an address by decoding it (the node's rules,
 * through neurai-create-transaction `decodeAddress`).
 *
 * Base58 P2PKH addresses report `xna` / `xna-test`; every Bech32m AuthScript
 * address — generic v1 (`nc1p…`), strict PQ v2 (`pq1z…`) and strict ECDSA v3
 * (`nq1r…`) — reports `xna-pq` / `xna-pq-test`, this package's AuthScript
 * label. The old `nq1p…` / `tnq1p…` encoding of generic v1 is not an address
 * anymore and throws, like in the node.
 *
 * @param {string} address - Neurai address
 * @returns {string} Network name ('xna', 'xna-test', 'xna-pq', or 'xna-pq-test')
 */
function detectNetworkFromAddress(address) {
  let decoded;
  try {
    decoded = decodeAddress(address);
  } catch (error) {
    throw new Error(`Cannot detect network from address: ${address} (${error.message})`);
  }
  const testnet = decoded.network.endsWith('-test');
  if (decoded.type === 'p2pkh') {
    return testnet ? 'xna-test' : 'xna';
  }
  return testnet ? 'xna-pq-test' : 'xna-pq';
}

module.exports = {
  NETWORKS,
  MAINNET_NETWORKS,
  TESTNET_NETWORKS,
  AUTHSCRIPT_NETWORKS,
  ASSET_NAME_RULES,
  ASSET_LIMITS,
  getNetworkConfig,
  resolveAddressNetworkFamily,
  areAddressNetworksCompatible,
  detectNetworkFromAddress
};
