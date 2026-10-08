import { prepareIntent, validatePrepareInput } from "@/modules/preparation/prepare";

/** Read-only unsigned transaction preparation and simulation. Never signs or broadcasts. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  let raw: unknown;
  try { raw = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const input = validatePrepareInput(raw);
  if (!input) {
    return Response.json({ error: "Expected ticker, positive notionalUsd, public BSC userWalletAddress, and valid slippagePercent (0, 50]." }, { status: 400 });
  }
  try {
    const result = await prepareIntent(input);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("OC_API_KEY") || message.includes("OC_SECRET_KEY") ? 503 : 502;
    return Response.json({ error: "Preparation request failed", detail: message }, { status });
  }
}
