import type { PreparationResult } from "./types";

export function buildPreExecutionReceipt(result: PreparationResult) {
  return {
    intent: `Acquire $${result.intent.notionalUsd} ${result.intent.ticker} exposure`,
    marketRegime: (result.marketContext as { regime?: string } | null)?.regime ?? "unknown",
    representationsEvaluated: result.route.alternatives.length + (result.route.selected ? 1 : 0),
    selected: result.route.selected ? {
      provider: result.route.selected.provider,
      symbol: result.route.selected.symbol,
      vendor: result.route.selected.vendorName,
      executionMode: result.route.selected.executionMode,
      estimatedUnderlyingShares: result.route.selected.estimatedUnderlyingShares,
      effectiveUsdPerShare: result.route.selected.effectiveUsdPerShare,
      priceImpactPercent: result.route.selected.priceImpactPercent,
    } : null,
    preparation: {
      status: result.preparation.status,
      reason: result.preparation.reason,
      slippagePercent: result.intent.slippagePercent,
      minReceiveAmount: result.preparation.preparedRoute?.transaction?.minReceiveAmount ?? null,
      approval: result.preparation.approval ? {
        status: result.preparation.approval.status,
        spender: result.preparation.approval.spender,
        amount: result.preparation.approval.amount,
        tokenAddress: result.preparation.approval.tokenAddress,
        advanced: { calldata: result.preparation.approval.calldata, signatureData: result.preparation.approval.signatureData },
      } : null,
      executionMode: result.preparation.preparedRoute?.executionMode ?? result.route.selected?.executionMode ?? null,
    },
    simulation: {
      status: result.simulation.status,
      failReason: result.simulation.failReason,
      balanceChanges: result.simulation.balanceChanges,
      allowanceChanges: result.simulation.allowanceChanges,
    },
    policy: result.policyDecision ? { mandate: result.mandate, decision: result.policyDecision, policyRejectedRoutes: result.policyRejectedRoutes ?? [] } : null,
    generatedAt: new Date().toISOString(),
  };
}
