/**
 * Tests for AmountConverter
 */

const { expect } = require('chai');
const AmountConverter = require('../../../src/utils/amountConverter');

describe('AmountConverter', () => {
  describe('toSatoshis', () => {
    it('should convert whole numbers with 0 units', () => {
      expect(AmountConverter.toSatoshis(100, 0)).to.equal(100);
      expect(AmountConverter.toSatoshis(1000, 0)).to.equal(1000);
    });

    it('should convert decimal amounts with various units', () => {
      expect(AmountConverter.toSatoshis(1.5, 1)).to.equal(15);
      expect(AmountConverter.toSatoshis(1.5, 2)).to.equal(150);
      expect(AmountConverter.toSatoshis(1.00000001, 8)).to.equal(100000001);
    });

    it('should handle very small amounts', () => {
      expect(AmountConverter.toSatoshis(0.00000001, 8)).to.equal(1);
      expect(AmountConverter.toSatoshis(0.0001, 4)).to.equal(1);
    });

    it('should handle large amounts', () => {
      expect(AmountConverter.toSatoshis(1000000, 0)).to.equal(1000000);
      expect(AmountConverter.toSatoshis(1000000, 8)).to.equal(100000000000000);
    });

    it('should round to avoid floating point issues', () => {
      expect(AmountConverter.toSatoshis(0.1 + 0.2, 1)).to.equal(3);
    });

    it('should throw error for invalid amounts', () => {
      expect(() => AmountConverter.toSatoshis('100', 0))
        .to.throw('Amount must be a valid number');

      expect(() => AmountConverter.toSatoshis(NaN, 0))
        .to.throw('Amount must be a valid number');
    });

    it('should throw error for invalid units', () => {
      expect(() => AmountConverter.toSatoshis(100, -1))
        .to.throw('Units must be a number between 0 and 8');

      expect(() => AmountConverter.toSatoshis(100, 9))
        .to.throw('Units must be a number between 0 and 8');

      expect(() => AmountConverter.toSatoshis(100, 'two'))
        .to.throw('Units must be a number between 0 and 8');
    });
  });

  describe('fromSatoshis', () => {
    it('should convert satoshis to whole numbers with 0 units', () => {
      expect(AmountConverter.fromSatoshis(100, 0)).to.equal(100);
      expect(AmountConverter.fromSatoshis(1000, 0)).to.equal(1000);
    });

    it('should convert satoshis to decimal amounts with various units', () => {
      expect(AmountConverter.fromSatoshis(15, 1)).to.equal(1.5);
      expect(AmountConverter.fromSatoshis(150, 2)).to.equal(1.5);
      expect(AmountConverter.fromSatoshis(100000001, 8)).to.equal(1.00000001);
    });

    it('should handle very small satoshi amounts', () => {
      expect(AmountConverter.fromSatoshis(1, 8)).to.equal(0.00000001);
      expect(AmountConverter.fromSatoshis(1, 4)).to.equal(0.0001);
    });

    it('should throw error for invalid satoshis', () => {
      expect(() => AmountConverter.fromSatoshis('100', 0))
        .to.throw('Satoshis must be a valid number');

      expect(() => AmountConverter.fromSatoshis(NaN, 0))
        .to.throw('Satoshis must be a valid number');
    });

    it('should throw error for invalid units', () => {
      expect(() => AmountConverter.fromSatoshis(100, -1))
        .to.throw('Units must be a number between 0 and 8');

      expect(() => AmountConverter.fromSatoshis(100, 9))
        .to.throw('Units must be a number between 0 and 8');
    });
  });

  describe('format', () => {
    it('should format amounts with 0 units as integers', () => {
      expect(AmountConverter.format(100, 0)).to.equal('100');
      expect(AmountConverter.format(1000, 0)).to.equal('1000');
    });

    it('should format amounts with decimal places', () => {
      expect(AmountConverter.format(1.5, 1)).to.equal('1.5');
      expect(AmountConverter.format(1.5, 2)).to.equal('1.50');
      expect(AmountConverter.format(1.00000001, 8)).to.equal('1.00000001');
    });

    it('should pad with zeros to match units', () => {
      expect(AmountConverter.format(1, 2)).to.equal('1.00');
      expect(AmountConverter.format(1, 8)).to.equal('1.00000000');
    });
  });

  describe('parse', () => {
    it('should parse formatted amounts', () => {
      expect(AmountConverter.parse('100')).to.equal(100);
      expect(AmountConverter.parse('1.5')).to.equal(1.5);
      expect(AmountConverter.parse('0.00000001')).to.equal(0.00000001);
    });

    it('should throw error for invalid formats', () => {
      expect(() => AmountConverter.parse('abc'))
        .to.throw('Invalid number format');

      expect(() => AmountConverter.parse(''))
        .to.throw('Invalid number format');
    });
  });

  describe('getDecimalPlaces', () => {
    it('should count decimal places correctly', () => {
      expect(AmountConverter.getDecimalPlaces(100)).to.equal(0);
      expect(AmountConverter.getDecimalPlaces(1.5)).to.equal(1);
      expect(AmountConverter.getDecimalPlaces(1.25)).to.equal(2);
      expect(AmountConverter.getDecimalPlaces(0.00000001)).to.equal(8);
    });

    it('should handle scientific notation', () => {
      expect(AmountConverter.getDecimalPlaces(1e-8)).to.equal(8);
      expect(AmountConverter.getDecimalPlaces(1.5e2)).to.equal(0);
    });
  });

  describe('adjustToUnits', () => {
    it('should not modify amounts with fewer decimals than units', () => {
      expect(AmountConverter.adjustToUnits(1.5, 2)).to.equal(1.5);
      expect(AmountConverter.adjustToUnits(1, 8)).to.equal(1);
    });

    it('should round amounts with more decimals than units', () => {
      expect(AmountConverter.adjustToUnits(1.123, 2)).to.equal(1.12);
      expect(AmountConverter.adjustToUnits(1.567, 2)).to.equal(1.57);
    });

    it('should handle edge cases', () => {
      expect(AmountConverter.adjustToUnits(1.999, 2)).to.equal(2);
      expect(AmountConverter.adjustToUnits(0.001, 2)).to.equal(0);
    });
  });

  describe('round-trip conversion', () => {
    it('should convert back and forth without loss', () => {
      const amount = 1.5;
      const units = 2;
      const satoshis = AmountConverter.toSatoshis(amount, units);
      const back = AmountConverter.fromSatoshis(satoshis, units);
      expect(back).to.equal(amount);
    });

    it('should handle maximum precision', () => {
      const amount = 1.00000001;
      const units = 8;
      const satoshis = AmountConverter.toSatoshis(amount, units);
      const back = AmountConverter.fromSatoshis(satoshis, units);
      expect(back).to.equal(amount);
    });
  });
});
