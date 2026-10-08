import { createBawClient } from "@/modules/agentic-wallet/baw-client";
import { runExecutionGate } from "@/modules/agentic-wallet/gate-service";
import { validateAgenticPreflightInput } from "@/modules/agentic-wallet/preflight";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown; try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const input = validateAgenticPreflightInput(body);
  if (!input) return Response.json({ error: "Malformed gate input" }, { status: 400 });
  return Response.json(await runExecutionGate(input, createBawClient()));
}
