/**
 * Errors Module
 * Exports all error classes
 */

const {
  ValidationError,
  InvalidAssetNameError,
  InvalidAmountError,
  InvalidUnitsError,
  InvalidVerifierStringError,
  InvalidIPFSHashError,
  InvalidAddressError,
  InsufficientFundsError
} = require('./ValidationErrors');

const {
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
} = require('./AssetErrors');

module.exports = {
  // Validation Errors
  ValidationError,
  InvalidAssetNameError,
  InvalidAmountError,
  InvalidUnitsError,
  InvalidVerifierStringError,
  InvalidIPFSHashError,
  InvalidAddressError,
  InsufficientFundsError,

  // Asset Errors
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
