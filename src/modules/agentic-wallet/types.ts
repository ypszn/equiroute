export type AgenticWalletConnection = "connected" | "signed_out" | "unavailable" | "error";
export type AgenticExecutionCompatibility = "supported" | "unsupported" | "unverified";
export type AgenticWalletCapability = { quote: "supported" | "unsupported" | "unavailable" | "unknown"; execution: AgenticExecutionCompatibility; details: { success: boolean | null; code: string | number | null; message: string | null; fromSymbol: string | null; fromAmount: string | null; toSymbol: string | null; toAmount: string | null; slippage: string | null; durationMs: number; errorClass?: string | null } };
export type CanonicalCapabilityMap = { bstock: AgenticWalletCapability; ondo: AgenticWalletCapability; xstock: AgenticWalletCapability };

export type AgenticWalletChain = { binanceChainId: string; name: string | null; simpleName: string | null };
export type AgenticWalletBalance = { symbol: string; address: string; binanceChainId: string; balance: string };
export type AgenticWalletSettings = {
  dailyLimit: string | null;
  quotaUsed: string | null;
  quotaLeft: string | null;
  quotaDate: string | null;
  abnormalTxnHandling: string | null;
  tradeAllTokens: boolean | null;
  devMode: { enabled: boolean | null; expiresAt: string | null; dailyLimit: string | null; balanceExceeded: boolean | null };
  sessionExpireTime: string | null;
};
export type AgenticWalletState = {
  connection: AgenticWalletConnection;
  address: string | null;
  bscSupported: boolean;
  balances: { usdt: string | null; bnb: string | null };
  quota: { dailyLimit: string | null; used: string | null; remaining: string | null; date: string | null };
  security: { abnormalTxnHandling: string | null; tradeAllTokens: boolean | null };
  developerMode: { enabled: boolean | null; expiresAt: string | null; dailyLimit: string | null; balanceExceeded: boolean | null };
  sessionExpireTime: string | null;
  errorCode: string | null;
  cliVersion?: string | null;
  requiredCliVersion?: string;
  cliCompatible?: boolean | null;
  skillVersion?: string;
  skillUpdateAvailable?: boolean | null;
};

export type ExecutionReadiness = {
  outcome: "ready_for_confirmation" | "blocked" | "wallet_setup_required" | "wallet_funding_required";
  equiRouteOutcome: "allowed" | "confirmation_required" | "blocked";
  equiRoutePolicy: import("../policy/engine").PolicyDecision;
  agenticWallet: {
    connected: boolean;
    addressMatch: boolean;
    chainSupported: boolean;
    inputBalanceSufficient: true | false | "unknown";
    gasBalanceAvailable: true | false | "unknown";
    quotaSufficient: true | false | "unknown";
    tokenScopeCompatible: true | false | "unknown";
    executionCompatibility: AgenticExecutionCompatibility;
  };
  blockingReasons: string[];
  confirmationReasons: string[];
};

export interface AgenticWalletClient {
  getStatus(): Promise<unknown>;
  getAddress(): Promise<unknown>;
  getChains(): Promise<unknown>;
  getBalances(chainId: string): Promise<unknown>;
  getSettings(): Promise<unknown>;
  cliCheck(): Promise<unknown>;
  skillCheck(): Promise<unknown>;
  quoteMarketOrder(input: { fromTokenQty: string; fromToken: string; toToken: string; binanceChainId: "56"; slippage: string }): Promise<unknown>;
  auditToken?(tokenAddress: string): Promise<unknown>;
}
