/**
 * Exact amount conversion for the canonical createTransactionBuild contract.
 *
 * Everything the chain encodes in a transaction is an integer:
 *   - XNA values are 10^8 sats;
 *   - asset payload quantities are ALSO 10^8-scaled, independently of the
 *     asset's `units`. `units` limits divisibility and presentation, it is
 *     never a multiplier (see the node's CheckAmountWithUnits in assets.cpp).
 *
 * The display <-> raw conversion is therefore a fixed 10^8 scaling, done
 * **through text**: scaling the decimal string keeps every digit the caller
 * wrote, and refuses the ones it cannot keep.
 *
 * The alternative — `BigInt(Math.round(value * 1e8))`, which is what
 * `assetUnitsToRaw` in neurai-create-transaction does — is correct for
 * ordinary magnitudes. `4.35 * 1e8` is `434999999.99999994`, but `Math.round`
 * recovers `435000000`; that example shows binary representation, not a wrong
 * result. For a finite, non-negative number it has two silent failure modes:
 *
 *   - more than eight decimals are rounded away instead of rejected, so an
 *     amount can vanish (`1e-9` becomes `0n`) or shift (`1.123456789` becomes
 *     `112345679`);
 *   - past `Number.MAX_SAFE_INTEGER` a double can no longer represent every
 *     integer, so the product may or may not survive — and nothing says which.
 *     `184467440.73709551` comes back as `18446744073709552n`, one unit off,
 *     while `21000000000` scales to `2100000000000000000n` exactly. The risk
 *     is that the two cases are indistinguishable from the outside.
 *
 * Outside that range its `Number(amount || 0)` also turns `NaN`, `null` and
 * `''` into `0n`, accepts negatives, and coerces other types — `true` yields a
 * whole unit. Every one of these is reachable with values a wallet can hold,
 * and none announces itself. Hence: convert by text, validate, and fail closed
 * rather than delegate.
 */

const { InvalidAmountError, InvalidUnitsError } = require('../errors');

/** Asset payload and XNA values are both encoded with 8 decimals. */
const PROTOCOL_DECIMALS = 8;

/** 10^8, as a bigint, for callers that need the scale itself. */
const PROTOCOL_SCALE = 100000000n;

/**
 * Consensus ceiling for any CAmount, asset payloads included:
 * `MAX_MONEY = 21000000000 * COIN` in the node's `src/amount.h`, with
 * `MoneyRange(v)` requiring `0 <= v <= MAX_MONEY`.
 *
 * Enforced here rather than left to the callers because it is a property of
 * the value, not of the operation: a string is not exempt just because it
 * carried its digits faithfully.
 */
const MAX_MONEY_RAW = 2100000000000000000n;

const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;
const SCIENTIFIC_DECIMAL = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/;

/**
 * Expand a scientific-notation decimal ("1e-7", "2.1e+19") into plain decimal
 * text. Returns the input unchanged when it carries no exponent.
 *
 * @param {string} text - Decimal text, possibly with an exponent
 * @returns {string} Plain decimal text
 */
function expandScientificNotation(text) {
  const match = SCIENTIFIC_DECIMAL.exec(text);
  if (!match) {
    return text;
  }

  const [, sign, intPart, fracPart = '', exponentText] = match;
  const digits = intPart + fracPart;
  const pointPosition = intPart.length + Number.parseInt(exponentText, 10);

  let expanded;
  if (pointPosition <= 0) {
    expanded = `0.${'0'.repeat(-pointPosition)}${digits}`;
  } else if (pointPosition >= digits.length) {
    expanded = digits + '0'.repeat(pointPosition - digits.length);
  } else {
    expanded = `${digits.slice(0, pointPosition)}.${digits.slice(pointPosition)}`;
  }

  return sign + expanded;
}

/**
 * Normalize a public amount into canonical plain decimal text.
 *
 * Strings must already be plain decimals: a caller that writes "1e3" is more
 * likely to have a bug than to mean 1000, and there is no reason to guess.
 * Numbers are accepted through their shortest round-trip representation
 * (`String(0.1)` is `"0.1"`, not the exact binary expansion), then expanded,
 * which is the only reading under which a literal like `1e-7` is meaningful.
 *
 * @param {string|number} value - Public amount
 * @param {string} label - What is being converted, for the error message
 * @returns {string} Plain decimal text
 * @throws {InvalidAmountError} If the value cannot be read exactly
 */
function normalizeDecimalText(value, label) {
  if (typeof value === 'bigint') {
    throw new InvalidAmountError(
      `${label}: a bigint is ambiguous as a display amount (is 5n five tokens ` +
      `or five raw units?). Pass a decimal string such as "5", or set the ` +
      `*Raw / *Sats field directly when you already hold protocol integers.`,
      value
    );
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new InvalidAmountError(`${label}: ${value} is not a finite number`, value);
    }
    return expandScientificNotation(String(value));
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (text === '') {
      throw new InvalidAmountError(`${label}: empty string is not an amount`, value);
    }
    if (SCIENTIFIC_DECIMAL.test(text)) {
      throw new InvalidAmountError(
        `${label}: "${text}" uses exponent notation. Pass a plain decimal ` +
        `string (for example "${expandScientificNotation(text)}") so the ` +
        `intended value is unambiguous.`,
        value
      );
    }
    if (!PLAIN_DECIMAL.test(text)) {
      throw new InvalidAmountError(`${label}: "${text}" is not a decimal number`, value);
    }
    return text;
  }

  throw new InvalidAmountError(
    `${label}: expected a decimal string or a number, received ${value === null ? 'null' : typeof value}`,
    value
  );
}

/**
 * Scale plain decimal text by 10^decimals, exactly, using text only.
 *
 * `rounding: 'ceil'` exists for one purpose: a *threshold* — a fee or a
 * funding requirement — computed by float arithmetic upstream, which can
 * carry noise digits below the satoshi (`0.031275000000000004`). Rounding it
 * up asks for slightly more than needed, which is safe; rounding a value that
 * will be *encoded* would silently create money, so the default is to reject.
 *
 * @param {string} text - Plain decimal text
 * @param {number} decimals - Number of decimals of the target scale
 * @param {string} label - What is being converted, for the error message
 * @param {'exact'|'ceil'} [rounding] - How to treat excess precision
 * @returns {bigint} Scaled integer
 * @throws {InvalidAmountError} If the value carries more decimals than the scale
 */
function scaleDecimalText(text, decimals, label, rounding = 'exact') {
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [intPart, fracPart = ''] = unsigned.split('.');

  if (fracPart.length > decimals) {
    if (rounding !== 'ceil') {
      throw new InvalidAmountError(
        `${label}: "${text}" has ${fracPart.length} decimals; the protocol ` +
        `encodes at most ${decimals}. The extra digits would be silently ` +
        `dropped, so this is rejected instead of rounded.`,
        text
      );
    }
    if (negative) {
      throw new InvalidAmountError(
        `${label}: "${text}" is negative; rounding up a negative threshold is not meaningful`,
        text
      );
    }
    const kept = BigInt(intPart + fracPart.slice(0, decimals));
    const dropped = fracPart.slice(decimals);
    return /[1-9]/.test(dropped) ? kept + 1n : kept;
  }

  const scaled = BigInt(intPart + fracPart.padEnd(decimals, '0'));
  return negative ? -scaled : scaled;
}

/**
 * Refuse a `number` whose scaled value no longer fits a safe integer.
 *
 * Above `MAX_SAFE_INTEGER / 1e8` (~90071992.55) a double can no longer name
 * every 8-decimal value, so the shortest round-trip form this module reads is
 * not necessarily the decimal the caller meant. The two paths then disagree:
 *
 *   assetAmountToRaw(184467440.73709551)   → 18446744073709550n
 *   assetAmountToRaw('184467440.73709551') → 18446744073709551n
 *
 * because `String(184467440.73709551)` is `'184467440.7370955'` — one digit
 * shorter. Neither answer is wrong for the double that arrived; the problem is
 * that the intended decimal was already lost at the call site. Asking for a
 * string is the only way to get it back, so this fails closed instead of
 * picking one. Strings are never restricted.
 *
 * A number that is itself a safe integer is still accepted, however large it
 * scales: it names its value exactly and has no fractional digits to lose, so
 * `21000000000` — the documented maximum supply — keeps working. What is
 * refused is a number that is neither a safe integer nor small enough for its
 * eight decimals to be unambiguous.
 *
 * @param {string|number} value - The original input
 * @param {bigint} raw - Scaled result
 * @param {string} text - Normalized decimal text
 * @param {string} label - Prefix for error messages
 * @throws {InvalidAmountError} If a number cannot carry the value exactly
 */
function assertNumberCarriedItExactly(value, raw, text, label) {
  if (typeof value !== 'number') {
    return;
  }
  if (raw <= BigInt(Number.MAX_SAFE_INTEGER) || Number.isSafeInteger(value)) {
    return;
  }
  throw new InvalidAmountError(
    `${label}: ${text} scales to ${raw}, past Number.MAX_SAFE_INTEGER, and the ` +
    `number that arrived can no longer name every 8-decimal value at that ` +
    `magnitude — it may already differ from the amount intended. Pass it as a ` +
    `decimal string ("${text}") instead.`,
    value
  );
}

/**
 * Convert a user-facing asset amount into the raw 10^8-scaled integer that
 * goes into the asset payload.
 *
 * @param {string|number} value - Display amount (e.g. "1.25")
 * @param {number} [units] - Asset decimal places; when given, divisibility is enforced
 * @param {object} [options]
 * @param {string} [options.label] - Prefix for error messages
 * @returns {bigint} Raw amount, 10^8-scaled
 * @throws {InvalidAmountError|InvalidUnitsError} If the amount cannot be encoded
 */
function assetAmountToRaw(value, units, options = {}) {
  const label = options.label || 'asset amount';
  const text = normalizeDecimalText(value, label);
  const raw = scaleDecimalText(text, PROTOCOL_DECIMALS, label);

  if (raw < 0n) {
    throw new InvalidAmountError(`${label}: "${text}" is negative`, value);
  }

  assertNumberCarriedItExactly(value, raw, text, label);

  if (raw > MAX_MONEY_RAW) {
    throw new InvalidAmountError(
      `${label}: "${text}" scales to ${raw}, above the consensus ceiling ` +
      `MAX_MONEY (${MAX_MONEY_RAW}, i.e. 21000000000 units). The node rejects ` +
      `it with MoneyRange, so it is refused here rather than serialized.`,
      value
    );
  }

  if (units !== undefined && units !== null) {
    if (!Number.isInteger(units) || units < 0 || units > PROTOCOL_DECIMALS) {
      throw new InvalidUnitsError(
        `${label}: units must be an integer between 0 and ${PROTOCOL_DECIMALS}, received ${units}`,
        units
      );
    }
    const step = 10n ** BigInt(PROTOCOL_DECIMALS - units);
    if (raw % step !== 0n) {
      throw new InvalidAmountError(
        `${label}: "${text}" is not a multiple of the asset's precision ` +
        `(units=${units} allows steps of ${formatRawAsDecimal(step)}). The ` +
        `node rejects it with CheckAmountWithUnits.`,
        value
      );
    }
  }

  return raw;
}

/**
 * Convert a user-facing XNA amount into satoshis, exactly.
 *
 * @param {string|number} value - Display XNA amount
 * @param {object} [options]
 * @param {string} [options.label] - Prefix for error messages
 * @param {boolean} [options.allowNegative] - Permit negative results
 * @param {'exact'|'ceil'} [options.rounding] - Only for thresholds; see scaleDecimalText
 * @returns {bigint} Satoshis
 * @throws {InvalidAmountError} If the amount cannot be encoded
 */
function xnaAmountToSats(value, options = {}) {
  const label = options.label || 'XNA amount';
  const text = normalizeDecimalText(value, label);
  const sats = scaleDecimalText(text, PROTOCOL_DECIMALS, label, options.rounding);

  if (sats < 0n && !options.allowNegative) {
    throw new InvalidAmountError(`${label}: "${text}" is negative`, value);
  }

  return sats;
}

/**
 * Render a protocol integer back as plain decimal text, exactly.
 *
 * Used for the RPC/legacy envelopes, which speak display amounts. Text keeps
 * values above `Number.MAX_SAFE_INTEGER` intact; `toNumber` is the explicit,
 * lossy step for the places that still need a JS number.
 *
 * @param {bigint} raw - Protocol integer (10^8-scaled)
 * @returns {string} Plain decimal text without trailing zeros
 */
function formatRawAsDecimal(raw) {
  const negative = raw < 0n;
  const digits = (negative ? -raw : raw).toString().padStart(PROTOCOL_DECIMALS + 1, '0');
  const intPart = digits.slice(0, digits.length - PROTOCOL_DECIMALS);
  const fracPart = digits.slice(digits.length - PROTOCOL_DECIMALS).replace(/0+$/, '');
  const text = fracPart === '' ? intPart : `${intPart}.${fracPart}`;
  return negative ? `-${text}` : text;
}

/**
 * Render a protocol integer as a JS number for the legacy display envelopes.
 *
 * Fails closed rather than returning a value the caller cannot trust: a
 * quantity whose display form is not exactly representable would otherwise
 * travel on as a plausible-looking wrong number.
 *
 * @param {bigint} raw - Protocol integer (10^8-scaled)
 * @param {string} [label] - Prefix for error messages
 * @returns {number} Display amount
 * @throws {InvalidAmountError} If the display value is not exactly representable
 */
function rawToDisplayNumber(raw, label = 'amount') {
  const text = formatRawAsDecimal(raw);
  const asNumber = Number(text);
  if (!Number.isFinite(asNumber) || expandScientificNotation(String(asNumber)) !== text) {
    throw new InvalidAmountError(
      `${label}: ${text} cannot be represented exactly as a JavaScript number. ` +
      `Read the raw bigint instead of the display field.`,
      text
    );
  }
  return asNumber;
}

/**
 * Normalize a chain-reported integer (UTXO `satoshis`, asset balance) to bigint.
 *
 * A `number` is only accepted when it is a safe integer. An unsafe one is
 * rejected rather than converted: `JSON.parse` already destroyed the low bits,
 * and `BigInt(9007199254740993)` cannot bring them back — it would just make
 * the corruption look deliberate.
 *
 * @param {bigint|string|number} value - Chain integer
 * @param {string} [label] - Prefix for error messages
 * @returns {bigint} The same integer, exactly
 * @throws {InvalidAmountError} If the value is not an exact integer
 */
function toProtocolInteger(value, label = 'value') {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new InvalidAmountError(`${label}: ${value} is not an integer`, value);
    }
    if (!Number.isSafeInteger(value)) {
      throw new InvalidAmountError(
        `${label}: ${value} exceeds Number.MAX_SAFE_INTEGER, so JSON parsing ` +
        `already lost digits. Have the RPC transport deliver this field as a ` +
        `string or bigint; converting it here would preserve the corruption.`,
        value
      );
    }
    return BigInt(value);
  }

  if (typeof value === 'string') {
    const text = value.trim();
    if (!/^-?\d+$/.test(text)) {
      throw new InvalidAmountError(`${label}: "${value}" is not an integer`, value);
    }
    return BigInt(text);
  }

  throw new InvalidAmountError(
    `${label}: expected an integer as bigint, string or number, received ${value === null ? 'null' : typeof value}`,
    value
  );
}

/**
 * Sum chain-reported integers exactly.
 *
 * @param {Array<object>} items - Objects carrying the field
 * @param {string} [field] - Field name (default: 'satoshis')
 * @param {string} [label] - Prefix for error messages
 * @returns {bigint} Exact total
 */
function sumProtocolIntegers(items, field = 'satoshis', label = 'utxo.satoshis') {
  return (items || []).reduce(
    (total, item) => total + toProtocolInteger(item ? item[field] : undefined, label),
    0n
  );
}

module.exports = {
  PROTOCOL_DECIMALS,
  PROTOCOL_SCALE,
  MAX_MONEY_RAW,
  assetAmountToRaw,
  xnaAmountToSats,
  formatRawAsDecimal,
  rawToDisplayNumber,
  toProtocolInteger,
  sumProtocolIntegers,
  expandScientificNotation,
  normalizeDecimalText,
  scaleDecimalText
};
