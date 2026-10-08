import { BinanceApiError } from "../../lib/binance/client";
import type { BinanceClient } from "../../lib/binance/client";
import { getBinanceConfig } from "../../lib/binance/config";
import { parseUnits } from "./decimal";
import { failedQuote, normalizeBinanceError, normalizeQuoteBody } from "./normalize";
import type { NormalizedQuote, QuoteProvider, QuoteRequest } from "./types";

export const USDT_BSC = {
  symbol: "USDT",
  contractAddress: "0x55d398326f99059ff775485246999027b3197955",
  decimals: 18,
} as const;

export function createBinanceQuoteProvider(client: BinanceClient): QuoteProvider {
  const cfg = getBinanceConfig();
  return {
    name: "binance-web3-aggregator",
    async getQuote(req: QuoteRequest): Promise<NormalizedQuote> {
      const { representation, notionalUsd, userWalletAddress } = req;
      const normalizeInput = {
        provider: representation.provider,
        symbol: representation.symbol,
        contractAddress: representation.contractAddress,
        tokenDecimals: representation.tokenDecimals,
        tokenToShareRatio: representation.tokenToShareRatio,
        ratioStatus: representation.ratioStatus,
        notionalUsd,
      };
      const params: Record<string, string> = {
        binanceChainId: String(representation.chainId),
        amount: parseUnits(notionalUsd, USDT_BSC.decimals),
        fromTokenAddress: USDT_BSC.contractAddress,
        toTokenAddress: representation.contractAddress,
      };
      if (userWalletAddress) params.userWalletAddress = userWalletAddress;
      try {
        const result = await client.signedGet(cfg.quotePath, params);
        const failure = normalizeBinanceError(result.body);
        if (failure) return failedQuote({ ...normalizeInput, latencyMs: result.latencyMs }, failure.code, failure.reason, result.body);
        return normalizeQuoteBody({ ...normalizeInput, latencyMs: result.latencyMs }, result.body);
      } catch (error) {
        if (error instanceof BinanceApiError) {
          return failedQuote(normalizeInput, String(error.code ?? "BINANCE_ERROR"), error.msg ?? error.message, error.body);
        }
        return failedQuote(normalizeInput, "REQUEST_FAILED", error instanceof Error ? error.message : String(error));
      }
    },
  };
}
