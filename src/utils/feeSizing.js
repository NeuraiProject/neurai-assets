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

/** Estimate the bytes contributed by an output (address string or `{address}`). */
function estimateOutputBytes(target) {
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
  isPQAddress,
  isPQScript,
  estimateInputVbytes,
  estimateOutputBytes,
  estimateTransactionVbytes,
};
