import { evaluatePolicyPreview } from "@/modules/policy/preview";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Body must be an object" }, { status: 400 });
  const value = body as Record<string, unknown>;
  if (typeof value.ticker !== "string" || typeof value.notionalUsd !== "string") return Response.json({ error: "ticker and notionalUsd are required" }, { status: 400 });
  try {
    const result = await evaluatePolicyPreview({ ticker: value.ticker, notionalUsd: value.notionalUsd, slippagePercent: typeof value.slippagePercent === "string" ? value.slippagePercent : "0.5", mandate: value.mandate, userWalletAddress: typeof value.userWalletAddress === "string" ? value.userWalletAddress : undefined });
    return result ? Response.json(result) : Response.json({ error: "Malformed mandate" }, { status: 400 });
  } catch (error) { return Response.json({ error: "Policy evaluation failed", detail: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
