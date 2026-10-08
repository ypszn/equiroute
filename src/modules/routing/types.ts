import type { EquityProvider, MarketContext, RatioStatus } from "../registry/types";
import type { PolicyDecision, ExecutionMandate } from "../policy/engine";

export type DexRouteHop = {
  dexName: string | null;
  percent: string | null;
  fromTokenSymbol: string | null;
  toTokenSymbol: string | null;
  fromTokenIndex: string | null;
  toTokenIndex: string | null;
  raw: unknown;
};

export type DexRoute = {
  hops: DexRouteHop[];
  raw: unknown;
};

export type NormalizedQuote = {
  provider: EquityProvider;
  symbol: string;
  contractAddress: string;
  available: boolean;
  vendorName: string | null;
  executionMode: string | null;
  inputAmountUsd: string;
  inputAmountRaw: string | null;
  outputTokenAmount: string | null;
  estimatedUnderlyingShares: string | null;
  effectiveUsdPerShare: string | null;
  priceImpactPercent: string | null;
  tradeFee: string | null;
  estimatedGas: string | null;
  dexes: DexRoute[] | null;
  quoteId: string | null;
  approveTarget: string | null;
  latencyMs: number;
  ratioStatus: RatioStatus;
  tokenToShareRatio?: string | null;
  failureCode: string | null;
  failureReason: string | null;
  raw: unknown;
};

export type QuoteRejection = {
  provider: EquityProvider | null;
  symbol: string;
  reason: string;
  code: string | null;
};


export type QuoteRequest = {
  representation: {
    provider: EquityProvider;
    symbol: string;
    contractAddress: string;
    chainId: number;
    tokenDecimals: number;
    tokenToShareRatio: string | null;
    ratioStatus: RatioStatus;
  };
  notionalUsd: string;
  userWalletAddress?: string;
};

export type QuoteProvider = {
  name: string;
  getQuote(req: QuoteRequest): Promise<NormalizedQuote>;
};

export type PolicyRejectedRoute = {
  provider: string;
  symbol: string;
  reasonCode: string;
  reason: string;
  stage: "representation" | "quote" | "market";
};
export type RoutingResult = {
  intent: { ticker: string; notionalUsd: string; userWalletAddress: string | null };
  marketContext: MarketContext | null;
  representationsEvaluated: number;
  quotes: NormalizedQuote[];
  selected: NormalizedQuote | null;
  rejected: QuoteRejection[];
  explanation: string[];
  mandate?: ExecutionMandate;
  policyDecision?: PolicyDecision;
  policyRejectedRoutes?: PolicyRejectedRoute[];
};
