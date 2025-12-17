/**
 * Asset Name Validator
 * Validates asset names according to Neurai protocol rules
 */

const { ASSET_NAME_RULES } = require('../constants');
const { InvalidAssetNameError } = require('../errors');

class AssetNameValidator {
  /**
   * Validate ROOT asset name
   * Rules: 3-30 uppercase characters, A-Z, 0-9, underscore, period
   * Cannot start with period, A, or Z
   * Cannot be reserved names
   */
  static validateRoot(name) {
    if (!name || typeof name !== 'string') {
      throw new InvalidAssetNameError('Asset name must be a non-empty string', name);
    }

    // Length check
    if (name.length < ASSET_NAME_RULES.ROOT.minLength || name.length > ASSET_NAME_RULES.ROOT.maxLength) {
      throw new InvalidAssetNameError(
        `ROOT asset name must be ${ASSET_NAME_RULES.ROOT.minLength}-${ASSET_NAME_RULES.ROOT.maxLength} characters`,
        name
      );
    }

    // Uppercase check
    if (name !== name.toUpperCase()) {
      throw new InvalidAssetNameError('Asset name must be uppercase', name);
    }

    // Starting character check
    if (ASSET_NAME_RULES.ROOT.cannotStartWith.some(char => name.startsWith(char))) {
      throw new InvalidAssetNameError(
        `Asset name cannot start with: ${ASSET_NAME_RULES.ROOT.cannotStartWith.join(', ')}`,
        name
      );
    }

    // Pattern check
    if (!ASSET_NAME_RULES.ROOT.pattern.test(name)) {
      throw new InvalidAssetNameError(
        'Asset name can only contain A-Z, 0-9, underscore, and period',
        name
      );
    }

    // Reserved names check
    if (ASSET_NAME_RULES.ROOT.reserved.includes(name)) {
      throw new InvalidAssetNameError(`${name} is a reserved asset name`, name);
    }

    return true;
  }

  /**
   * Validate SUB asset name
   * Format: ROOT/SUBNAME
   */
  static validateSub(name) {
    if (!name || typeof name !== 'string') {
      throw new InvalidAssetNameError('SUB asset name must be a non-empty string', name);
    }

    const parts = name.split(ASSET_NAME_RULES.SUB.separator);
    if (parts.length !== 2) {
      throw new InvalidAssetNameError(
        `SUB asset must be in ${ASSET_NAME_RULES.SUB.separator} format (ROOT/SUBNAME)`,
        name
      );
    }

    const [rootName, subName] = parts;

    // Validate root part
    this.validateRoot(rootName);

    // Validate sub part
    if (subName.length < ASSET_NAME_RULES.SUB.minLength || subName.length > ASSET_NAME_RULES.SUB.maxLength) {
      throw new InvalidAssetNameError(
        `SUB asset name must be ${ASSET_NAME_RULES.SUB.minLength}-${ASSET_NAME_RULES.SUB.maxLength} characters`,
        name
      );
    }

    if (subName !== subName.toUpperCase()) {
      throw new InvalidAssetNameError('SUB asset name must be uppercase', name);
    }

    if (!ASSET_NAME_RULES.SUB.pattern.test(subName)) {
      throw new InvalidAssetNameError(
        'SUB asset name can only contain A-Z, 0-9, underscore, and period',
        name
      );
    }

    return true;
  }

  /**
   * Validate UNIQUE asset name
   * Format: ROOT#TAG
   */
  static validateUnique(name) {
    if (!name || typeof name !== 'string') {
      throw new InvalidAssetNameError('UNIQUE asset name must be a non-empty string', name);
    }

    const parts = name.split(ASSET_NAME_RULES.UNIQUE.separator);
    if (parts.length !== 2) {
      throw new InvalidAssetNameError(
        `UNIQUE asset must be in ROOT${ASSET_NAME_RULES.UNIQUE.separator}TAG format`,
        name
      );
    }

    const [rootName, tag] = parts;

    // Validate root part
    this.validateRoot(rootName);

    // Validate tag
    if (tag.length < ASSET_NAME_RULES.UNIQUE.minLength || tag.length > ASSET_NAME_RULES.UNIQUE.maxLength) {
      throw new InvalidAssetNameError(
        `UNIQUE tag must be ${ASSET_NAME_RULES.UNIQUE.minLength}-${ASSET_NAME_RULES.UNIQUE.maxLength} characters`,
        name
      );
    }

    if (tag !== tag.toUpperCase()) {
      throw new InvalidAssetNameError('UNIQUE tag must be uppercase', name);
    }

    if (!ASSET_NAME_RULES.UNIQUE.pattern.test(tag)) {
      throw new InvalidAssetNameError(
        'UNIQUE tag can only contain A-Z, 0-9, underscore, and period',
        name
      );
    }

    return true;
  }

  /**
   * Validate QUALIFIER asset name
   * Format: #NAME or #ROOT/SUB
   */
  static validateQualifier(name) {
    if (!name || typeof name !== 'string') {
      throw new InvalidAssetNameError('QUALIFIER asset name must be a non-empty string', name);
    }

    if (!name.startsWith(ASSET_NAME_RULES.QUALIFIER.prefix)) {
      throw new InvalidAssetNameError(
        `QUALIFIER asset must start with ${ASSET_NAME_RULES.QUALIFIER.prefix}`,
        name
      );
    }

    const withoutPrefix = name.substring(1);

    if (withoutPrefix.includes(ASSET_NAME_RULES.QUALIFIER.separator)) {
      // Sub-qualifier: #ROOT/SUB
      const parts = withoutPrefix.split(ASSET_NAME_RULES.QUALIFIER.separator);
      if (parts.length !== 2) {
        throw new InvalidAssetNameError(
          'SUB_QUALIFIER must be in #ROOT/SUB format',
          name
        );
      }

      // Validate each part as a qualifier name (without the #)
      parts.forEach(part => {
        if (part.length < ASSET_NAME_RULES.QUALIFIER.minLength || part.length > ASSET_NAME_RULES.QUALIFIER.maxLength) {
          throw new InvalidAssetNameError(
            `QUALIFIER name must be ${ASSET_NAME_RULES.QUALIFIER.minLength}-${ASSET_NAME_RULES.QUALIFIER.maxLength} characters`,
            name
          );
        }

        if (part !== part.toUpperCase()) {
          throw new InvalidAssetNameError('QUALIFIER name must be uppercase', name);
        }

        if (!ASSET_NAME_RULES.QUALIFIER.pattern.test(part)) {
          throw new InvalidAssetNameError(
            'QUALIFIER name can only contain A-Z, 0-9, and underscore',
            name
          );
        }
      });
    } else {
      // Root qualifier: #NAME
      if (withoutPrefix.length < ASSET_NAME_RULES.QUALIFIER.minLength ||
          withoutPrefix.length > ASSET_NAME_RULES.QUALIFIER.maxLength) {
        throw new InvalidAssetNameError(
          `QUALIFIER name must be ${ASSET_NAME_RULES.QUALIFIER.minLength}-${ASSET_NAME_RULES.QUALIFIER.maxLength} characters`,
          name
        );
      }

      if (withoutPrefix !== withoutPrefix.toUpperCase()) {
        throw new InvalidAssetNameError('QUALIFIER name must be uppercase', name);
      }

      if (!ASSET_NAME_RULES.QUALIFIER.pattern.test(withoutPrefix)) {
        throw new InvalidAssetNameError(
          'QUALIFIER name can only contain A-Z, 0-9, and underscore',
          name
        );
      }
    }

    return true;
  }

  /**
   * Validate RESTRICTED asset name
   * Format: $NAME
   */
  static validateRestricted(name) {
    if (!name || typeof name !== 'string') {
      throw new InvalidAssetNameError('RESTRICTED asset name must be a non-empty string', name);
    }

    if (!name.startsWith(ASSET_NAME_RULES.RESTRICTED.prefix)) {
      throw new InvalidAssetNameError(
        `RESTRICTED asset must start with ${ASSET_NAME_RULES.RESTRICTED.prefix}`,
        name
      );
    }

    const withoutPrefix = name.substring(1);

    // Validate the part after $ as a ROOT asset name
    this.validateRoot(withoutPrefix);

    return true;
  }

  /**
   * Validate owner token name
   * Format: ASSETNAME!
   */
  static validateOwnerToken(name) {
    if (!name || typeof name !== 'string') {
      throw new InvalidAssetNameError('Owner token name must be a non-empty string', name);
    }

    if (!name.endsWith('!')) {
      throw new InvalidAssetNameError('Owner token must end with !', name);
    }

    const assetName = name.substring(0, name.length - 1);

    // Validate the asset name part (could be ROOT or RESTRICTED)
    if (assetName.startsWith('$')) {
      this.validateRestricted(assetName);
    } else {
      this.validateRoot(assetName);
    }

    return true;
  }

  /**
   * Auto-detect asset type and validate
   * @param {string} name - Asset name
   * @returns {string} Asset type ('ROOT', 'SUB', 'UNIQUE', 'QUALIFIER', 'RESTRICTED', 'OWNER')
   */
  static validateAndDetectType(name) {
    if (name.endsWith('!')) {
      this.validateOwnerToken(name);
      return 'OWNER';
    } else if (name.startsWith('#')) {
      this.validateQualifier(name);
      return name.includes('/') ? 'SUB_QUALIFIER' : 'QUALIFIER';
    } else if (name.startsWith('$')) {
      this.validateRestricted(name);
      return 'RESTRICTED';
    } else if (name.includes('#')) {
      this.validateUnique(name);
      return 'UNIQUE';
    } else if (name.includes('/')) {
      this.validateSub(name);
      return 'SUB';
    } else {
      this.validateRoot(name);
      return 'ROOT';
    }
  }
}

module.exports = AssetNameValidator;
