/**
 * IPFS Hash Validator
 * Validates IPFS CID formats
 */

const { InvalidIPFSHashError } = require('../errors');

class IpfsValidator {
  /**
   * Validate IPFS hash format
   * Accepts:
   * - CIDv0: Qm... (46 characters, base58)
   * - CIDv1: bafy... or bafk... (various lengths, base32)
   * - Neurai TXID: 64 hex characters (for on-chain metadata)
   *
   * @param {string} hash - IPFS hash or TXID
   * @returns {boolean} True if valid
   */
  static validate(hash) {
    if (!hash || typeof hash !== 'string') {
      throw new InvalidIPFSHashError('IPFS hash must be a non-empty string', hash);
    }

    const trimmed = hash.trim();

    // Check maximum length (Neurai allows up to 40 bytes in protocol)
    if (trimmed.length > 80) {
      throw new InvalidIPFSHashError('IPFS hash too long (max 80 characters)', hash);
    }

    // Check if it's a valid format
    const isCIDv0 = this.isCIDv0(trimmed);
    const isCIDv1 = this.isCIDv1(trimmed);
    const isTXID = this.isTXID(trimmed);

    if (!isCIDv0 && !isCIDv1 && !isTXID) {
      throw new InvalidIPFSHashError(
        'Invalid IPFS hash format. Must be CIDv0 (Qm...), CIDv1 (bafy...), or TXID (64 hex chars)',
        hash
      );
    }

    return true;
  }

  /**
   * Check if hash is CIDv0 format
   * @param {string} hash - Hash to check
   * @returns {boolean} True if CIDv0
   */
  static isCIDv0(hash) {
    // CIDv0: Starts with "Qm", 46 characters, base58
    if (!hash.startsWith('Qm')) return false;
    if (hash.length !== 46) return false;

    // Base58 characters: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
    const base58Pattern = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
    return base58Pattern.test(hash);
  }

  /**
   * Check if hash is CIDv1 format
   * @param {string} hash - Hash to check
   * @returns {boolean} True if CIDv1
   */
  static isCIDv1(hash) {
    // CIDv1: Starts with "bafy" or "bafk" (base32), various lengths
    if (!hash.startsWith('bafy') && !hash.startsWith('bafk')) return false;

    // Base32 characters: a-z, 2-7
    const base32Pattern = /^[a-z2-7]+$/;
    return base32Pattern.test(hash);
  }

  /**
   * Check if hash is a transaction ID
   * @param {string} hash - Hash to check
   * @returns {boolean} True if TXID
   */
  static isTXID(hash) {
    // TXID: 64 hexadecimal characters
    if (hash.length !== 64) return false;

    const hexPattern = /^[0-9a-fA-F]+$/;
    return hexPattern.test(hash);
  }

  /**
   * Get IPFS hash type
   * @param {string} hash - IPFS hash
   * @returns {string} Type ('CIDv0', 'CIDv1', 'TXID', or 'UNKNOWN')
   */
  static getHashType(hash) {
    if (this.isCIDv0(hash)) return 'CIDv0';
    if (this.isCIDv1(hash)) return 'CIDv1';
    if (this.isTXID(hash)) return 'TXID';
    return 'UNKNOWN';
  }
}

module.exports = IpfsValidator;
