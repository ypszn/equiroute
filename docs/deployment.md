# EquiRoute deployment notes

## Public service boundary

Deploy this Next.js application as the persistent HTTPS EquiRoute service. The BNB Market Sentinel calls the public service server-to-server using `EQUIROUTE_BASE_URL`.

Core endpoints:

- `GET /api/health` — local liveness only; no external calls.
- `POST /api/route` — deterministic live routing and receipts.
- `POST /api/policy/evaluate` — deterministic policy preview and route evaluation.

The core routing endpoints do not require Binance Agentic Wallet or the `baw` CLI. They require only the server-side Binance Web3 credentials documented in `.env.example`.

## Required production environment

```text
OC_API_KEY
OC_SECRET_KEY
OC_BASE_URL=https://web3.binance.com/build
```

Optional routing settings:

```text
OC_QUOTE_PATH=/api/v1/dex/aggregator/quote
OC_TIMEOUT_MS=15000
OC_RECV_WINDOW=10000
```

Configure these in the hosting provider's server environment. Never expose them with `NEXT_PUBLIC_` names.

## Agentic Wallet boundary

Agentic Wallet routes are separate from core routing:

- `/api/agentic-wallet/status`
- `/api/agentic-wallet/capabilities`
- `/api/agentic-wallet/preflight`
- `/api/agentic-wallet/execution-gate`

They are Node-runtime, local/user-bound integrations. They require an authenticated `baw` CLI session and are expected to return `unavailable` or `error` when deployed without `baw`; they do not fall back to another signer. `BAW_BIN` is optional and is only used to locate a local CLI executable.

A cloud EquiRoute deployment does not need Agentic Wallet for `/api/route` or `/api/policy/evaluate`. The BNB Agent Studio wallet is a separate custody boundary and is not copied into this service.

## Runtime and caching

The routing and preparation handlers use the Node.js runtime because Binance authentication and local CLI integration require Node APIs. Binance requests use `cache: "no-store"` and bounded abort timeouts; live quotes and market metadata are not intended for hosting-platform cache reuse.

Agent Studio must call this service over HTTPS. Browser CORS is not required for its server-to-server calls; no permissive CORS policy is enabled.

## Secrets and filesystem

The application has no required writable persistent filesystem and no dependency on `../equiroutesentinel`. `.env.local`, private keys, wallet sessions, BAW auth material, and Studio/Pieverse credentials remain ignored and must not be committed.
