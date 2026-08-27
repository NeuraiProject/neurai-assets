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
 * Bytes an asset payload adds on top of a plain destination output.
 *
 * An asset output is `<destination script> OP_XNA_ASSET <pushdata payload>
 * OP_DROP`, so it costs the destination plus the wrapper (OP_XNA_ASSET,
 * the pushdata prefix and OP_DROP) plus the payload itself:
 *
 *   marker(3) + type(1) + nameLength(1) + name + kind-specific tail
 *
 * Sizing these as bare P2PKH outputs under-counts a transaction by tens to
 * hundreds of bytes. That is invisible while the node's fee rate sits well
 * above its minimum relay fee, and becomes `min relay fee not met` as soon as
 * it does not — which is exactly the failure this file's header warns about.
 *
 * @param {object} descriptor - Output descriptor with `assetName` and `kind`
 * @returns {number} Extra bytes, or 0 when the output carries no asset payload
 */
function assetPayloadBytes(descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || !descriptor.assetName) {
    return 0;
  }

  const nameLength = Buffer.byteLength(String(descriptor.assetName), 'ascii');
  const kind = descriptor.kind || 'transfer';

  // marker(3) + type(1) + CompactSize name length(1) + name
  let payload = 5 + nameLength;

  switch (kind) {
    case 'owner':
      // The owner payload carries no amount: it is always exactly one unit.
      break;
    case 'issue':
      // amount(8) + units(1) + reissuable(1) + has_ipfs(1)
      payload += 11;
      break;
    case 'reissue':
      // amount(8) + units(1) + reissuable(1)
      payload += 10;
      break;
    default:
      // transfer: amount(8)
      payload += 8;
      break;
  }

  if (descriptor.hasIpfs) {
    payload += 34;
  }

  // OP_XNA_ASSET(1) + pushdata prefix + OP_DROP(1). Payloads over 75 bytes
  // need OP_PUSHDATA1, which is one byte wider — reachable with the 121-char
  // asset names testnet and regtest allow for DePIN.
  const pushPrefix = payload > 75 ? 2 : 1;

  return 1 + pushPrefix + payload + 1;
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
  const address =
    typeof target === 'string' ? target : (target && target.address) || '';
  const base = isPQAddress(address) ? VBYTES.pqOutputBytes : VBYTES.legacyOutputBytes;
  return base + assetPayloadBytes(typeof target === 'string' ? null : target);
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
  assetPayloadBytes,
  estimateTransactionVbytes,
};
