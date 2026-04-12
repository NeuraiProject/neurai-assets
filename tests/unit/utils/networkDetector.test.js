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

    it('should detect AuthScript mainnet addresses', () => {
      expect(NetworkDetector.detectFromAddress('nq1examplepqaddress')).to.equal('xna-pq');
    });

    it('should detect AuthScript testnet addresses', () => {
      expect(NetworkDetector.detectFromAddress('tnq1examplepqaddress')).to.equal('xna-pq-test');
    });
  });

  describe('detectFromAddresses', () => {
    it('should accept multiple AuthScript addresses from the same network', () => {
      const result = NetworkDetector.detectFromAddresses([
        'nq1firstpqaddress',
        'nq1secondpqaddress'
      ]);

      expect(result).to.equal('xna');
    });

    it('should accept mixed legacy and AuthScript addresses on the same chain', () => {
      const result = NetworkDetector.detectFromAddresses([
        'NExampleLegacyAddress',
        'nq1exampleauthscriptaddress'
      ]);

      expect(result).to.equal('xna');
    });

    it('should reject mixed chain families', () => {
      expect(() => NetworkDetector.detectFromAddresses([
        'nq1firstpqaddress',
        'tExampleLegacyAddress'
      ])).to.throw('Mixed network addresses detected');
    });
  });

  describe('validateAddressesNetwork', () => {
    it('should validate AuthScript addresses against expected network', () => {
      expect(NetworkDetector.validateAddressesNetwork(['nq1examplepqaddress'], 'xna-pq')).to.be.true;
      expect(NetworkDetector.validateAddressesNetwork(['tnq1examplepqaddress'], 'xna-pq-test')).to.be.true;
    });

    it('should allow AuthScript addresses when validating the base network family', () => {
      expect(NetworkDetector.validateAddressesNetwork(['nq1examplepqaddress'], 'xna')).to.be.true;
      expect(NetworkDetector.validateAddressesNetwork(['tnq1examplepqaddress'], 'xna-test')).to.be.true;
    });
  });

  describe('getNetworkConfig', () => {
    it('should return AuthScript alias config for mainnet', () => {
      const config = getNetworkConfig('xna-pq');
      expect(config.name).to.equal('xna-pq');
      expect(config.authScriptAddressPrefix).to.equal('nq1');
      expect(config.baseNetwork).to.equal('xna');
    });

    it('should return AuthScript alias config for testnet', () => {
      const config = getNetworkConfig('xna-pq-test');
      expect(config.name).to.equal('xna-pq-test');
      expect(config.authScriptAddressPrefix).to.equal('tnq1');
      expect(config.baseNetwork).to.equal('xna-test');
    });
  });

  describe('detectNetworkFromAddress', () => {
    it('should detect AuthScript addresses through constants helper', () => {
      expect(detectNetworkFromAddress('nq1examplepqaddress')).to.equal('xna-pq');
      expect(detectNetworkFromAddress('tnq1examplepqaddress')).to.equal('xna-pq-test');
    });
  });

  describe('getBurnAddress', () => {
    it('should use mainnet burn addresses for AuthScript alias xna-pq', () => {
      expect(getBurnAddress('ISSUE_ROOT', 'xna-pq')).to.equal('NbURNXXXXXXXXXXXXXXXXXXXXXXXT65Gdr');
    });

    it('should use testnet burn addresses for AuthScript alias xna-pq-test', () => {
      expect(getBurnAddress('ISSUE_ROOT', 'xna-pq-test')).to.equal('tBURNXXXXXXXXXXXXXXXXXXXXXXXVZLroy');
    });
  });
});
