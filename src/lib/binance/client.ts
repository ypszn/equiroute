import { getBinanceConfig, type BinanceConfig } from "./config";
import { buildPreHash, buildSignedRequestPath, signRequestPayload, toQueryString } from "./signature";

export type BinanceDiagnostics = {
  method: string;
  apiPath: string;
  signedRequestPathname: string;
  queryKeys: string[];
  status: number | null;
  code: string | number | null;
  msg: string | null;
  durationMs: number;
};

export class BinanceApiError extends Error {
  readonly diagnostics: BinanceDiagnostics;
  constructor(message: string, readonly status: number | null, readonly code: string | number | null, readonly msg: string | null, readonly body: unknown, diagnostics: BinanceDiagnostics) {
    super(message);
    this.name = "BinanceApiError";
    this.diagnostics = diagnostics;
  }
}

export class BinanceNetworkError extends Error {
  constructor(message: string, readonly cause?: unknown, readonly diagnostics?: BinanceDiagnostics) {
    super(message);
    this.name = "BinanceNetworkError";
  }
}

export type SignedRequestResult = { status: number; body: unknown; latencyMs: number; signedPath: string };
export type BinanceClient = {
  signedGet(path: string, params: Record<string, string>): Promise<SignedRequestResult>;
  signedPost(path: string, params: Record<string, string>, body: unknown): Promise<SignedRequestResult>;
};

function parseBody(text: string): unknown {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

function errorFields(body: unknown): { code: string | number | null; msg: string | null } {
  if (body === null || typeof body !== "object") return { code: null, msg: null };
  const record = body as Record<string, unknown>;
  const code = typeof record.code === "string" || typeof record.code === "number" ? record.code : null;
  const value = record.msg ?? record.message;
  return { code, msg: typeof value === "string" ? value : null };
}

function validateBuildPath(url: string, signedPath: string): void {
  const occurrences = (s: string) => (s.match(/\/build(?=\/|$)/g) ?? []).length;
  if (occurrences(url) !== 1 || occurrences(signedPath) !== 1 || !signedPath.startsWith("/build/")) {
    throw new Error("Binance URL and signed request path must each contain exactly one leading /build");
  }
}

export function createBinanceClient(config: BinanceConfig = getBinanceConfig()): BinanceClient {
  async function request(method: "GET" | "POST", apiPath: string, params: Record<string, string>, bodyValue?: unknown): Promise<SignedRequestResult> {
    const body = method === "POST" ? JSON.stringify(bodyValue ?? {}) : "";
    const query = toQueryString(params);
    const signedPath = buildSignedRequestPath(apiPath, query);
    const requestUrl = `${config.baseOrigin}${signedPath}`;
    validateBuildPath(requestUrl, signedPath);
    const timestamp = new Date().toISOString();
    const signature = signRequestPayload(config.secretKey.trim(), buildPreHash(timestamp, method, signedPath, body));
    const queryKeys = Object.keys(params);
    const diagnosticsBase = { method, apiPath, signedRequestPathname: signedPath.split("?")[0], queryKeys };
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(requestUrl, {
        method,
        headers: {
          "X-OC-APIKEY": config.apiKey.trim(),
          "X-OC-TIMESTAMP": timestamp,
          "X-OC-SIGN": signature,
          "X-OC-RECV-WINDOW": String(config.recvWindow),
          Accept: "application/json",
          ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
        },
        ...(method === "POST" ? { body } : {}),
        cache: "no-store",
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (error) {
      const durationMs = Date.now() - started;
      const diagnostics: BinanceDiagnostics = { ...diagnosticsBase, status: null, code: null, msg: null, durationMs };
      if (process.env.NODE_ENV === "development") console.debug("Binance request diagnostics", diagnostics);
      throw new BinanceNetworkError(`Network error calling Binance ${apiPath}: ${error instanceof Error ? error.message : String(error)}`, error, diagnostics);
    }
    const durationMs = Date.now() - started;
    const parsed = parseBody(await response.text());
    const { code, msg } = errorFields(parsed);
    const diagnostics: BinanceDiagnostics = { ...diagnosticsBase, status: response.status, code, msg, durationMs };
    if (process.env.NODE_ENV === "development") console.debug("Binance request diagnostics", diagnostics);
    if (!response.ok) throw new BinanceApiError(`Binance API error ${response.status}${code !== null ? ` (${code})` : ""}: ${msg ?? "HTTP error"}`, response.status, code, msg, parsed, diagnostics);
    return { status: response.status, body: parsed, latencyMs: durationMs, signedPath };
  }
  return {
    signedGet: (path, params) => request("GET", path, params),
    signedPost: (path, params, body) => request("POST", path, params, body),
  };
}

