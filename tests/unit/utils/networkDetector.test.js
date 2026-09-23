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
const { ADDR, PQ_ADDR, STRICT_PQ_ADDR, ECDSA_ADDR, MAINNET } = require('../../fixtures/addresses');

describe('NetworkDetector', () => {
  describe('detectFromAddress', () => {
    it('should detect legacy mainnet addresses', () => {
      expect(NetworkDetector.detectFromAddress(MAINNET.legacy)).to.equal('xna');
    });

    it('should detect legacy testnet addresses', () => {
      expect(NetworkDetector.detectFromAddress(ADDR[0])).to.equal('xna-test');
    });

    it('should detect every AuthScript family on mainnet as xna-pq', () => {
      for (const address of [MAINNET.authScript, MAINNET.pq, MAINNET.ecdsa]) {
        expect(NetworkDetector.detectFromAddress(address), address).to.equal('xna-pq');
      }
    });

    it('should detect every AuthScript family on testnet as xna-pq-test', () => {
      for (const address of [PQ_ADDR[0], STRICT_PQ_ADDR, ECDSA_ADDR]) {
        expect(NetworkDetector.detectFromAddress(address), address).to.equal('xna-pq-test');
      }
    });

    it('should decode Base58 addresses that look like a Bech32m prefix', () => {
      expect(NetworkDetector.detectFromAddress('NQ1EZZUfHwE4ntRyqW5LAFCcDZjLKxvGyH')).to.equal('xna');
      expect(NetworkDetector.detectFromAddress('tNc1F3aqhmGhKipLWa9U4tuoLh9yyP1ZXP')).to.equal('xna-test');
    });

    it('should reject strings that are not addresses, including the pre-5.0 tnq1p encoding', () => {
      expect(() => NetworkDetector.detectFromAddress('NExampleLegacyAddress')).to.throw('Cannot detect network');
      expect(() => NetworkDetector.detectFromAddress(
        'tnq1p432fs3tk3226vpmjdal52f4s9fplrt9rz2clmduudcesz93ht7ys7nm0ag'
      )).to.throw(/tnc1p/);
    });
  });

  describe('detectFromAddresses', () => {
    it('should accept multiple AuthScript addresses from the same network', () => {
      const result = NetworkDetector.detectFromAddresses([MAINNET.authScript, MAINNET.pq, MAINNET.ecdsa]);
      expect(result).to.equal('xna');
    });

    it('should accept mixed legacy and AuthScript addresses on the same chain', () => {
      const result = NetworkDetector.detectFromAddresses([ADDR[0], PQ_ADDR[0], STRICT_PQ_ADDR, ECDSA_ADDR]);
      expect(result).to.equal('xna-test');
    });

    it('should reject mixed chain families', () => {
      expect(() => NetworkDetector.detectFromAddresses([MAINNET.pq, ADDR[0]])).to.throw('Mixed network addresses detected');
    });
  });

  describe('validateAddressesNetwork', () => {
    it('should validate AuthScript addresses against expected network', () => {
      expect(NetworkDetector.validateAddressesNetwork([MAINNET.pq], 'xna-pq')).to.be.true;
      expect(NetworkDetector.validateAddressesNetwork([ECDSA_ADDR], 'xna-pq-test')).to.be.true;
    });

    it('should allow AuthScript addresses when validating the base network family', () => {
      expect(NetworkDetector.validateAddressesNetwork([MAINNET.ecdsa], 'xna')).to.be.true;
      expect(NetworkDetector.validateAddressesNetwork([PQ_ADDR[1]], 'xna-test')).to.be.true;
    });

    it('should accept the neurai-key 5 network labels as family aliases', () => {
      for (const label of ['xna-legacy', 'xna-old-legacy', 'xna-authscript']) {
        expect(NetworkDetector.validateAddressesNetwork([MAINNET.legacy, MAINNET.pq], label), label).to.be.true;
        expect(NetworkDetector.isMainnet(label)).to.be.true;
      }
      for (const label of ['xna-legacy-test', 'xna-authscript-test']) {
        expect(NetworkDetector.validateAddressesNetwork([ADDR[0], ECDSA_ADDR], label), label).to.be.true;
        expect(NetworkDetector.isTestnet(label)).to.be.true;
      }
      expect(NetworkDetector.isMainnet('bogus')).to.be.false;
      expect(NetworkDetector.isTestnet('bogus')).to.be.false;
    });
  });

  describe('getNetworkConfig', () => {
    it('should return AuthScript alias config for mainnet', () => {
      const config = getNetworkConfig('xna-pq');
      expect(config.name).to.equal('xna-pq');
      expect(config.authScriptAddressPrefix).to.equal('nc1');
      expect(config.pqAddressPrefix).to.equal('pq1');
      expect(config.ecdsaAddressPrefix).to.equal('nq1');
      expect(config.baseNetwork).to.equal('xna');
    });

    it('should return AuthScript alias config for testnet', () => {
      const config = getNetworkConfig('xna-pq-test');
      expect(config.name).to.equal('xna-pq-test');
      expect(config.authScriptAddressPrefix).to.equal('tnc1');
      expect(config.pqAddressPrefix).to.equal('tpq1');
      expect(config.ecdsaAddressPrefix).to.equal('tnq1');
      expect(config.baseNetwork).to.equal('xna-test');
    });

    it('should map the neurai-key 5 labels to their family configuration', () => {
      expect(getNetworkConfig('xna-legacy').name).to.equal('xna');
      expect(getNetworkConfig('xna-old-legacy').name).to.equal('xna');
      expect(getNetworkConfig('xna-authscript').name).to.equal('xna-pq');
      expect(getNetworkConfig('xna-legacy-test').name).to.equal('xna-test');
      expect(getNetworkConfig('xna-authscript-test').name).to.equal('xna-pq-test');
      expect(NetworkDetector.getNetworkConfig('xna-authscript-test').baseNetwork).to.equal('xna-test');
    });
  });

  describe('detectNetworkFromAddress', () => {
    it('should detect AuthScript addresses through constants helper', () => {
      expect(detectNetworkFromAddress(MAINNET.authScript)).to.equal('xna-pq');
      expect(detectNetworkFromAddress(STRICT_PQ_ADDR)).to.equal('xna-pq-test');
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
