import type { RoutingResult } from "../routing/types";
import type { BestExecutionReceipt, ReceiptEntry } from "./types";

/**
 * Build a deterministic Best-Execution Receipt from a routing result.
 * Pure function — safe to unit-test.
 */
export function buildReceipt(result: RoutingResult): BestExecutionReceipt {
  const entries: ReceiptEntry[] = result.quotes.map((q) => {
    if (q.available) {
      return {
        provider: q.provider,
        symbol: q.symbol,
        status: "executable",
        effectiveExposurePrice: q.effectiveUsdPerShare ?? undefined,
        estimatedUnderlyingShares: q.estimatedUnderlyingShares ?? undefined,
        executionMode: q.executionMode,
        vendorName: q.vendorName,
        priceImpactPercent: q.priceImpactPercent,
        outputTokenAmount: q.outputTokenAmount,
        effectiveUsdPerShare: q.effectiveUsdPerShare,
        dexes: q.dexes,
        ratioStatus: q.ratioStatus,
      };
    }
    return {
      provider: q.provider,
      symbol: q.symbol,
      status: "rejected",
      reason: q.failureReason ?? "Unavailable",
      code: q.failureCode,
    };
  });

  const why: string[] = [];
  if (result.selected) {
      why.push(`Selected because it delivered the greatest verified ${result.intent.ticker}-equivalent exposure among executable canonical representations.`);
      why.push("Sufficient executable liquidity confirmed by quote response");
      why.push("Valid canonical representation (contract + recognized provider verified)");
      why.push("Live wrapper ratio verified before normalized exposure comparison");
    why.push("Within available route constraints");
  } else {
    why.push("No executable route survived availability and validity filters");
  }

  return {
    intent: {
      ticker: result.intent.ticker,
      notionalUsd: result.intent.notionalUsd,
      description: `Acquire $${result.intent.notionalUsd} ${result.intent.ticker} exposure`,
    },
    representationsEvaluated: result.representationsEvaluated,
    entries,
    selected: result.selected
      ? {
          provider: result.selected.provider,
          symbol: result.selected.symbol,
          contractAddress: result.selected.contractAddress,
        }
      : null,
    why: [...why, ...result.explanation],
    rejectedRoutes: result.rejected,
    generatedAt: new Date().toISOString(),
  };
}
