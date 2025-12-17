/**
 * Asset-Specific Error Classes
 * Errors related to asset operations
 */

class AssetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssetError';
    this.code = 'ASSET_ERROR';
  }
}

class AssetExistsError extends AssetError {
  constructor(message, assetName) {
    super(message);
    this.name = 'AssetExistsError';
    this.code = 'ASSET_EXISTS';
    this.assetName = assetName;
  }
}

class AssetNotFoundError extends AssetError {
  constructor(message, assetName) {
    super(message);
    this.name = 'AssetNotFoundError';
    this.code = 'ASSET_NOT_FOUND';
    this.assetName = assetName;
  }
}

class OwnerTokenNotFoundError extends AssetError {
  constructor(message, ownerTokenName) {
    super(message);
    this.name = 'OwnerTokenNotFoundError';
    this.code = 'OWNER_TOKEN_NOT_FOUND';
    this.ownerTokenName = ownerTokenName;
    this.severity = 'HIGH';
  }
}

class OwnerTokenNotReturnedError extends AssetError {
  constructor(message, ownerTokenName) {
    super(message);
    this.name = 'OwnerTokenNotReturnedError';
    this.code = 'OWNER_TOKEN_NOT_RETURNED';
    this.ownerTokenName = ownerTokenName;
    this.severity = 'CRITICAL';  // This results in permanent loss
  }
}

class AssetNotReissuableError extends AssetError {
  constructor(message, assetName) {
    super(message);
    this.name = 'AssetNotReissuableError';
    this.code = 'ASSET_NOT_REISSUABLE';
    this.assetName = assetName;
  }
}

class InsufficientBurnAmountError extends AssetError {
  constructor(message, required, provided) {
    super(message);
    this.name = 'InsufficientBurnAmountError';
    this.code = 'INSUFFICIENT_BURN_AMOUNT';
    this.required = required;
    this.provided = provided;
  }
}

class InvalidBurnAddressError extends AssetError {
  constructor(message, expectedAddress, providedAddress) {
    super(message);
    this.name = 'InvalidBurnAddressError';
    this.code = 'INVALID_BURN_ADDRESS';
    this.expectedAddress = expectedAddress;
    this.providedAddress = providedAddress;
  }
}

class MaxSupplyExceededError extends AssetError {
  constructor(message, assetName, currentSupply, additionalAmount, maxSupply) {
    super(message);
    this.name = 'MaxSupplyExceededError';
    this.code = 'MAX_SUPPLY_EXCEEDED';
    this.assetName = assetName;
    this.currentSupply = currentSupply;
    this.additionalAmount = additionalAmount;
    this.maxSupply = maxSupply;
  }
}

class RestrictedAssetViolationError extends AssetError {
  constructor(message, assetName, address, reason) {
    super(message);
    this.name = 'RestrictedAssetViolationError';
    this.code = 'RESTRICTED_ASSET_VIOLATION';
    this.assetName = assetName;
    this.address = address;
    this.reason = reason;
  }
}

class QualifierNotFoundError extends AssetError {
  constructor(message, qualifierName) {
    super(message);
    this.name = 'QualifierNotFoundError';
    this.code = 'QUALIFIER_NOT_FOUND';
    this.qualifierName = qualifierName;
  }
}

class ParentAssetNotFoundError extends AssetError {
  constructor(message, parentAssetName) {
    super(message);
    this.name = 'ParentAssetNotFoundError';
    this.code = 'PARENT_ASSET_NOT_FOUND';
    this.parentAssetName = parentAssetName;
  }
}

module.exports = {
  AssetError,
  AssetExistsError,
  AssetNotFoundError,
  OwnerTokenNotFoundError,
  OwnerTokenNotReturnedError,
  AssetNotReissuableError,
  InsufficientBurnAmountError,
  InvalidBurnAddressError,
  MaxSupplyExceededError,
  RestrictedAssetViolationError,
  QualifierNotFoundError,
  ParentAssetNotFoundError
};
