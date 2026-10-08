import { describe, expect, it } from "vitest";
import { createBawClient, BAW_READ_ONLY_ALLOWLIST } from "../baw-client";
import { parseAddress, parseBalances, parseChains, parseSettings, parseStatus, evaluateWalletReadiness } from "../service";
import type { AgenticWalletState } from "../types";

describe("BAW CLI read-only client", () => {
  it("uses fixed argument arrays and rejects commands outside the allowlist", async () => {
    const calls: Array<{ file: string; args: string[] }> = [];
    const exec = async (file: string, args: string[]) => { calls.push({ file, args }); return { stdout: JSON.stringify({ success: true, data: { status: "CONNECTED" } }), stderr: "" }; };
    const client = createBawClient(exec as never);
    await client.getStatus();
    expect(calls[0].args).toEqual(["wallet", "status", "--json"]);
    expect(calls[0].file).toMatch(/baw$/);
    await expect(client.run(["wallet", "send", "--json"])).rejects.toMatchObject({ code: "COMMAND_NOT_ALLOWED" });
    expect(BAW_READ_ONLY_ALLOWLIST.size).toBe(7);
    expect([...BAW_READ_ONLY_ALLOWLIST].some((entry) => entry.includes("swap"))).toBe(false);
  });
  it("normalizes missing binary, timeout, oversized output and malformed JSON", async () => {
    const missing = createBawClient(async () => { const e = new Error() as NodeJS.ErrnoException; e.code = "ENOENT"; throw e; });
    await expect(missing.getStatus()).rejects.toMatchObject({ code: "CLI_NOT_INSTALLED" });
    const timeout = createBawClient(async () => { const e = new Error() as NodeJS.ErrnoException; e.code = "ETIMEDOUT"; throw e; });
    await expect(timeout.getStatus()).rejects.toMatchObject({ code: "CLI_TIMEOUT" });
    const malformed = createBawClient(async () => ({ stdout: "not-json", stderr: "" }));
    await expect(malformed.getStatus()).rejects.toMatchObject({ code: "MALFORMED_JSON" });
    const oversized = createBawClient(async () => ({ stdout: "x".repeat(1_000_001), stderr: "" }));
    await expect(oversized.getStatus()).rejects.toMatchObject({ code: "OUTPUT_TOO_LARGE" });
  });
});

describe("Agentic Wallet normalization and readiness", () => {
  it("parses connection, BSC address/chains, balances, settings, quota and dev mode", () => {
    expect(parseStatus({ data: { status: "CONNECTED" } })).toBe("connected");
    expect(parseStatus({ data: { status: "UNCONNECTED" } })).toBe("signed_out");
    expect(parseAddress({ data: { addresses: [{ binanceChainId: "56", address: "0x1111111111111111111111111111111111111111" }] } })).toBe("0x1111111111111111111111111111111111111111");
    expect(parseChains({ data: [{ binanceChainId: "56", name: "BNB Smart Chain", simpleName: "BSC" }] })[0].binanceChainId).toBe("56");
    const balances = parseBalances({ data: [{ symbol: "USDT", address: "0xusdt", binanceChainId: "56", balance: "12.5" }, { symbol: "BNB", address: "0xbnb", binanceChainId: "56", balance: "0" }] });
    expect(balances.map((b) => b.symbol)).toEqual(["USDT", "BNB"]);
    const settings = parseSettings({ data: { dailyLimit: 500, quotaUsed: 200, quotaLeft: 300, quotaDate: "today", abnormalTxnHandling: "AutoReject", tradeAllTokens: false, devMode: { enabled: false, expiresAt: null, dailyLimit: 10, balanceExceeded: false } } });
    expect(settings.quotaLeft).toBe("300");
    expect(settings.abnormalTxnHandling).toBe("AutoReject");
    expect(settings.devMode.enabled).toBe(false);
  });
  const state: AgenticWalletState = { connection: "connected", address: "0x1111111111111111111111111111111111111111", bscSupported: true, balances: { usdt: "100", bnb: "0.01" }, quota: { dailyLimit: "1000", used: "100", remaining: "900", date: null }, security: { abnormalTxnHandling: "NeedConfirmation", tradeAllTokens: true }, developerMode: { enabled: false, expiresAt: null, dailyLimit: null, balanceExceeded: null }, sessionExpireTime: null, errorCode: null };
  it("checks identity, funding, gas, quota and leaves provider compatibility unverified", () => {
    const readiness = evaluateWalletReadiness({ wallet: state, amountUsd: "10", requestedAddress: state.address, txFrom: state.address, simulationFrom: state.address, provider: "bstock", equiRouteOutcome: "allowed" });
    expect(readiness.agenticWallet.inputBalanceSufficient).toBe(true);
    expect(readiness.agenticWallet.gasBalanceAvailable).toBe(true);
    expect(readiness.agenticWallet.executionCompatibility).toBe("unverified");
    expect(readiness.blockingReasons).toContain("PROVIDER_EXECUTION_UNVERIFIED");
    const mismatch = evaluateWalletReadiness({ wallet: state, amountUsd: "10", requestedAddress: "0x2222222222222222222222222222222222222222", txFrom: state.address, simulationFrom: state.address, provider: "ondo", equiRouteOutcome: "allowed" });
    expect(mismatch.blockingReasons).toContain("AGENTIC_WALLET_ADDRESS_MISMATCH");
  });
  it("classifies insufficient USDT, zero BNB and unknown quota conservatively", () => {
    const poor = { ...state, balances: { usdt: "5", bnb: "0" }, quota: { dailyLimit: null, used: null, remaining: null, date: null } };
    const readiness = evaluateWalletReadiness({ wallet: poor, amountUsd: "10", provider: "ondo", equiRouteOutcome: "allowed" });
    expect(readiness.agenticWallet.inputBalanceSufficient).toBe(false);
    expect(readiness.agenticWallet.gasBalanceAvailable).toBe(false);
    expect(readiness.agenticWallet.quotaSufficient).toBe("unknown");
    expect(readiness.outcome).toBe("wallet_funding_required");
  });
  it("keeps EquiRoute blocked/confirmation stricter", () => {
    expect(evaluateWalletReadiness({ wallet: state, amountUsd: "10", provider: "bstock", equiRouteOutcome: "blocked" }).blockingReasons).toContain("EQUIROUTE_POLICY_BLOCKED");
    expect(evaluateWalletReadiness({ wallet: state, amountUsd: "10", provider: "bstock", equiRouteOutcome: "confirmation_required" }).confirmationReasons).toContain("EQUIROUTE_CONFIRMATION_REQUIRED");
  });
});
