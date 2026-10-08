import type { EquityProvider, MarketRegime } from "../registry/types";
import { cmp, parseDecimal, tryParseDecimal } from "../routing/decimal";
import type { NormalizedQuote } from "../routing/types";

export type ExecutionMandate = {
  version: 1;
  trade: { maxNotionalUsd: string | null; maxPriceImpactPercent: string | null; maxSlippagePercent: string | null };
  providers: { allowed: EquityProvider[] | null; blocked: EquityProvider[] };
  marketRegime: { allowRegular: boolean; allowPremarket: boolean; allowPostmarket: boolean; allowOffhours: boolean; allowClosed: boolean; allowPaused: boolean; allowRestricted: boolean; requireConfirmationOutsideRegular: boolean };
  verification: { requireVerifiedWrapperRatio: boolean; requireCanonicalRepresentation: boolean; requireSimulationSuccess: boolean };
  execution: { requireHumanConfirmation: boolean };
};

export const DEFAULT_MANDATE: ExecutionMandate = {
  version: 1,
  trade: { maxNotionalUsd: "1000", maxPriceImpactPercent: "1", maxSlippagePercent: "0.5" },
  providers: { allowed: null, blocked: [] },
  marketRegime: { allowRegular: true, allowPremarket: true, allowPostmarket: true, allowOffhours: true, allowClosed: false, allowPaused: false, allowRestricted: false, requireConfirmationOutsideRegular: true },
  verification: { requireVerifiedWrapperRatio: true, requireCanonicalRepresentation: true, requireSimulationSuccess: true },
  execution: { requireHumanConfirmation: true },
};

export type PolicyDecision = { outcome: "allowed" | "confirmation_required" | "blocked"; checks: Array<{ id: string; stage: "intent" | "representation" | "quote" | "market" | "simulation"; status: "passed" | "failed" | "confirmation_required" | "unknown"; reason: string; observed?: string | null; limit?: string | null }>; blockingReasons: string[]; confirmationReasons: string[] };

export function validateMandate(value: unknown): ExecutionMandate | null {
  if (value === undefined || value === null) return structuredClone(DEFAULT_MANDATE);
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const rootKeys = ["version", "trade", "providers", "marketRegime", "verification", "execution"];
  if (Object.keys(v).some((key) => !rootKeys.includes(key))) return null;
  const tradeKeys = ["maxNotionalUsd", "maxPriceImpactPercent", "maxSlippagePercent"];
  const providerKeys = ["allowed", "blocked"];
  const marketKeys = ["allowRegular", "allowPremarket", "allowPostmarket", "allowOffhours", "allowClosed", "allowPaused", "allowRestricted", "requireConfirmationOutsideRegular"];
  const verificationKeys = ["requireVerifiedWrapperRatio", "requireCanonicalRepresentation", "requireSimulationSuccess"];
  const executionKeys = ["requireHumanConfirmation"];
  const sections = [ [v.trade, tradeKeys], [v.providers, providerKeys], [v.marketRegime, marketKeys], [v.verification, verificationKeys], [v.execution, executionKeys] ] as const;
  if (sections.some(([section, keys]) => !section || typeof section !== "object" || Object.keys(section).some((key) => !keys.includes(key)))) return null;
  if (v.version !== 1 || typeof v.trade !== "object" || typeof v.providers !== "object" || typeof v.marketRegime !== "object" || typeof v.verification !== "object" || typeof v.execution !== "object") return null;
  const candidate = value as ExecutionMandate;
  const bools = [...marketKeys.map((key) => (candidate.marketRegime as unknown as Record<string, unknown>)[key]), candidate.verification.requireVerifiedWrapperRatio, candidate.verification.requireCanonicalRepresentation, candidate.verification.requireSimulationSuccess, candidate.execution.requireHumanConfirmation];
  if (bools.some((item) => typeof item !== "boolean")) return null;
  if (candidate.providers.allowed !== null && !Array.isArray(candidate.providers.allowed)) return null;
  const allowed = candidate.providers.allowed;
  if (allowed !== null && (!Array.isArray(allowed) || allowed.some((p) => !["ondo", "bstock", "xstock"].includes(p)))) return null;
  if (!Array.isArray(candidate.providers.blocked) || candidate.providers.blocked.some((p) => !["ondo", "bstock", "xstock"].includes(p))) return null;
  for (const field of [candidate.trade.maxNotionalUsd, candidate.trade.maxPriceImpactPercent, candidate.trade.maxSlippagePercent]) if (field !== null && (!tryParseDecimal(field) || cmp(parseDecimal(field), parseDecimal("0")) <= 0)) return null;
  return structuredClone(candidate);
}

function check(decision: PolicyDecision, item: PolicyDecision["checks"][number]) { decision.checks.push(item); if (item.status === "failed") decision.blockingReasons.push(item.reason); if (item.status === "confirmation_required") decision.confirmationReasons.push(item.reason); }
export function evaluatePolicy(input: { ticker: string; notionalUsd: string; slippagePercent?: string; mandate: ExecutionMandate; quote?: NormalizedQuote | null; regime?: MarketRegime | null; simulationStatus?: string | null }): PolicyDecision {
  const d: PolicyDecision = { outcome: "allowed", checks: [], blockingReasons: [], confirmationReasons: [] };
  const amount = tryParseDecimal(input.notionalUsd);
  if (!amount) check(d, { id: "valid-notional", stage: "intent", status: "failed", reason: "Notional is malformed" });
  else if (input.mandate.trade.maxNotionalUsd && cmp(amount, parseDecimal(input.mandate.trade.maxNotionalUsd)) > 0) check(d, { id: "max-notional", stage: "intent", status: "failed", reason: "Trade exceeds mandate maxNotionalUsd", observed: input.notionalUsd, limit: input.mandate.trade.maxNotionalUsd }); else check(d, { id: "max-notional", stage: "intent", status: "passed", reason: "Trade size within mandate" });
  if (input.slippagePercent && input.mandate.trade.maxSlippagePercent && cmp(parseDecimal(input.slippagePercent), parseDecimal(input.mandate.trade.maxSlippagePercent)) > 0) check(d, { id: "max-slippage", stage: "intent", status: "failed", reason: "Slippage exceeds mandate", observed: input.slippagePercent, limit: input.mandate.trade.maxSlippagePercent }); else check(d, { id: "max-slippage", stage: "intent", status: "passed", reason: "Slippage within mandate" });
  const q = input.quote;
  if (q) {
    const providerAllowed = (input.mandate.providers.allowed === null || input.mandate.providers.allowed.includes(q.provider)) && !input.mandate.providers.blocked.includes(q.provider);
    check(d, { id: "provider", stage: "representation", status: providerAllowed ? "passed" : "failed", reason: providerAllowed ? "Provider allowed" : "Provider blocked by mandate", observed: q.provider });
    check(d, { id: "wrapper-ratio", stage: "representation", status: !input.mandate.verification.requireVerifiedWrapperRatio || q.ratioStatus === "verified" ? "passed" : "failed", reason: q.ratioStatus === "verified" ? "Wrapper ratio verified" : "Wrapper ratio is unverified" });
    if (input.mandate.trade.maxPriceImpactPercent && q.priceImpactPercent && cmp(parseDecimal(q.priceImpactPercent), parseDecimal(input.mandate.trade.maxPriceImpactPercent)) > 0) check(d, { id: "price-impact", stage: "quote", status: "failed", reason: "Price impact exceeds mandate", observed: q.priceImpactPercent, limit: input.mandate.trade.maxPriceImpactPercent }); else check(d, { id: "price-impact", stage: "quote", status: "passed", reason: "Price impact within mandate" });
  }
  const regime = input.regime ?? "unknown";
  const allow = regime === "regular" ? input.mandate.marketRegime.allowRegular : regime === "premarket" ? input.mandate.marketRegime.allowPremarket : regime === "postmarket" ? input.mandate.marketRegime.allowPostmarket : regime === "offhours" ? input.mandate.marketRegime.allowOffhours : regime === "closed" ? input.mandate.marketRegime.allowClosed : regime === "paused" ? input.mandate.marketRegime.allowPaused : regime === "restricted" ? input.mandate.marketRegime.allowRestricted : false;
  if (!allow) check(d, { id: "market-regime", stage: "market", status: "failed", reason: `Market regime ${regime} is not allowed` }); else if (regime !== "regular" && input.mandate.marketRegime.requireConfirmationOutsideRegular) check(d, { id: "market-regime", stage: "market", status: "confirmation_required", reason: `Market is ${regime}; mandate requires confirmation` }); else check(d, { id: "market-regime", stage: "market", status: "passed", reason: `Market regime ${regime} allowed` });
  if (input.simulationStatus && input.mandate.verification.requireSimulationSuccess) check(d, { id: "simulation", stage: "simulation", status: input.simulationStatus === "success" ? "passed" : "failed", reason: input.simulationStatus === "success" ? "Simulation succeeded" : `Simulation status ${input.simulationStatus} is not success` });
  if (d.blockingReasons.length) d.outcome = "blocked"; else if (d.confirmationReasons.length || input.mandate.execution.requireHumanConfirmation) d.outcome = "confirmation_required";
  return d;
}

export function filterPolicyCompliantQuotes(quotes: NormalizedQuote[], mandate: ExecutionMandate, regime: MarketRegime): { eligible: NormalizedQuote[]; decisions: Map<string, PolicyDecision> } {
  const decisions = new Map<string, PolicyDecision>();
  const eligible = quotes.filter((quote) => { const decision = evaluatePolicy({ ticker: "", notionalUsd: quote.inputAmountUsd, mandate, quote, regime }); decisions.set(`${quote.provider}:${quote.symbol}`, decision); return quote.available && decision.outcome !== "blocked"; });
  return { eligible, decisions };
}
