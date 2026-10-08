import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildPreHash, buildSignedRequestPath, signRequestPayload, toQueryString } from "../signature";
import { BinanceApiError, createBinanceClient } from "../client";
import type { BinanceConfig } from "../config";

describe("Binance authentication signing", () => {
  it("uses exact path, query order, percent20 encoding, and Base64 HMAC", () => {
    const query = toQueryString({ first: "a b", second: "x/y" });
    expect(query).toBe("first=a%20b&second=x%2Fy");
    const path = buildSignedRequestPath("/api/v1/dex/aggregator/quote", query);
    expect(path).toBe("/build/api/v1/dex/aggregator/quote?first=a%20b&second=x%2Fy");
    expect(path.match(/\/build/g)).toHaveLength(1);
    const preHash = buildPreHash("2026-10-04T12:00:00.000Z", "GET", path, "");
    expect(preHash).toBe("2026-10-04T12:00:00.000ZGET/build/api/v1/dex/aggregator/quote?first=a%20b&second=x%2Fy");
    expect(signRequestPayload("secret", preHash)).toBe("bwjN6yvUwHux7TXkKmxYKkqBmKMcZJLXZJN+668JMMU=");
  });

  it("rejects caller paths containing /build", () => {
    expect(() => buildSignedRequestPath("/build/api/v1/test", "")).toThrow(/must not include/);
  });
});

describe("Binance client request fidelity and errors", () => {
  const config: BinanceConfig = {
    apiKey: " key ", secretKey: " secret ", baseOrigin: "https://web3.binance.com", signedPathPrefix: "/build",
    quotePath: "/api/v1/dex/aggregator/quote", rwaTokensPath: "/api/v1/dex/market/rwa/tokens", underlyingMarketPath: "/api/v1/dex/market/rwa/underlying-market", swapPath: "/api/v1/dex/aggregator/swap", simulatePath: "/api/v1/dex/pre-transaction/simulate", timeoutMs: 5000, recvWindow: 10000,
  };
  beforeEach(() => vi.restoreAllMocks());

  it("uses exact OC headers and identical query in URL/signed path", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = createBinanceClient(config);
    const result = await client.signedGet("/api/v1/dex/aggregator/quote", { first: "a b", second: "two" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("https://web3.binance.com/build/api/v1/dex/aggregator/quote?first=a%20b&second=two");
    expect(String(url).match(/\/build/g)).toHaveLength(1);
    const headers = new Headers(init?.headers);
    expect(headers.get("X-OC-APIKEY")).toBe("key");
    const timestamp = headers.get("X-OC-TIMESTAMP");
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const request = new URL(String(url));
    const signedPath = `${request.pathname}${request.search}`;
    const expected = signRequestPayload("secret", `${timestamp}GET${signedPath}`);
    expect(headers.get("X-OC-SIGN")).toBe(expected);
    expect([...headers.keys()].filter((key) => key.startsWith("x-oc-")).sort()).toEqual(["x-oc-apikey", "x-oc-recv-window", "x-oc-sign", "x-oc-timestamp"]);
    expect(headers.get("X-OC-RECV-WINDOW")).toBe("10000");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("parses Binance 401 code/msg without exposing credentials or signature", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: 40102, msg: "Invalid signature" }), { status: 401 }));
    const client = createBinanceClient(config);
    try { await client.signedGet("/api/v1/dex/aggregator/supported/chain", {}); throw new Error("expected error"); } catch (error) {
      expect(error).toBeInstanceOf(BinanceApiError);
      const apiError = error as BinanceApiError;
      expect(apiError.status).toBe(401);
      expect(apiError.code).toBe(40102);
      expect(apiError.msg).toBe("Invalid signature");
      expect(JSON.stringify(apiError.diagnostics)).not.toContain("secret");
      expect(JSON.stringify(apiError.diagnostics)).not.toContain("X-OC-SIGN");
      expect(apiError.diagnostics.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});
