import { createHmac } from "node:crypto";

export function toQueryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

export function buildSignedRequestPath(apiPath: string, query: string): string {
  if (!apiPath.startsWith("/") || apiPath.startsWith("//")) {
    throw new Error("Binance API path must be absolute and must not include a host");
  }
  if (apiPath === "/build" || apiPath.startsWith("/build/")) {
    throw new Error("Binance API paths must not include the /build prefix");
  }
  const fullPath = query ? `${apiPath}?${query}` : apiPath;
  return `/build${fullPath}`;
}

export function buildPreHash(timestamp: string, method: string, signedRequestPath: string, body = ""): string {
  return `${timestamp}${method.toUpperCase()}${signedRequestPath}${body}`;
}

export function signRequestPayload(secretKey: string, preHash: string): string {
  return createHmac("sha256", secretKey).update(preHash, "utf8").digest("base64");
}
