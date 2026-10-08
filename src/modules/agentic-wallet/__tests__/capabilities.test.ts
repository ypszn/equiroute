import { describe, expect, it } from "vitest";
import { BAW_READ_ONLY_ALLOWLIST, createBawClient, BawCliError } from "../baw-client";
import { BSC_USDT, classifyQuoteError, normalizeQuoteCapability, NVDA_AGENTIC_TARGETS } from "../capabilities";
import type { AgenticWalletClient } from "../types";

describe("read-only Agentic Wallet quote capability", () => {
  it("allows canonical fixed quote and never allows swap", async () => {
    const calls: string[][] = [];
    const client = createBawClient(async (_file, args) => { calls.push(args); return { stdout: JSON.stringify({ success: true, data: { fromCoinSymbol: "USDT", fromCoinAmount: "10", toCoinSymbol: "NVDAB", toCoinAmount: "0.04", slippage: 0.005 } }), stderr: "" }; });
    await client.quoteMarketOrder({ fromTokenQty: "10", fromToken: BSC_USDT, toToken: NVDA_AGENTIC_TARGETS.bstock, binanceChainId: "56", slippage: "0.5" });
    expect(calls[0]).toEqual(["market-order", "quote", "--fromTokenQty", "10", "--fromToken", BSC_USDT, "--toToken", NVDA_AGENTIC_TARGETS.bstock, "--binanceChainId", "56", "--slippage", "0.5", "--json"]);
    expect(BAW_READ_ONLY_ALLOWLIST.size).toBe(7);
    expect([...BAW_READ_ONLY_ALLOWLIST].some((entry) => entry.startsWith("market-order"))).toBe(false);
    expect([...BAW_READ_ONLY_ALLOWLIST].some((entry) => entry.startsWith("market-order swap"))).toBe(false);
    await expect(client.quoteMarketOrder({ fromTokenQty: "10", fromToken: BSC_USDT, toToken: "0x000000000000000000000000000000000000dead", binanceChainId: "56", slippage: "0.5" })).rejects.toThrow(/canonical NVDA/);
    await expect(client.quoteMarketOrder({ fromTokenQty: "10", fromToken: "0x000000000000000000000000000000000000beef", toToken: NVDA_AGENTIC_TARGETS.bstock, binanceChainId: "56", slippage: "0.5" })).rejects.toThrow(/canonical BSC USDT/);
  });
  it("parses success as quote support while execution remains unverified", () => {
    const result = normalizeQuoteCapability({ success: true, data: { fromCoinSymbol: "USDT", fromCoinAmount: "10", toCoinSymbol: "NVDAB", toCoinAmount: "0.04", slippage: 0.005 } }, 25);
    expect(result.quote).toBe("supported");
    expect(result.execution).toBe("unverified");
    expect(result.details.toAmount).toBe("0.04");
  });
  it("distinguishes liquidity-unavailable from explicit unsupported", () => {
    expect(classifyQuoteError({ success: false, code: 40374, msg: "Insufficient liquidity" }).capability).toBe("unavailable");
    expect(classifyQuoteError({ success: false, code: "UNSUPPORTED_TOKEN", msg: "Token not supported on this chain" }).capability).toBe("unsupported");
    expect(normalizeQuoteCapability(null, 1, new BawCliError("CLI_TIMEOUT", "timed out")).quote).toBe("unknown");
  });
  it("probes each representation independently", async () => {
    const seen: string[] = [];
    const client = { quoteMarketOrder: async (input: { toToken: string }) => { seen.push(input.toToken); if (input.toToken === NVDA_AGENTIC_TARGETS.xstock) throw new BawCliError("COMMAND_FAILED", "Insufficient liquidity", { code: 40374, message: "Insufficient liquidity" }); return { success: true, data: { fromCoinSymbol: "USDT", fromCoinAmount: "10", toCoinSymbol: "NVDA", toCoinAmount: "0.04", slippage: 0.005 } };     } } as unknown as AgenticWalletClient;
    const { probeNvdaCapabilities } = await import("../capabilities");
    const result = await probeNvdaCapabilities(client);
    expect(result.bstock.quote).toBe("supported");
    expect(result.ondo.quote).toBe("supported");
    expect(result.xstock.quote).toBe("unavailable");
    expect(new Set(seen).size).toBe(3);
    expect(result.bstock.execution).toBe("unverified");
    expect(result.xstock.execution).toBe("unverified");
  });
});
