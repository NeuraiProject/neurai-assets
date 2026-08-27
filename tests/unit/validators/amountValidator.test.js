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
      // Since 1.5.0 a plain decimal STRING is a valid quantity: above
      // MAX_SAFE_INTEGER / 1e8 it is the only way to state one exactly,
      // because assetAmountToRaw refuses the number form there. Anything that
      // is not a plain decimal is still rejected.
      expect(AmountValidator.validate('100', 0)).to.be.true;

      expect(() => AmountValidator.validate('one hundred', 0))
        .to.throw(InvalidAmountError, 'not a decimal number');

      expect(() => AmountValidator.validate(NaN, 0))
        .to.throw(InvalidAmountError, 'valid number or a decimal string');
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

describe('AmountValidator with decimal strings (1.5.0)', () => {
  const { expect } = require('chai');
  const AmountValidator = require('../../../src/validators/amountValidator');

  // Above MAX_SAFE_INTEGER / 1e8 (~90071992.55) assetAmountToRaw refuses a
  // fractional number and asks for a string. If the validator rejected strings
  // too, a legitimate supply such as 100000000.5 — far below MAX_QUANTITY —
  // would be unexpressible in either form.
  it('accepts a plain decimal string', () => {
    expect(AmountValidator.validate('1000', 0)).to.equal(true);
    expect(AmountValidator.validate('100000000.5', 1)).to.equal(true);
  });

  it('still applies the range limits to strings', () => {
    expect(() => AmountValidator.validate('21000000001', 0)).to.throw(/cannot exceed/);
    expect(() => AmountValidator.validate('0', 0)).to.throw(/greater than 0/);
  });

  it('still applies the units check to strings', () => {
    expect(() => AmountValidator.validate('1.25', 0)).to.throw(/decimal places/);
    expect(AmountValidator.validate('1.25', 2)).to.equal(true);
  });

  it('rejects text that is not a plain decimal', () => {
    expect(() => AmountValidator.validate('abc', 0)).to.throw(/not a decimal number/);
    expect(() => AmountValidator.validate('1e3', 0)).to.throw(/exponent notation/);
    expect(() => AmountValidator.validate('', 0)).to.throw(/empty string/);
  });

  it('keeps rejecting non-numeric, non-string types', () => {
    expect(() => AmountValidator.validate(null, 0)).to.throw(/valid number or a decimal string/);
    expect(() => AmountValidator.validate(Number.NaN, 0)).to.throw(/valid number or a decimal string/);
  });
});

describe('AmountValidator range check is exact, not numeric', () => {
  const { expect } = require('chai');
  const AmountValidator = require('../../../src/validators/amountValidator');
  const { assetAmountToRaw } = require('../../../src/utils/assetAmount');

  // Number('21000000000.00000001') collapses to exactly 21000000000, so a
  // numeric comparison would report the value as valid. assetAmountToRaw
  // catches it afterwards against MAX_MONEY — the flow fails closed either
  // way — but the two must state the same contract, or the validator lies.
  it('sees the excess a numeric comparison would lose', () => {
    expect(Number('21000000000.00000001')).to.equal(21000000000);
    expect(() => AmountValidator.validate('21000000000.00000001', 8))
      .to.throw(/cannot exceed/);
  });

  it('accepts exactly MAX_QUANTITY', () => {
    expect(AmountValidator.validate('21000000000', 8)).to.be.true;
    expect(AmountValidator.validate(21000000000, 8)).to.be.true;
  });

  const AGREEMENT_CASES = [
    ['21000000000', 8, true],
    ['21000000000.00000001', 8, false],
    ['21000000001', 8, false],
    ['100000000.5', 1, true],
    ['1', 0, true]
  ];

  AGREEMENT_CASES.forEach(([quantity, units, valid]) => {
    it(`validator and converter agree on "${quantity}" (${valid ? 'valid' : 'invalid'})`, () => {
      const accepts = fn => { try { fn(); return true; } catch { return false; } };
      const byValidator = accepts(() => AmountValidator.validate(quantity, units));
      const byConverter = accepts(() => assetAmountToRaw(quantity, units));
      expect(byValidator).to.equal(valid);
      expect(byConverter).to.equal(valid);
    });
  });
});
