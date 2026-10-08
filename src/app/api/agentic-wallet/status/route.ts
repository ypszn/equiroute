import { createBawClient } from "@/modules/agentic-wallet/baw-client";
import { getAgenticWalletState, safeWalletStatus } from "@/modules/agentic-wallet";

export const runtime = "nodejs";

export async function GET() {
  const state = await getAgenticWalletState(createBawClient());
  return Response.json(safeWalletStatus(state), { status: state.connection === "error" || state.connection === "unavailable" ? 503 : 200 });
}
