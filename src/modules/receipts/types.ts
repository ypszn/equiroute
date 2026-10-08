import type { EquityProvider } from "../registry/types";
import type { QuoteRejection } from "../routing/types";
import type { DexRoute } from "../routing/types";

/**
 * Best-Execution Receipt: a deterministic, human-readable record of why a
 * route won. Generated from normalized quote data — never from an LLM.
 */
export type ReceiptEntry = {
  provider: EquityProvider;
  symbol: string;
  status: "executable" | "rejected";
  /** Present when executable. */
  effectiveExposurePrice?: string;
  estimatedUnderlyingShares?: string;
  executionMode?: string | null;
  vendorName?: string | null;
  priceImpactPercent?: string | null;
  outputTokenAmount?: string | null;
  effectiveUsdPerShare?: string | null;
  dexes?: DexRoute[] | null;
  ratioStatus?: "verified" | "assumed" | "unavailable";
  /** Present when rejected. */
  reason?: string;
  code?: string | null;
};

export type BestExecutionReceipt = {
  intent: {
    ticker: string;
    notionalUsd: string;
    description: string;
  };
  representationsEvaluated: number;
  entries: ReceiptEntry[];
  selected: {
    provider: EquityProvider;
    symbol: string;
    contractAddress: string;
  } | null;
  why: string[];
  rejectedRoutes: QuoteRejection[];
  generatedAt: string;
};
