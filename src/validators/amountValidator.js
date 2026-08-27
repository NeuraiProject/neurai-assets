/**
 * Amount Validator
 * Validates asset quantities and units
 */

const { ASSET_LIMITS } = require('../constants');
const { InvalidAmountError, InvalidUnitsError } = require('../errors');
const { normalizeDecimalText } = require('../utils/assetAmount');

class AmountValidator {
  /**
   * Validate asset quantity.
   *
   * Accepts a decimal **string** as well as a number. That is not a
   * convenience: above `MAX_SAFE_INTEGER / 1e8` (~90071992.55) a fractional
   * `number` can no longer name every 8-decimal value, so `assetAmountToRaw`
   * refuses it and asks for a string. Rejecting strings here would leave
   * legitimate supplies — `100000000.5`, far below MAX_QUANTITY —
   * unexpressible in either form.
   *
   * @param {number|string} quantity - Asset quantity
   * @param {number} units - Decimal places (0-8)
   */
  static validate(quantity, units = 0) {
    // Validate quantity is a number or a plain decimal string
    if (typeof quantity === 'string') {
      // Throws with an actionable message for anything that is not a plain
      // decimal (exponent notation, empty, non-numeric).
      normalizeDecimalText(quantity, 'Quantity');
    } else if (typeof quantity !== 'number' || isNaN(quantity)) {
      throw new InvalidAmountError(
        'Quantity must be a valid number or a decimal string',
        quantity
      );
    }

    // Small magnitudes convert exactly, so `Number` is fine for the lower
    // bounds. The UPPER bound is not: `Number('21000000000.00000001')` is
    // `21000000000`, which would slip past a numeric comparison — so that one
    // is done on the digits themselves (see exceedsMaxQuantity).
    const numeric = Number(quantity);

    // Validate quantity is positive
    if (numeric <= 0) {
      throw new InvalidAmountError('Quantity must be greater than 0', quantity);
    }

    // Validate quantity is within limits
    if (numeric < ASSET_LIMITS.MIN_QUANTITY) {
      throw new InvalidAmountError(
        `Quantity must be at least ${ASSET_LIMITS.MIN_QUANTITY}`,
        quantity
      );
    }

    if (this.exceedsMaxQuantity(quantity)) {
      throw new InvalidAmountError(
        `Quantity cannot exceed ${ASSET_LIMITS.MAX_QUANTITY}`,
        quantity
      );
    }

    // Validate units
    this.validateUnits(units);

    // Validate quantity doesn't have more decimals than units allow
    const decimalPlaces = this.getDecimalPlaces(quantity);
    if (decimalPlaces > units) {
      throw new InvalidAmountError(
        `Quantity has ${decimalPlaces} decimal places but units is ${units}`,
        quantity
      );
    }

    return true;
  }

  /**
   * Whether a quantity is above MAX_QUANTITY, compared on the digits.
   *
   * A numeric comparison is not enough at this magnitude: `MAX_QUANTITY` is
   * `21000000000`, and `Number('21000000000.00000001')` collapses to exactly
   * `21000000000`, so the excess disappears before the comparison happens.
   * `assetAmountToRaw` catches it afterwards against the consensus ceiling —
   * the flow does fail closed — but this validator would have reported the
   * value as valid, and the two must state the same contract.
   *
   * @param {number|string} quantity - Quantity as given by the caller
   * @returns {boolean} True when the value exceeds MAX_QUANTITY
   */
  static exceedsMaxQuantity(quantity) {
    const text = normalizeDecimalText(quantity, 'Quantity');
    const [intPart, fracPart = ''] = (text.startsWith('-') ? text.slice(1) : text).split('.');

    const maxWhole = BigInt(ASSET_LIMITS.MAX_QUANTITY);
    const whole = BigInt(intPart);

    if (whole > maxWhole) {
      return true;
    }
    // Exactly at the ceiling: any non-zero fraction puts it over.
    return whole === maxWhole && /[1-9]/.test(fracPart);
  }

  /**
   * Validate units (decimal places)
   * @param {number} units - Decimal places (0-8)
   */
  static validateUnits(units) {
    if (typeof units !== 'number' || isNaN(units)) {
      throw new InvalidUnitsError('Units must be a valid number', units);
    }

    if (!Number.isInteger(units)) {
      throw new InvalidUnitsError('Units must be an integer', units);
    }

    if (units < ASSET_LIMITS.MIN_UNITS || units > ASSET_LIMITS.MAX_UNITS) {
      throw new InvalidUnitsError(
        `Units must be between ${ASSET_LIMITS.MIN_UNITS} and ${ASSET_LIMITS.MAX_UNITS}`,
        units
      );
    }

    return true;
  }

  /**
   * Validate qualifier quantity (1-10 only)
   * @param {number} quantity - Qualifier quantity
   */
  static validateQualifierQuantity(quantity) {
    if (typeof quantity !== 'number' || isNaN(quantity)) {
      throw new InvalidAmountError('Qualifier quantity must be a valid number', quantity);
    }

    if (!Number.isInteger(quantity)) {
      throw new InvalidAmountError('Qualifier quantity must be an integer', quantity);
    }

    if (quantity < ASSET_LIMITS.QUALIFIER_MIN_QUANTITY || quantity > ASSET_LIMITS.QUALIFIER_MAX_QUANTITY) {
      throw new InvalidAmountError(
        `Qualifier quantity must be between ${ASSET_LIMITS.QUALIFIER_MIN_QUANTITY} and ${ASSET_LIMITS.QUALIFIER_MAX_QUANTITY}`,
        quantity
      );
    }

    return true;
  }

  /**
   * Validate owner token quantity (always 1)
   * @param {number} quantity - Owner token quantity
   */
  static validateOwnerTokenQuantity(quantity) {
    if (quantity !== ASSET_LIMITS.OWNER_TOKEN_QUANTITY) {
      throw new InvalidAmountError(
        `Owner token quantity must be exactly ${ASSET_LIMITS.OWNER_TOKEN_QUANTITY}`,
        quantity
      );
    }

    return true;
  }

  /**
   * Get number of decimal places in a number
   * @param {number} num - Number to check
   * @returns {number} Number of decimal places
   */
  static getDecimalPlaces(num) {
    const match = ('' + num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
    if (!match) return 0;
    return Math.max(
      0,
      (match[1] ? match[1].length : 0) - (match[2] ? +match[2] : 0)
    );
  }

  /**
   * Validate that sum of amounts doesn't exceed max
   * @param {number} current - Current amount
   * @param {number} additional - Additional amount
   * @returns {boolean} True if sum is valid
   */
  static validateSum(current, additional) {
    if (current + additional > ASSET_LIMITS.MAX_QUANTITY) {
      throw new InvalidAmountError(
        `Sum of current (${current}) and additional (${additional}) exceeds maximum ${ASSET_LIMITS.MAX_QUANTITY}`,
        current + additional
      );
    }

    return true;
  }
}

module.exports = AmountValidator;
