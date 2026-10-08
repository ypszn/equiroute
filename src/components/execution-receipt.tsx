import type { BestExecutionReceipt } from "@/modules/receipts/types";

export function ExecutionReceipt({ receipt }: { receipt: BestExecutionReceipt }) {
  return (
    <section className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Best-Execution Receipt
      </h2>

      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="w-40 shrink-0 text-zinc-500">Intent</dt>
          <dd className="font-medium">{receipt.intent.description}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-40 shrink-0 text-zinc-500">Evaluated</dt>
          <dd>{receipt.representationsEvaluated} representations</dd>
        </div>
      </dl>

      <ul className="mt-4 space-y-2">
        {receipt.entries.map((e) => (
          <li
            key={`${e.provider}-${e.symbol}`}
            className="rounded border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="font-medium">
              {e.provider} / {e.symbol}{" "}
              <span
                className={
                  e.status === "executable"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400"
                }
              >
                {e.status === "executable" ? "Executable" : "Rejected"}
              </span>
            </div>
            {e.status === "executable" ? (
              <div className="mt-1 grid gap-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                <div>Output token amount: {e.outputTokenAmount ?? "—"}</div>
                <div>Verified underlying shares: {e.estimatedUnderlyingShares ?? "—"}</div>
                <div>Effective USD/share: {e.effectiveUsdPerShare ? `$${e.effectiveUsdPerShare}` : "—"}</div>
                <div>
                  Route: {e.vendorName ?? "—"}
                  {e.executionMode ? ` (${e.executionMode})` : ""}
                </div>
                <div>Price impact: {e.priceImpactPercent ? `${e.priceImpactPercent}%` : "—"}</div>
                {e.dexes?.map((route, routeIndex) => (
                  <div key={routeIndex}>DEX route: {route.hops.map((hop, hopIndex) => `${hopIndex > 0 ? " → " : ""}${hop.dexName ?? "Unknown DEX"} ${hop.fromTokenSymbol ?? "?"}→${hop.toTokenSymbol ?? "?"}${hop.percent ? ` (${hop.percent}%)` : ""}`).join("")}</div>
                ))}
              </div>
            ) : (
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                Reason: {e.reason}
              </div>
            )}
          </li>
        ))}
      </ul>

      {receipt.selected && (
        <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950">
          <div className="font-medium">
            Selected: {receipt.selected.provider} / {receipt.selected.symbol}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-zinc-500">
            {receipt.selected.contractAddress}
          </div>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-zinc-700 dark:text-zinc-300">
            {receipt.why.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 text-right text-[10px] text-zinc-400">{receipt.generatedAt}</div>
    </section>
  );
}
