import type { BestExecutionReceipt } from "../receipts/types";
import type { NormalizedQuote, QuoteRejection, PolicyRejectedRoute } from "./types";
import type { MarketContext } from "../registry/types";

export type RouteApiResponse = {
  intent: { ticker: string; notionalUsd: string; userWalletAddress: string | null };
  marketContext: MarketContext | null;
  representationsEvaluated: number;
  quotes: NormalizedQuote[];
  selected: NormalizedQuote | null;
  rejected: QuoteRejection[];
  policyRejectedRoutes?: PolicyRejectedRoute[];
  explanation: string[];
  receipt: BestExecutionReceipt;
};

export type RouteApiError = { error: string; detail?: string };
