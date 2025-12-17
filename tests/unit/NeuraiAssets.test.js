/**
 * Tests for NeuraiAssets main class
 */

const { expect } = require('chai');
const NeuraiAssets = require('../../src/NeuraiAssets');
const { createMockRPC } = require('../mocks/rpcMock');

describe('NeuraiAssets', () => {
  let assets;
  let mockRPC;

  beforeEach(() => {
    mockRPC = createMockRPC();
    assets = new NeuraiAssets(mockRPC, {
      network: 'xna',
      addresses: ['N123...'],
      changeAddress: 'N123...',
      toAddress: 'N456...'
    });
  });

  describe('constructor', () => {
    it('should initialize with RPC and config', () => {
      expect(assets.rpc).to.be.a('function');
      expect(assets.config.network).to.equal('xna');
      expect(assets.config.addresses).to.deep.equal(['N123...']);
      expect(assets.config.changeAddress).to.equal('N123...');
      expect(assets.config.toAddress).to.equal('N456...');
    });

    it('should use default config values when not provided', () => {
      const defaultAssets = new NeuraiAssets(mockRPC);
      expect(defaultAssets.config.network).to.equal('xna');
      expect(defaultAssets.config.addresses).to.deep.equal([]);
      expect(defaultAssets.config.changeAddress).to.be.null;
      expect(defaultAssets.config.toAddress).to.be.null;
    });

    it('should throw error if RPC is not provided', () => {
      expect(() => new NeuraiAssets())
        .to.throw('RPC function is required');
    });

    it('should throw error if RPC is not a function', () => {
      expect(() => new NeuraiAssets('not a function'))
        .to.throw('RPC function is required');
    });

    it('should initialize queries instance', () => {
      expect(assets.queries).to.exist;
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      assets.updateConfig({
        network: 'xna-test',
        changeAddress: 'N789...'
      });

      expect(assets.config.network).to.equal('xna-test');
      expect(assets.config.changeAddress).to.equal('N789...');
      expect(assets.config.addresses).to.deep.equal(['N123...']);
    });
  });

  describe('_buildParams', () => {
    it('should merge params with config', () => {
      const params = assets._buildParams({
        assetName: 'MYTOKEN',
        quantity: 1000
      });

      expect(params.assetName).to.equal('MYTOKEN');
      expect(params.quantity).to.equal(1000);
      expect(params.network).to.equal('xna');
      expect(params.addresses).to.deep.equal(['N123...']);
      expect(params.changeAddress).to.equal('N123...');
      expect(params.toAddress).to.equal('N456...');
    });

    it('should allow params to override config values', () => {
      const params = assets._buildParams({
        assetName: 'MYTOKEN',
        changeAddress: 'N999...'
      });

      expect(params.changeAddress).to.equal('N999...');
    });
  });

  describe('Asset Type Detection', () => {
    it('should detect ROOT asset type', () => {
      const type = assets.getAssetType('MYTOKEN');
      expect(type).to.equal('ROOT');
    });

    it('should detect SUB asset type', () => {
      const type = assets.getAssetType('MYTOKEN/SUB');
      expect(type).to.equal('SUB');
    });

    it('should detect UNIQUE asset type', () => {
      const type = assets.getAssetType('MYTOKEN#NFT1');
      expect(type).to.equal('UNIQUE');
    });

    it('should detect QUALIFIER asset type', () => {
      const type = assets.getAssetType('#KYC');
      expect(type).to.equal('QUALIFIER');
    });

    it('should detect RESTRICTED asset type', () => {
      const type = assets.getAssetType('$SECURITY');
      expect(type).to.equal('RESTRICTED');
    });

    it('should detect OWNER token type', () => {
      const type = assets.getAssetType('MYTOKEN!');
      expect(type).to.equal('OWNER');
    });
  });

  describe('Query Methods', () => {
    it('should call getAssetData', async () => {
      const mockData = { name: 'MYTOKEN', amount: 1000000 };
      const rpcMock = createMockRPC({ 'getassetdata': mockData });
      const testAssets = new NeuraiAssets(rpcMock);

      const result = await testAssets.getAssetData('MYTOKEN');
      expect(result).to.deep.equal(mockData);
    });

    it('should call listAssets', async () => {
      const mockList = ['TOKEN1', 'TOKEN2', 'TOKEN3'];
      const rpcMock = createMockRPC({ 'listassets': mockList });
      const testAssets = new NeuraiAssets(rpcMock);

      const result = await testAssets.listAssets('*', false, 100, 0);
      expect(result).to.deep.equal(mockList);
    });

    it('should call listMyAssets', async () => {
      const mockAssets = { 'MYTOKEN': 1000, 'MYTOKEN2': 500 };
      const rpcMock = createMockRPC({ 'listmyassets': mockAssets });
      const testAssets = new NeuraiAssets(rpcMock);

      const result = await testAssets.listMyAssets();
      expect(result).to.deep.equal(mockAssets);
    });

    it('should call checkAddressTag', async () => {
      const rpcMock = createMockRPC({ 'checkaddresstag': true });
      const testAssets = new NeuraiAssets(rpcMock);

      const result = await testAssets.checkAddressTag('N123...', '#KYC');
      expect(result).to.be.true;
    });

    it('should call assetExists', async () => {
      const rpcMock = createMockRPC({ 'getassetdata': { name: 'MYTOKEN' } });
      const testAssets = new NeuraiAssets(rpcMock);

      const result = await testAssets.assetExists('MYTOKEN');
      expect(result).to.exist;
    });
  });

  describe('Method Availability', () => {
    it('should have all ROOT asset methods', () => {
      expect(assets.createRootAsset).to.be.a('function');
      expect(assets.createSubAsset).to.be.a('function');
      expect(assets.reissueAsset).to.be.a('function');
    });

    it('should have all UNIQUE asset methods', () => {
      expect(assets.createUniqueAssets).to.be.a('function');
    });

    it('should have all QUALIFIER methods', () => {
      expect(assets.createQualifier).to.be.a('function');
      expect(assets.tagAddresses).to.be.a('function');
      expect(assets.untagAddresses).to.be.a('function');
    });

    it('should have all RESTRICTED asset methods', () => {
      expect(assets.createRestrictedAsset).to.be.a('function');
      expect(assets.reissueRestrictedAsset).to.be.a('function');
      expect(assets.freezeAddresses).to.be.a('function');
      expect(assets.unfreezeAddresses).to.be.a('function');
      expect(assets.freezeAssetGlobally).to.be.a('function');
      expect(assets.unfreezeAssetGlobally).to.be.a('function');
    });

    it('should have all query methods', () => {
      expect(assets.getAssetData).to.be.a('function');
      expect(assets.listAssets).to.be.a('function');
      expect(assets.listMyAssets).to.be.a('function');
      expect(assets.listAddressesByAsset).to.be.a('function');
      expect(assets.listAssetBalancesByAddress).to.be.a('function');
      expect(assets.checkAddressTag).to.be.a('function');
      expect(assets.listTagsForAddress).to.be.a('function');
      expect(assets.listAddressesForTag).to.be.a('function');
      expect(assets.checkAddressRestriction).to.be.a('function');
      expect(assets.isAddressFrozen).to.be.a('function');
      expect(assets.checkGlobalRestriction).to.be.a('function');
      expect(assets.getVerifierString).to.be.a('function');
      expect(assets.isValidVerifierString).to.be.a('function');
      expect(assets.getSnapshotRequest).to.be.a('function');
      expect(assets.cancelSnapshotRequest).to.be.a('function');
      expect(assets.assetExists).to.be.a('function');
      expect(assets.getAssetType).to.be.a('function');
      expect(assets.getAssetCount).to.be.a('function');
    });
  });
});
