/**
 * Validation Error Classes
 * Errors thrown during parameter validation
 */

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'VALIDATION_ERROR';
  }
}

class InvalidAssetNameError extends ValidationError {
  constructor(message, assetName) {
    super(message);
    this.name = 'InvalidAssetNameError';
    this.code = 'INVALID_ASSET_NAME';
    this.assetName = assetName;
  }
}

class InvalidAmountError extends ValidationError {
  constructor(message, amount) {
    super(message);
    this.name = 'InvalidAmountError';
    this.code = 'INVALID_AMOUNT';
    this.amount = amount;
  }
}

class InvalidUnitsError extends ValidationError {
  constructor(message, units) {
    super(message);
    this.name = 'InvalidUnitsError';
    this.code = 'INVALID_UNITS';
    this.units = units;
  }
}

class InvalidVerifierStringError extends ValidationError {
  constructor(message, verifier) {
    super(message);
    this.name = 'InvalidVerifierStringError';
    this.code = 'INVALID_VERIFIER_STRING';
    this.verifier = verifier;
  }
}

class InvalidIPFSHashError extends ValidationError {
  constructor(message, hash) {
    super(message);
    this.name = 'InvalidIPFSHashError';
    this.code = 'INVALID_IPFS_HASH';
    this.ipfsHash = hash;
  }
}

class InvalidAddressError extends ValidationError {
  constructor(message, address) {
    super(message);
    this.name = 'InvalidAddressError';
    this.code = 'INVALID_ADDRESS';
    this.address = address;
  }
}

class InsufficientFundsError extends ValidationError {
  constructor(message, required, available) {
    super(message);
    this.name = 'InsufficientFundsError';
    this.code = 'INSUFFICIENT_FUNDS';
    this.required = required;
    this.available = available;
  }
}

module.exports = {
  ValidationError,
  InvalidAssetNameError,
  InvalidAmountError,
  InvalidUnitsError,
  InvalidVerifierStringError,
  InvalidIPFSHashError,
  InvalidAddressError,
  InsufficientFundsError
};
