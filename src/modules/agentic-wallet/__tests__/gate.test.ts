import { describe, expect, it, vi } from "vitest";
import { reconcileWalletQuote, buildExecutionProposal, isProposalFresh, assertProposalNotAuthorization, auditToken, PROPOSAL_TTL_MS, type TokenSecurityDecision } from "../gate";
import { runExecutionGate } from "../gate-service";
import { buildQuoteArgs, BAW_READ_ONLY_ALLOWLIST, createBawClient } from "../baw-client";
import { DEFAULT_MANDATE, type PolicyDecision } from "../../policy/engine";
import type { NormalizedQuote } from "../../routing/types";
import type { AgenticWalletClient } from "../types";

const walletAddress = "0x1111111111111111111111111111111111111111";
const bstock = "0x02fca66c1d1afb4e2a7884261eb00f63598a7436";
const ondo = "0xa9ee28c80f960b889dfbd1902055218cba016f75";
const usdt = "0x55d398326f99059ff775485246999027b3197955";

function quote(overrides: Partial<NormalizedQuote> = {}): NormalizedQuote {
  return { provider: "bstock", symbol: "NVDAB", contractAddress: bstock, available: true, vendorName: "LiquidMesh", executionMode: "SWAP", inputAmountUsd: "10", inputAmountRaw: "10000000000000000000", outputTokenAmount: "0.0418", estimatedUnderlyingShares: "0.0418", effectiveUsdPerShare: "239.23", priceImpactPercent: "0.01", tradeFee: null, estimatedGas: null, dexes: null, quoteId: "q", approveTarget: null, latencyMs: 5, ratioStatus: "verified", tokenToShareRatio: "1", failureCode: null, failureReason: null, raw: null, ...overrides };
}
const passingPolicy: PolicyDecision = { outcome: "confirmation_required", checks: [], blockingReasons: [], confirmationReasons: ["offhours"] };
const passedSecurity: TokenSecurityDecision = { status: "passed", tokenAddress: bstock, risks: [], source: "query-token-audit", acknowledgmentRequired: false };

describe("wallet quote reconciliation", () => {
  it("normalizes wallet output with the verified wrapper ratio for bStock and Ondo", () => {
    const bs = reconcileWalletQuote(quote({ tokenToShareRatio: "1.000778223752807865" }), "0.0418", "1.000778223752807865", DEFAULT_MANDATE);
    expect(bs.agenticWallet.estimatedUnderlyingShares).toBe("0.041767495542");
    const on = reconcileWalletQuote(quote({ provider: "ondo", symbol: "NVDAon", contractAddress: ondo, estimatedUnderlyingShares: "0.0417", tokenToShareRatio: "1.0017152487959898" }), "0.0418", "1.0017152487959898", DEFAULT_MANDATE);
    expect(on.agenticWallet.estimatedUnderlyingShares).toBe("0.041728425368");
    expect(on.agenticWallet.effectiveUsdPerShare).toBe("239.64479636");
  });
  it("classifies wallet quote inside and outside the mandate", () => {
    const inside = reconcileWalletQuote(quote(), "0.0418", "1", { ...DEFAULT_MANDATE, trade: { ...DEFAULT_MANDATE.trade, maxPriceImpactPercent: "1" } });
    expect(inside.outcome).toBe("within_policy");
    const outside = reconcileWalletQuote(quote(), "0.0300", "1", { ...DEFAULT_MANDATE, trade: { ...DEFAULT_MANDATE.trade, maxPriceImpactPercent: "1" } });
    expect(outside.outcome).toBe("outside_policy");
    expect(reconcileWalletQuote(quote(), null, "1", DEFAULT_MANDATE).outcome).toBe("unverifiable");
  });
});

describe("execution proposal", () => {
  const reconciliation = reconcileWalletQuote(quote(), "0.0418", "1", DEFAULT_MANDATE);
  it("stays blocked while execution is unverified and contains no credentials", () => {
    const proposal = buildExecutionProposal({ ticker: "NVDA", notionalUsd: "10", slippagePercent: "0.5", address: walletAddress, quote: quote(), reconciliation, policy: passingPolicy, security: passedSecurity, walletReady: true, walletQuoteCapability: "supported" });
    expect(proposal.readiness).toBe("blocked");
    expect(proposal.blockingReasons).toContain("PROVIDER_EXECUTION_UNVERIFIED");
    expect(proposal.authorization).toBe("none");
    const serialized = JSON.stringify(proposal).toLowerCase();
    for (const secret of ["apikey", "secret", "privatekey", "mnemonic", "x-oc-sign", "session"]) expect(serialized).not.toContain(secret);
    expect(assertProposalNotAuthorization(proposal).executable).toBe(false);
  });
  it("records funding, policy, and security blockers separately", () => {
    const unavailable: TokenSecurityDecision = { status: "unavailable", tokenAddress: bstock, risks: [], source: "query-token-audit", acknowledgmentRequired: true };
    const proposal = buildExecutionProposal({ ticker: "NVDA", notionalUsd: "10", slippagePercent: "0.5", address: walletAddress, quote: quote(), reconciliation, policy: { outcome: "blocked", checks: [], blockingReasons: ["sim failed"], confirmationReasons: [] }, security: unavailable, walletReady: false, walletQuoteCapability: "supported" });
    expect(proposal.blockingReasons).toContain("sim failed");
    expect(proposal.blockingReasons).toContain("TOKEN_SECURITY_AUDIT_UNAVAILABLE_ACKNOWLEDGMENT_REQUIRED");
    expect(proposal.blockingReasons).toContain("WALLET_NOT_EXECUTION_READY");
    expect(unavailable.acknowledgmentRequired).toBe(true);
  });
  it("expires so a stale proposal is never execution-authoritative", () => {
    const proposal = buildExecutionProposal({ ticker: "NVDA", notionalUsd: "10", slippagePercent: "0.5", address: walletAddress, quote: quote(), reconciliation, policy: passingPolicy, security: passedSecurity, walletReady: true, walletQuoteCapability: "supported" });
    expect(isProposalFresh(proposal, new Date())).toBe(true);
    expect(isProposalFresh(proposal, new Date(Date.now() + PROPOSAL_TTL_MS + 1_000))).toBe(false);
  });
});

describe("token security audit (read-only)", () => {
  it("passes a clean documented audit result", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: "000000", data: { hasResult: true, isSupported: true, riskLevelEnum: "LOW", riskItems: [{ id: "CONTRACT_RISK", details: [{ title: "Honeypot Risk Not Found", isHit: false }] }] }, success: true }), { status: 200 }));
    const result = await auditToken(bstock);
    expect(result.status).toBe("passed");
    expect(result.acknowledgmentRequired).toBe(false);
    vi.restoreAllMocks();
  });
  it("warns when a risk is hit and preserves acknowledgment", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { hasResult: true, isSupported: true, riskLevelEnum: "MEDIUM", riskItems: [{ details: [{ title: "Trading cooldown", isHit: true }] }] }, success: true }), { status: 200 }));
    const result = await auditToken(bstock);
    expect(result.status).toBe("warning");
    expect(result.risks).toEqual(["Trading cooldown"]);
    expect(result.acknowledgmentRequired).toBe(true);
    vi.restoreAllMocks();
  });
  it("treats unsupported/absent audit data as unavailable requiring acknowledgment", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { hasResult: false, isSupported: false } }), { status: 200 }));
    const result = await auditToken(bstock);
    expect(result.status).toBe("unavailable");
    expect(result.acknowledgmentRequired).toBe(true);
    expect(result.risks).toEqual([]);
    vi.restoreAllMocks();
  });
});

describe("gate command safety", () => {
  it("builds only documented read-only quote commands and never a swap", () => {
    expect(buildQuoteArgs({ fromTokenQty: "10", fromToken: usdt, toToken: bstock, binanceChainId: "56", slippage: "0.5" })).toEqual(["market-order", "quote", "--fromTokenQty", "10", "--fromToken", usdt, "--toToken", bstock, "--binanceChainId", "56", "--slippage", "0.5", "--json"]);
    expect(() => buildQuoteArgs({ fromTokenQty: "10", fromToken: usdt, toToken: "0x000000000000000000000000000000000000dead", binanceChainId: "56", slippage: "0.5" })).toThrow(/canonical NVDA/);
    expect(() => buildQuoteArgs({ fromTokenQty: "0", fromToken: usdt, toToken: bstock, binanceChainId: "56", slippage: "0.5" })).toThrow(/positive/);
    expect([...BAW_READ_ONLY_ALLOWLIST].some((entry) => entry.includes("swap"))).toBe(false);
    const client = createBawClient(async () => ({ stdout: "{}", stderr: "" }));
    expect("swapMarketOrder" in client).toBe(false);
    expect(Object.keys(client).some((key) => /swap|sign|broadcast|devmode/i.test(key))).toBe(false);
  });
  it("uses one fresh wallet quote for the selected route and rechecks wallet state", async () => {
    const quoteCalls: string[] = [];
    const client: AgenticWalletClient = {
      getStatus: async () => ({ data: { status: "CONNECTED" } }),
      getAddress: async () => ({ data: { addresses: [{ binanceChainId: "56", address: walletAddress }] } }),
      getChains: async () => ({ data: [{ binanceChainId: "56" }] }),
      getBalances: async () => ({ data: [{ symbol: "USDT", address: usdt, binanceChainId: "56", balance: "25" }, { symbol: "BNB", address: "bnb", binanceChainId: "56", balance: "0.1" }] }),
      getSettings: async () => ({ data: { dailyLimit: 500, quotaUsed: 0, quotaLeft: 500, tradeAllTokens: true } }),
      cliCheck: async () => ({ data: { currentCliVersion: "1.10.0", needUpdateCli: false } }),
      skillCheck: async () => ({ data: { needUpdateSkill: false } }),
      quoteMarketOrder: async (input) => { quoteCalls.push(input.toToken); return { success: true, data: { fromCoinSymbol: "USDT", fromCoinAmount: "10", toCoinSymbol: "NVDAB", toCoinAmount: "0.0418", slippage: 0.005 } }; },
    };
    const prepare = async (value: { userWalletAddress: string }) => ({
      intent: { ticker: "NVDA", notionalUsd: "10", userWalletAddress: value.userWalletAddress, slippagePercent: "0.5" },
      marketContext: { regime: "offhours" }, route: { selected: quote(), alternatives: [] },
      preparation: { status: "ready", stateCode: null, preparedRoute: { transaction: { from: value.userWalletAddress } }, approval: null, rfq: null, reason: null },
      simulation: { attempted: true, status: "success", binanceStatus: "SUCCESS", failReason: null, balanceChanges: [], allowanceChanges: [], failureClassification: null, transactionFidelity: { from: true, to: true, value: true, data: true }, raw: null },
      safetyChecks: [], policyDecision: passingPolicy, policyRejectedRoutes: [], receipt: null,
    });
    const gate = await import("../gate-service");
    const result = await gate.runExecutionGate({ ticker: "NVDA", notionalUsd: "10", slippagePercent: "0.5", mandate: DEFAULT_MANDATE }, { ...client }, { audit: async () => passedSecurity, prepare: prepare as never });
    void runExecutionGate;
    expect(quoteCalls).toEqual([bstock]);
    expect(result.reconciliation?.provider).toBe("bstock");
    expect(result.executionProposal?.wallet.address).toBe(walletAddress);
    expect(result.walletQuotePolicy?.outcome).toBeDefined();
  });
});
