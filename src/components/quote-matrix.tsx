import type { NormalizedQuote } from "@/modules/routing/types";

function fmt(v: string | null | undefined, suffix = ""): string {
  return v === null || v === undefined ? "—" : `${v}${suffix}`;
}

export function QuoteMatrix({ quotes }: { quotes: NormalizedQuote[] }) {
  if (quotes.length === 0) return null;

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            <th className="px-4 py-3 font-medium">Representation</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Est. shares</th>
            <th className="px-4 py-3 font-medium">Eff. USD/share</th>
            <th className="px-4 py-3 font-medium">Vendor / mode</th>
            <th className="px-4 py-3 font-medium">Impact</th>
            <th className="px-4 py-3 font-medium">Latency</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => (
            <tr
              key={`${q.provider}-${q.contractAddress}`}
              className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
            >
              <td className="px-4 py-3">
                <div className="font-medium">
                  {q.provider} <span className="text-zinc-500">/ {q.symbol}</span>
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-zinc-400">
                  {q.contractAddress.slice(0, 10)}…{q.contractAddress.slice(-6)}
                </div>
              </td>
              <td className="px-4 py-3">
                {q.available ? (
                  <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    Executable
                  </span>
                ) : (
                  <div>
                    <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
                      Rejected
                    </span>
                    <div className="mt-1 text-xs text-zinc-500">{q.failureReason}</div>
                  </div>
                )}
              </td>
              <td className="px-4 py-3 font-mono text-xs">{fmt(q.estimatedUnderlyingShares)}</td>
              <td className="px-4 py-3 font-mono text-xs">
                {q.effectiveUsdPerShare ? `$${q.effectiveUsdPerShare}` : "—"}
              </td>
              <td className="px-4 py-3 text-xs">
                {fmt(q.vendorName)}
                {q.executionMode ? <span className="text-zinc-500"> / {q.executionMode}</span> : null}
              </td>
              <td className="px-4 py-3 font-mono text-xs">{fmt(q.priceImpactPercent, "%")}</td>
              <td className="px-4 py-3 font-mono text-xs">{q.latencyMs}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
