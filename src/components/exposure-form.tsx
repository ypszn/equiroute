"use client";

import { useState } from "react";
import type { RouteApiResponse } from "@/modules/routing/api-types";

type Props = {
  onResult: (r: RouteApiResponse) => void;
  onError: (msg: string) => void;
  onLoading: (loading: boolean) => void;
  onPrepare: (input: { ticker: string; notionalUsd: string; userWalletAddress: string; slippagePercent: string; mandate?: unknown }) => Promise<void>;
  loading: boolean;
};

const mandate = (maxImpact: string, slippage: string, afterHours: boolean, simulation: boolean) => ({ version: 1, trade: { maxNotionalUsd: "1000", maxPriceImpactPercent: maxImpact, maxSlippagePercent: slippage }, providers: { allowed: null, blocked: [] }, marketRegime: { allowRegular: true, allowPremarket: afterHours, allowPostmarket: afterHours, allowOffhours: afterHours, allowClosed: false, allowPaused: false, allowRestricted: false, requireConfirmationOutsideRegular: true }, verification: { requireVerifiedWrapperRatio: true, requireCanonicalRepresentation: true, requireSimulationSuccess: simulation }, execution: { requireHumanConfirmation: true } });

export function ExposureForm({ onResult, onError, onLoading, onPrepare, loading }: Props) {
  const [ticker, setTicker] = useState("NVDA"); const [notionalUsd, setNotionalUsd] = useState("10"); const [wallet, setWallet] = useState(""); const [slippage, setSlippage] = useState("0.5"); const [maxImpact, setMaxImpact] = useState("1"); const [afterHours, setAfterHours] = useState(true); const [simulation, setSimulation] = useState(true);
  async function submit(event: React.FormEvent) { event.preventDefault(); onLoading(true); onError(""); try { const response = await fetch("/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker, notionalUsd, ...(wallet.trim() ? { userWalletAddress: wallet.trim() } : {}) }) }); const data = await response.json(); if (!response.ok) throw new Error(data?.detail ?? data?.error ?? `Request failed (${response.status})`); onResult(data as RouteApiResponse); } catch (error) { onError(error instanceof Error ? error.message : String(error)); } finally { onLoading(false); } }
  const runPreparation = () => onPrepare({ ticker, notionalUsd, userWalletAddress: wallet.trim(), slippagePercent: slippage, mandate: mandate(maxImpact, slippage, afterHours, simulation) });
  return <form id="route-workspace" onSubmit={submit} className="panel grid-bg p-6 sm:p-8">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="eyebrow">Intent workspace</div><h2 className="mt-2 text-2xl font-semibold tracking-tight">Find Best Route</h2><p className="mt-2 max-w-2xl text-sm muted">Define your exposure intent and compare live executable tokenized-stock representations.</p></div><span className="badge badge-blue">Read-only analysis</span></div>
    <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[["Ticker", ticker, setTicker, "NVDA", "text"], ["USD exposure", notionalUsd, setNotionalUsd, "10", "decimal"], ["Slippage %", slippage, setSlippage, "0.5", "decimal"]].map(([label, value, setter, placeholder, type]) => <label key={label as string} className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-wider muted">{label as string}</span><input className="input" value={value as string} onChange={(e) => (setter as (v: string) => void)(e.target.value)} placeholder={placeholder as string} inputMode={type === "decimal" ? "decimal" : undefined} /></label>)}
      <label className="block"><span className="mb-2 block text-xs font-semibold uppercase tracking-wider muted">Public BSC wallet</span><input className="input font-mono text-xs" value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="Optional 0x…" spellCheck={false} /><span className="mt-1 block text-[11px] muted">Quote context only; never execution authority.</span></label>
    </div>
    <details className="mt-6 panel-soft p-4"><summary className="cursor-pointer list-none font-semibold"><span className="mr-2 text-cyan-300">⌘</span> Execution Rules <span className="ml-2 text-xs font-normal muted">Deterministic mandate controls</span></summary><p className="mt-3 text-xs muted">These rules affect deterministic route eligibility. They never authorize execution.</p><div className="mt-4 grid gap-4 sm:grid-cols-3"><label className="block text-xs muted">Max price impact %<input className="input mt-2" value={maxImpact} onChange={(e) => setMaxImpact(e.target.value)} inputMode="decimal" /></label><label className="flex items-center gap-3 text-xs muted"><input type="checkbox" checked={afterHours} onChange={(e) => setAfterHours(e.target.checked)} /> Allow non-regular regimes</label><label className="flex items-center gap-3 text-xs muted"><input type="checkbox" checked={simulation} onChange={(e) => setSimulation(e.target.checked)} /> Require simulation success</label></div></details>
    <div className="mt-6 flex flex-wrap gap-3"><button className="btn-primary" type="submit" disabled={loading}>{loading ? "Analyzing live routes…" : "Find Best Route →"}</button><button className="btn-secondary" type="button" disabled={loading || !/^0x[0-9a-fA-F]{40}$/.test(wallet)} onClick={() => void runPreparation()}>{loading ? "Preparing…" : "Prepare & Simulate"}</button></div>
  </form>;
}
