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

export function ExposureForm({ onResult, onError, onLoading, onPrepare, loading }: Props) {
  const [ticker, setTicker] = useState("NVDA");
  const [notionalUsd, setNotionalUsd] = useState("10");
  const [wallet, setWallet] = useState("");
  const [slippagePercent, setSlippagePercent] = useState("0.5");
  const [maxImpact, setMaxImpact] = useState("1");
  const [allowAfterHours, setAllowAfterHours] = useState(true);
  const [requireSimulation, setRequireSimulation] = useState(true);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    onLoading(true);
    onError("");
    try {
      const res = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          notionalUsd,
          ...(wallet.trim() ? { userWalletAddress: wallet.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data?.detail ?? data?.error ?? `Request failed (${res.status})`);
        return;
      }
      onResult(data as RouteApiResponse);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      onLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="w-full rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Ticker
          </span>
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="rounded border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            placeholder="NVDA"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            USD exposure
          </span>
          <input
            value={notionalUsd}
            onChange={(e) => setNotionalUsd(e.target.value)}
            inputMode="decimal"
            className="rounded border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700"
            placeholder="10"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            BSC wallet (public, optional)
          </span>
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            spellCheck={false}
            className="rounded border border-zinc-300 bg-transparent px-3 py-2 font-mono text-xs dark:border-zinc-700"
            placeholder="0x…"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Slippage %</span>
          <input value={slippagePercent} onChange={(e) => setSlippagePercent(e.target.value)} inputMode="decimal" className="rounded border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700" />
        </label>
      </div>
      <details className="mt-4 rounded border border-zinc-200 p-3 text-sm dark:border-zinc-800">
        <summary className="cursor-pointer font-medium">Execution Rules</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-500">Max price impact %<input value={maxImpact} onChange={(e) => setMaxImpact(e.target.value)} className="rounded border border-zinc-300 bg-transparent px-2 py-1 text-sm dark:border-zinc-700" /></label>
          <label className="flex items-center gap-2 text-xs text-zinc-600"><input type="checkbox" checked={allowAfterHours} onChange={(e) => setAllowAfterHours(e.target.checked)} /> Allow after-hours</label>
          <label className="flex items-center gap-2 text-xs text-zinc-600"><input type="checkbox" checked={requireSimulation} onChange={(e) => setRequireSimulation(e.target.checked)} /> Require simulation success</label>
        </div>
      </details>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" disabled={loading} className="rounded bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">{loading ? "Working…" : "Find Best Route"}</button>
        <button type="button" disabled={loading} onClick={() => void onPrepare({ ticker, notionalUsd, userWalletAddress: wallet.trim(), slippagePercent, mandate: { version: 1, trade: { maxNotionalUsd: "1000", maxPriceImpactPercent: maxImpact, maxSlippagePercent: slippagePercent }, providers: { allowed: null, blocked: [] }, marketRegime: { allowRegular: true, allowPremarket: allowAfterHours, allowPostmarket: allowAfterHours, allowOffhours: allowAfterHours, allowClosed: false, allowPaused: false, allowRestricted: false, requireConfirmationOutsideRegular: true }, verification: { requireVerifiedWrapperRatio: true, requireCanonicalRepresentation: true, requireSimulationSuccess: requireSimulation }, execution: { requireHumanConfirmation: true } } })} className="rounded border border-zinc-300 px-4 py-2.5 text-sm font-medium disabled:opacity-50 dark:border-zinc-700">Prepare &amp; Simulate</button>
      </div>
    </form>
  );
}
