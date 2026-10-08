import { tryParseDecimal, div, formatUnits, decimalToString, isPositive } from "./decimal";
import type { EquityProvider, RatioStatus } from "../registry/types";
import type { DexRoute, DexRouteHop, NormalizedQuote } from "./types";

export type Body = Record<string, unknown>;

export function isBody(value: unknown): value is Body {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function pickString(body: Body, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    const text = optionalText(value);
    if (text !== null && text.length > 0) return text;
  }
  return null;
}
function optionalText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function unwrapQuote(body: unknown): Body | null {
  if (!isBody(body)) return null;
  if (isBody(body.data)) return body.data;
  if (Array.isArray(body.data)) {
    const first = body.data[0];
    return isBody(first) ? first : null;
  }
  if (pickString(body, ["toTokenAmount"]) !== null) return body;
  return null;
}

export function parseDexRoutes(body: Body): DexRoute[] | null {
  if (!Array.isArray(body.dexRouterList)) return null;
  return body.dexRouterList.map((route): DexRoute => {
    const routeRecord = isBody(route) ? route : {};
    const dexRecord = isBody(routeRecord.dexProtocol) ? routeRecord.dexProtocol : {};
    const fromToken = isBody(routeRecord.fromToken) ? routeRecord.fromToken : {};
    const toToken = isBody(routeRecord.toToken) ? routeRecord.toToken : {};
    const hop: DexRouteHop = {
      dexName: pickString(dexRecord, ["dexName"]),
      percent: pickString(dexRecord, ["percent"]),
      fromTokenSymbol: pickString(fromToken, ["tokenSymbol"]),
      toTokenSymbol: pickString(toToken, ["tokenSymbol"]),
      fromTokenIndex: pickString(routeRecord, ["fromTokenIndex"]),
      toTokenIndex: pickString(routeRecord, ["toTokenIndex"]),
      raw: route,
    };
    return { hops: [hop], raw: route };
  });
}

export type NormalizeInput = {
  provider: EquityProvider;
  symbol: string;
  contractAddress: string;
  tokenDecimals: number;
  tokenToShareRatio: string | null;
  ratioStatus: RatioStatus;
  notionalUsd: string;
  latencyMs: number;
};

export function normalizeQuoteBody(input: NormalizeInput, rawBody: unknown): NormalizedQuote {
  const body = unwrapQuote(rawBody);
  const code = isBody(rawBody) ? optionalText(rawBody.code) : null;
  const message = isBody(rawBody) ? optionalText(rawBody.message) ?? optionalText(rawBody.msg) : null;
  const common = {
    provider: input.provider,
    symbol: input.symbol,
    contractAddress: input.contractAddress,
    vendorName: body ? optionalText(body.vendorName) : null,
    executionMode: body ? optionalText(body.executionMode) : null,
    inputAmountUsd: input.notionalUsd,
    inputAmountRaw: body ? pickString(body, ["fromTokenAmount"]) : null,
    outputTokenAmount: null as string | null,
    estimatedUnderlyingShares: null as string | null,
    effectiveUsdPerShare: null as string | null,
    priceImpactPercent: body ? optionalText(body.priceImpactPercent) : null,
    tradeFee: body ? optionalText(body.tradeFee) : null,
    estimatedGas: body ? optionalText(body.estimateGasFee) : null,
    dexes: body ? parseDexRoutes(body) : null,
    quoteId: body ? optionalText(body.quoteId) : null,
    approveTarget: body ? optionalText(body.approveTarget) : null,
    latencyMs: input.latencyMs,
    ratioStatus: input.ratioStatus,
    tokenToShareRatio: input.tokenToShareRatio,
    raw: rawBody,
  };
  if (!body) {
    return { ...common, available: false, failureCode: "MALFORMED_QUOTE", failureReason: "Binance quote response missing data.toTokenAmount or verified quote fields" };
  }
  if (code !== null && code !== "0" && code !== "200" && code !== "000000") {
    return { ...common, available: false, failureCode: code, failureReason: message ?? `Binance quote rejected (${code})` };
  }
  const fromAmount = pickString(body, ["fromTokenAmount"]);
  const toAmount = pickString(body, ["toTokenAmount"]);
  if (fromAmount === null || toAmount === null) {
    return { ...common, available: false, failureCode: "MALFORMED_QUOTE", failureReason: "Binance quote missing fromTokenAmount or toTokenAmount" };
  }
  let humanOutput: string;
  try {
    humanOutput = formatUnits(toAmount, input.tokenDecimals);
  } catch {
    return { ...common, available: false, failureCode: "MALFORMED_QUOTE", failureReason: "Binance toTokenAmount is not an integer base-unit amount" };
  }
  const out = tryParseDecimal(humanOutput);
  if (out === null || !isPositive(out)) {
    return { ...common, outputTokenAmount: humanOutput, available: false, failureCode: "MALFORMED_QUOTE", failureReason: "Binance quote has no positive output amount" };
  }
  if (input.ratioStatus !== "verified" || input.tokenToShareRatio === null) {
    return { ...common, outputTokenAmount: humanOutput, available: true, failureCode: null, failureReason: "Executable quote; excluded from normalized exposure ranking because wrapper ratio is unverified" };
  }
  const ratio = tryParseDecimal(input.tokenToShareRatio);
  if (ratio === null || !isPositive(ratio)) {
    return { ...common, outputTokenAmount: humanOutput, available: true, failureCode: null, failureReason: "Executable quote; excluded from normalized exposure ranking because wrapper ratio metadata is invalid" };
  }
  const shares = div(out, ratio);
  const effective = div(tryParseDecimal(input.notionalUsd) ?? out, shares);
  return {
    ...common,
    outputTokenAmount: humanOutput,
    estimatedUnderlyingShares: decimalToString(shares, 10),
    effectiveUsdPerShare: decimalToString(effective, 6),
    available: true,
    failureCode: null,
    failureReason: null,
  };
}

export function failedQuote(
  input: Omit<NormalizeInput, "latencyMs"> & { latencyMs?: number },
  code: string,
  reason: string,
  raw: unknown = null,
): NormalizedQuote {
  return {
    provider: input.provider,
    symbol: input.symbol,
    contractAddress: input.contractAddress,
    available: false,
    vendorName: null,
    executionMode: null,
    inputAmountUsd: input.notionalUsd,
    inputAmountRaw: null,
    outputTokenAmount: null,
    estimatedUnderlyingShares: null,
    effectiveUsdPerShare: null,
    priceImpactPercent: null,
    tradeFee: null,
    estimatedGas: null,
    dexes: null,
    quoteId: null,
    approveTarget: null,
    latencyMs: input.latencyMs ?? 0,
    ratioStatus: input.ratioStatus,
    tokenToShareRatio: input.tokenToShareRatio,
    failureCode: code,
    failureReason: reason,
    raw,
  };
}

/** Binance's documented code 40374 maps specifically to insufficient liquidity. */
export function normalizeBinanceError(body: unknown): { code: string; reason: string } | null {
  if (!isBody(body)) return null;
  const code = optionalText(body.code);
  const message = optionalText(body.message) ?? optionalText(body.msg);
  if (code === "40374") return { code, reason: message ?? "Insufficient executable liquidity" };
  if (code && code !== "0" && code !== "200" && code !== "000000") {
    return { code, reason: message ?? `Binance quote rejected (${code})` };
  }
  return null;
}
