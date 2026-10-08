"use client";

import { useState } from "react";
import { ExposureForm } from "@/components/exposure-form";
import { QuoteMatrix } from "@/components/quote-matrix";
import { ExecutionReceipt } from "@/components/execution-receipt";
import type { RouteApiResponse } from "@/modules/routing/api-types";
import type { PreparationResult } from "@/modules/preparation/types";
import { AgenticWalletCard } from "@/components/agentic-wallet-card";

export default function Home() {
  const [result, setResult] = useState<RouteApiResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [preparation, setPreparation] = useState<PreparationResult | null>(null);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 font-sans dark:bg-black">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            EquiRoute
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            You choose the stock. EquiRoute chooses how you own it.
          </p>
        </header>

        <AgenticWalletCard />
        <ExposureForm
          loading={loading}
          onLoading={setLoading}
          onPrepare={async (input) => {
            setLoading(true);
            setError("");
            setPreparation(null);
            try {
              const response = await fetch("/api/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
              const data = await response.json();
              if (!response.ok) throw new Error(data?.detail ?? data?.error ?? `Request failed (${response.status})`);
              setPreparation(data as PreparationResult);
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setLoading(false);
            }
          }}
          onError={(m) => {
            setError(m);
            setResult(null);
          }}
          onResult={(r) => {
            setResult(r);
            setError("");
          }}
        />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {result && (
          <>
            {result.selected && (
              <div className="rounded-lg border border-emerald-200 bg-white p-4 dark:border-emerald-900 dark:bg-zinc-950">
                <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Selected route
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {result.selected.provider} / {result.selected.symbol}
                </div>
                <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {result.selected.estimatedUnderlyingShares ?? "—"} est. shares · $
                  {result.selected.effectiveUsdPerShare ?? "—"}/share ·{" "}
                  {result.selected.vendorName ?? "—"}
                </div>
              </div>
            )}

            <QuoteMatrix quotes={result.quotes} />
            <ExecutionReceipt receipt={result.receipt} />
            {preparation && <section className="w-full rounded-lg border border-zinc-200 bg-white p-5 text-sm dark:border-zinc-800 dark:bg-zinc-950">
              <h2 className="font-semibold">Pre-Execution Receipt</h2>
              <p className="mt-2">Preparation: <strong>{preparation.preparation.status}</strong>{preparation.preparation.reason ? ` — ${preparation.preparation.reason}` : ""}</p>
              <p>Simulation: <strong>{preparation.simulation.status}</strong>{preparation.simulation.failReason ? ` — ${preparation.simulation.failReason}` : ""}</p>
              <p>Approval: {preparation.preparation.approval?.status ?? "unknown"}{preparation.preparation.approval?.spender ? ` — spender ${preparation.preparation.approval.spender}` : ""}{preparation.preparation.approval?.amount ? ` — amount ${preparation.preparation.approval.amount}` : ""}</p>
              <p>Minimum receive: {preparation.preparation.preparedRoute?.transaction?.minReceiveAmount ?? "unknown"} · Slippage: {preparation.intent.slippagePercent}%</p>
              <div className="mt-3 space-y-1 text-xs text-zinc-600 dark:text-zinc-400">{preparation.safetyChecks.map((check) => <div key={check.name}>{check.status.toUpperCase()} — {check.name}: {check.detail}</div>)}</div>
              {preparation.preparation.preparedRoute?.transaction && <details className="mt-3"><summary className="cursor-pointer">Advanced unsigned transaction details</summary><pre className="mt-2 overflow-auto text-[10px]">{JSON.stringify(preparation.preparation.preparedRoute.transaction, null, 2)}</pre></details>}
            </section>}
          </>
        )}
      </main>
    </div>
  );
}
