import { describe, it, expect } from "vitest";
import { runAgenticPreflight } from "../preflight";
import type { AgenticWalletClient } from "../types";

const walletAddress = "0x1111111111111111111111111111111111111111";
const client: AgenticWalletClient = {
  getStatus: async () => ({ data: { status: "CONNECTED" } }),
  getAddress: async () => ({ data: { addresses: [{ binanceChainId: "56", address: walletAddress }] } }),
  getChains: async () => ({ data: [{ binanceChainId: "56" }] }),
  getBalances: async () => ({ data: [{ symbol: "USDT", address: "usdt", binanceChainId: "56", balance: "20" }, { symbol: "BNB", address: "bnb", binanceChainId: "56", balance: "0.1" }] }),
  getSettings: async () => ({ data: { dailyLimit: 100, quotaLeft: 90, quotaUsed: 10, tradeAllTokens: true } }),
  cliCheck: async () => ({}),   skillCheck: async () => ({}),
  quoteMarketOrder: async () => ({ success: true, data: { fromCoinSymbol: "USDT", fromCoinAmount: "10", toCoinSymbol: "NVDAB", toCoinAmount: "0.04", slippage: 0.005 } }),
};

describe("Agentic preflight identity source", () => {
  it("uses BAW address as EquiRoute's preparation wallet, not browser input", async () => {
    const captured: Array<{ userWalletAddress: string }> = [];
    const prepare = async (value: { userWalletAddress: string }) => {
      captured.push(value);
      return {
        intent: { ticker: "NVDA", notionalUsd: "10", userWalletAddress: value.userWalletAddress, slippagePercent: "0.5" },
        marketContext: null, route: { selected: null, alternatives: [] }, preparation: { status: "no_route", stateCode: "NO_POLICY_COMPLIANT_ROUTE", preparedRoute: null, approval: null, rfq: null, reason: "No route" },
        simulation: { attempted: false, status: "not_available", binanceStatus: null, failReason: null, balanceChanges: [], allowanceChanges: [], failureClassification: null, transactionFidelity: null, raw: null }, safetyChecks: [], policyDecision: { outcome: "blocked", checks: [], blockingReasons: [], confirmationReasons: [] }, receipt: null,
      };
    };
    const result = await runAgenticPreflight({ ticker: "NVDA", notionalUsd: "10", slippagePercent: "0.5" }, client, prepare as never);
    expect(captured[0].userWalletAddress).toBe(walletAddress);
    expect(result.wallet.address).toBe(walletAddress);
    expect(result.readiness.outcome).toBe("blocked");
  });
});
