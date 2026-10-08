import { createBawClient } from "@/modules/agentic-wallet/baw-client";
import { runAgenticPreflight, validateAgenticPreflightInput } from "@/modules/agentic-wallet/preflight";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Body must be an object" }, { status: 400 });
  const input = validateAgenticPreflightInput(body);
  if (!input) return Response.json({ error: "Malformed preflight input, invalid mandate, or untrusted browser wallet override." }, { status: 400 });
  const result = await runAgenticPreflight(input, createBawClient());
  return Response.json(result, { status: result.wallet.connection === "error" || result.wallet.connection === "unavailable" ? 503 : 200 });
}
