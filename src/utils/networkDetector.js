/**
 * Network Detector
 * Detects network type from various sources
 */

const { NETWORKS } = require('../constants');

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
      throw new Error(`Failed to detect network from RPC: ${error.message}`);
    }
  }

  /**
   * Detect network from address
   * @param {string} address - Neurai address
   * @returns {string} Network name ('xna' or 'xna-test')
   */
  static detectFromAddress(address) {
    if (!address || typeof address !== 'string') {
      throw new Error('Address must be a non-empty string');
    }

    // Mainnet addresses start with 'N'
    if (address.startsWith(NETWORKS.MAINNET.addressPrefix)) {
      return 'xna';
    }

    // Testnet addresses start with 'm' or 'n'
    if (address.startsWith(NETWORKS.TESTNET.addressPrefix) || address.startsWith('n')) {
      return 'xna-test';
    }

    throw new Error(`Cannot detect network from address: ${address}`);
  }

  /**
   * Detect network from multiple addresses
   * @param {string[]} addresses - Array of addresses
   * @returns {string} Network name ('xna' or 'xna-test')
   */
  static detectFromAddresses(addresses) {
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new Error('Addresses must be a non-empty array');
    }

    // Detect from first address
    const network = this.detectFromAddress(addresses[0]);

    // Verify all addresses are from the same network
    for (let i = 1; i < addresses.length; i++) {
      const otherNetwork = this.detectFromAddress(addresses[i]);
      if (otherNetwork !== network) {
        throw new Error(`Mixed network addresses detected: ${network} and ${otherNetwork}`);
      }
    }

    return network;
  }

  /**
   * Validate that addresses match expected network
   * @param {string[]} addresses - Array of addresses
   * @param {string} expectedNetwork - Expected network ('xna' or 'xna-test')
   * @returns {boolean} True if all addresses match network
   */
  static validateAddressesNetwork(addresses, expectedNetwork) {
    if (!Array.isArray(addresses) || addresses.length === 0) {
      throw new Error('Addresses must be a non-empty array');
    }

    for (const address of addresses) {
      const network = this.detectFromAddress(address);
      if (network !== expectedNetwork) {
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
    if (network === 'xna' || network === 'mainnet') {
      return NETWORKS.MAINNET;
    } else if (network === 'xna-test' || network === 'testnet') {
      return NETWORKS.TESTNET;
    } else {
      throw new Error(`Unknown network: ${network}`);
    }
  }

  /**
   * Check if network is mainnet
   * @param {string} network - Network name
   * @returns {boolean} True if mainnet
   */
  static isMainnet(network) {
    return network === 'xna' || network === 'mainnet';
  }

  /**
   * Check if network is testnet
   * @param {string} network - Network name
   * @returns {boolean} True if testnet
   */
  static isTestnet(network) {
    return network === 'xna-test' || network === 'testnet' || network === 'regtest';
  }
}

module.exports = NetworkDetector;
