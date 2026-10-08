import { describe, expect, it } from "vitest";
import { evaluateWalletReadiness } from "../service";
import { buildAgenticPreflightReceipt } from "../receipt";
import type { AgenticWalletState } from "../types";

const wallet: AgenticWalletState = { connection: "connected", address: "0x1111111111111111111111111111111111111111", bscSupported: true, balances: { usdt: "20", bnb: "0.1" }, quota: { dailyLimit: "1000", used: "0", remaining: "1000", date: "today" }, security: { abnormalTxnHandling: "AutoReject", tradeAllTokens: true }, developerMode: { enabled: false, expiresAt: null, dailyLimit: null, balanceExceeded: null }, sessionExpireTime: null, errorCode: null };

describe("Agentic preflight receipt dual policy boundaries", () => {
  it("serializes wallet readiness separately from EquiRoute mandate decision", () => {
    const readiness = evaluateWalletReadiness({ wallet, amountUsd: "10", requestedAddress: wallet.address, txFrom: wallet.address, simulationFrom: wallet.address, provider: "bstock", equiRouteOutcome: "confirmation_required" });
    const receipt = buildAgenticPreflightReceipt({ wallet, preparation: null, readiness, equiRoutePolicy: { outcome: "confirmation_required", checks: [], blockingReasons: [], confirmationReasons: ["offhours"] }, capabilities: null });
    expect(receipt.equiRoutePolicy).toMatchObject({ outcome: "confirmation_required" });
    expect(receipt.finalExecutionReadiness.agenticWallet.executionCompatibility).toBe("unverified");
    expect(receipt.agenticWallet.addressBinding).toBe("passed");
  });
});
