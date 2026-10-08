import type { UnderlyingMarketStatus } from "./market";

export type EquityProvider = "ondo" | "bstock" | "xstock";
export type RatioStatus = "verified" | "assumed" | "unavailable";

export type EquityRepresentation = {
  underlying: string;
  provider: EquityProvider;
  symbol: string;
  chainId: number;
  contractAddress: string;
  recognized: boolean;
  tokenDecimals: number;
  /** Live metadata is required; no production fallback ratio is permitted. */
  tokenToShareRatio?: string;
  ratioStatus: RatioStatus;
};

export type ExposureIntent = {
  ticker: string;
  notionalUsd: string;
  userWalletAddress?: string;
};

export type MarketRegime =
  | "regular"
  | "premarket"
  | "postmarket"
  | "offhours"
  | "closed"
  | "paused"
  | "restricted"
  | "unknown";

export type MarketContext = UnderlyingMarketStatus & { regime: MarketRegime };
