import { describe, it, expect } from "vitest";
import { parseRwaRatios, parseUnderlyingMarket } from "../market";
import { getRepresentations } from "../registry";
import { normalizeQuoteBody } from "../../routing/normalize";
import { rankQuotes } from "../../routing/rank";
import type { NormalizedQuote } from "../../routing/types";

const reps = getRepresentations("NVDA");

describe("live Binance RWA and market envelopes", () => {
  it("unwraps token envelope and requires exact chain/address/provider/ticker identity", () => {
    const rows = [
      { binanceChainId: "56", tokenContractAddress: reps[0].contractAddress, platformId: "ondo", underlyingTicker: "NVDA", tokenToShareRatio: "1.0017152487959898" },
      { binanceChainId: "56", tokenContractAddress: reps[1].contractAddress, platformId: "bstock", underlyingTicker: "NVDA", tokenToShareRatio: "1.000778223752807865" },
      { binanceChainId: "56", tokenContractAddress: reps[2].contractAddress, platformId: null, underlyingTicker: "NVDA", tokenToShareRatio: null },
    ];
    const parsed = parseRwaRatios({ code: 0, msg: "success", data: rows, success: true });
    expect(parsed[0].ratioStatus).toBe("verified");
    expect(parsed[0].tokenToShareRatio).toBe("1.0017152487959898");
    expect(parsed[1].ratioStatus).toBe("verified");
    expect(parsed[1].tokenToShareRatio).toBe("1.000778223752807865");
    expect(parsed[2].ratioStatus).toBe("unavailable");
    const mismatchedChain = parseRwaRatios({ data: [{ ...rows[0], binanceChainId: "1" }] });
    expect(mismatchedChain[0].ratioStatus).toBe("unavailable");
    const mismatchedPlatform = parseRwaRatios({ data: [{ ...rows[0], platformId: "bstock" }] });
    expect(mismatchedPlatform[0].ratioStatus).toBe("unavailable");
  });

  it("reads statusInfo and marketData from data envelope without inferring missing values", () => {
    const raw = { code: 0, msg: "success", data: { statusInfo: { openState: true, marketStatus: "offhours", reasonCode: "TRADING", reasonMsg: null }, marketData: { referencePrice: "234.432889" } }, success: true };
    const parsed = parseUnderlyingMarket(raw);
    expect(parsed.openState).toBe(true);
    expect(parsed.marketStatus).toBe("offhours");
    expect(parsed.reasonCode).toBe("TRADING");
    expect(parsed.reasonMsg).toBeNull();
    expect(parsed.referencePrice).toBe("234.432889");
    expect(parsed.normalizedRegime).toBe("offhours");
    expect(parsed.raw).toBe(raw);
    expect(parseUnderlyingMarket({ data: { statusInfo: {}, marketData: {} } }).normalizedRegime).toBe("unknown");
  });
});

describe("verified quote normalization and rank eligibility", () => {
  const normalizeInput = {
    provider: "ondo" as const, symbol: "NVDAon", contractAddress: reps[0].contractAddress,
    tokenDecimals: 18, tokenToShareRatio: "1.0017152487959898", ratioStatus: "verified" as const,
    notionalUsd: "10", latencyMs: 17,
  };
  const liveQuote = (ratioStatus: "verified" | "unavailable", ratio: string | null): NormalizedQuote => normalizeQuoteBody(
    { ...normalizeInput, tokenToShareRatio: ratio, ratioStatus },
    { code: 0, msg: "success", data: [{ quoteId: "abc", vendorName: "LiquidMesh", executionMode: "SWAP", fromTokenAmount: "10000000000000000000", toTokenAmount: "42555500620531883", priceImpactPercent: "0.00056", tradeFee: "0.02", estimateGasFee: "450000", approveTarget: "0xabc", dexRouterList: [
      { dexProtocol: { dexName: "PancakeSwap V3", percent: "60" }, fromToken: { tokenSymbol: "USDT" }, toToken: { tokenSymbol: "WBNB" } },
      { dexProtocol: { dexName: "Uniswap V4", percent: "40" }, fromToken: { tokenSymbol: "WBNB" }, toToken: { tokenSymbol: "NVDAon" } },
    ] }], success: true },
  );

  it("normalizes output tokens to shares by dividing token amount by tokens-per-share ratio", () => {
    const quote = normalizeQuoteBody(normalizeInput, { code: 0, data: [{ fromTokenAmount: "10000000000000000000", toTokenAmount: "42555500620531883", vendorName: "LiquidMesh", executionMode: "SWAP" }] });
    // 0.042555500620531883 tokens / 1.0017152487959898 tokens per share.
    expect(quote.estimatedUnderlyingShares).toBe("0.0424826323");
    expect(quote.effectiveUsdPerShare).toBe("235.39031");
  });

  it("preserves multi-route DEX composition and raw Binance payload", () => {
    const quote = liveQuote("verified", normalizeInput.tokenToShareRatio);
    expect(quote.dexes).toHaveLength(2);
    expect(quote.dexes?.[0].hops[0].dexName).toBe("PancakeSwap V3");
    expect(quote.dexes?.[1].hops[0].fromTokenSymbol).toBe("WBNB");
    expect(quote.raw).toEqual(expect.objectContaining({ success: true }));
    expect(quote.vendorName).toBe("LiquidMesh");
    expect(quote.executionMode).toBe("SWAP");
    expect(quote.quoteId).toBe("abc");
    expect(quote.approveTarget).toBe("0xabc");
  });

  it("verified executable routes rank, unverified executable routes do not", () => {
    const verified = liveQuote("verified", normalizeInput.tokenToShareRatio);
    const unverified = liveQuote("unavailable", null);
    const result = rankQuotes([unverified, verified]);
    expect(result.selected).toBe(verified);
    expect(result.rejected[0].code).toBe("UNVERIFIED_RATIO");
  });
});
