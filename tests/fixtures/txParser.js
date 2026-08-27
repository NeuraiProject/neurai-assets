/**
 * Minimal reader for the unsigned transactions create-transaction emits.
 *
 * The point of these tests is to check what the CHAIN will see, so the
 * assertions run against the serialized bytes rather than against the object
 * that produced them.
 */

/** NIP-040 markers, hex-encoded, with the payload type byte appended. */
const MARKER_HEX = { rvn: '72766e', xna: '786e61' };
const TYPE_BYTES = { t: '74', q: '71', o: '6f', r: '72' };

function asciiHex(value) {
  return Buffer.from(value, 'ascii').toString('hex');
}

function readVarInt(hex, offset) {
  const prefix = Number.parseInt(hex.slice(offset, offset + 2), 16);
  offset += 2;

  if (prefix < 0xfd) {
    return { value: prefix, offset };
  }
  if (prefix === 0xfd) {
    const bytes = hex.slice(offset, offset + 4).match(/../g).reverse().join('');
    return { value: Number.parseInt(bytes, 16), offset: offset + 4 };
  }
  if (prefix === 0xfe) {
    const bytes = hex.slice(offset, offset + 8).match(/../g).reverse().join('');
    return { value: Number.parseInt(bytes, 16), offset: offset + 8 };
  }
  throw new Error('64-bit CompactSize values are not expected in these tests');
}

/**
 * Parse the outputs of an unsigned raw transaction.
 *
 * @param {string} rawTx - Raw transaction hex
 * @returns {Array<{valueHex: string, valueSats: bigint, scriptHex: string}>} Outputs
 */
function parseUnsignedOutputs(rawTx) {
  let offset = 8; // version
  const vinCount = readVarInt(rawTx, offset);
  offset = vinCount.offset;

  for (let index = 0; index < vinCount.value; index += 1) {
    offset += 64; // txid
    offset += 8; // vout
    const scriptLength = readVarInt(rawTx, offset);
    offset = scriptLength.offset + scriptLength.value * 2;
    offset += 8; // sequence
  }

  const voutCount = readVarInt(rawTx, offset);
  offset = voutCount.offset;
  const outputs = [];

  for (let index = 0; index < voutCount.value; index += 1) {
    const valueHex = rawTx.slice(offset, offset + 16);
    offset += 16;
    const scriptLength = readVarInt(rawTx, offset);
    offset = scriptLength.offset;
    const scriptHex = rawTx.slice(offset, offset + scriptLength.value * 2);
    offset += scriptLength.value * 2;
    outputs.push({
      valueHex,
      valueSats: Buffer.from(valueHex, 'hex').readBigUInt64LE(0),
      scriptHex
    });
  }

  return outputs;
}

/**
 * Decode every asset payload found in a list of outputs.
 *
 * A payload is `<marker><type><CompactSize name><name>` followed, for the
 * transfer/new/owner/reissue kinds, by a little-endian u64 amount. Owner
 * payloads ('o') carry no amount — the owner token is always exactly one
 * unit — so they are reported as 10^8 to keep the caller's comparison
 * uniform with what the chain credits.
 *
 * @param {Array<{scriptHex: string}>} outputs - Parsed outputs
 * @returns {Array<{marker: string, type: string, assetName: string, amountRaw: bigint}>} Payloads
 */
function assetPayloads(outputs) {
  const payloads = [];

  outputs.forEach(output => {
    Object.entries(MARKER_HEX).forEach(([marker, markerHex]) => {
      Object.entries(TYPE_BYTES).forEach(([type, typeHex]) => {
        const needle = markerHex + typeHex;
        let searchFrom = 0;
        for (;;) {
          const at = output.scriptHex.indexOf(needle, searchFrom);
          if (at === -1) {
            break;
          }
          searchFrom = at + 2;

          const after = output.scriptHex.slice(at + needle.length);
          const nameLength = Number.parseInt(after.slice(0, 2), 16);
          if (!Number.isFinite(nameLength) || nameLength === 0) {
            continue;
          }
          const nameHex = after.slice(2, 2 + nameLength * 2);
          if (nameHex.length < nameLength * 2) {
            continue;
          }
          const assetName = Buffer.from(nameHex, 'hex').toString('ascii');
          // An asset name is printable ASCII; anything else means this was a
          // coincidental byte sequence, not a payload.
          if (!/^[!-~]+$/.test(assetName)) {
            continue;
          }

          let amountRaw = 100000000n;
          if (type !== 'o') {
            const amountHex = after.slice(2 + nameLength * 2, 2 + nameLength * 2 + 16);
            if (amountHex.length < 16) {
              continue;
            }
            amountRaw = Buffer.from(amountHex, 'hex').readBigUInt64LE(0);
          }

          payloads.push({ marker, type, assetName, amountRaw });
        }
      });
    });
  });

  return payloads;
}

module.exports = { parseUnsignedOutputs, assetPayloads, asciiHex, MARKER_HEX };
