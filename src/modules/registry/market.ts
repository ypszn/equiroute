import type { BinanceClient } from "../../lib/binance/client";
import type { EquityProvider, EquityRepresentation, RatioStatus } from "./types";
import { getBinanceConfig } from "../../lib/binance/config";
import { getRepresentations } from "./registry";
import { isBody, pickString } from "../routing/normalize";

export type RwaRatioMetadata = {
  contractAddress: string;
  provider: EquityProvider;
  underlying: string;
  tokenToShareRatio: string | null;
  ratioStatus: RatioStatus;
  raw: unknown;
};

export type UnderlyingMarketStatus = {
  openState: boolean | null;
  marketStatus: string | null;
  reasonCode: string | null;
  reasonMsg: string | null;
  nextOpenTime: string | null;
  nextCloseTime: string | null;
  referencePrice: string | null;
  normalizedRegime: "regular" | "premarket" | "postmarket" | "offhours" | "closed" | "paused" | "restricted" | "unknown";
  raw: unknown;
};

function unwrap(body: unknown): Record<string, unknown> {
  if (!isBody(body)) return {};
  return isBody(body.data) ? body.data : body;
}

function normalizeProvider(value: string | null): EquityProvider | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.includes("ondo")) return "ondo";
  if (v.includes("bstock") || v.includes("b-stock") || v.includes("backed")) return "bstock";
  if (v.includes("xstock")) return "xstock";
  return null;
}

function findArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  const root = unwrap(body);
  for (const key of ["tokens", "items", "list", "records", "data"]) {
    if (Array.isArray(root[key])) return root[key];
  }
  return [];
}

function optionalText(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}
function recordField(item: Record<string, unknown>, keys: string[]): string | null {
  return pickString(item, keys);
}

export function parseRwaRatios(
  body: unknown,
  representations: readonly EquityRepresentation[] = getRepresentations("NVDA"),
): RwaRatioMetadata[] {
  const rows = findArray(body);
  return representations.map((rep) => {
    const row = rows.find((candidate) => {
      if (!isBody(candidate)) return false;
      const contract = recordField(candidate, ["tokenContractAddress"]);
      const underlying = recordField(candidate, ["underlyingTicker"]);
      const platform = recordField(candidate, ["platformId"]);
      const chain = recordField(candidate, ["binanceChainId"]);
      return contract?.toLowerCase() === rep.contractAddress.toLowerCase() &&
        underlying?.toUpperCase() === rep.underlying &&
        chain === String(rep.chainId) &&
        normalizeProvider(platform) === rep.provider;
    });
    const rawRatio = row && isBody(row) ? recordField(row, ["tokenToShareRatio"]) : null;
    const validRatio = rawRatio !== null && /^\d+(?:\.\d+)?$/.test(rawRatio) && rawRatio !== "0";
    return {
      contractAddress: rep.contractAddress,
      provider: rep.provider,
      underlying: rep.underlying,
      tokenToShareRatio: validRatio ? rawRatio : null,
      ratioStatus: validRatio ? "verified" : "unavailable",
      raw: row ?? null,
    };
  });
}

export async function fetchRwaRatios(client: BinanceClient, ticker: string): Promise<RwaRatioMetadata[]> {
  const cfg = getBinanceConfig();
  const reps = getRepresentations(ticker);
  try {
    const result = await client.signedGet(cfg.rwaTokensPath, {});
    return parseRwaRatios(result.body, reps);
  } catch (error) {
    return reps.map((rep) => ({
      contractAddress: rep.contractAddress,
      provider: rep.provider,
      underlying: rep.underlying,
      tokenToShareRatio: null,
      ratioStatus: "unavailable",
      raw: { error: error instanceof Error ? error.message : String(error) },
    }));
  }
}

export function parseUnderlyingMarket(body: unknown): UnderlyingMarketStatus {
  const root = unwrap(body);
  const status = isBody(root.statusInfo) ? root.statusInfo : {};
  const market = isBody(root.marketData) ? root.marketData : {};
  const knownState = pickString(status, ["marketStatus"]);
  let normalizedRegime: UnderlyingMarketStatus["normalizedRegime"] = "unknown";
  if (knownState) {
    const state = knownState.toLowerCase();
    if (state.includes("pre")) normalizedRegime = "premarket";
    else if (state.includes("post")) normalizedRegime = "postmarket";
    else if (state.includes("pause")) normalizedRegime = "paused";
    else if (state.includes("restrict")) normalizedRegime = "restricted";
    else if (state.includes("open") || state === "regular") normalizedRegime = "regular";
    else if (state.includes("close")) normalizedRegime = "closed";
    else if (state.includes("offhour")) normalizedRegime = "offhours";
  }
  return {
    openState: typeof status.openState === "boolean" ? status.openState : null,
    marketStatus: pickString(status, ["marketStatus"]),
    reasonCode: pickString(status, ["reasonCode"]),
    reasonMsg: pickString(status, ["reasonMsg"]),
    nextOpenTime: optionalText(status.nextOpenTime),
    nextCloseTime: optionalText(status.nextCloseTime),
    referencePrice: pickString(market, ["referencePrice"]),
    normalizedRegime,
    raw: body,
  };
}

export async function fetchUnderlyingMarket(client: BinanceClient, representation: EquityRepresentation): Promise<UnderlyingMarketStatus> {
  const cfg = getBinanceConfig();
  try {
    const result = await client.signedGet(cfg.underlyingMarketPath, {
      binanceChainId: String(representation.chainId),
      tokenContractAddress: representation.contractAddress,
    });
    return parseUnderlyingMarket(result.body);
  } catch (error) {
    return {
      openState: null,
      marketStatus: null,
      reasonCode: "REQUEST_FAILED",
      reasonMsg: error instanceof Error ? error.message : String(error),
      nextOpenTime: null,
      nextCloseTime: null,
      referencePrice: null,
      normalizedRegime: "unknown",
      raw: null,
    };
  }
}
