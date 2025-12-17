/**
 * Mock RPC Function for Testing
 * Simulates Neurai RPC calls without requiring a live node
 */

class RPCMock {
  constructor() {
    this.mockResponses = new Map();
    this.callHistory = [];
  }

  /**
   * Set mock response for a specific RPC method
   * @param {string} method - RPC method name
   * @param {*} response - Response to return
   */
  setMockResponse(method, response) {
    this.mockResponses.set(method, response);
  }

  /**
   * Mock RPC function
   * @param {string} method - RPC method name
   * @param {Array} params - RPC parameters
   * @returns {Promise<*>} Mock response
   */
  async call(method, ...params) {
    this.callHistory.push({ method, params });

    if (this.mockResponses.has(method)) {
      const response = this.mockResponses.get(method);

      // If response is a function, call it with params
      if (typeof response === 'function') {
        return response(...params);
      }

      return response;
    }

    // Default responses for common methods
    return this.getDefaultResponse(method, params);
  }

  /**
   * Get default response for common RPC methods
   */
  getDefaultResponse(method, params) {
    const defaults = {
      'listunspent': [],
      'getassetdata': { name: params[0], amount: 1000000 },
      'listassets': [],
      'listmyassets': {},
      'listaddressesbyasset': [],
      'listassetbalancesbyaddress': [],
      'checkaddresstag': false,
      'checkaddressrestriction': true,
      'isaddressfrozen': false,
      'checkglobalrestriction': false,
      'getverifierstring': '',
      'isvalidverifierstring': true
    };

    return defaults[method] || null;
  }

  /**
   * Clear call history
   */
  clearHistory() {
    this.callHistory = [];
  }

  /**
   * Get number of times a method was called
   */
  getCallCount(method) {
    return this.callHistory.filter(call => call.method === method).length;
  }

  /**
   * Get last call for a method
   */
  getLastCall(method) {
    const calls = this.callHistory.filter(call => call.method === method);
    return calls[calls.length - 1];
  }

  /**
   * Reset all mocks
   */
  reset() {
    this.mockResponses.clear();
    this.callHistory = [];
  }
}

/**
 * Create a simple mock RPC function
 */
function createMockRPC(responses = {}) {
  const mock = new RPCMock();

  Object.entries(responses).forEach(([method, response]) => {
    mock.setMockResponse(method, response);
  });

  return mock.call.bind(mock);
}

/**
 * Create mock UTXO data
 */
function createMockUTXO(address, amount = 100, assetName = null) {
  const utxo = {
    txid: '0000000000000000000000000000000000000000000000000000000000000001',
    vout: 0,
    address: address,
    scriptPubKey: '76a914...',
    amount: assetName ? undefined : amount,
    confirmations: 10,
    spendable: true,
    solvable: true,
    safe: true
  };

  if (assetName) {
    utxo.assetName = assetName;
    utxo.assetAmount = amount;
  }

  return utxo;
}

/**
 * Create mock asset data
 */
function createMockAssetData(assetName, options = {}) {
  return {
    name: assetName,
    amount: options.amount || 1000000,
    units: options.units || 0,
    reissuable: options.reissuable !== undefined ? options.reissuable : true,
    has_ipfs: options.hasIpfs || false,
    ipfs_hash: options.ipfsHash || '',
    block_height: 1000,
    blockhash: '0000000000000000000000000000000000000000000000000000000000000001'
  };
}

module.exports = {
  RPCMock,
  createMockRPC,
  createMockUTXO,
  createMockAssetData
};
