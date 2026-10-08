/**
 * Arbitrary-precision decimal arithmetic for routing math.
 *
 * Uses BigInt-scaled fixed point internally. All inputs are decimal strings —
 * never floats — so no IEEE-754 rounding contaminates comparisons.
 */

const SCALE_DIGITS = 36;
const SCALE = 10n ** BigInt(SCALE_DIGITS);

/** Internal fixed-point representation. */
export type Decimal = { scaled: bigint };

/** Parse a decimal string like "10", "0.001", "-3.5" into a Decimal. */
export function parseDecimal(input: string): Decimal {
  const s = input.trim();
  const m = s.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!m) {
    throw new Error(`Invalid decimal: "${input}"`);
  }
  const sign = m[1] === "-" ? -1n : 1n;
  const intPart = BigInt(m[2]);
  const fracPart = m[3] ?? "";
  const fracScaled = BigInt(fracPart.padEnd(SCALE_DIGITS, "0").slice(0, SCALE_DIGITS) || "0");
  return { scaled: sign * (intPart * SCALE + fracScaled) };
}

/** Attempt to parse; returns null on malformed input instead of throwing. */
export function tryParseDecimal(input: string | null | undefined): Decimal | null {
  if (input === null || input === undefined) return null;
  try {
    return parseDecimal(input);
  } catch {
    return null;
  }
}

export const ZERO: Decimal = { scaled: 0n };
export const ONE: Decimal = { scaled: SCALE };

export function isZero(d: Decimal): boolean {
  return d.scaled === 0n;
}

export function isPositive(d: Decimal): boolean {
  return d.scaled > 0n;
}

export function isNegative(d: Decimal): boolean {
  return d.scaled < 0n;
}

export function add(a: Decimal, b: Decimal): Decimal {
  return { scaled: a.scaled + b.scaled };
}

export function sub(a: Decimal, b: Decimal): Decimal {
  return { scaled: a.scaled - b.scaled };
}

export function mul(a: Decimal, b: Decimal): Decimal {
  return { scaled: (a.scaled * b.scaled) / SCALE };
}

/** Divide; throws on division by zero. */
export function div(a: Decimal, b: Decimal): Decimal {
  if (b.scaled === 0n) throw new Error("Division by zero");
  return { scaled: (a.scaled * SCALE) / b.scaled };
}

/** Compare: -1 if a<b, 0 if equal, 1 if a>b. */
export function cmp(a: Decimal, b: Decimal): number {
  if (a.scaled < b.scaled) return -1;
  if (a.scaled > b.scaled) return 1;
  return 0;
}

export function min(a: Decimal, b: Decimal): Decimal {
  return cmp(a, b) <= 0 ? a : b;
}

export function max(a: Decimal, b: Decimal): Decimal {
  return cmp(a, b) >= 0 ? a : b;
}

/**
 * Convert a base-unit integer amount ("1230000000000000000") to a human
 * decimal given token decimals (18 → "1.23").
 */
export function formatUnits(rawAmount: string, decimals: number): string {
  const n = BigInt(rawAmount);
  const negative = n < 0n;
  const abs = negative ? -n : n;
  const str = abs.toString().padStart(decimals + 1, "0");
  const intPart = str.slice(0, str.length - decimals) || "0";
  const fracPart = decimals > 0 ? str.slice(str.length - decimals) : "";
  const trimmedFrac = fracPart.replace(/0+$/, "");
  const result = trimmedFrac.length > 0 ? `${intPart}.${trimmedFrac}` : intPart;
  return negative ? `-${result}` : result;
}

/**
 * Convert a human decimal ("1.23") to a base-unit integer string given token
 * decimals (18 → "1230000000000000000"). Truncates excess precision.
 */
export function parseUnits(humanAmount: string, decimals: number): string {
  const s = humanAmount.trim();
  const m = s.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!m) throw new Error(`Invalid decimal: "${humanAmount}"`);
  const negative = m[1] === "-";
  const intPart = m[2];
  const fracPart = (m[3] ?? "").padEnd(decimals, "0").slice(0, decimals);
  const raw = BigInt(intPart + (decimals > 0 ? fracPart : ""));
  return (negative ? -raw : raw).toString();
}

/**
 * Convert a Decimal back to a canonical decimal string, trimming trailing
 * zeros. Precision beyond `maxDecimals` is truncated.
 */
export function decimalToString(d: Decimal, maxDecimals = 8): string {
  const negative = d.scaled < 0n;
  const abs = negative ? -d.scaled : d.scaled;
  const str = abs.toString().padStart(SCALE_DIGITS + 1, "0");
  const intPart = str.slice(0, str.length - SCALE_DIGITS) || "0";
  let frac = str.slice(str.length - SCALE_DIGITS);
  if (maxDecimals >= 0) {
    frac = frac.slice(0, Math.max(maxDecimals, 0));
  }
  frac = frac.replace(/0+$/, "");
  const out = frac.length > 0 ? `${intPart}.${frac}` : intPart;
  return negative && out !== "0" ? `-${out}` : out;
}
