/**
 * Fee / size helpers for Neurai transactions.
 *
 * These constants and classifiers are the same ones exposed by
 * `@neuraiproject/neurai-sign-transaction` (`VBYTES`, `isPQAddress`,
 * `isPQScript`, `estimateInputVbytes`, `estimateOutputBytes`,
 * `estimateTransactionVbytes`). They are inlined here to keep the assets
 * package light: depending on the full signer would pull `bitcoinjs-lib`
 * and `@noble/post-quantum` into the IIFE / browser bundles, which is far
 * more weight than the few constants we actually need for fee estimation.
 *
 * SOURCE OF TRUTH: `@neuraiproject/neurai-sign-transaction` `src/estimate.ts`.
 * Keep these values in sync with the signer's `VBYTES`. Mismatches surface
 * immediately as `min relay fee not met` failures from the node.
 */

/** Per-component byte sizes used across the Neurai stack for fee estimation. */
const VBYTES = Object.freeze({
  /** Raw transaction overhead: version (4) + in-count varint (1) + out-count varint (1) + locktime (4). */
  baseTxOverheadBytes: 10,
  /** Extra weight contributed by the segwit marker + flag bytes when any input is PQ. */
  segwitMarkerVbytes: 1,
  /** vbytes for a typical legacy P2PKH input (worst-case scriptSig). */
  legacyInputVbytes: 148,
  /** vbytes for a typical PQ AuthScript input with the default OP_TRUE witnessScript. */
  pqInputVbytes: 977,
  /** Bytes of a legacy P2PKH output (8-byte value + 1-byte script length + 25-byte scriptPubKey). */
  legacyOutputBytes: 34,
  /** Bytes of an AuthScript-v1 output (8-byte value + 1-byte script length + 34-byte scriptPubKey). */
  pqOutputBytes: 43,
});

/** True for Neurai PQ AuthScript bech32 destinations (`nq1…` mainnet, `tnq1…` testnet). */
function isPQAddress(address) {
  return (
    typeof address === 'string' &&
    (address.startsWith('nq1') || address.startsWith('tnq1'))
  );
}

/** True for AuthScript-v1 scriptPubKey hex (witness v1, 32-byte program — `5120…`). */
function isPQScript(scriptHex) {
  if (typeof scriptHex !== 'string' || scriptHex.length < 4) return false;
  return scriptHex.toLowerCase().startsWith('5120');
}

/**
 * Estimate the vbytes contributed by spending one UTXO. Uses the UTXO's
 * `script` if available, otherwise falls back to its `address`. Unknown
 * prevouts are treated as legacy.
 */
function estimateInputVbytes(utxo) {
  const script = utxo && utxo.script;
  if (typeof script === 'string' && script.length > 0) {
    return isPQScript(script) ? VBYTES.pqInputVbytes : VBYTES.legacyInputVbytes;
  }
  const address = utxo && utxo.address;
  if (typeof address === 'string' && isPQAddress(address)) {
    return VBYTES.pqInputVbytes;
  }
  return VBYTES.legacyInputVbytes;
}

/**
 * Encoders that produce the exact scriptPubKey the node will see.
 *
 * Sizing asset outputs from a hand-written byte formula drifted: the owner
 * token a reissue RETURNS is serialized as a transfer (it carries an amount),
 * not as the owner payload an issuance CREATES, and the null-asset-data
 * outputs of tag/freeze were not counted at all — those outputs are not
 * P2PKH-plus-payload, they replace the destination script entirely. The result
 * was twelve of eighteen operations budgeting below what the node charges.
 *
 * Asking the serializer is the only way to keep this from drifting again: the
 * numbers below are not a model of the encoding, they ARE the encoding.
 */
const ct = require('@neuraiproject/neurai-create-transaction');

/** Bytes a CompactSize length prefix occupies for `n`. */
function compactSizeBytes(n) {
  if (n < 253) return 1;
  if (n <= 0xffff) return 3;
  if (n <= 0xffffffff) return 5;
  return 9;
}

/** An IPFS hash of the right LENGTH; only its size matters here. */
const IPFS_PLACEHOLDER = 'Qm' + 'a'.repeat(44);

/**
 * The exact scriptPubKey for an asset-bearing output descriptor, or null when
 * the descriptor names no asset operation.
 *
 * Values are placeholders on purpose: every field the amount or the flag lands
 * in is fixed-width, so a zero costs the same bytes as the real number. The
 * name, the address and the presence of IPFS are the only things that move the
 * size, and those come from the descriptor.
 *
 * @param {object} descriptor - Output descriptor
 * @returns {Uint8Array|null} Encoded script, or null
 */
function assetOutputScript(descriptor) {
  const { address, assetName, kind = 'transfer' } = descriptor;
  const ipfs = descriptor.hasIpfs ? (descriptor.ipfsHash || IPFS_PLACEHOLDER) : undefined;

  switch (kind) {
    case 'owner':
      return ct.encodeOwnerAssetScript(address, assetName);
    case 'issue':
      return ct.encodeNewAssetScript(address, assetName, 0n, 0, true, ipfs);
    case 'reissue':
      return ct.encodeReissueAssetScript(address, assetName, 0n, undefined, true, ipfs);
    case 'tag':
      return ct.encodeNullAssetTagScript(address, assetName, 'tag');
    case 'restriction':
      return ct.encodeNullAssetRestrictionScript(address, assetName, 1);
    case 'globalRestriction':
      return ct.encodeGlobalRestrictionScript(assetName, 1);
    case 'verifier':
      return ct.encodeVerifierStringScript(descriptor.verifierString || '');
    case 'transfer':
      return ct.encodeAssetTransferScript(address, assetName, 0n);
    default:
      return null;
  }
}

/**
 * Kinds whose script REPLACES the destination rather than extending it.
 *
 * A tag, a restriction or a verifier string is not "a payment with a payload
 * bolted on": there is no P2PKH to pay. Adding a destination's bytes to these
 * over-counts; treating them as plain destinations, which is what the builders
 * used to do, under-counts by far more.
 */
const STANDALONE_KINDS = new Set(['tag', 'restriction', 'globalRestriction', 'verifier']);

/**
 * Fallback used only when the encoders cannot express a descriptor — an
 * address family they do not accept, say. Keeps the previous behaviour rather
 * than throwing in the middle of a fee estimate.
 */
function assetPayloadBytesApprox(descriptor) {
  const nameLength = String(descriptor.assetName || '').length;
  const kind = descriptor.kind || 'transfer';
  let payload = 5 + nameLength;
  if (kind === 'issue') payload += 11;
  else if (kind === 'reissue') payload += 10;
  else if (kind !== 'owner') payload += 8;
  if (descriptor.hasIpfs) payload += 34;
  return 1 + (payload > 75 ? 2 : 1) + payload + 1;
}

/**
 * Bytes an asset payload adds on top of a plain destination output.
 *
 * Kept for callers that only want the delta. Standalone kinds have no
 * destination to add to, so this is not meaningful for them.
 *
 * @param {object} descriptor - Output descriptor with `assetName` and `kind`
 * @returns {number} Extra bytes, or 0 when the output carries no asset payload
 */
function assetPayloadBytes(descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || !descriptor.assetName) {
    return 0;
  }
  try {
    const script = assetOutputScript(descriptor);
    if (!script) return 0;
    const base = isPQAddress(descriptor.address) ? 34 : 25;
    return script.length - base;
  } catch {
    return assetPayloadBytesApprox(descriptor);
  }
}

/**
 * Estimate the bytes contributed by an output.
 *
 * Accepts an address string, `{ address }`, or an asset-aware descriptor
 * `{ address, assetName, kind, hasIpfs }` where `kind` is one of `transfer`
 * (default), `owner`, `issue` or `reissue`.
 *
 * @param {string|object} target - Output descriptor
 * @returns {number} Estimated bytes
 */
function estimateOutputBytes(target) {
  if (typeof target !== 'string' && target && (target.assetName || target.kind === 'verifier')) {
    try {
      const script = assetOutputScript(target);
      if (script) {
        // value(8) + CompactSize(scriptLen) + script
        return 8 + compactSizeBytes(script.length) + script.length;
      }
    } catch {
      // fall through to the approximation
    }
    if (STANDALONE_KINDS.has(target.kind)) {
      return VBYTES.legacyOutputBytes;
    }
    const base = isPQAddress(target.address) ? VBYTES.pqOutputBytes : VBYTES.legacyOutputBytes;
    return base + assetPayloadBytesApprox(target);
  }

  const address =
    typeof target === 'string' ? target : (target && target.address) || '';
  return isPQAddress(address) ? VBYTES.pqOutputBytes : VBYTES.legacyOutputBytes;
}

/**
 * Sum the per-input/per-output contributions, plus base overhead and segwit
 * marker (added once when any input is PQ). Inputs may be partial UTXO-like
 * objects with `script` and/or `address`. Outputs may be address strings or
 * `{ address }` descriptors.
 */
function estimateTransactionVbytes(inputs, outputs) {
  let vbytes = VBYTES.baseTxOverheadBytes;
  let hasPQInput = false;

  for (const inp of inputs) {
    const v = estimateInputVbytes(inp);
    vbytes += v;
    if (v === VBYTES.pqInputVbytes) hasPQInput = true;
  }

  for (const out of outputs) {
    vbytes += estimateOutputBytes(out);
  }

  if (hasPQInput) vbytes += VBYTES.segwitMarkerVbytes;

  return vbytes;
}

module.exports = {
  VBYTES,
  compactSizeBytes,
  assetOutputScript,
  isPQAddress,
  isPQScript,
  estimateInputVbytes,
  estimateOutputBytes,
  assetPayloadBytes,
  estimateTransactionVbytes,
};
