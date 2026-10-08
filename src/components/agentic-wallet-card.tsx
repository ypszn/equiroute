"use client";

import { useEffect, useState } from "react";
import type { AgenticWalletState, CanonicalCapabilityMap, ExecutionReadiness } from "@/modules/agentic-wallet/types";
import type { ExecutionProposal, TokenSecurityDecision, WalletQuoteReconciliation } from "@/modules/agentic-wallet/gate";

type GateResponse = {
  wallet: AgenticWalletState;
  readiness: ExecutionReadiness;
  equiRoutePolicy: { outcome: string; confirmationReasons: string[] };
  walletQuotePolicy?: { outcome: string; confirmationReasons: string[] };
  capabilities: CanonicalCapabilityMap | null;
  reconciliation?: WalletQuoteReconciliation | null;
  security?: TokenSecurityDecision | null;
  executionProposal?: ExecutionProposal | null;
  preparation: { route: { selected: { provider: string; symbol: string } | null }; marketContext?: { regime?: string } | null } | null;
};

function abbreviated(address: string | null) { return address ? `${address.slice(0, 8)}…${address.slice(-6)}` : "—"; }

export function AgenticWalletCard() {
  const [status, setStatus] = useState<AgenticWalletState | null>(null);
  const [gate, setGate] = useState<GateResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => { void fetch("/api/agentic-wallet/status").then((r) => r.json()).then(setStatus).catch((e) => setError(String(e))); }, []);

  async function reviewExecution() {
    setError(""); setLoading(true);
    try {
      const response = await fetch("/api/agentic-wallet/execution-gate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: "NVDA", notionalUsd: "10", slippagePercent: "0.5" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Execution gate failed");
      setGate(data as GateResponse);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }

  const proposal = gate?.executionProposal ?? null;
  const reconciliation = gate?.reconciliation ?? null;
  return <section className="rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950">
    <h2 className="font-semibold">Binance Agentic Wallet</h2>
    {!status ? <p className="mt-2 text-zinc-500">Checking connection…</p> : <>
      <p className="mt-2">Connection: <strong>{status.connection === "signed_out" ? "Agentic Wallet not connected" : status.connection}</strong></p>
      <p>Address: {abbreviated(status.address)} · BSC: {status.bscSupported ? "supported" : "not confirmed"}</p>
      <p>USDT: {status.balances.usdt ?? "unknown"} · BNB: {status.balances.bnb ?? "unknown"}</p>
      <p>Quota remaining: {status.quota.remaining ?? "unknown"} / limit {status.quota.dailyLimit ?? "unknown"}</p>
      <p>Security: {status.security.abnormalTxnHandling ?? "unknown"} · trade all tokens: {status.security.tradeAllTokens === null ? "unknown" : String(status.security.tradeAllTokens)}</p>
      <p>Developer Mode: {status.developerMode.enabled === null ? "unknown" : status.developerMode.enabled ? "enabled (informational only)" : "disabled"}</p>
      <button type="button" onClick={() => void reviewExecution()} disabled={status.connection !== "connected" || loading} className="mt-3 rounded border border-zinc-300 px-3 py-2 text-xs disabled:opacity-50 dark:border-zinc-700">{loading ? "Reviewing…" : "Review Execution"}</button>
    </>}
    {error && <p className="mt-2 text-red-600">{error}</p>}

    {gate && <div className="mt-3 space-y-1 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <h3 className="font-medium">Execution Proposal</h3>
      <p>Equity intent: {proposal ? `$${proposal.intent.notionalUsd} ${proposal.intent.ticker} exposure` : "—"}</p>
      <p>Selected representation: {gate.preparation?.route.selected ? `${gate.preparation.route.selected.provider} / ${gate.preparation.route.selected.symbol}` : "none"}</p>
      <p>Market regime: {gate.preparation?.marketContext?.regime ?? "unknown"}</p>
      <p>EquiRoute quote: {reconciliation?.equiRoute.outputTokenAmount || "—"} ({reconciliation?.equiRoute.estimatedUnderlyingShares ?? "—"} shares)</p>
      <p>Agentic Wallet quote: {reconciliation?.agenticWallet.outputTokenAmount || "—"} ({reconciliation?.agenticWallet.estimatedUnderlyingShares ?? "—"} shares)</p>
      <p>Deviation: {reconciliation?.deviationPercent ? `${reconciliation.deviationPercent}%` : "unverifiable"} · reconciliation: {reconciliation?.outcome ?? "—"}</p>
      <p>Token security: {gate.security?.status ?? "—"}{gate.security?.acknowledgmentRequired ? " (acknowledgment required)" : ""}{gate.security?.risks.length ? ` · ${gate.security.risks.join(", ")}` : ""}</p>
      <p>EquiRoute policy: {gate.equiRoutePolicy.outcome} · wallet-quote policy: {gate.walletQuotePolicy?.outcome ?? "—"}</p>
      <p>Wallet readiness: {gate.readiness.outcome}</p>
      <p>Proposal readiness: <strong>{proposal?.readiness ?? "—"}</strong>{proposal?.blockingReasons.length ? ` · ${proposal.blockingReasons.join(", ")}` : ""}</p>
      <p className="text-xs text-zinc-500">Reference only: proposal {proposal?.id ?? "—"} carries no execution authorization and expires at {proposal?.freshUntil ?? "—"}.</p>
      <p className="text-xs text-zinc-500">⚠️ This audit result is for reference only and does not constitute investment advice. Always conduct your own research.</p>
    </div>}
  </section>;
}
