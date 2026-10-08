import { describe, it, expect } from "vitest";
import {
  parseDecimal,
  tryParseDecimal,
  formatUnits,
  parseUnits,
  decimalToString,
  div,
  cmp,
  isPositive,
  ZERO,
} from "../decimal";

describe("decimal / token-amount conversion", () => {
  it("formats base units to human decimals", () => {
    expect(formatUnits("1230000000000000000", 18)).toBe("1.23");
    expect(formatUnits("1000000", 6)).toBe("1");
    expect(formatUnits("0", 18)).toBe("0");
  });

  it("parses human decimals to base units", () => {
    expect(parseUnits("1.23", 18)).toBe("1230000000000000000");
    expect(parseUnits("10", 18)).toBe("10000000000000000000");
    expect(parseUnits("1", 6)).toBe("1000000");
  });

  it("round-trips without precision loss", () => {
    const human = "0.05342";
    expect(formatUnits(parseUnits(human, 18), 18)).toBe(human);
  });

  it("rejects malformed decimals", () => {
    expect(tryParseDecimal("abc")).toBeNull();
    expect(tryParseDecimal("1.2.3")).toBeNull();
    expect(tryParseDecimal("")).toBeNull();
    expect(tryParseDecimal(null)).toBeNull();
  });

  it("exact arithmetic on decimals", () => {
    // 0.1 + 0.2 would be 0.30000000000000004 in float; exact here.
    const a = parseDecimal("0.1");
    const b = parseDecimal("0.2");
    const sum = { scaled: a.scaled + b.scaled };
    expect(decimalToString(sum, 10)).toBe("0.3");
  });

  it("divides with high precision", () => {
    const ten = parseDecimal("10");
    const three = parseDecimal("3");
    const q = div(ten, three);
    // 36-digit fixed point — far beyond float precision.
    expect(decimalToString(q, 18)).toBe("3.333333333333333333");
  });

  it("compares correctly", () => {
    expect(cmp(parseDecimal("1"), parseDecimal("2"))).toBe(-1);
    expect(cmp(parseDecimal("2"), parseDecimal("1"))).toBe(1);
    expect(cmp(parseDecimal("1.5"), parseDecimal("1.50"))).toBe(0);
    expect(isPositive(parseDecimal("0.0001"))).toBe(true);
    expect(isPositive(ZERO)).toBe(false);
  });
});
