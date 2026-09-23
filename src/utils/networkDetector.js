/**
 * Network Detector
 * Detects network type from various sources
 */
const { rpcErrorMessage } = require('./rpcErrorMessage');

const {
  areAddressNetworksCompatible,
  detectNetworkFromAddress,
  getNetworkConfig,
  resolveAddressNetworkFamily
} = require('../constants');

class NetworkDetector {
  /**
   * Detect network from RPC client
   * Calls getblockchaininfo to determine network
   * @param {Function} rpc - RPC function
   * @returns {Promise<string>} Network name ('xna' or 'xna-test')
   */
  static async detectFromRPC(rpc) {
    try {
      const blockchainInfo = await rpc('getblockchaininfo', []);

      // Check chain name
      if (blockchainInfo.chain === 'main') {
        return 'xna';
      } else if (blockchainInfo.chain === 'test') {
        return 'xna-test';
      } else if (blockchainInfo.chain === 'regtest') {
        return 'xna-test';  // Treat regtest as testnet
      }

      // Fallback: check if testnet field exists
      if (blockchainInfo.testnet === true) {
        return 'xna-test';
      }

      // Default to mainnet
      return 'xna';
    } catch (error) {
      throw new Error(`Failed to detect network from RPC: ${rpcErrorMessage(error)}`);
    }
  }

  /**
   * Detect network from address
   * @param {string} address - Neurai address
   * @returns {string} Network label: `xna` / `xna-test` for Base58 P2PKH,
   * `xna-pq` / `xna-pq-test` for every Bech32m AuthScript address (generic
   * v1 `nc1p…`, PQ v2 `pq1z…`, ECDSA v3 `nq1r…`)
   */
  static detectFromAddress(address) {
    if (!address || typeof address !== 'string') {
      throw new Error('Address must be a non-empty string');
    }
    return detectNetworkFromAddress(address);
  }

  /**
   * Detect network from multiple addresses
   * @param {string[]} addresses - Array of addresses
   * @returns {string} Network label. Mixed legacy/AuthScript addresses on the same
   * chain are normalized to the chain family label (`xna` or `xna-test`).
   */
  static detectFromAddresses(addresses) {
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new Error('Addresses must be a non-empty array');
    }

    const firstNetwork = this.detectFromAddress(addresses[0]);
    const family = resolveAddressNetworkFamily(firstNetwork);

    // Verify all addresses are from the same network
    for (let i = 1; i < addresses.length; i++) {
      const otherNetwork = this.detectFromAddress(addresses[i]);
      if (!areAddressNetworksCompatible(firstNetwork, otherNetwork)) {
        throw new Error(`Mixed network addresses detected: ${firstNetwork} and ${otherNetwork}`);
      }
    }

    return family === 'mainnet' ? 'xna' : 'xna-test';
  }

  /**
   * Validate that addresses match expected network
   * @param {string[]} addresses - Array of addresses
   * @param {string} expectedNetwork - Expected network label
   * @returns {boolean} True if all addresses match network
   */
  static validateAddressesNetwork(addresses, expectedNetwork) {
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new Error('Addresses must be a non-empty array');
    }

    for (const address of addresses) {
      const network = this.detectFromAddress(address);
      if (!areAddressNetworksCompatible(network, expectedNetwork)) {
        throw new Error(
          `Address ${address} is from ${network} but expected ${expectedNetwork}`
        );
      }
    }

    return true;
  }

  /**
   * Get network config from network name
   * @param {string} network - Network name
   * @returns {object} Network configuration
   */
  static getNetworkConfig(network) {
    return getNetworkConfig(network);
  }

  /**
   * Check if network is mainnet
   * @param {string} network - Network name
   * @returns {boolean} True if mainnet
   */
  static isMainnet(network) {
    try {
      return resolveAddressNetworkFamily(network) === 'mainnet';
    } catch {
      return false;
    }
  }

  /**
   * Check if network is testnet
   * @param {string} network - Network name
   * @returns {boolean} True if testnet
   */
  static isTestnet(network) {
    try {
      return resolveAddressNetworkFamily(network) === 'testnet';
    } catch {
      return false;
    }
  }
}

module.exports = NetworkDetector;
