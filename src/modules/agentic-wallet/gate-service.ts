import { runAgenticPreflight } from "./preflight";
import { quoteSelectedRepresentation } from "./capabilities";
import { reconcileWalletQuote, auditToken, buildExecutionProposal, type TokenSecurityDecision } from "./gate";
import { buildAgenticPreflightReceipt } from "./receipt";
import type { AgenticWalletCapability, AgenticWalletClient, CanonicalCapabilityMap } from "./types";
import { evaluatePolicy, type ExecutionMandate } from "../policy/engine";

/**
 * Final non-executing Agentic Wallet execution gate.
 * Obtains ONE fresh wallet quote for the representation EquiRoute already selected,
 * re-applies the user's mandate to that fresh quote, runs the documented token-security
 * pre-check, and emits an audit-only execution proposal. Never calls `market-order swap`.
 */
export type ExecutionGateResult = Awaited<ReturnType<typeof runAgenticPreflight>> & {
  capabilities: CanonicalCapabilityMap | null;
  walletCapability: AgenticWalletCapability | null;
  reconciliation: ReturnType<typeof reconcileWalletQuote> | null;
  walletQuotePolicy: ReturnType<typeof evaluatePolicy> | null;
  security: TokenSecurityDecision | null;
  executionProposal: ReturnType<typeof buildExecutionProposal> | null;
};

export async function runExecutionGate(
  input: { ticker: string; notionalUsd: string; slippagePercent: string; mandate: ExecutionMandate },
  client: AgenticWalletClient,
  deps: { audit?: typeof auditToken; prepare?: Parameters<typeof runAgenticPreflight>[2] } = {},
): Promise<ExecutionGateResult> {
  const audit = deps.audit ?? auditToken;
  const preflight = await runAgenticPreflight(input, client, deps.prepare, { probeCapabilities: false });
  const selected = preflight.preparation?.route.selected ?? null;
  const base: ExecutionGateResult = { ...preflight, capabilities: null, walletCapability: null, reconciliation: null, walletQuotePolicy: null, security: null, executionProposal: null };
  if (!selected || !preflight.wallet.address) return base;

  // Single fresh wallet quote for the already-selected representation (no duplicate provider probing).
  const walletCapability = await quoteSelectedRepresentation(client, { toToken: selected.contractAddress, fromTokenQty: input.notionalUsd, slippage: input.slippagePercent });
  const capabilities = { [selected.provider]: walletCapability } as unknown as CanonicalCapabilityMap;
  const reconciliation = reconcileWalletQuote(selected, walletCapability.details.toAmount, selected.tokenToShareRatio ?? null, input.mandate);

  // Re-apply the mandate to the fresh wallet quote rather than reusing the earlier verdict.
  const walletQuotePolicy = evaluatePolicy({
    ticker: input.ticker,
    notionalUsd: input.notionalUsd,
    slippagePercent: input.slippagePercent,
    mandate: input.mandate,
    quote: { ...selected, outputTokenAmount: walletCapability.details.toAmount ?? selected.outputTokenAmount, estimatedUnderlyingShares: reconciliation.agenticWallet.estimatedUnderlyingShares, effectiveUsdPerShare: reconciliation.agenticWallet.effectiveUsdPerShare },
    regime: preflight.preparation?.marketContext && typeof preflight.preparation.marketContext === "object" ? (preflight.preparation.marketContext as { regime?: "regular" }).regime ?? "unknown" : "unknown",
    simulationStatus: preflight.preparation?.simulation.status ?? null,
  });

  const security = await audit(selected.contractAddress);
  const walletReady = preflight.readiness.outcome !== "wallet_funding_required" && preflight.readiness.outcome !== "wallet_setup_required";
  const executionProposal = buildExecutionProposal({
    ticker: input.ticker, notionalUsd: input.notionalUsd, slippagePercent: input.slippagePercent,
    address: preflight.wallet.address, quote: selected, reconciliation,
    policy: walletQuotePolicy, security, walletReady,
    walletQuoteCapability: walletCapability.quote,
  });
  const receipt = {
    ...buildAgenticPreflightReceipt({ wallet: preflight.wallet, preparation: preflight.preparation, readiness: preflight.readiness, equiRoutePolicy: preflight.equiRoutePolicy, capabilities }),
    walletQuoteReconciliation: reconciliation,
    walletQuotePolicy,
    tokenSecurity: security,
    executionProposal,
  };
  return { ...preflight, capabilities, walletCapability, reconciliation, walletQuotePolicy, security, executionProposal, receipt };
}
