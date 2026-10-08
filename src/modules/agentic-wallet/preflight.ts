import type { AgenticWalletClient, AgenticWalletState } from "./types";
import type { PolicyDecision } from "../policy/engine";
import { getAgenticWalletState, evaluateWalletReadiness } from "./service";
import { prepareIntent } from "../preparation/prepare";
import { probeNvdaCapabilities } from "./capabilities";
import { buildAgenticPreflightReceipt } from "./receipt";
import { validateMandate, DEFAULT_MANDATE, type ExecutionMandate } from "../policy/engine";
import { cmp, parseDecimal, tryParseDecimal, isPositive } from "../routing/decimal";

export function validateAgenticPreflightInput(value: unknown): { ticker: string; notionalUsd: string; slippagePercent: string; mandate: ExecutionMandate } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if ("userWalletAddress" in record || "address" in record) return null;
  const ticker = typeof record.ticker === "string" ? record.ticker.trim().toUpperCase() : "";
  const notionalUsd = typeof record.notionalUsd === "string" ? record.notionalUsd.trim() : "";
  const slippagePercent = typeof record.slippagePercent === "string" ? record.slippagePercent.trim() : "0.5";
  const notional = tryParseDecimal(notionalUsd); const slippage = tryParseDecimal(slippagePercent); const mandate = validateMandate(record.mandate) ?? (record.mandate === undefined ? DEFAULT_MANDATE : null);
  if (!ticker || !notional || !isPositive(notional) || !slippage || !isPositive(slippage) || cmp(slippage, parseDecimal("50")) > 0 || !mandate) return null;
  return { ticker, notionalUsd, slippagePercent, mandate };
}


export async function runAgenticPreflight(input: { ticker: string; notionalUsd: string; slippagePercent: string; mandate?: ExecutionMandate }, walletClient: AgenticWalletClient, prepare = prepareIntent, options: { probeCapabilities?: boolean } = {}) {
  const wallet = await getAgenticWalletState(walletClient);
  const probe = options.probeCapabilities ?? true;
  const capabilities = probe && wallet.connection === "connected" ? await probeNvdaCapabilities(walletClient, { fromTokenQty: input.notionalUsd, slippage: input.slippagePercent }) : null;
  if (wallet.connection !== "connected" || !wallet.address || !wallet.bscSupported) {
    const policy: PolicyDecision = { outcome: "blocked", checks: [], blockingReasons: ["Agentic Wallet must be connected and support BSC before preflight"], confirmationReasons: [] };
    const readiness = evaluateWalletReadiness({ wallet, amountUsd: input.notionalUsd, provider: null, equiRouteOutcome: "blocked", equiRoutePolicy: policy });
    return { wallet, preparation: null, readiness, equiRoutePolicy: policy, capabilities, receipt: buildAgenticPreflightReceipt({ wallet, preparation: null, readiness, equiRoutePolicy: policy, capabilities }) };
  }
  // Address is sourced exclusively from baw wallet address --json. Browser address fields are never accepted.
  const preparation = await prepare({ ticker: input.ticker, notionalUsd: input.notionalUsd, slippagePercent: input.slippagePercent, userWalletAddress: wallet.address, mandate: input.mandate });
  const provider = preparation.route.selected?.provider ?? null;
  const routePolicy = preparation.policyDecision?.outcome ?? "blocked";
  const selectedAddress = preparation.preparation.preparedRoute?.transaction?.from ?? null;
  const simulationAddress = preparation.simulation.transactionFidelity?.from ? selectedAddress : null;
  const readiness = evaluateWalletReadiness({
    wallet,
    amountUsd: input.notionalUsd,
    requestedAddress: wallet.address,
    txFrom: selectedAddress,
    simulationFrom: simulationAddress,
    provider,
    equiRouteOutcome: routePolicy,
    equiRoutePolicy: preparation.policyDecision,
  });
  const fallbackPolicy: PolicyDecision = preparation.policyDecision ?? { outcome: "blocked", checks: [], blockingReasons: ["No policy-compliant EquiRoute route"], confirmationReasons: [] };
  return { wallet, preparation, readiness, equiRoutePolicy: fallbackPolicy, capabilities, receipt: buildAgenticPreflightReceipt({ wallet, preparation, readiness, equiRoutePolicy: fallbackPolicy, capabilities }) };
}

export function safeWalletStatus(state: AgenticWalletState) {
  return {
    connection: state.connection,
    address: state.address,
    bscSupported: state.bscSupported,
    balances: state.balances,
    quota: state.quota,
    security: state.security,
    developerMode: state.developerMode,
    sessionExpireTime: state.sessionExpireTime,
    cliVersion: state.cliVersion,
    requiredCliVersion: state.requiredCliVersion,
    cliCompatible: state.cliCompatible,
    skillVersion: state.skillVersion,
    skillUpdateAvailable: state.skillUpdateAvailable,
  };
}
