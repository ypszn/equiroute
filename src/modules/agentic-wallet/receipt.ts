import type { AgenticWalletCapability, CanonicalCapabilityMap, ExecutionReadiness } from "./types";
import type { PreparationResult } from "../preparation/types";
import type { AgenticWalletState } from "./types";

function selectedCapability(input: { preparation: PreparationResult | null; capabilities: CanonicalCapabilityMap | null }): AgenticWalletCapability | null {
  const provider = input.preparation?.route.selected?.provider;
  if (!provider || !input.capabilities) return null;
  if (provider === "bstock") return input.capabilities.bstock;
  if (provider === "ondo") return input.capabilities.ondo;
  if (provider === "xstock") return input.capabilities.xstock;
  return null;
}

export function buildAgenticPreflightReceipt(input: { wallet: AgenticWalletState; preparation: PreparationResult | null; readiness: ExecutionReadiness; equiRoutePolicy: unknown; capabilities: CanonicalCapabilityMap | null }) {
  return {
    agenticWallet: {
      connection: input.wallet.connection,
      executionAddress: input.wallet.address,
      addressBinding: input.readiness.agenticWallet.addressMatch ? "passed" : "failed",
      bscSupported: input.wallet.bscSupported,
      usdtBalance: input.wallet.balances.usdt,
      usdtReadiness: input.readiness.agenticWallet.inputBalanceSufficient,
      bnbBalance: input.wallet.balances.bnb,
      gasReadiness: input.readiness.agenticWallet.gasBalanceAvailable,
      dailyLimit: input.wallet.quota.dailyLimit,
      quotaUsed: input.wallet.quota.used,
      quotaRemaining: input.wallet.quota.remaining,
      quotaReadiness: input.readiness.agenticWallet.quotaSufficient,
      abnormalTxnHandling: input.wallet.security.abnormalTxnHandling,
      tradeAllTokens: input.wallet.security.tradeAllTokens,
      developerMode: input.wallet.developerMode,
      executionCompatibility: "unverified",
      capability: selectedCapability(input),
    },
    capabilities: input.capabilities,
    equiRoutePolicy: input.equiRoutePolicy,
    finalExecutionReadiness: input.readiness,
  };
}
