/**
 * Tests for AssetNameValidator
 */

const { expect } = require('chai');
const AssetNameValidator = require('../../../src/validators/assetNameValidator');
const { InvalidAssetNameError } = require('../../../src/errors');

describe('AssetNameValidator', () => {
  describe('validateRoot', () => {
    it('should validate correct ROOT asset names', () => {
      expect(AssetNameValidator.validateRoot('MYTOKEN')).to.be.true;
      expect(AssetNameValidator.validateRoot('AMBER')).to.be.true;
      expect(AssetNameValidator.validateRoot('TEST')).to.be.true;
      expect(AssetNameValidator.validateRoot('MY_TOKEN')).to.be.true;
      expect(AssetNameValidator.validateRoot('MY.TOKEN')).to.be.true;
      expect(AssetNameValidator.validateRoot('TOKEN123')).to.be.true;
    });

    it('should reject names that are too short', () => {
      expect(() => AssetNameValidator.validateRoot('AB'))
        .to.throw(InvalidAssetNameError, 'ROOT asset name must be');
    });

    it('should reject names that are too long', () => {
      expect(() => AssetNameValidator.validateRoot('A'.repeat(32)))
        .to.throw(InvalidAssetNameError, 'ROOT asset name must be');
    });

    it('should reject lowercase names', () => {
      expect(() => AssetNameValidator.validateRoot('mytoken'))
        .to.throw(InvalidAssetNameError, 'must be uppercase');
    });

    it('should reject names with invalid punctuation placement', () => {
      expect(() => AssetNameValidator.validateRoot('.TOKEN'))
        .to.throw(InvalidAssetNameError, 'special characters');

      expect(() => AssetNameValidator.validateRoot('TOKEN.'))
        .to.throw(InvalidAssetNameError, 'special characters');

      expect(() => AssetNameValidator.validateRoot('MY..TOKEN'))
        .to.throw(InvalidAssetNameError, 'invalid characters');
    });

    it('should reject names with invalid characters', () => {
      expect(() => AssetNameValidator.validateRoot('MY-TOKEN'))
        .to.throw(InvalidAssetNameError, 'invalid characters');

      expect(() => AssetNameValidator.validateRoot('MY TOKEN'))
        .to.throw(InvalidAssetNameError, 'invalid characters');

      expect(() => AssetNameValidator.validateRoot('MY@TOKEN'))
        .to.throw(InvalidAssetNameError, 'invalid characters');
    });

    it('should reject reserved names', () => {
      expect(() => AssetNameValidator.validateRoot('XNA'))
        .to.throw(InvalidAssetNameError, 'reserved asset name');
    });

    it('should reject non-string inputs', () => {
      expect(() => AssetNameValidator.validateRoot(null))
        .to.throw(InvalidAssetNameError, 'must be a non-empty string');

      expect(() => AssetNameValidator.validateRoot(123))
        .to.throw(InvalidAssetNameError, 'must be a non-empty string');

      expect(() => AssetNameValidator.validateRoot(''))
        .to.throw(InvalidAssetNameError, 'must be a non-empty string');
    });
  });

  describe('validateSub', () => {
    it('should validate correct SUB asset names', () => {
      expect(AssetNameValidator.validateSub('MYTOKEN/SUB')).to.be.true;
      expect(AssetNameValidator.validateSub('TEST/ALPHA')).to.be.true;
      expect(AssetNameValidator.validateSub('TOKEN/SUB_1')).to.be.true;
    });

    it('should reject names without separator', () => {
      expect(() => AssetNameValidator.validateSub('MYTOKEN'))
        .to.throw(InvalidAssetNameError, 'must be in');
    });

    it('should validate chained sub-assets when all segments are valid', () => {
      expect(AssetNameValidator.validateSub('TOKEN/ALPHA/BETA')).to.be.true;
    });

    it('should reject invalid root parts', () => {
      expect(() => AssetNameValidator.validateSub('AB/SUB'))
        .to.throw(InvalidAssetNameError);
    });

    it('should reject invalid sub parts', () => {
      expect(() => AssetNameValidator.validateSub('MYTOKEN/ab'))
        .to.throw(InvalidAssetNameError, 'must be uppercase');
    });
  });

  describe('validateUnique', () => {
    it('should validate correct UNIQUE asset names', () => {
      expect(AssetNameValidator.validateUnique('MYTOKEN#NFT1')).to.be.true;
      expect(AssetNameValidator.validateUnique('TEST#ALPHA')).to.be.true;
      expect(AssetNameValidator.validateUnique('TOKEN#123')).to.be.true;
      expect(AssetNameValidator.validateUnique('TOKEN#nft-1')).to.be.true;
      expect(AssetNameValidator.validateUnique('TOKEN#Tag:@1')).to.be.true;
    });

    it('should reject names without # separator', () => {
      expect(() => AssetNameValidator.validateUnique('MYTOKEN'))
        .to.throw(InvalidAssetNameError, 'must be in ROOT#TAG format');
    });

    it('should reject names with multiple # separators', () => {
      expect(() => AssetNameValidator.validateUnique('MY#TOKEN#TAG'))
        .to.throw(InvalidAssetNameError);
    });

    it('should reject invalid root parts', () => {
      expect(() => AssetNameValidator.validateUnique('AB#TAG'))
        .to.throw(InvalidAssetNameError);
    });

    it('should reject invalid tag parts', () => {
      expect(() => AssetNameValidator.validateUnique('MYTOKEN#BAD/TAG'))
        .to.throw(InvalidAssetNameError, 'Unique name contains invalid characters');
    });
  });

  describe('validateQualifier', () => {
    it('should validate correct QUALIFIER names', () => {
      expect(AssetNameValidator.validateQualifier('#KYC')).to.be.true;
      expect(AssetNameValidator.validateQualifier('#ACCREDITED')).to.be.true;
      expect(AssetNameValidator.validateQualifier('#TEST_1')).to.be.true;
      expect(AssetNameValidator.validateQualifier('#KYC.TEST')).to.be.true;
    });

    it('should validate correct SUB_QUALIFIER names', () => {
      expect(AssetNameValidator.validateQualifier('#KYC/#TIER1')).to.be.true;
      expect(AssetNameValidator.validateQualifier('#TEST/#ALPHA')).to.be.true;
    });

    it('should reject names without # prefix', () => {
      expect(() => AssetNameValidator.validateQualifier('KYC'))
        .to.throw(InvalidAssetNameError, 'must start with #');
    });

    it('should reject lowercase qualifier names', () => {
      expect(() => AssetNameValidator.validateQualifier('#kyc'))
        .to.throw(InvalidAssetNameError, 'must be uppercase');
    });

    it('should reject sub-qualifiers that do not use the canonical syntax', () => {
      expect(() => AssetNameValidator.validateQualifier('#KYC/TIER1'))
        .to.throw(InvalidAssetNameError, 'Qualifier name contains invalid characters');
    });
  });

  describe('validateRestricted', () => {
    it('should validate correct RESTRICTED asset names', () => {
      expect(AssetNameValidator.validateRestricted('$SECURITY')).to.be.true;
      expect(AssetNameValidator.validateRestricted('$TOKEN')).to.be.true;
      expect(AssetNameValidator.validateRestricted('$MY_TOKEN')).to.be.true;
      expect(AssetNameValidator.validateRestricted('$XNA')).to.be.true;
    });

    it('should reject names without $ prefix', () => {
      expect(() => AssetNameValidator.validateRestricted('SECURITY'))
        .to.throw(InvalidAssetNameError, 'must start with $');
    });

    it('should reject invalid base names', () => {
      expect(() => AssetNameValidator.validateRestricted('$ab'))
        .to.throw(InvalidAssetNameError);
    });
  });

  describe('validateDepin', () => {
    it('should validate correct DEPIN asset names', () => {
      expect(AssetNameValidator.validateDepin('&FRANCE')).to.be.true;
      expect(AssetNameValidator.validateDepin('&FRANCE/PARIS')).to.be.true;
      expect(AssetNameValidator.validateDepin('&NODE_1')).to.be.true;
    });

    it('should enforce testnet-only DEPIN issuance when network is provided', () => {
      expect(() => AssetNameValidator.validateDepin('&FRANCE', 'xna'))
        .to.throw(InvalidAssetNameError, 'only available in testnet');

      expect(AssetNameValidator.validateDepin('&FRANCE', 'xna-test')).to.be.true;
    });

    it('should reject names without & prefix', () => {
      expect(() => AssetNameValidator.validateDepin('FRANCE'))
        .to.throw(InvalidAssetNameError, 'must start with &');
    });

    it('should reject lowercase depin names', () => {
      expect(() => AssetNameValidator.validateDepin('&france'))
        .to.throw(InvalidAssetNameError, 'must be uppercase');
    });

    it('should reject depin sub-parts shorter than 3 characters', () => {
      expect(() => AssetNameValidator.validateDepin('&FRANCE/AB'))
        .to.throw(InvalidAssetNameError, 'Each DEPIN sub-part must be at least 3 characters');
    });
  });

  describe('validateOwnerToken', () => {
    it('should validate correct owner token names', () => {
      expect(AssetNameValidator.validateOwnerToken('MYTOKEN!')).to.be.true;
      expect(AssetNameValidator.validateOwnerToken('SECURITY!')).to.be.true;
      expect(AssetNameValidator.validateOwnerToken('&FRANCE!')).to.be.true;
    });

    it('should reject names without ! suffix', () => {
      expect(() => AssetNameValidator.validateOwnerToken('MYTOKEN'))
        .to.throw(InvalidAssetNameError, 'must end with !');
    });

    it('should reject invalid base names', () => {
      expect(() => AssetNameValidator.validateOwnerToken('ab!'))
        .to.throw(InvalidAssetNameError);

      expect(() => AssetNameValidator.validateOwnerToken('$SECURITY!'))
        .to.throw(InvalidAssetNameError);
    });
  });

  describe('validateAndDetectType', () => {
    it('should detect and validate ROOT assets', () => {
      const type = AssetNameValidator.validateAndDetectType('MYTOKEN');
      expect(type).to.equal('ROOT');
    });

    it('should detect and validate SUB assets', () => {
      const type = AssetNameValidator.validateAndDetectType('MYTOKEN/SUB');
      expect(type).to.equal('SUB');
    });

    it('should detect and validate UNIQUE assets', () => {
      const type = AssetNameValidator.validateAndDetectType('MYTOKEN#NFT1');
      expect(type).to.equal('UNIQUE');
    });

    it('should detect and validate QUALIFIER assets', () => {
      const type = AssetNameValidator.validateAndDetectType('#KYC');
      expect(type).to.equal('QUALIFIER');
    });

    it('should detect and validate SUB_QUALIFIER assets', () => {
      const type = AssetNameValidator.validateAndDetectType('#KYC/#TIER1');
      expect(type).to.equal('SUB_QUALIFIER');
    });

    it('should detect and validate RESTRICTED assets', () => {
      const type = AssetNameValidator.validateAndDetectType('$SECURITY');
      expect(type).to.equal('RESTRICTED');
    });

    it('should detect and validate DEPIN assets', () => {
      const type = AssetNameValidator.validateAndDetectType('&FRANCE/PARIS');
      expect(type).to.equal('DEPIN');
    });

    it('should detect and validate OWNER tokens', () => {
      const type = AssetNameValidator.validateAndDetectType('MYTOKEN!');
      expect(type).to.equal('OWNER');
    });
  });
});
