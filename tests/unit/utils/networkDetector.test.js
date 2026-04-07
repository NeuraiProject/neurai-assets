/**
 * Tests for NetworkDetector and network constants.
 */

const { expect } = require('chai');
const NetworkDetector = require('../../../src/utils/networkDetector');
const {
  getNetworkConfig,
  detectNetworkFromAddress,
  getBurnAddress
} = require('../../../src/constants');

describe('NetworkDetector', () => {
  describe('detectFromAddress', () => {
    it('should detect legacy mainnet addresses', () => {
      expect(NetworkDetector.detectFromAddress('NExampleLegacyAddress')).to.equal('xna');
    });

    it('should detect legacy testnet addresses', () => {
      expect(NetworkDetector.detectFromAddress('tExampleLegacyAddress')).to.equal('xna-test');
    });

    it('should detect PQ mainnet addresses', () => {
      expect(NetworkDetector.detectFromAddress('nq1examplepqaddress')).to.equal('xna-pq');
    });

    it('should detect PQ testnet addresses', () => {
      expect(NetworkDetector.detectFromAddress('tnq1examplepqaddress')).to.equal('xna-pq-test');
    });
  });

  describe('detectFromAddresses', () => {
    it('should accept multiple PQ addresses from the same network', () => {
      const result = NetworkDetector.detectFromAddresses([
        'nq1firstpqaddress',
        'nq1secondpqaddress'
      ]);

      expect(result).to.equal('xna-pq');
    });

    it('should reject mixed PQ networks', () => {
      expect(() => NetworkDetector.detectFromAddresses([
        'nq1firstpqaddress',
        'tnq1secondpqaddress'
      ])).to.throw('Mixed network addresses detected');
    });
  });

  describe('validateAddressesNetwork', () => {
    it('should validate PQ addresses against expected network', () => {
      expect(NetworkDetector.validateAddressesNetwork(['nq1examplepqaddress'], 'xna-pq')).to.be.true;
      expect(NetworkDetector.validateAddressesNetwork(['tnq1examplepqaddress'], 'xna-pq-test')).to.be.true;
    });
  });

  describe('getNetworkConfig', () => {
    it('should return PQ network config for mainnet', () => {
      const config = getNetworkConfig('xna-pq');
      expect(config.name).to.equal('xna-pq');
      expect(config.pqAddressPrefix).to.equal('nq1');
      expect(config.baseNetwork).to.equal('xna');
    });

    it('should return PQ network config for testnet', () => {
      const config = getNetworkConfig('xna-pq-test');
      expect(config.name).to.equal('xna-pq-test');
      expect(config.pqAddressPrefix).to.equal('tnq1');
      expect(config.baseNetwork).to.equal('xna-test');
    });
  });

  describe('detectNetworkFromAddress', () => {
    it('should detect PQ addresses through constants helper', () => {
      expect(detectNetworkFromAddress('nq1examplepqaddress')).to.equal('xna-pq');
      expect(detectNetworkFromAddress('tnq1examplepqaddress')).to.equal('xna-pq-test');
    });
  });

  describe('getBurnAddress', () => {
    it('should use mainnet burn addresses for xna-pq', () => {
      expect(getBurnAddress('ISSUE_ROOT', 'xna-pq')).to.equal('NbURNXXXXXXXXXXXXXXXXXXXXXXXT65Gdr');
    });

    it('should use testnet burn addresses for xna-pq-test', () => {
      expect(getBurnAddress('ISSUE_ROOT', 'xna-pq-test')).to.equal('tBURNXXXXXXXXXXXXXXXXXXXXXXXVZLroy');
    });
  });
});
