import { randomUUID } from "node:crypto";
import { div, decimalToString, tryParseDecimal, cmp } from "../routing/decimal";
import type { NormalizedQuote } from "../routing/types";
import type { ExecutionMandate, PolicyDecision } from "../policy/engine";

export type WalletQuoteReconciliation = { provider: string; symbol: string; equiRoute: { outputTokenAmount: string; estimatedUnderlyingShares: string | null; effectiveUsdPerShare: string | null }; agenticWallet: { outputTokenAmount: string; estimatedUnderlyingShares: string | null; effectiveUsdPerShare: string | null }; deviationPercent: string | null; outcome: "matched" | "within_policy" | "outside_policy" | "unverifiable"; generatedAt: string; freshness: "fresh" };
export type TokenSecurityDecision = { status: "passed" | "warning" | "failed" | "unavailable"; tokenAddress: string; risks: string[]; source: string | null; acknowledgmentRequired: boolean };
export type ExecutionProposal = { id: string; createdAt: string; intent: { ticker: string; notionalUsd: string; slippagePercent: string }; selectedRepresentation: { provider: string; symbol: string; contractAddress: string }; wallet: { address: string; chainId: "56" }; amounts: { inputUsdt: string; expectedOutputToken: string; expectedUnderlyingShares: string | null; effectiveUsdPerShare: string | null }; policy: { outcome: string; confirmationReasons: string[] }; walletQuote: { capability: string; reconciliation: string }; security: TokenSecurityDecision; readiness: "ready_for_user_confirmation" | "blocked"; blockingReasons: string[]; authorization: "none"; freshUntil: string };
function decimal(value: string | null): ReturnType<typeof tryParseDecimal> { return value ? tryParseDecimal(value) : null; }
function shares(output: string, ratio: string | null): string | null { const out = decimal(output); const r = decimal(ratio); return out && r && r.scaled > 0n ? decimalToString(div(out, r), 12) : null; }
function price(input: string, sharesValue: string | null): string | null { const s = decimal(sharesValue); const amount = decimal(input); return s && amount && s.scaled > 0n ? decimalToString(div(amount, s), 8) : null; }
export function reconcileWalletQuote(quote: NormalizedQuote, walletOutput: string | null, ratio: string | null, mandate: ExecutionMandate): WalletQuoteReconciliation {
  const output = quote.outputTokenAmount ?? ""; const walletShares = walletOutput && ratio ? shares(walletOutput, ratio) : null; const walletPrice = price(quote.inputAmountUsd, walletShares); const equiShares = quote.estimatedUnderlyingShares; const equiPrice = quote.effectiveUsdPerShare;
  let deviationPercent: string | null = null; let outcome: WalletQuoteReconciliation["outcome"] = "unverifiable";
  if (equiShares && walletShares) { const e = decimal(equiShares); const w = decimal(walletShares); if (e && w && e.scaled !== 0n) { const delta = w.scaled >= e.scaled ? w.scaled - e.scaled : e.scaled - w.scaled; deviationPercent = decimalToString({ scaled: (delta * 100n * (10n ** 36n)) / e.scaled }, 8); const maxImpact = mandate.trade.maxPriceImpactPercent ? decimal(mandate.trade.maxPriceImpactPercent) : null; outcome = maxImpact && decimal(deviationPercent) && cmp(decimal(deviationPercent)!, maxImpact) <= 0 ? "within_policy" : "outside_policy"; } }
  return { provider: quote.provider, symbol: quote.symbol, equiRoute: { outputTokenAmount: output, estimatedUnderlyingShares: equiShares, effectiveUsdPerShare: equiPrice }, agenticWallet: { outputTokenAmount: walletOutput ?? "", estimatedUnderlyingShares: walletShares, effectiveUsdPerShare: walletPrice }, deviationPercent, outcome, generatedAt: new Date().toISOString(), freshness: "fresh" };
}
export async function auditToken(tokenAddress: string): Promise<TokenSecurityDecision> {
  try { const response = await fetch("https://web3.binance.com/bapi/defi/v1/public/wallet-direct/security/token/audit", { method: "POST", headers: { "Content-Type": "application/json", source: "agent", "Accept-Encoding": "identity", "User-Agent": "binance-web3/1.4 (Skill)" }, body: JSON.stringify({ binanceChainId: "56", contractAddress: tokenAddress, requestId: randomUUID() }), cache: "no-store" }); const root = await response.json() as Record<string, unknown>; const data = root.data as Record<string, unknown> | undefined; if (!response.ok || !data?.hasResult || !data?.isSupported) return { status: "unavailable", tokenAddress, risks: [], source: "query-token-audit", acknowledgmentRequired: true }; const risks: string[] = []; for (const item of Array.isArray(data.riskItems) ? data.riskItems : []) { if (item && typeof item === "object" && Array.isArray((item as Record<string, unknown>).details)) for (const detail of (item as Record<string, unknown>).details as unknown[]) if (detail && typeof detail === "object" && (detail as Record<string, unknown>).isHit === true) risks.push(String((detail as Record<string, unknown>).title ?? "Risk detected")); } const level = String(data.riskLevelEnum ?? "").toUpperCase(); return { status: level === "HIGH" || risks.length > 0 ? "warning" : "passed", tokenAddress, risks, source: "query-token-audit", acknowledgmentRequired: level === "HIGH" || risks.length > 0 }; } catch { return { status: "unavailable", tokenAddress, risks: [], source: "query-token-audit", acknowledgmentRequired: true }; }
}
export function buildExecutionProposal(input: { ticker: string; notionalUsd: string; slippagePercent: string; address: string; quote: NormalizedQuote; reconciliation: WalletQuoteReconciliation; policy: PolicyDecision; security: TokenSecurityDecision; walletReady: boolean; walletQuoteCapability: string }): ExecutionProposal {
  const blockingReasons = [...input.policy.blockingReasons];
  if (input.walletQuoteCapability !== "supported") blockingReasons.push("AGENTIC_WALLET_QUOTE_UNAVAILABLE");
  if (input.reconciliation.outcome === "outside_policy") blockingReasons.push("AGENTIC_WALLET_QUOTE_OUTSIDE_POLICY");
  if (input.reconciliation.outcome === "unverifiable") blockingReasons.push("AGENTIC_WALLET_QUOTE_UNVERIFIABLE");
  if (input.security.status === "failed") blockingReasons.push("TOKEN_SECURITY_AUDIT_FAILED");
  if (input.security.status === "unavailable") blockingReasons.push("TOKEN_SECURITY_AUDIT_UNAVAILABLE_ACKNOWLEDGMENT_REQUIRED");
  if (input.security.status === "warning") blockingReasons.push("TOKEN_SECURITY_ACKNOWLEDGMENT_REQUIRED");
  if (!input.walletReady) blockingReasons.push("WALLET_NOT_EXECUTION_READY");
  // Execution capability is never asserted by a successful quote alone.
  blockingReasons.push("PROVIDER_EXECUTION_UNVERIFIED");
  const createdAt = new Date();
  return { id: randomUUID(), createdAt: createdAt.toISOString(), intent: { ticker: input.ticker, notionalUsd: input.notionalUsd, slippagePercent: input.slippagePercent }, selectedRepresentation: { provider: input.quote.provider, symbol: input.quote.symbol, contractAddress: input.quote.contractAddress }, wallet: { address: input.address, chainId: "56" }, amounts: { inputUsdt: input.notionalUsd, expectedOutputToken: input.reconciliation.agenticWallet.outputTokenAmount, expectedUnderlyingShares: input.reconciliation.agenticWallet.estimatedUnderlyingShares, effectiveUsdPerShare: input.reconciliation.agenticWallet.effectiveUsdPerShare }, policy: { outcome: input.policy.outcome, confirmationReasons: input.policy.confirmationReasons }, walletQuote: { capability: input.walletQuoteCapability, reconciliation: input.reconciliation.outcome }, security: input.security, readiness: blockingReasons.length === 0 ? "ready_for_user_confirmation" : "blocked", blockingReasons, authorization: "none", freshUntil: new Date(createdAt.getTime() + PROPOSAL_TTL_MS).toISOString() };
}

export const PROPOSAL_TTL_MS = 30_000;
/** A proposal is an audit artifact only: it never authorizes execution and expires quickly. */
export function isProposalFresh(proposal: Pick<ExecutionProposal, "freshUntil">, now: Date = new Date()): boolean {
  return now.getTime() < Date.parse(proposal.freshUntil);
}
export function assertProposalNotAuthorization(proposal: ExecutionProposal): { executable: false; reason: string } {
  return { executable: false, reason: `Proposal ${proposal.id} is an audit reference only; a fresh wallet quote and explicit user action are required before any execution.` };
}
