/**
 * Tests for AssetNameParser
 */

const { expect } = require('chai');
const AssetNameParser = require('../../../src/utils/assetNameParser');
const { AssetType } = require('../../../src/constants');

describe('AssetNameParser', () => {
  describe('parse', () => {
    it('should parse ROOT asset names', () => {
      const result = AssetNameParser.parse('MYTOKEN');
      expect(result.type).to.equal(AssetType.ROOT);
      expect(result.name).to.equal('MYTOKEN');
      expect(result.parent).to.be.null;
      expect(result.isOwner).to.be.false;
      expect(result.isRestricted).to.be.false;
      expect(result.isQualifier).to.be.false;
    });

    it('should parse SUB asset names', () => {
      const result = AssetNameParser.parse('MYTOKEN/SUB');
      expect(result.type).to.equal(AssetType.SUB);
      expect(result.parent).to.equal('MYTOKEN');
      expect(result.subName).to.equal('SUB');
      expect(result.name).to.equal('MYTOKEN/SUB');
    });

    it('should parse UNIQUE asset names', () => {
      const result = AssetNameParser.parse('MYTOKEN#NFT1');
      expect(result.type).to.equal(AssetType.UNIQUE);
      expect(result.parent).to.equal('MYTOKEN');
      expect(result.tag).to.equal('NFT1');
      expect(result.name).to.equal('MYTOKEN#NFT1');
    });

    it('should parse QUALIFIER asset names', () => {
      const result = AssetNameParser.parse('#KYC');
      expect(result.type).to.equal(AssetType.QUALIFIER);
      expect(result.prefix).to.equal('#');
      expect(result.isQualifier).to.be.true;
      expect(result.name).to.equal('#KYC');
    });

    it('should parse SUB_QUALIFIER asset names', () => {
      const result = AssetNameParser.parse('#KYC/TIER1');
      expect(result.type).to.equal(AssetType.SUB_QUALIFIER);
      expect(result.parent).to.equal('#KYC');
      expect(result.subName).to.equal('TIER1');
      expect(result.prefix).to.equal('#');
    });

    it('should parse RESTRICTED asset names', () => {
      const result = AssetNameParser.parse('$SECURITY');
      expect(result.type).to.equal(AssetType.RESTRICTED);
      expect(result.prefix).to.equal('$');
      expect(result.isRestricted).to.be.true;
      expect(result.name).to.equal('$SECURITY');
    });

    it('should parse OWNER token names', () => {
      const result = AssetNameParser.parse('MYTOKEN!');
      expect(result.type).to.equal(AssetType.OWNER);
      expect(result.isOwner).to.be.true;
      expect(result.baseName).to.equal('MYTOKEN');
      expect(result.fullName).to.equal('MYTOKEN!');
    });

    it('should parse RESTRICTED OWNER token names', () => {
      const result = AssetNameParser.parse('$SECURITY!');
      expect(result.type).to.equal(AssetType.OWNER);
      expect(result.isOwner).to.be.true;
      expect(result.isRestricted).to.be.true;
      expect(result.baseName).to.equal('$SECURITY');
    });
  });

  describe('getType', () => {
    it('should return correct type for various asset names', () => {
      expect(AssetNameParser.getType('MYTOKEN')).to.equal(AssetType.ROOT);
      expect(AssetNameParser.getType('MYTOKEN/SUB')).to.equal(AssetType.SUB);
      expect(AssetNameParser.getType('MYTOKEN#NFT')).to.equal(AssetType.UNIQUE);
      expect(AssetNameParser.getType('#KYC')).to.equal(AssetType.QUALIFIER);
      expect(AssetNameParser.getType('#KYC/TIER1')).to.equal(AssetType.SUB_QUALIFIER);
      expect(AssetNameParser.getType('$SECURITY')).to.equal(AssetType.RESTRICTED);
      expect(AssetNameParser.getType('MYTOKEN!')).to.equal(AssetType.OWNER);
    });
  });

  describe('getParent', () => {
    it('should return parent for SUB assets', () => {
      expect(AssetNameParser.getParent('MYTOKEN/SUB')).to.equal('MYTOKEN');
    });

    it('should return parent for UNIQUE assets', () => {
      expect(AssetNameParser.getParent('MYTOKEN#NFT')).to.equal('MYTOKEN');
    });

    it('should return null for ROOT assets', () => {
      expect(AssetNameParser.getParent('MYTOKEN')).to.be.null;
    });

    it('should return parent for SUB_QUALIFIER', () => {
      expect(AssetNameParser.getParent('#KYC/TIER1')).to.equal('#KYC');
    });
  });

  describe('isOwnerToken', () => {
    it('should identify owner tokens', () => {
      expect(AssetNameParser.isOwnerToken('MYTOKEN!')).to.be.true;
      expect(AssetNameParser.isOwnerToken('$SECURITY!')).to.be.true;
    });

    it('should return false for non-owner tokens', () => {
      expect(AssetNameParser.isOwnerToken('MYTOKEN')).to.be.false;
      expect(AssetNameParser.isOwnerToken('MYTOKEN/SUB')).to.be.false;
    });
  });

  describe('getOwnerTokenName', () => {
    it('should add ! to get owner token name', () => {
      expect(AssetNameParser.getOwnerTokenName('MYTOKEN')).to.equal('MYTOKEN!');
      expect(AssetNameParser.getOwnerTokenName('$SECURITY')).to.equal('$SECURITY!');
    });

    it('should return as-is if already an owner token', () => {
      expect(AssetNameParser.getOwnerTokenName('MYTOKEN!')).to.equal('MYTOKEN!');
    });
  });

  describe('getBaseAssetName', () => {
    it('should remove ! to get base asset name', () => {
      expect(AssetNameParser.getBaseAssetName('MYTOKEN!')).to.equal('MYTOKEN');
      expect(AssetNameParser.getBaseAssetName('$SECURITY!')).to.equal('$SECURITY');
    });

    it('should return as-is if not an owner token', () => {
      expect(AssetNameParser.getBaseAssetName('MYTOKEN')).to.equal('MYTOKEN');
    });
  });

  describe('isRestricted', () => {
    it('should identify restricted assets', () => {
      expect(AssetNameParser.isRestricted('$SECURITY')).to.be.true;
      expect(AssetNameParser.isRestricted('$TOKEN')).to.be.true;
    });

    it('should return false for non-restricted assets', () => {
      expect(AssetNameParser.isRestricted('MYTOKEN')).to.be.false;
      expect(AssetNameParser.isRestricted('#KYC')).to.be.false;
    });
  });

  describe('isQualifier', () => {
    it('should identify qualifiers', () => {
      expect(AssetNameParser.isQualifier('#KYC')).to.be.true;
      expect(AssetNameParser.isQualifier('#KYC/TIER1')).to.be.true;
    });

    it('should return false for non-qualifiers', () => {
      expect(AssetNameParser.isQualifier('MYTOKEN')).to.be.false;
      expect(AssetNameParser.isQualifier('MYTOKEN#NFT')).to.be.false;
    });
  });

  describe('isUnique', () => {
    it('should identify unique assets', () => {
      expect(AssetNameParser.isUnique('MYTOKEN#NFT')).to.be.true;
      expect(AssetNameParser.isUnique('TOKEN#123')).to.be.true;
    });

    it('should return false for non-unique assets', () => {
      expect(AssetNameParser.isUnique('MYTOKEN')).to.be.false;
      expect(AssetNameParser.isUnique('#KYC')).to.be.false;
    });
  });

  describe('isSub', () => {
    it('should identify sub-assets', () => {
      expect(AssetNameParser.isSub('MYTOKEN/SUB')).to.be.true;
      expect(AssetNameParser.isSub('TOKEN/ALPHA')).to.be.true;
    });

    it('should return false for non-sub assets', () => {
      expect(AssetNameParser.isSub('MYTOKEN')).to.be.false;
      expect(AssetNameParser.isSub('#KYC/TIER1')).to.be.false;
    });
  });

  describe('buildUniqueName', () => {
    it('should build unique asset names', () => {
      expect(AssetNameParser.buildUniqueName('MYTOKEN', 'NFT1')).to.equal('MYTOKEN#NFT1');
      expect(AssetNameParser.buildUniqueName('TOKEN', '123')).to.equal('TOKEN#123');
    });
  });

  describe('buildSubName', () => {
    it('should build sub-asset names', () => {
      expect(AssetNameParser.buildSubName('MYTOKEN', 'SUB')).to.equal('MYTOKEN/SUB');
      expect(AssetNameParser.buildSubName('TOKEN', 'ALPHA')).to.equal('TOKEN/ALPHA');
    });
  });
});
