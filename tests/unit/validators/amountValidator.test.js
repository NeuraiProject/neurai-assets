/**
 * Tests for AmountValidator
 */

const { expect } = require('chai');
const AmountValidator = require('../../../src/validators/amountValidator');
const { InvalidAmountError, InvalidUnitsError } = require('../../../src/errors');

describe('AmountValidator', () => {
  describe('validate', () => {
    it('should validate correct amounts', () => {
      expect(AmountValidator.validate(100, 0)).to.be.true;
      expect(AmountValidator.validate(1.5, 2)).to.be.true;
      expect(AmountValidator.validate(1000000, 8)).to.be.true;
      expect(AmountValidator.validate(1, 0)).to.be.true;
      expect(AmountValidator.validate(1.00000001, 8)).to.be.true;
    });

    it('should reject non-numeric amounts', () => {
      expect(() => AmountValidator.validate('100', 0))
        .to.throw(InvalidAmountError, 'must be a valid number');

      expect(() => AmountValidator.validate(NaN, 0))
        .to.throw(InvalidAmountError, 'must be a valid number');
    });

    it('should reject zero or negative amounts', () => {
      expect(() => AmountValidator.validate(0, 0))
        .to.throw(InvalidAmountError, 'must be greater than 0');

      expect(() => AmountValidator.validate(-100, 0))
        .to.throw(InvalidAmountError, 'must be greater than 0');
    });

    it('should reject amounts that are too large', () => {
      expect(() => AmountValidator.validate(22000000000, 0))
        .to.throw(InvalidAmountError, 'cannot exceed');
    });

    it('should reject amounts with more decimals than units allow', () => {
      expect(() => AmountValidator.validate(1.123, 2))
        .to.throw(InvalidAmountError, 'decimal places but units is');
    });

    it('should reject invalid units', () => {
      expect(() => AmountValidator.validate(100, -1))
        .to.throw(InvalidUnitsError);

      expect(() => AmountValidator.validate(100, 9))
        .to.throw(InvalidUnitsError);

      expect(() => AmountValidator.validate(100, 1.5))
        .to.throw(InvalidUnitsError, 'must be an integer');
    });
  });

  describe('validateUnits', () => {
    it('should validate correct units', () => {
      expect(AmountValidator.validateUnits(0)).to.be.true;
      expect(AmountValidator.validateUnits(4)).to.be.true;
      expect(AmountValidator.validateUnits(8)).to.be.true;
    });

    it('should reject units outside range', () => {
      expect(() => AmountValidator.validateUnits(-1))
        .to.throw(InvalidUnitsError, 'must be between');

      expect(() => AmountValidator.validateUnits(9))
        .to.throw(InvalidUnitsError, 'must be between');
    });

    it('should reject non-integer units', () => {
      expect(() => AmountValidator.validateUnits(2.5))
        .to.throw(InvalidUnitsError, 'must be an integer');
    });

    it('should reject non-numeric units', () => {
      expect(() => AmountValidator.validateUnits('4'))
        .to.throw(InvalidUnitsError, 'must be a valid number');
    });
  });

  describe('validateQualifierQuantity', () => {
    it('should validate correct qualifier quantities', () => {
      expect(AmountValidator.validateQualifierQuantity(1)).to.be.true;
      expect(AmountValidator.validateQualifierQuantity(5)).to.be.true;
      expect(AmountValidator.validateQualifierQuantity(10)).to.be.true;
    });

    it('should reject quantities outside 1-10 range', () => {
      expect(() => AmountValidator.validateQualifierQuantity(0))
        .to.throw(InvalidAmountError, 'must be between');

      expect(() => AmountValidator.validateQualifierQuantity(11))
        .to.throw(InvalidAmountError, 'must be between');
    });

    it('should reject non-integer quantities', () => {
      expect(() => AmountValidator.validateQualifierQuantity(5.5))
        .to.throw(InvalidAmountError, 'must be an integer');
    });
  });

  describe('validateOwnerTokenQuantity', () => {
    it('should validate owner token quantity of 1', () => {
      expect(AmountValidator.validateOwnerTokenQuantity(1)).to.be.true;
    });

    it('should reject any quantity other than 1', () => {
      expect(() => AmountValidator.validateOwnerTokenQuantity(0))
        .to.throw(InvalidAmountError, 'must be exactly 1');

      expect(() => AmountValidator.validateOwnerTokenQuantity(2))
        .to.throw(InvalidAmountError, 'must be exactly 1');
    });
  });

  describe('getDecimalPlaces', () => {
    it('should correctly count decimal places', () => {
      expect(AmountValidator.getDecimalPlaces(100)).to.equal(0);
      expect(AmountValidator.getDecimalPlaces(1.5)).to.equal(1);
      expect(AmountValidator.getDecimalPlaces(1.25)).to.equal(2);
      expect(AmountValidator.getDecimalPlaces(0.00000001)).to.equal(8);
    });

    it('should handle scientific notation', () => {
      expect(AmountValidator.getDecimalPlaces(1e-8)).to.equal(8);
      expect(AmountValidator.getDecimalPlaces(1.5e2)).to.equal(0);
    });
  });

  describe('validateSum', () => {
    it('should validate sums within limits', () => {
      expect(AmountValidator.validateSum(1000, 2000)).to.be.true;
      expect(AmountValidator.validateSum(10000000000, 10000000000)).to.be.true;
    });

    it('should reject sums that exceed maximum', () => {
      expect(() => AmountValidator.validateSum(20000000000, 5000000000))
        .to.throw(InvalidAmountError, 'exceeds maximum');
    });
  });
});
