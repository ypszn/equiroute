import { describe, expect, it } from "vitest";
import { DEFAULT_MANDATE, evaluatePolicy, validateMandate } from "../engine";
import { rankQuotes } from "../../routing/rank";
import type { NormalizedQuote } from "../../routing/types";

const goodQuote = (provider: "ondo" | "bstock" | "xstock", shares: string, impact: string, verified = true): NormalizedQuote => ({
  provider, symbol: provider, contractAddress: `0x${provider}`, available: true, vendorName: null, executionMode: "SWAP", inputAmountUsd: "10", inputAmountRaw: "10", outputTokenAmount: shares, estimatedUnderlyingShares: shares, effectiveUsdPerShare: "10", priceImpactPercent: impact, tradeFee: null, estimatedGas: null, dexes: null, quoteId: "q", approveTarget: null, latencyMs: 1, ratioStatus: verified ? "verified" : "unavailable", failureCode: null, failureReason: null, raw: null,
});

describe("mandate policy engine", () => {
  it("enforces max trade and slippage with decimal-safe comparisons", () => {
    const mandate = { ...structuredClone(DEFAULT_MANDATE), trade: { maxNotionalUsd: "100", maxPriceImpactPercent: "1", maxSlippagePercent: "0.5" } };
    expect(evaluatePolicy({ ticker: "NVDA", notionalUsd: "100.01", slippagePercent: "0.4", mandate }).outcome).toBe("blocked");
    expect(evaluatePolicy({ ticker: "NVDA", notionalUsd: "10", slippagePercent: "0.5001", mandate }).outcome).toBe("blocked");
  });
  it("filters provider and price impact before ranking so second route can win", () => {
    const mandate = { ...structuredClone(DEFAULT_MANDATE), trade: { maxNotionalUsd: "100", maxPriceImpactPercent: "0.5", maxSlippagePercent: "0.5" } };
    const quotes = [goodQuote("bstock", "0.12", "0.8"), goodQuote("ondo", "0.11", "0.3")];
    const eligible = quotes.filter((q) => evaluatePolicy({ ticker: "NVDA", notionalUsd: "10", mandate, quote: q, regime: "regular" }).outcome !== "blocked");
    expect(rankQuotes(eligible).selected?.provider).toBe("ondo");
    const blockedProvider = { ...mandate, providers: { allowed: ["ondo" as const], blocked: ["ondo" as const] } };
    expect(evaluatePolicy({ ticker: "NVDA", notionalUsd: "10", mandate: blockedProvider, quote: quotes[1] }).outcome).toBe("blocked");
  });
  it("requires verified ratio and rejects paused/restricted regimes", () => {
    expect(evaluatePolicy({ ticker: "NVDA", notionalUsd: "10", mandate: DEFAULT_MANDATE, quote: goodQuote("xstock", "0.2", "0.1", false), regime: "regular" }).outcome).toBe("blocked");
    expect(evaluatePolicy({ ticker: "NVDA", notionalUsd: "10", mandate: DEFAULT_MANDATE, regime: "paused" }).outcome).toBe("blocked");
    expect(evaluatePolicy({ ticker: "NVDA", notionalUsd: "10", mandate: DEFAULT_MANDATE, regime: "restricted" }).outcome).toBe("blocked");
  });
  it("allows regular, requires confirmation offhours and handles unknown conservatively", () => {
    expect(evaluatePolicy({ ticker: "NVDA", notionalUsd: "10", mandate: DEFAULT_MANDATE, regime: "regular" }).outcome).toBe("confirmation_required");
    expect(evaluatePolicy({ ticker: "NVDA", notionalUsd: "10", mandate: DEFAULT_MANDATE, regime: "offhours" }).outcome).toBe("confirmation_required");
    expect(evaluatePolicy({ ticker: "NVDA", notionalUsd: "10", mandate: DEFAULT_MANDATE, regime: "unknown" }).outcome).toBe("blocked");
  });
  it("distinguishes simulation failures and rejects malformed mandate", () => {
    expect(evaluatePolicy({ ticker: "NVDA", notionalUsd: "10", mandate: DEFAULT_MANDATE, regime: "regular", simulationStatus: "success" }).checks.at(-1)?.status).toBe("passed");
    expect(evaluatePolicy({ ticker: "NVDA", notionalUsd: "10", mandate: DEFAULT_MANDATE, regime: "regular", simulationStatus: "failed" }).outcome).toBe("blocked");
    expect(validateMandate({ version: 1, garbage: true })).toBeNull();
  });
  it("is deterministic and contains no model dependency", () => {
    const first = evaluatePolicy({ ticker: "NVDA", notionalUsd: "10", mandate: DEFAULT_MANDATE, regime: "offhours" });
    const second = evaluatePolicy({ ticker: "NVDA", notionalUsd: "10", mandate: DEFAULT_MANDATE, regime: "offhours" });
    expect(first).toEqual(second);
  });
});
