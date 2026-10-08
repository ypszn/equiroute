import type { AgenticWalletCapability, CanonicalCapabilityMap } from "./types";
import type { AgenticWalletClient } from "./types";
import { BawCliError } from "./baw-client";

export const NVDA_AGENTIC_TARGETS = {
  bstock: "0x02fca66c1d1afb4e2a7884261eb00f63598a7436",
  ondo: "0xa9ee28c80f960b889dfbd1902055218cba016f75",
  xstock: "0xc845b2894dbddd03858fd2d643b4ef725fe0849d",
} as const;
export const BSC_USDT = "0x55d398326f99059ff775485246999027b3197955";

function object(value: unknown): Record<string, unknown> | null { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function text(value: unknown): string | null { return typeof value === "string" || typeof value === "number" ? String(value) : null; }
function numberCode(value: unknown): string | number | null { return typeof value === "string" || typeof value === "number" ? value : null; }
function getPayload(root: unknown): Record<string, unknown> | null {
  const top = object(root);
  if (!top) return null;
  const data = top.data;
  if (Array.isArray(data)) return object(data[0]);
  return object(data) ?? top;
}

export function classifyQuoteError(root: unknown): { capability: AgenticWalletCapability["quote"]; code: string | number | null; message: string | null } {
  const top = object(root); const error = object(top?.error); const payload = getPayload(root);
  const code = numberCode(error?.code ?? top?.code ?? payload?.code);
  const message = text(error?.message ?? top?.msg ?? top?.message ?? payload?.msg ?? payload?.message) ?? "";
  const normalized = (message ?? "").toLowerCase();
  if (/insufficient liquidity|no liquidity|liquidity unavailable/.test(normalized)) return { capability: "unavailable", code, message };
  if (/unsupported token|token not supported|unsupported route|not supported on this chain/.test(normalized)) return { capability: "unsupported", code, message };
  return { capability: "unknown", code, message };
}

export function normalizeQuoteCapability(root: unknown, durationMs = 0, error?: unknown): AgenticWalletCapability {
  if (error) {
    if (error instanceof BawCliError && error.code === "COMMAND_FAILED") {
      const classified = classifyQuoteError(error.response);
      return { quote: classified.capability, execution: "unverified", details: { success: false, code: classified.code, message: classified.message ?? error.message, fromSymbol: null, fromAmount: null, toSymbol: null, toAmount: null, slippage: null, durationMs, errorClass: classified.capability === "unknown" ? error.code : null } };
    }
    return { quote: "unknown", execution: "unverified", details: { success: null, code: null, message: error instanceof Error ? error.message : String(error), fromSymbol: null, fromAmount: null, toSymbol: null, toAmount: null, slippage: null, durationMs, errorClass: error instanceof BawCliError ? error.code : "CLI_ERROR" } };
  }
  const top = object(root); const data = getPayload(root);
  if (!top || !data) return { quote: "unknown", execution: "unverified", details: { success: null, code: null, message: "Malformed quote response", fromSymbol: null, fromAmount: null, toSymbol: null, toAmount: null, slippage: null, durationMs, errorClass: "MALFORMED_JSON" } };
  const success = top.success === true;
  if (!success) {
    const failure = classifyQuoteError(root);
    return { quote: failure.capability, execution: "unverified", details: { success: false, code: failure.code, message: failure.message, fromSymbol: null, fromAmount: null, toSymbol: null, toAmount: null, slippage: null, durationMs, errorClass: failure.capability === "unknown" ? "QUOTE_FAILED" : null } };
  }
  const required = ["fromCoinSymbol", "fromCoinAmount", "toCoinSymbol", "toCoinAmount"] as const;
  if (required.some((key) => text(data[key]) === null)) return { quote: "unknown", execution: "unverified", details: { success: true, code: numberCode(top.code), message: text(top.msg), fromSymbol: null, fromAmount: null, toSymbol: null, toAmount: null, slippage: text(data.slippage), durationMs, errorClass: "MALFORMED_RESPONSE" } };
  return { quote: "supported", execution: "unverified", details: { success: true, code: numberCode(top.code), message: text(top.msg), fromSymbol: text(data.fromCoinSymbol), fromAmount: text(data.fromCoinAmount), toSymbol: text(data.toCoinSymbol), toAmount: text(data.toCoinAmount), slippage: text(data.slippage), durationMs } };
}

export async function probeNvdaCapabilities(client: AgenticWalletClient, input: { fromTokenQty?: string; slippage?: string } = {}): Promise<CanonicalCapabilityMap> {
  const fromTokenQty = input.fromTokenQty ?? "10";
  const slippage = input.slippage ?? "0.5";
  const providers = Object.entries(NVDA_AGENTIC_TARGETS) as Array<[keyof CanonicalCapabilityMap, string]>;
  const results = await Promise.all(providers.map(async ([provider, target]) => {
    const start = Date.now();
    try {
      const response = await client.quoteMarketOrder({ fromTokenQty, fromToken: BSC_USDT, toToken: target, binanceChainId: "56", slippage });
      return [provider, normalizeQuoteCapability(response, Date.now() - start)] as const;
    } catch (error) {
      return [provider, normalizeQuoteCapability(null, Date.now() - start, error)] as const;
    }
  }));
  return Object.fromEntries(results) as CanonicalCapabilityMap;
}

/** Single fresh quote for one already-selected representation. Used by the execution gate to avoid duplicate CLI calls. */
export async function quoteSelectedRepresentation(client: AgenticWalletClient, input: { toToken: string; fromTokenQty: string; slippage: string }): Promise<AgenticWalletCapability> {
  const start = Date.now();
  try {
    const response = await client.quoteMarketOrder({ fromTokenQty: input.fromTokenQty, fromToken: BSC_USDT, toToken: input.toToken, binanceChainId: "56", slippage: input.slippage });
    return normalizeQuoteCapability(response, Date.now() - start);
  } catch (error) {
    return normalizeQuoteCapability(null, Date.now() - start, error);
  }
}
