import { createBinanceClient } from "@/lib/binance/client";
import { createBinanceQuoteProvider } from "@/modules/routing/quote-provider";
import { routeIntent } from "@/modules/routing/service";
import { buildReceipt } from "@/modules/receipts/build-receipt";
import { tryParseDecimal, isPositive } from "@/modules/routing/decimal";

/**
 * POST /api/route
 *
 * Read-only intent routing. Returns executable quotes per canonical
 * representation, deterministic selection, and a Best-Execution Receipt.
 *
 * NEVER requests or accepts private keys / seed phrases. The optional
 * userWalletAddress is a PUBLIC BSC address only, required by some quote
 * vendors for executable-route calculation.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body === null || typeof body !== "object") {
    return Response.json({ error: "Body must be an object" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const ticker = typeof b.ticker === "string" ? b.ticker.trim().toUpperCase() : "";
  const notionalUsd = typeof b.notionalUsd === "string" ? b.notionalUsd.trim() : "";
  const userWalletAddress =
    typeof b.userWalletAddress === "string" && b.userWalletAddress.trim().length > 0
      ? b.userWalletAddress.trim()
      : undefined;

  if (ticker.length === 0) {
    return Response.json({ error: "ticker is required" }, { status: 400 });
  }
  const notional = tryParseDecimal(notionalUsd);
  if (notional === null || !isPositive(notional)) {
    return Response.json(
      { error: "notionalUsd must be a positive decimal string" },
      { status: 400 },
    );
  }
  if (
    userWalletAddress !== undefined &&
    !/^0x[0-9a-fA-F]{40}$/.test(userWalletAddress)
  ) {
    return Response.json(
      { error: "userWalletAddress must be a 0x-prefixed 20-byte address (public key only)" },
      { status: 400 },
    );
  }

  try {
    const client = createBinanceClient();
    const provider = createBinanceQuoteProvider(client);
    const result = await routeIntent(
      { ticker, notionalUsd, userWalletAddress },
      provider,
      client,
    );
    const receipt = buildReceipt(result);

    return Response.json({
      intent: result.intent,
      marketContext: result.marketContext,
      representationsEvaluated: result.representationsEvaluated,
      quotes: result.quotes,
      selected: result.selected,
      rejected: result.rejected,
      policyRejectedRoutes: result.policyRejectedRoutes,
      explanation: result.explanation,
      receipt,
    });
  } catch (err) {
    // Honest failure — no fake fallback quotes.
    const message = err instanceof Error ? err.message : String(err);
    const isConfig = message.includes("OC_API_KEY") || message.includes("OC_SECRET_KEY");
    return Response.json(
      {
        error: isConfig
          ? "Binance API credentials are not configured on the server."
          : "Routing failed upstream.",
        detail: message,
      },
      { status: isConfig ? 503 : 502 },
    );
  }
}
