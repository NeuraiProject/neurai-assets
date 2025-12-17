/**
 * Verifier String Validator
 * Validates verifier strings for restricted assets
 */

const { InvalidVerifierStringError } = require('../errors');
const AssetNameValidator = require('./assetNameValidator');

class VerifierValidator {
  /**
   * Validate verifier string syntax
   * Verifier syntax: #TAG, !#TAG, &, |, (, )
   * Examples:
   *   "#KYC"
   *   "#KYC & #ACCREDITED"
   *   "#KYC | #INSTITUTION"
   *   "(#KYC & #ACCREDITED) | #INSTITUTION"
   *   "!#BANNED"
   *
   * @param {string} verifierString - Verifier string to validate
   * @returns {boolean} True if valid
   */
  static validate(verifierString) {
    if (!verifierString || typeof verifierString !== 'string') {
      throw new InvalidVerifierStringError(
        'Verifier string must be a non-empty string',
        verifierString
      );
    }

    // Trim whitespace
    const trimmed = verifierString.trim();
    if (trimmed.length === 0) {
      throw new InvalidVerifierStringError(
        'Verifier string cannot be empty',
        verifierString
      );
    }

    // Check for valid characters only
    // Valid: #, A-Z, 0-9, _, &, |, !, (, ), space, /
    const validPattern = /^[#A-Z0-9_&|()\s!/]+$/;
    if (!validPattern.test(trimmed)) {
      throw new InvalidVerifierStringError(
        'Verifier contains invalid characters. Valid: #, A-Z, 0-9, _, &, |, !, (, ), space, /',
        verifierString
      );
    }

    // Extract all qualifiers (tokens starting with # or !#)
    const qualifierMatches = trimmed.match(/!?#[A-Z0-9_/]+/g) || [];

    if (qualifierMatches.length === 0) {
      throw new InvalidVerifierStringError(
        'Verifier must contain at least one qualifier (#TAG)',
        verifierString
      );
    }

    // Validate each qualifier
    for (const match of qualifierMatches) {
      const qualifier = match.startsWith('!') ? match.substring(1) : match;

      try {
        AssetNameValidator.validateQualifier(qualifier);
      } catch (e) {
        throw new InvalidVerifierStringError(
          `Invalid qualifier in verifier: ${qualifier} - ${e.message}`,
          verifierString
        );
      }
    }

    // Check balanced parentheses
    let depth = 0;
    for (const char of trimmed) {
      if (char === '(') depth++;
      if (char === ')') depth--;
      if (depth < 0) {
        throw new InvalidVerifierStringError(
          'Unbalanced parentheses in verifier string',
          verifierString
        );
      }
    }
    if (depth !== 0) {
      throw new InvalidVerifierStringError(
        'Unbalanced parentheses in verifier string',
        verifierString
      );
    }

    // Check for valid operators placement
    // & and | must be between qualifiers, not at start/end
    const operatorPattern = /(&|\|)/g;
    const operators = trimmed.match(operatorPattern);
    if (operators) {
      // Check operators are not at start or end
      if (trimmed.trim().match(/^(&|\|)/) || trimmed.trim().match(/(&|\|)$/)) {
        throw new InvalidVerifierStringError(
          'Operators & or | cannot be at start or end of verifier',
          verifierString
        );
      }

      // Check no consecutive operators
      if (trimmed.match(/(&|\|)\s*(&|\|)/)) {
        throw new InvalidVerifierStringError(
          'Consecutive operators are not allowed',
          verifierString
        );
      }
    }

    return true;
  }

  /**
   * Extract all qualifiers from verifier string
   * @param {string} verifierString - Verifier string
   * @returns {string[]} Array of qualifier names (including #)
   */
  static extractQualifiers(verifierString) {
    this.validate(verifierString);

    const qualifierMatches = verifierString.match(/!?#[A-Z0-9_/]+/g) || [];

    // Remove ! prefix and deduplicate
    const qualifiers = [...new Set(qualifierMatches.map(q => q.replace('!', '')))];

    return qualifiers;
  }

  /**
   * Check if verifier string uses a specific qualifier
   * @param {string} verifierString - Verifier string
   * @param {string} qualifierName - Qualifier to check (with #)
   * @returns {boolean} True if qualifier is used
   */
  static usesQualifier(verifierString, qualifierName) {
    const qualifiers = this.extractQualifiers(verifierString);
    return qualifiers.includes(qualifierName);
  }
}

module.exports = VerifierValidator;
