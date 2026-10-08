import { createBawClient } from "@/modules/agentic-wallet/baw-client";
import { probeNvdaCapabilities } from "@/modules/agentic-wallet/capabilities";

export const runtime = "nodejs";

export async function GET() {
  const client = createBawClient();
  const stateResponse = await client.getStatus().catch(() => null);
  const connected = (stateResponse as { data?: { status?: string } } | null)?.data?.status === "CONNECTED";
  if (!connected) return Response.json({ connection: "signed_out_or_unavailable", capabilities: null });
  const capabilities = await probeNvdaCapabilities(client);
  return Response.json({ connection: "connected", chain: "56", amount: "10", slippage: "0.5", capabilities });
}
