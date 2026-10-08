export type BinanceConfig = {
  apiKey: string;
  secretKey: string;
  baseOrigin: string;
  signedPathPrefix: string;
  quotePath: string;
  rwaTokensPath: string;
  underlyingMarketPath: string;
  swapPath: string;
  simulatePath: string;
  timeoutMs: number;
  recvWindow: number;
};

const DEFAULT_BASE_URL = "https://web3.binance.com/build";
export const BINANCE_PATHS = {
  quote: "/api/v1/dex/aggregator/quote",
  rwaTokens: "/api/v1/dex/market/rwa/tokens",
  underlyingMarket: "/api/v1/dex/market/rwa/underlying-market",
  swap: "/api/v1/dex/aggregator/swap",
  simulate: "/api/v1/dex/pre-transaction/simulate",
} as const;

let cached: BinanceConfig | null = null;

function numericEnv(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

function endpointPath(name: string, fallback: string): string {
  const value = (process.env[name] ?? fallback).trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("/build/build")) {
    throw new Error(`${name} must be an absolute API path without a duplicated /build prefix`);
  }
  return value;
}

export function getBinanceConfig(): BinanceConfig {
  if (cached) return cached;
  const apiKey = process.env.OC_API_KEY?.trim();
  const secretKey = process.env.OC_SECRET_KEY?.trim();
  if (!apiKey || !secretKey) {
    throw new Error("Missing Binance API credentials: OC_API_KEY and OC_SECRET_KEY must be set (see .env.example).");
  }
  const rawBase = (process.env.OC_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const match = rawBase.match(/^(https?:\/\/[^/]+)(\/.*)?$/);
  if (!match) throw new Error(`OC_BASE_URL is not a valid URL: ${rawBase}`);
  const signedPathPrefix = match[2] || "/build";
  if (signedPathPrefix !== "/build") throw new Error("OC_BASE_URL must use the /build API prefix");
  cached = {
    apiKey,
    secretKey,
    baseOrigin: match[1],
    signedPathPrefix,
    quotePath: endpointPath("OC_QUOTE_PATH", BINANCE_PATHS.quote),
    rwaTokensPath: BINANCE_PATHS.rwaTokens,
    underlyingMarketPath: BINANCE_PATHS.underlyingMarket,
    swapPath: BINANCE_PATHS.swap,
    simulatePath: BINANCE_PATHS.simulate,
    timeoutMs: numericEnv("OC_TIMEOUT_MS", 15_000),
    recvWindow: numericEnv("OC_RECV_WINDOW", 10_000),
  };
  return cached;
}

export function __resetBinanceConfigForTests(): void {
  cached = null;
}
