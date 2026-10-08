import { createBinanceClient } from "../../lib/binance/client";
import { createBinanceQuoteProvider } from "../routing/quote-provider";
import { routeIntent } from "../routing/service";
import { validateMandate } from "./engine";

export async function evaluatePolicyPreview(input: { ticker: string; notionalUsd: string; slippagePercent: string; mandate?: unknown; userWalletAddress?: string }) {
  const mandate = validateMandate(input.mandate);
  if (!mandate) return null;
  const client = createBinanceClient();
  const routing = await routeIntent({ ticker: input.ticker, notionalUsd: input.notionalUsd, userWalletAddress: input.userWalletAddress }, createBinanceQuoteProvider(client), client, mandate);
  return { mandate, intent: routing.intent, marketContext: routing.marketContext, quotes: routing.quotes, selected: routing.selected, rejected: routing.rejected, policyRejectedRoutes: routing.policyRejectedRoutes, policyDecision: routing.policyDecision, evaluatedAt: new Date().toISOString() };
}
