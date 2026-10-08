import { describe, it, expect, beforeEach } from "vitest";
import { normalizeQuoteBody, failedQuote, normalizeBinanceError } from "../normalize";
import { rankQuotes } from "../rank";
import { routeIntent } from "../service";
import { getRepresentations, isCanonicalRepresentation } from "../../registry/registry";
import { parseRwaRatios, parseUnderlyingMarket } from "../../registry/market";
import type { NormalizedQuote, QuoteProvider } from "../types";
import type { BinanceClient } from "../../../lib/binance/client";

process.env.OC_API_KEY = "test-key";
process.env.OC_SECRET_KEY = "test-secret";
process.env.OC_BASE_URL = "https://web3.binance.com/build";

const reps = getRepresentations("NVDA");
const base = {
  provider: "ondo" as const,
  symbol: "NVDAon",
  contractAddress: reps[0].contractAddress,
  tokenDecimals: 18,
  tokenToShareRatio: "1.0017152487959898",
  ratioStatus: "verified" as const,
  notionalUsd: "10",
  latencyMs: 23,
};

function quote(overrides: Partial<NormalizedQuote> = {}): NormalizedQuote {
  return {
    provider: "ondo", symbol: "NVDAon", contractAddress: reps[0].contractAddress,
    available: true, vendorName: "venue", executionMode: "SWAP", inputAmountUsd: "10", inputAmountRaw: "10000000000000000000",
    outputTokenAmount: "0.1", estimatedUnderlyingShares: "0.1", effectiveUsdPerShare: "100",
    priceImpactPercent: null, tradeFee: null, estimatedGas: null, dexes: [], quoteId: "q",
    approveTarget: null, latencyMs: 10, ratioStatus: "verified", failureCode: null,
    failureReason: null, raw: {}, ...overrides,
  };
}

describe("Binance quote normalization", () => {
  it("uses only verified Binance fields and live ratio", () => {
    const raw = { data: { fromTokenAmount: "10000000000000000000", toTokenAmount: "2000000000000000000", vendorName: "1inch", executionMode: "SWAP", priceImpactPercent: "0.2", tradeFee: "0.01", estimateGasFee: "0.003", dexRouterList: [{ dexProtocol: { dexName: "PancakeSwap V3", percent: "60" }, fromToken: { tokenSymbol: "USDT" }, toToken: { tokenSymbol: "NVDAon" } }, { dexProtocol: { dexName: "Uniswap V4", percent: "40" }, fromToken: { tokenSymbol: "USDT" }, toToken: { tokenSymbol: "NVDAon" } }], quoteId: "q", approveTarget: "0x1" } };
    const normalized = normalizeQuoteBody({ ...base, provider: "bstock", symbol: "NVDAB", contractAddress: reps[1].contractAddress, tokenToShareRatio: "1.000778223752807865" }, raw);
    expect(normalized.available).toBe(true);
    expect(normalized.outputTokenAmount).toBe("2");
    expect(normalized.estimatedUnderlyingShares).toBe("1.9984447628");
    expect(normalized.vendorName).toBe("1inch");
    expect(normalized.executionMode).toBe("SWAP");
    expect(normalized.estimatedGas).toBe("0.003");
    expect(normalized.dexes?.[0].hops[0].dexName).toBe("PancakeSwap V3");
    expect(normalized.dexes?.[1].hops[0].dexName).toBe("Uniswap V4");
    expect(normalized.raw).toBe(raw);
  });

  it("fails closed for guessed/unsupported quote shapes", () => {
    const normalized = normalizeQuoteBody(base, { data: { toAmount: "2000000000000000000", vendor: "fake" } });
    expect(normalized.available).toBe(false);
    expect(normalized.failureCode).toBe("MALFORMED_QUOTE");
  });

  it("maps Binance 40374 to insufficient liquidity", () => {
    expect(normalizeBinanceError({ code: 40374, message: "Insufficient liquidity" })).toEqual({ code: "40374", reason: "Insufficient liquidity" });
  });

  it("does not hard-code execution mode", () => {
    const normalized = normalizeQuoteBody(base, { data: { fromTokenAmount: "100", toTokenAmount: "2000000000000000000", vendorName: "v" } });
    expect(normalized.executionMode).toBeNull();
  });

  it("does not rank an executable quote with an unverified ratio", () => {
    const normalized = normalizeQuoteBody({ ...base, ratioStatus: "unavailable", tokenToShareRatio: null }, { data: { fromTokenAmount: "100", toTokenAmount: "2000000000000000000" } });
    expect(normalized.available).toBe(true);
    expect(normalized.estimatedUnderlyingShares).toBeNull();
    expect(normalized.failureReason).toContain("unverified");
  });

  it("creates unavailable result for provider errors", () => {
    const q = failedQuote(base, "NETWORK", "timed out");
    expect(q.available).toBe(false);
    expect(q.failureCode).toBe("NETWORK");
  });
});

describe("RWA metadata and canonical identity", () => {
  it("requires exact contract, provider, and underlying matches", () => {
    const body = { data: [
      { tokenContractAddress: reps[0].contractAddress, platformId: "ondo", binanceChainId: "56", underlyingTicker: "NVDA", tokenToShareRatio: "1.0017152487959898" },
      { tokenContractAddress: reps[1].contractAddress, platformId: "bstock", binanceChainId: "56", underlyingTicker: "NVDA", tokenToShareRatio: "1.000778223752807865" },
    ] };
    const ratios = parseRwaRatios(body);
    expect(ratios[0].ratioStatus).toBe("verified");
    expect(ratios[1].tokenToShareRatio).toBe("1.000778223752807865");
    expect(ratios[2].ratioStatus).toBe("unavailable");
    expect(parseRwaRatios({ data: [{ tokenContractAddress: reps[0].contractAddress, platformId: "ondo", binanceChainId: "56", underlyingTicker: "FAKE", tokenToShareRatio: "2" }] })[0].ratioStatus).toBe("unavailable");
  });

  it("rejects fake contract even when symbol matches", () => {
    expect(isCanonicalRepresentation("NVDA", "ondo", "0x0000000000000000000000000000000000000001")).toBe(false);
  });
});

describe("market regime normalization", () => {
  it("normalizes known market status and preserves raw metadata", () => {
    const raw = { code: 0, msg: "success", data: { binanceChainId: "56", tokenContractAddress: reps[0].contractAddress, platformId: "ondo", statusInfo: { openState: true, marketStatus: "offhours", reasonCode: "TRADING", reasonMsg: null, nextOpenTime: 1791158700000, nextCloseTime: 1791158100000 }, marketData: { referencePrice: "234.432889" } }, success: true };
    const market = parseUnderlyingMarket(raw);
    expect(market.openState).toBe(true);
    expect(market.marketStatus).toBe("offhours");
    expect(market.reasonCode).toBe("TRADING");
    expect(market.nextOpenTime).toBe("1791158700000");
    expect(market.referencePrice).toBe("234.432889");
    expect(market.normalizedRegime).toBe("offhours");
    expect(market.raw).toBe(raw);
  });

  it("does not invent a regime from incomplete data", () => {
    expect(parseUnderlyingMarket({ code: 0, data: { statusInfo: {}, marketData: { referencePrice: "1" } } }).normalizedRegime).toBe("unknown");
  });
});

describe("rankQuotes", () => {
  it("selects greatest verified underlying-share output", () => {
    const result = rankQuotes([
      quote({ estimatedUnderlyingShares: "0.10" }),
      quote({ provider: "bstock", symbol: "NVDAB", estimatedUnderlyingShares: "0.11" }),
      quote({ provider: "xstock", symbol: "NVDAx", available: false, failureCode: "40374", failureReason: "Insufficient liquidity" }),
    ]);
    expect(result.selected?.provider).toBe("bstock");
    expect(result.rejected).toHaveLength(1);
  });

  it("rejects unverified, malformed, unavailable, and all unavailable routes", () => {
    const result = rankQuotes([
      quote({ ratioStatus: "unavailable", estimatedUnderlyingShares: null, failureReason: "unverified" }),
      quote({ provider: "bstock", symbol: "NVDAB", available: false, failureReason: "No liquidity" }),
    ]);
    expect(result.selected).toBeNull();
    expect(result.rejected.map((x) => x.code)).toEqual(["UNVERIFIED_RATIO", null]);
  });

  it("breaks equal-output ties deterministically", () => {
    const input = [quote({ provider: "xstock", symbol: "NVDAx" }), quote({ provider: "bstock", symbol: "NVDAB" }), quote({ provider: "ondo", symbol: "NVDAon" })];
    expect(rankQuotes(input).selected?.provider).toBe("bstock");
    expect(rankQuotes([...input].reverse()).selected?.provider).toBe("bstock");
  });
});

describe("routeIntent provider isolation", () => {
  beforeEach(() => {
    process.env.OC_API_KEY = "test-key";
    process.env.OC_SECRET_KEY = "test-secret";
    process.env.OC_BASE_URL = "https://web3.binance.com/build";
  });

  it("keeps other results if one provider rejects", async () => {
    const provider: QuoteProvider = { name: "test", async getQuote(req) {
      if (req.representation.provider === "xstock") throw new Error("provider down");
      return quote({ provider: req.representation.provider, symbol: req.representation.symbol, contractAddress: req.representation.contractAddress, estimatedUnderlyingShares: req.representation.provider === "bstock" ? "0.2" : "0.1" });
    } };
    const client: BinanceClient = { signedGet: async (_path, params) => ({ status: 200, body: { data: [{ tokenContractAddress: params.tokenContractAddress ?? reps[0].contractAddress, platform: "Ondo", underlyingTicker: "NVDA", tokenToShareRatio: "1" }] }, latencyMs: 1, signedPath: _path }), signedPost: async () => ({ status: 200, body: {}, latencyMs: 1, signedPath: "" }) };
    const result = await routeIntent({ ticker: "NVDA", notionalUsd: "10" }, provider, client);
    expect(result.quotes).toHaveLength(3);
    expect(result.quotes.find((q) => q.provider === "xstock")?.failureCode).toBe("PROVIDER_ERROR");
  });
});
