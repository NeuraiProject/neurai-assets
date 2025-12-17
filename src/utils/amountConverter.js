/**
 * Amount Converter
 * Converts between user amounts and satoshis (protocol internal format)
 */

class AmountConverter {
  /**
   * Convert user amount to satoshis
   * @param {number} amount - User-friendly amount (e.g., 1.5)
   * @param {number} units - Decimal places (0-8)
   * @returns {number} Amount in satoshis
   */
  static toSatoshis(amount, units) {
    if (typeof amount !== 'number' || isNaN(amount)) {
      throw new Error('Amount must be a valid number');
    }

    if (typeof units !== 'number' || isNaN(units) || units < 0 || units > 8) {
      throw new Error('Units must be a number between 0 and 8');
    }

    // Calculate multiplier
    const multiplier = Math.pow(10, units);

    // Convert to satoshis and round to avoid floating point issues
    const satoshis = Math.round(amount * multiplier);

    return satoshis;
  }

  /**
   * Convert satoshis to user amount
   * @param {number} satoshis - Amount in satoshis
   * @param {number} units - Decimal places (0-8)
   * @returns {number} User-friendly amount
   */
  static fromSatoshis(satoshis, units) {
    if (typeof satoshis !== 'number' || isNaN(satoshis)) {
      throw new Error('Satoshis must be a valid number');
    }

    if (typeof units !== 'number' || isNaN(units) || units < 0 || units > 8) {
      throw new Error('Units must be a number between 0 and 8');
    }

    // Calculate divisor
    const divisor = Math.pow(10, units);

    // Convert to user amount
    const amount = satoshis / divisor;

    return amount;
  }

  /**
   * Format amount with proper decimal places
   * @param {number} amount - Amount to format
   * @param {number} units - Decimal places
   * @returns {string} Formatted amount
   */
  static format(amount, units) {
    if (units === 0) {
      return amount.toString();
    }

    return amount.toFixed(units);
  }

  /**
   * Parse formatted amount string
   * @param {string} formattedAmount - Formatted amount string
   * @returns {number} Parsed amount
   */
  static parse(formattedAmount) {
    const num = parseFloat(formattedAmount);
    if (isNaN(num)) {
      throw new Error('Invalid number format');
    }
    return num;
  }

  /**
   * Get decimal places from amount
   * @param {number} amount - Amount to check
   * @returns {number} Number of decimal places
   */
  static getDecimalPlaces(amount) {
    const match = ('' + amount).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
    if (!match) return 0;
    return Math.max(
      0,
      (match[1] ? match[1].length : 0) - (match[2] ? +match[2] : 0)
    );
  }

  /**
   * Adjust amount to proper units
   * If amount has more decimals than units allow, round it
   * @param {number} amount - Amount to adjust
   * @param {number} units - Target decimal places
   * @returns {number} Adjusted amount
   */
  static adjustToUnits(amount, units) {
    const decimalPlaces = this.getDecimalPlaces(amount);
    if (decimalPlaces <= units) {
      return amount;
    }

    // Round to units decimal places
    const multiplier = Math.pow(10, units);
    return Math.round(amount * multiplier) / multiplier;
  }
}

module.exports = AmountConverter;
