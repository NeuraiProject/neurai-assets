/**
 * Integration Tests - Asset Lifecycle
 * Tests the complete workflow of asset operations
 */

const { expect } = require('chai');
const NeuraiAssets = require('../../src/NeuraiAssets');
const AssetNameValidator = require('../../src/validators/assetNameValidator');
const AssetNameParser = require('../../src/utils/assetNameParser');
const AmountConverter = require('../../src/utils/amountConverter');
const { createMockRPC, createMockUTXO, createMockAssetData } = require('../mocks/rpcMock');

describe('Integration: Asset Lifecycle', () => {
  describe('Validator and Parser Integration', () => {
    it('should validate and parse ROOT assets correctly', () => {
      const assetName = 'MYTOKEN';

      expect(AssetNameValidator.validateRoot(assetName)).to.be.true;

      const parsed = AssetNameParser.parse(assetName);
      expect(parsed.type).to.equal(0);
      expect(parsed.name).to.equal(assetName);
      expect(parsed.isOwner).to.be.false;
    });

    it('should validate and parse UNIQUE assets correctly', () => {
      const assetName = 'MYTOKEN#NFT1';

      expect(AssetNameValidator.validateUnique(assetName)).to.be.true;

      const parsed = AssetNameParser.parse(assetName);
      expect(parsed.type).to.equal(2);
      expect(parsed.parent).to.equal('MYTOKEN');
      expect(parsed.tag).to.equal('NFT1');
    });

    it('should validate and parse QUALIFIER assets correctly', () => {
      const assetName = '#KYC_VERIFIED';

      expect(AssetNameValidator.validateQualifier(assetName)).to.be.true;

      const parsed = AssetNameParser.parse(assetName);
      expect(parsed.type).to.equal(4);
      expect(parsed.isQualifier).to.be.true;
      expect(parsed.prefix).to.equal('#');
    });

    it('should validate and parse RESTRICTED assets correctly', () => {
      const assetName = '$SECURITY_TOKEN';

      expect(AssetNameValidator.validateRestricted(assetName)).to.be.true;

      const parsed = AssetNameParser.parse(assetName);
      expect(parsed.type).to.equal(6);
      expect(parsed.isRestricted).to.be.true;
      expect(parsed.prefix).to.equal('$');
    });

    it('should validate and parse DEPIN assets correctly', () => {
      const assetName = '&FRANCE/PARIS';

      expect(AssetNameValidator.validateDepin(assetName)).to.be.true;

      const parsed = AssetNameParser.parse(assetName);
      expect(parsed.type).to.equal(12);
      expect(parsed.isDepin).to.be.true;
      expect(parsed.parent).to.equal('&FRANCE');
      expect(parsed.subName).to.equal('PARIS');
    });
  });

  describe('Amount Conversion Integration', () => {
    it('should convert amounts correctly for different units', () => {
      const testCases = [
        { amount: 100, units: 0, expected: 100 },
        { amount: 1.5, units: 1, expected: 15 },
        { amount: 1.5, units: 2, expected: 150 },
        { amount: 1.00000001, units: 8, expected: 100000001 }
      ];

      testCases.forEach(({ amount, units, expected }) => {
        const satoshis = AmountConverter.toSatoshis(amount, units);
        expect(satoshis).to.equal(expected);

        const back = AmountConverter.fromSatoshis(satoshis, units);
        expect(back).to.equal(amount);
      });
    });

    it('should format and parse amounts correctly', () => {
      const amount = 1.5;
      const units = 2;

      const formatted = AmountConverter.format(amount, units);
      expect(formatted).to.equal('1.50');

      const parsed = AmountConverter.parse(formatted);
      expect(parsed).to.equal(amount);
    });
  });

  describe('NeuraiAssets Integration', () => {
    let assets;
    let mockRPC;

    beforeEach(() => {
      mockRPC = createMockRPC({
        'listunspent': [
          createMockUTXO('N123...', 100),
          createMockUTXO('N123...', 50, 'MYTOKEN')
        ],
        'getassetdata': createMockAssetData('MYTOKEN', {
          amount: 1000000,
          units: 2,
          reissuable: true
        })
      });

      assets = new NeuraiAssets(mockRPC, {
        network: 'xna',
        addresses: ['N123...'],
        changeAddress: 'N123...',
        toAddress: 'N456...'
      });
    });

    it('should validate asset name before operations', async () => {
      expect(() => assets.getAssetType('invalid-name'))
        .to.not.throw();

      const type = assets.getAssetType('MYTOKEN');
      expect(type).to.equal('ROOT');
    });

    it('should query asset data successfully', async () => {
      const data = await assets.getAssetData('MYTOKEN');
      expect(data.name).to.equal('MYTOKEN');
      expect(data.amount).to.equal(1000000);
      expect(data.units).to.equal(2);
    });

    it('should detect different asset types', () => {
      const testCases = [
        { name: 'MYTOKEN', expected: 'ROOT' },
        { name: 'MYTOKEN/SUB', expected: 'SUB' },
        { name: 'MYTOKEN#NFT', expected: 'UNIQUE' },
        { name: '#KYC', expected: 'QUALIFIER' },
        { name: '$SECURITY', expected: 'RESTRICTED' },
        { name: '&FRANCE/PARIS', expected: 'DEPIN' },
        { name: 'MYTOKEN!', expected: 'OWNER' }
      ];

      testCases.forEach(({ name, expected }) => {
        const type = assets.getAssetType(name);
        expect(type).to.equal(expected);
      });
    });
  });

  describe('Complex Workflows', () => {
    it('should handle owner token derivation', () => {
      const assetName = 'MYTOKEN';
      const ownerToken = AssetNameParser.getOwnerTokenName(assetName);

      expect(ownerToken).to.equal('MYTOKEN!');
      expect(AssetNameParser.isOwnerToken(ownerToken)).to.be.true;

      const baseAsset = AssetNameParser.getBaseAssetName(ownerToken);
      expect(baseAsset).to.equal(assetName);
    });

    it('should handle sub-asset creation workflow', () => {
      const rootName = 'MYTOKEN';
      const subName = 'ALPHA';

      expect(AssetNameValidator.validateRoot(rootName)).to.be.true;

      const fullSubName = AssetNameParser.buildSubName(rootName, subName);
      expect(fullSubName).to.equal('MYTOKEN/ALPHA');

      expect(AssetNameValidator.validateSub(fullSubName)).to.be.true;

      const parsed = AssetNameParser.parse(fullSubName);
      expect(parsed.parent).to.equal(rootName);
      expect(parsed.subName).to.equal(subName);
    });

    it('should handle unique asset creation workflow', () => {
      const rootName = 'MYTOKEN';
      const tag = 'NFT001';

      expect(AssetNameValidator.validateRoot(rootName)).to.be.true;

      const uniqueName = AssetNameParser.buildUniqueName(rootName, tag);
      expect(uniqueName).to.equal('MYTOKEN#NFT001');

      expect(AssetNameValidator.validateUnique(uniqueName)).to.be.true;

      const parsed = AssetNameParser.parse(uniqueName);
      expect(parsed.parent).to.equal(rootName);
      expect(parsed.tag).to.equal(tag);
      expect(parsed.type).to.equal(2);
    });

    it('should handle restricted asset workflow', () => {
      const assetName = '$SECURITY';

      expect(AssetNameValidator.validateRestricted(assetName)).to.be.true;
      expect(AssetNameParser.isRestricted(assetName)).to.be.true;

      const parsed = AssetNameParser.parse(assetName);
      expect(parsed.type).to.equal(6);
      expect(parsed.prefix).to.equal('$');
    });

    it('should handle qualifier workflow', () => {
      const qualifierName = '#KYC_VERIFIED';

      expect(AssetNameValidator.validateQualifier(qualifierName)).to.be.true;
      expect(AssetNameParser.isQualifier(qualifierName)).to.be.true;

      const parsed = AssetNameParser.parse(qualifierName);
      expect(parsed.type).to.equal(4);
      expect(parsed.isQualifier).to.be.true;
    });

    it('should handle depin workflow', () => {
      const depinName = '&FRANCE/PARIS';

      expect(AssetNameValidator.validateDepin(depinName)).to.be.true;
      expect(AssetNameParser.isDepin(depinName)).to.be.true;

      const ownerToken = AssetNameParser.getOwnerTokenName(depinName);
      expect(ownerToken).to.equal('&FRANCE/PARIS!');

      const parsed = AssetNameParser.parse(depinName);
      expect(parsed.type).to.equal(12);
      expect(parsed.parent).to.equal('&FRANCE');
    });
  });

  describe('Error Handling Integration', () => {
    it('should propagate validation errors correctly', () => {
      expect(() => AssetNameValidator.validateRoot('ab'))
        .to.throw();

      expect(() => AssetNameValidator.validateSub('INVALID'))
        .to.throw();

      expect(() => AssetNameValidator.validateUnique('INVALID'))
        .to.throw();

      expect(() => AssetNameValidator.validateQualifier('INVALID'))
        .to.throw();

      expect(() => AssetNameValidator.validateRestricted('INVALID'))
        .to.throw();
    });

    it('should handle amount conversion errors', () => {
      expect(() => AmountConverter.toSatoshis('invalid', 0))
        .to.throw();

      expect(() => AmountConverter.toSatoshis(100, -1))
        .to.throw();

      expect(() => AmountConverter.fromSatoshis('invalid', 0))
        .to.throw();
    });
  });
});
