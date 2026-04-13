/**
 * Asset Name Validator
 * Validates asset names according to Neurai protocol rules
 */

const { ASSET_NAME_RULES } = require('../constants');
const { InvalidAssetNameError } = require('../errors');

const MIN_ASSET_LENGTH = 3;
const MAINNET_MAX_NAME_LENGTH = 32;
const TESTNET_MAX_NAME_LENGTH = 121;

const ROOT_NAME_CHARACTERS = /^[A-Z0-9._]{3,}$/;
const SUB_NAME_CHARACTERS = /^[A-Z0-9._]+$/;
const UNIQUE_TAG_CHARACTERS = /^[-A-Za-z0-9@$%&*()[\]{}_.?:]+$/;
const QUALIFIER_NAME_CHARACTERS = /^#[A-Z0-9._]{3,}$/;
const SUB_QUALIFIER_NAME_CHARACTERS = /^#[A-Z0-9._]+$/;
const RESTRICTED_NAME_CHARACTERS = /^\$[A-Z0-9._]{3,}$/;
const DEPIN_NAME_CHARACTERS = /^&[A-Z0-9._]{3,}$/;
const SUB_DEPIN_NAME_CHARACTERS = /^&[A-Z0-9._]+\/[A-Z0-9._/]+$/;
const DOUBLE_PUNCTUATION = /^.*[._]{2,}.*$/;
const LEADING_PUNCTUATION = /^[._].*$/;
const TRAILING_PUNCTUATION = /^.*[._]$/;
const QUALIFIER_LEADING_PUNCTUATION = /^[#$][._].*$/;
const NEURAI_NAMES = /^XNA$|^NEURAI$|^NEURAICOIN$|^#XNA$|^#NEURAI$|^#NEURAICOIN$/;

function isTestnet(network) {
  return typeof network === 'string' && network.toLowerCase().includes('test');
}

function getMaxAssetNameLength(network) {
  return isTestnet(network) ? TESTNET_MAX_NAME_LENGTH : MAINNET_MAX_NAME_LENGTH;
}

function getRootOrSubMaxLength(network) {
  return getMaxAssetNameLength(network) - 1;
}

function ensureName(name, label) {
  if (!name || typeof name !== 'string') {
    throw new InvalidAssetNameError(`${label} must be a non-empty string`, name);
  }
}

function ensureMaxLength(name, maxLength, label) {
  if (name.length > maxLength) {
    throw new InvalidAssetNameError(`${label} cannot exceed ${maxLength} characters`, name);
  }
}

function ensureUppercase(name, message) {
  if (name !== name.toUpperCase()) {
    throw new InvalidAssetNameError(message, name);
  }
}

function isRootNameValid(name) {
  return ROOT_NAME_CHARACTERS.test(name)
    && !DOUBLE_PUNCTUATION.test(name)
    && !LEADING_PUNCTUATION.test(name)
    && !TRAILING_PUNCTUATION.test(name)
    && !NEURAI_NAMES.test(name);
}

function isSubNameValid(name) {
  return SUB_NAME_CHARACTERS.test(name)
    && !DOUBLE_PUNCTUATION.test(name)
    && !LEADING_PUNCTUATION.test(name)
    && !TRAILING_PUNCTUATION.test(name);
}

function isQualifierNameValid(name) {
  return QUALIFIER_NAME_CHARACTERS.test(name)
    && !DOUBLE_PUNCTUATION.test(name)
    && !QUALIFIER_LEADING_PUNCTUATION.test(name)
    && !TRAILING_PUNCTUATION.test(name)
    && !NEURAI_NAMES.test(name);
}

function isSubQualifierNameValid(name) {
  return SUB_QUALIFIER_NAME_CHARACTERS.test(name)
    && !DOUBLE_PUNCTUATION.test(name)
    && !LEADING_PUNCTUATION.test(name)
    && !TRAILING_PUNCTUATION.test(name);
}

function isRestrictedNameValid(name) {
  return RESTRICTED_NAME_CHARACTERS.test(name)
    && !DOUBLE_PUNCTUATION.test(name)
    && !LEADING_PUNCTUATION.test(name)
    && !TRAILING_PUNCTUATION.test(name)
    && !NEURAI_NAMES.test(name);
}

function isNameValidBeforeTag(name) {
  const parts = name.split('/');

  if (!isRootNameValid(parts[0])) {
    return false;
  }

  for (let index = 1; index < parts.length; index += 1) {
    if (!isSubNameValid(parts[index])) {
      return false;
    }
  }

  return true;
}

function isQualifierNameValidBeforeTag(name) {
  const parts = name.split('/');

  if (!isQualifierNameValid(parts[0])) {
    return false;
  }

  if (parts.length > 2) {
    return false;
  }

  for (let index = 1; index < parts.length; index += 1) {
    if (!isSubQualifierNameValid(parts[index])) {
      return false;
    }
  }

  return true;
}

function isDepinIndicator(name) {
  return DEPIN_NAME_CHARACTERS.test(name) || SUB_DEPIN_NAME_CHARACTERS.test(name);
}

class AssetNameValidator {
  /**
   * Validate ROOT asset name
   * Rules: 3-31 visible characters on mainnet, A-Z, 0-9, underscore, period
   * Cannot start or end with period/underscore, cannot use repeated punctuation
   * Cannot be reserved names
   */
  static validateRoot(name, network = 'xna') {
    ensureName(name, 'Asset name');

    const maxLength = getRootOrSubMaxLength(network);

    if (name.length < MIN_ASSET_LENGTH || name.length > maxLength) {
      throw new InvalidAssetNameError(
        `ROOT asset name must be ${MIN_ASSET_LENGTH}-${maxLength} characters`,
        name
      );
    }

    ensureUppercase(name, 'Asset name must be uppercase');

    if (NEURAI_NAMES.test(name)) {
      throw new InvalidAssetNameError(`${name} is a reserved asset name`, name);
    }

    if (!isRootNameValid(name)) {
      throw new InvalidAssetNameError(
        'Name contains invalid characters (Valid characters are: A-Z 0-9 _ .) (special characters can\'t be the first or last characters)',
        name
      );
    }

    return true;
  }

  /**
   * Validate SUB asset name
   * Format: ROOT/SUBNAME
   */
  static validateSub(name, network = 'xna') {
    ensureName(name, 'SUB asset name');

    if (!name.includes(ASSET_NAME_RULES.SUB.separator)) {
      throw new InvalidAssetNameError(
        `SUB asset must be in ${ASSET_NAME_RULES.SUB.separator} format (ROOT/SUBNAME)`,
        name
      );
    }

    ensureMaxLength(name, getRootOrSubMaxLength(network), 'SUB asset name');

    if (name !== name.toUpperCase()) {
      throw new InvalidAssetNameError('SUB asset name must be uppercase', name);
    }

    if (!isNameValidBeforeTag(name)) {
      throw new InvalidAssetNameError(
        'Name contains invalid characters (Valid characters are: A-Z 0-9 _ .) (special characters can\'t be the first or last characters)',
        name
      );
    }

    return true;
  }

  /**
   * Validate UNIQUE asset name
   * Format: ROOT#TAG
   */
  static validateUnique(name, network = 'xna') {
    ensureName(name, 'UNIQUE asset name');

    ensureMaxLength(name, getMaxAssetNameLength(network), 'UNIQUE asset name');

    const parts = name.split(ASSET_NAME_RULES.UNIQUE.separator);
    if (parts.length !== 2) {
      throw new InvalidAssetNameError(
        `UNIQUE asset must be in ROOT${ASSET_NAME_RULES.UNIQUE.separator}TAG format`,
        name
      );
    }

    const [rootName, tag] = parts;

    if (!isNameValidBeforeTag(rootName) || !UNIQUE_TAG_CHARACTERS.test(tag)) {
      throw new InvalidAssetNameError(
        'Unique name contains invalid characters (Valid characters are: A-Z a-z 0-9 @ $ % & * ( ) [ ] { } _ . ? : -)',
        name
      );
    }

    return true;
  }

  /**
   * Validate QUALIFIER asset name
   * Format: #NAME or #ROOT/SUB
   */
  static validateQualifier(name, network = 'xna') {
    ensureName(name, 'QUALIFIER asset name');

    if (!name.startsWith(ASSET_NAME_RULES.QUALIFIER.prefix)) {
      throw new InvalidAssetNameError(
        `QUALIFIER asset must start with ${ASSET_NAME_RULES.QUALIFIER.prefix}`,
        name
      );
    }

    ensureMaxLength(name, getMaxAssetNameLength(network), 'QUALIFIER asset name');

    if (name !== name.toUpperCase()) {
      throw new InvalidAssetNameError('QUALIFIER name must be uppercase', name);
    }

    if (!isQualifierNameValidBeforeTag(name)) {
      throw new InvalidAssetNameError(
        'Qualifier name contains invalid characters (Valid characters are: A-Z 0-9 _ .) (# must be the first character, _ . special characters can\'t be the first or last characters)',
        name
      );
    }

    return true;
  }

  /**
   * Validate RESTRICTED asset name
   * Format: $NAME
   */
  static validateRestricted(name, network = 'xna') {
    ensureName(name, 'RESTRICTED asset name');

    if (!name.startsWith(ASSET_NAME_RULES.RESTRICTED.prefix)) {
      throw new InvalidAssetNameError(
        `RESTRICTED asset must start with ${ASSET_NAME_RULES.RESTRICTED.prefix}`,
        name
      );
    }

    ensureMaxLength(name, getMaxAssetNameLength(network), 'RESTRICTED asset name');

    if (name !== name.toUpperCase()) {
      throw new InvalidAssetNameError('RESTRICTED asset name must be uppercase', name);
    }

    if (!isRestrictedNameValid(name)) {
      throw new InvalidAssetNameError(
        'Restricted name contains invalid characters (Valid characters are: A-Z 0-9 _ .) ($ must be the first character, _ . special characters can\'t be the first or last characters)',
        name
      );
    }

    return true;
  }

  /**
   * Validate DEPIN asset name
   * Format: &NAME or &NAME/SUB[/...]
   */
  static validateDepin(name, network) {
    ensureName(name, 'DEPIN asset name');

    if (!name.startsWith(ASSET_NAME_RULES.DEPIN.prefix)) {
      throw new InvalidAssetNameError(
        `DEPIN asset must start with ${ASSET_NAME_RULES.DEPIN.prefix}`,
        name
      );
    }

    if (network && !isTestnet(network)) {
      throw new InvalidAssetNameError('DEPIN assets are only available in testnet', name);
    }

    ensureMaxLength(name, getMaxAssetNameLength(network || 'xna-test'), 'DEPIN asset name');

    if (name !== name.toUpperCase()) {
      throw new InvalidAssetNameError('DEPIN asset name must be uppercase', name);
    }

    if (!isDepinIndicator(name)) {
      throw new InvalidAssetNameError(
        'DEPIN asset name can only contain A-Z, 0-9, underscore, period, and separator /',
        name
      );
    }

    const parts = name.split(ASSET_NAME_RULES.DEPIN.separator);

    if (parts.length > 1) {
      parts.forEach(part => {
        if (part.length < MIN_ASSET_LENGTH) {
          throw new InvalidAssetNameError(
            `Each DEPIN sub-part must be at least ${MIN_ASSET_LENGTH} characters`,
            name
          );
        }
      });
    } else if (name.length < MIN_ASSET_LENGTH + 1) {
      throw new InvalidAssetNameError(
        `DEPIN name must be at least ${MIN_ASSET_LENGTH} characters (excluding &)`,
        name
      );
    }

    return true;
  }

  /**
   * Validate owner token name
   * Format: ASSETNAME!
   */
  static validateOwnerToken(name, network) {
    ensureName(name, 'Owner token name');

    ensureMaxLength(name, getMaxAssetNameLength(network), 'Owner token name');

    if (!name.endsWith('!')) {
      throw new InvalidAssetNameError('Owner token must end with !', name);
    }

    const assetName = name.substring(0, name.length - 1);
    const validBaseName = isNameValidBeforeTag(assetName)
      || (assetName.startsWith('&') && (() => {
        try {
          this.validateDepin(assetName, network);
          return true;
        } catch (error) {
          return false;
        }
      })());

    if (!validBaseName) {
        throw new InvalidAssetNameError(
          'Owner name contains invalid characters (Valid characters are: A-Z 0-9 _ .) (special characters can\'t be the first or last characters)',
          name
        );
    }

    return true;
  }

  /**
   * Auto-detect asset type and validate
   * @param {string} name - Asset name
   * @returns {string} Asset type ('ROOT', 'SUB', 'UNIQUE', 'QUALIFIER', 'RESTRICTED', 'DEPIN', 'OWNER')
   */
  static validateAndDetectType(name, network) {
    if (name.endsWith('!')) {
      this.validateOwnerToken(name, network);
      return 'OWNER';
    } else if (name.startsWith('#')) {
      this.validateQualifier(name, network);
      return name.includes('/') ? 'SUB_QUALIFIER' : 'QUALIFIER';
    } else if (name.startsWith('$')) {
      this.validateRestricted(name, network);
      return 'RESTRICTED';
    } else if (name.startsWith('&')) {
      this.validateDepin(name, network);
      return 'DEPIN';
    } else if (name.includes('#')) {
      this.validateUnique(name, network);
      return 'UNIQUE';
    } else if (name.includes('/')) {
      this.validateSub(name, network);
      return 'SUB';
    } else {
      this.validateRoot(name, network);
      return 'ROOT';
    }
  }
}

module.exports = AssetNameValidator;
