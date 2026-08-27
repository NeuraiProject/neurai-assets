const { expect } = require('chai');
const {
  assetAmountToRaw,
  xnaAmountToSats,
  formatRawAsDecimal,
  rawToDisplayNumber,
  toProtocolInteger,
  sumProtocolIntegers,
  expandScientificNotation,
  MAX_MONEY_RAW
} = require('../../../src/utils/assetAmount');
const { assetUnitsToRaw } = require('@neuraiproject/neurai-create-transaction');

describe('assetAmountToRaw', () => {
  describe('exact 10^8 scaling', () => {
    const cases = [
      ['1', 100000000n],
      ['1.25', 125000000n],
      ['0.00000001', 1n],
      ['0', 0n],
      ['21000000000', 2100000000000000000n],
      ['1.00000000', 100000000n],
      ['0.1', 10000000n]
    ];

    cases.forEach(([input, expected]) => {
      it(`converts "${input}" to ${expected}`, () => {
        expect(assetAmountToRaw(input)).to.equal(expected);
      });
    });

    it('produces display x 10^8, never the display value itself', () => {
      // The 1.4.1 defect: quantityRaw carried the display amount, so the chain
      // minted 4 raw units (0.00000004 tokens) for a requested 4 tokens.
      expect(assetAmountToRaw(4)).to.equal(400000000n);
      expect(assetAmountToRaw(4)).to.not.equal(4n);
    });

    it('never double-scales by units', () => {
      // Pre-1.2.2 multiplied by 10^units on top of 10^8.
      expect(assetAmountToRaw('1.25', 2)).to.equal(125000000n);
      expect(assetAmountToRaw('1.25', 8)).to.equal(125000000n);
    });

    it('exceeds Number.MAX_SAFE_INTEGER without losing digits', () => {
      const raw = assetAmountToRaw('21000000000', 8);
      expect(raw).to.equal(2100000000000000000n);
      expect(raw > BigInt(Number.MAX_SAFE_INTEGER)).to.equal(true);
    });
  });

  describe('units divisibility (node CheckAmountWithUnits)', () => {
    it('accepts an amount that fits the asset precision', () => {
      expect(assetAmountToRaw('1.25', 2)).to.equal(125000000n);
      expect(assetAmountToRaw('7', 0)).to.equal(700000000n);
    });

    it('rejects a decimal the asset cannot represent', () => {
      expect(() => assetAmountToRaw('1.25', 0)).to.throw(/not a multiple of the asset's precision/);
      expect(() => assetAmountToRaw('1.005', 2)).to.throw(/units=2/);
    });

    it('reports the allowed step in the error', () => {
      expect(() => assetAmountToRaw('0.5', 0)).to.throw(/steps of 1\b/);
    });

    it('rejects an out-of-range units value', () => {
      expect(() => assetAmountToRaw('1', 9)).to.throw(/units must be an integer between 0 and 8/);
      expect(() => assetAmountToRaw('1', -1)).to.throw(/units must be an integer/);
      expect(() => assetAmountToRaw('1', 1.5)).to.throw(/units must be an integer/);
    });

    it('skips the check when units are not supplied', () => {
      expect(assetAmountToRaw('1.25')).to.equal(125000000n);
    });
  });

  describe('rejected inputs', () => {
    it('rejects more than eight decimals instead of rounding', () => {
      expect(() => assetAmountToRaw('0.000000001')).to.throw(/at most 8/);
      expect(() => assetAmountToRaw('1.123456789')).to.throw(/9 decimals/);
    });

    it('rejects negatives', () => {
      expect(() => assetAmountToRaw('-1')).to.throw(/is negative/);
      expect(() => assetAmountToRaw(-0.5)).to.throw(/is negative/);
    });

    it('rejects NaN and infinities', () => {
      expect(() => assetAmountToRaw(Number.NaN)).to.throw(/not a finite number/);
      expect(() => assetAmountToRaw(Number.POSITIVE_INFINITY)).to.throw(/not a finite number/);
      expect(() => assetAmountToRaw(Number.NEGATIVE_INFINITY)).to.throw(/not a finite number/);
    });

    it('rejects non-numeric text', () => {
      expect(() => assetAmountToRaw('')).to.throw(/empty string/);
      expect(() => assetAmountToRaw('   ')).to.throw(/empty string/);
      expect(() => assetAmountToRaw('abc')).to.throw(/not a decimal number/);
      expect(() => assetAmountToRaw('1.2.3')).to.throw(/not a decimal number/);
      expect(() => assetAmountToRaw('0x10')).to.throw(/not a decimal number/);
    });

    it('rejects exponent notation in strings but suggests the plain form', () => {
      expect(() => assetAmountToRaw('1e3')).to.throw(/exponent notation/);
      expect(() => assetAmountToRaw('1e3')).to.throw(/"1000"/);
    });

    it('rejects null, undefined and objects', () => {
      expect(() => assetAmountToRaw(null)).to.throw(/received null/);
      expect(() => assetAmountToRaw(undefined)).to.throw(/received undefined/);
      expect(() => assetAmountToRaw({})).to.throw(/received object/);
    });

    it('rejects a bigint as ambiguous', () => {
      expect(() => assetAmountToRaw(5n)).to.throw(/ambiguous as a display amount/);
    });
  });

  describe('numbers', () => {
    it('reads a number through its shortest round-trip form', () => {
      expect(assetAmountToRaw(0.1)).to.equal(10000000n);
      expect(assetAmountToRaw(4.35)).to.equal(435000000n);
    });

    it('agrees with the float path where the float path is right', () => {
      // 4.35 * 1e8 is 434999999.99999994, but Math.round recovers 435000000.
      // That example shows binary representation, not a wrong result — the
      // text path simply never has to round.
      expect(4.35 * 1e8).to.equal(434999999.99999994);
      expect(Math.round(4.35 * 1e8)).to.equal(435000000);
      expect(assetAmountToRaw(4.35)).to.equal(435000000n);
    });

    it('expands scientific notation coming from String(number)', () => {
      expect(String(1e-7)).to.equal('1e-7');
      expect(assetAmountToRaw(1e-7)).to.equal(10n);
    });

    it('still rejects a number with more than eight decimals', () => {
      expect(() => assetAmountToRaw(1e-9)).to.throw(/at most 8/);
    });
  });

  describe('numbers too large to name their own value', () => {
    // Past MAX_SAFE_INTEGER / 1e8 (~90071992.55) a double no longer names
    // every 8-decimal value, so the number and string paths disagree. The
    // intended decimal was lost at the call site; only a string can restore it.
    it('rejects a fractional number whose scaled value is unsafe', () => {
      expect(() => assetAmountToRaw(184467440.73709551)).to.throw(/MAX_SAFE_INTEGER/);
      expect(() => assetAmountToRaw(184467440.73709551)).to.throw(/decimal string/);
      expect(() => assetAmountToRaw(90071992.54740993)).to.throw(/MAX_SAFE_INTEGER/);
    });

    it('shows why: the two paths would disagree by one unit', () => {
      // String(184467440.73709551) is '184467440.7370955' — one digit shorter.
      expect(String(184467440.73709551)).to.equal('184467440.7370955');
      expect(assetAmountToRaw('184467440.73709551')).to.equal(18446744073709551n);
      // Without the guard the number path would have returned ...550n.
    });

    it('rejects an integer number that is not a safe integer', () => {
      expect(Number.isSafeInteger(1e21)).to.equal(false);
      expect(() => assetAmountToRaw(1e21)).to.throw(/MAX_SAFE_INTEGER/);
    });

    it('still accepts a safe integer however large it scales', () => {
      // The documented maximum supply: exact as a double, no decimals to lose.
      expect(Number.isSafeInteger(21000000000)).to.equal(true);
      expect(assetAmountToRaw(21000000000)).to.equal(2100000000000000000n);
    });

    it('accepts the largest fractional number below the threshold', () => {
      expect(assetAmountToRaw(90071992.5474099)).to.equal(9007199254740990n);
    });

    it('does not apply the precision guard to strings', () => {
      // The guard is about what a double can name; a string carried its own
      // digits. Strings remain subject to every other rule (sign, decimals,
      // divisibility, consensus ceiling) — see the MAX_MONEY block below.
      expect(assetAmountToRaw('184467440.73709551')).to.equal(18446744073709551n);
      expect(assetAmountToRaw('90071992.54740993')).to.equal(9007199254740993n);
    });
  });

  describe('consensus ceiling (MAX_MONEY)', () => {
    // src/amount.h: MAX_MONEY = 21000000000 * COIN, and MoneyRange requires
    // 0 <= v <= MAX_MONEY. It is a property of the value, so a string is not
    // exempt just because it carried its digits faithfully.
    it('accepts exactly MAX_MONEY in both forms', () => {
      expect(assetAmountToRaw('21000000000')).to.equal(MAX_MONEY_RAW);
      expect(assetAmountToRaw(21000000000)).to.equal(MAX_MONEY_RAW);
      expect(MAX_MONEY_RAW).to.equal(2100000000000000000n);
    });

    it('rejects one unit above it, as a string', () => {
      expect(() => assetAmountToRaw('21000000001')).to.throw(/MAX_MONEY/);
      expect(() => assetAmountToRaw('21000000000.00000001')).to.throw(/MAX_MONEY/);
    });

    it('rejects one unit above it, as a number', () => {
      expect(() => assetAmountToRaw(21000000001)).to.throw(/MAX_MONEY/);
    });

    it('explains that the node would reject it with MoneyRange', () => {
      expect(() => assetAmountToRaw('99999999999')).to.throw(/MoneyRange/);
    });
  });

  describe('differential test against create-transaction assetUnitsToRaw', () => {
    // Guards the plan's requirement that a future "simplification" cannot
    // swap the strict helper for the upstream one. The upstream helper is
    // `BigInt(Math.round(value * 1e8))`, which is correct for ordinary
    // magnitudes; these are its two real, silent failure modes.
    it('disagrees past MAX_SAFE_INTEGER, where the product drops bits', () => {
      const strict = assetAmountToRaw('184467440.73709551');
      const upstream = assetUnitsToRaw(184467440.73709551);
      expect(strict).to.equal(18446744073709551n);
      expect(upstream).to.equal(18446744073709552n); // one unit off, silently
    });

    it('rejects what assetUnitsToRaw silently rounds away', () => {
      expect(assetUnitsToRaw(0.000000001)).to.equal(0n); // a whole amount vanishes
      expect(() => assetAmountToRaw(0.000000001)).to.throw(/at most 8/);

      expect(assetUnitsToRaw(1.123456789)).to.equal(112345679n); // 9th decimal folded in
      expect(() => assetAmountToRaw(1.123456789)).to.throw(/9 decimals/);
    });

    it('agrees on small, exactly representable values', () => {
      ['1', '2', '10', '0.5'].forEach(value => {
        expect(assetAmountToRaw(value)).to.equal(assetUnitsToRaw(Number(value)));
      });
    });
  });
});

describe('xnaAmountToSats', () => {
  it('scales exactly', () => {
    expect(xnaAmountToSats('0.015')).to.equal(1500000n);
    expect(xnaAmountToSats('1')).to.equal(100000000n);
  });

  it('rejects negatives by default and allows them explicitly', () => {
    expect(() => xnaAmountToSats('-0.001')).to.throw(/is negative/);
    expect(xnaAmountToSats('-0.001', { allowNegative: true })).to.equal(-100000n);
  });

  it('rejects sub-satoshi precision', () => {
    expect(() => xnaAmountToSats('0.000000001')).to.throw(/at most 8/);
  });
});

describe('formatRawAsDecimal', () => {
  const cases = [
    [0n, '0'],
    [1n, '0.00000001'],
    [100000000n, '1'],
    [125000000n, '1.25'],
    [2100000000000000000n, '21000000000'],
    [-100000n, '-0.001']
  ];

  cases.forEach(([raw, expected]) => {
    it(`renders ${raw} as "${expected}"`, () => {
      expect(formatRawAsDecimal(raw)).to.equal(expected);
    });
  });

  it('round-trips through assetAmountToRaw', () => {
    ['0.00000001', '1.25', '21000000000', '0.1', '0', '7'].forEach(text => {
      expect(formatRawAsDecimal(assetAmountToRaw(text))).to.equal(text);
    });
  });

  it('normalizes only the padding a decimal string carried', () => {
    expect(formatRawAsDecimal(assetAmountToRaw('1.00000000'))).to.equal('1');
    expect(formatRawAsDecimal(assetAmountToRaw('1.2500'))).to.equal('1.25');
  });
});

describe('rawToDisplayNumber', () => {
  it('returns an exact display number', () => {
    expect(rawToDisplayNumber(125000000n)).to.equal(1.25);
    expect(rawToDisplayNumber(1n)).to.equal(0.00000001);
  });

  it('fails closed when the display value is not exactly representable', () => {
    expect(() => rawToDisplayNumber(2100000000000000001n)).to.throw(/cannot be represented exactly/);
  });
});

describe('toProtocolInteger', () => {
  it('accepts bigint, integer string and safe integer number', () => {
    expect(toProtocolInteger(5n)).to.equal(5n);
    expect(toProtocolInteger('9007199254740993')).to.equal(9007199254740993n);
    expect(toProtocolInteger(500)).to.equal(500n);
  });

  it('rejects an unsafe number instead of preserving the corruption', () => {
    expect(() => toProtocolInteger(9007199254740993)).to.throw(/MAX_SAFE_INTEGER/);
    expect(() => toProtocolInteger(9007199254740993)).to.throw(/string or bigint/);
  });

  it('rejects non-integers and non-numeric text', () => {
    expect(() => toProtocolInteger(1.5)).to.throw(/not an integer/);
    expect(() => toProtocolInteger('1.5')).to.throw(/not an integer/);
    expect(() => toProtocolInteger(null)).to.throw(/received null/);
    expect(() => toProtocolInteger(undefined, 'utxo.satoshis')).to.throw(/utxo\.satoshis/);
  });
});

describe('sumProtocolIntegers', () => {
  it('sums exactly above MAX_SAFE_INTEGER', () => {
    const utxos = [{ satoshis: '9007199254740993' }, { satoshis: 7n }];
    expect(sumProtocolIntegers(utxos)).to.equal(9007199254741000n);
  });

  it('returns 0n for an empty or missing list', () => {
    expect(sumProtocolIntegers([])).to.equal(0n);
    expect(sumProtocolIntegers(undefined)).to.equal(0n);
  });

  it('propagates the rejection of an unsafe entry', () => {
    expect(() => sumProtocolIntegers([{ satoshis: 9007199254740993 }])).to.throw(/MAX_SAFE_INTEGER/);
  });
});

describe('expandScientificNotation', () => {
  const cases = [
    ['1e3', '1000'],
    ['1e-7', '0.0000001'],
    ['-2.5e2', '-250'],
    ['2.1e+19', '21000000000000000000'],
    ['1.5', '1.5']
  ];

  cases.forEach(([input, expected]) => {
    it(`expands "${input}" to "${expected}"`, () => {
      expect(expandScientificNotation(input)).to.equal(expected);
    });
  });
});
