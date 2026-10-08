import type { ExposureIntent, MarketContext } from "../registry/types";
import { getRepresentations } from "../registry/registry";
import { fetchRwaRatios, fetchUnderlyingMarket } from "../registry/market";
import type { BinanceClient } from "../../lib/binance/client";
import { failedQuote } from "./normalize";
import { rankQuotes } from "./rank";
import type { NormalizedQuote, QuoteProvider, RoutingResult } from "./types";
import { filterPolicyCompliantQuotes, evaluatePolicy, type ExecutionMandate } from "../policy/engine";

export async function routeIntent(intent: ExposureIntent, quoteProvider: QuoteProvider, client: BinanceClient, mandate?: ExecutionMandate): Promise<RoutingResult> {
  const ticker = intent.ticker.toUpperCase();
  const representations = getRepresentations(ticker);
  if (representations.length === 0) return { intent: { ticker, notionalUsd: intent.notionalUsd, userWalletAddress: intent.userWalletAddress ?? null }, marketContext: null, representationsEvaluated: 0, quotes: [], selected: null, rejected: [{ provider: null, symbol: ticker, reason: `Unsupported ticker: ${ticker}`, code: "UNSUPPORTED_TICKER" }], explanation: [`No canonical tokenized representations registered for ${ticker}.`] };
  const [ratios, market] = await Promise.all([fetchRwaRatios(client, ticker), fetchUnderlyingMarket(client, representations[0])]);
  const ratioByAddress = new Map(ratios.map((r) => [r.contractAddress.toLowerCase(), r]));
  const settled = await Promise.allSettled(representations.map((rep) => { const ratio = ratioByAddress.get(rep.contractAddress.toLowerCase()); return quoteProvider.getQuote({ representation: { provider: rep.provider, symbol: rep.symbol, contractAddress: rep.contractAddress, chainId: rep.chainId, tokenDecimals: rep.tokenDecimals, tokenToShareRatio: ratio?.tokenToShareRatio ?? null, ratioStatus: ratio?.ratioStatus ?? "unavailable" }, notionalUsd: intent.notionalUsd, userWalletAddress: intent.userWalletAddress }); }));
  const quotes: NormalizedQuote[] = settled.map((result, index) => { const rep = representations[index]; const ratio = ratioByAddress.get(rep.contractAddress.toLowerCase()); const base = { provider: rep.provider, symbol: rep.symbol, contractAddress: rep.contractAddress, tokenDecimals: rep.tokenDecimals, tokenToShareRatio: ratio?.tokenToShareRatio ?? null, ratioStatus: ratio?.ratioStatus ?? "unavailable" as const, notionalUsd: intent.notionalUsd }; return result.status === "fulfilled" ? result.value : failedQuote(base, "PROVIDER_ERROR", result.reason instanceof Error ? result.reason.message : String(result.reason)); });
  const marketContext: MarketContext = { ...market, regime: market.normalizedRegime };
  const policyFiltered = mandate ? filterPolicyCompliantQuotes(quotes, mandate, marketContext.regime) : { eligible: quotes, decisions: new Map() };
  const { selected, rejected: rankedRejected, ranked } = rankQuotes(policyFiltered.eligible);
  const rejected = [...rankedRejected];
  const policyRejectedRoutes = mandate ? quotes.filter((x) => !policyFiltered.eligible.includes(x)).map((q) => { const decision = policyFiltered.decisions.get(`${q.provider}:${q.symbol}`); const failed = decision?.checks.find((c: { status: string; id: string; stage: string; reason: string }) => c.status === "failed"); return { provider: q.provider, symbol: q.symbol, reasonCode: failed?.id === "provider" ? "PROVIDER_BLOCKED" : failed?.id === "price-impact" ? "PRICE_IMPACT_LIMIT" : failed?.id === "wrapper-ratio" ? "UNVERIFIED_WRAPPER_RATIO" : "POLICY_BLOCKED", reason: failed?.reason ?? "Route violates active mandate", stage: (failed?.stage ?? "representation") as "representation" | "quote" | "market" }; }) : [];
  if (mandate) for (const q of quotes.filter((x) => !policyFiltered.eligible.includes(x))) rejected.push({ provider: q.provider, symbol: q.symbol, reason: policyRejectedRoutes.find((x) => x.symbol === q.symbol)?.reason ?? "Route violates mandate", code: "POLICY_BLOCKED" });
  const explanation = selected ? [`${selected.provider}/${selected.symbol} selected after deterministic policy filtering and ranking (${selected.estimatedUnderlyingShares} shares for $${intent.notionalUsd}).`, `Market regime: ${marketContext.regime}.`] : ["No executable route remained after policy filtering and deterministic ranking.", `Market regime: ${marketContext.regime}.`];
  if (ranked.length > 1) explanation.push(`Deterministic ranking evaluated ${ranked.length} policy-compliant route(s).`);
  return { intent: { ticker, notionalUsd: intent.notionalUsd, userWalletAddress: intent.userWalletAddress ?? null }, marketContext, representationsEvaluated: representations.length, quotes, selected, rejected, explanation, mandate, policyDecision: mandate ? evaluatePolicy({ ticker, notionalUsd: intent.notionalUsd, mandate, regime: marketContext.regime, quote: selected }) : undefined, policyRejectedRoutes };
}
