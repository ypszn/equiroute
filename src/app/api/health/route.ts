const SERVICE_VERSION = "0.1.0";

/** Lightweight liveness endpoint. Deliberately performs no external calls. */
export function GET() {
  return Response.json({
    status: "ok",
    service: "equiroute",
    version: SERVICE_VERSION,
  });
}
