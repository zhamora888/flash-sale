# Flash Sale System

A high-throughput flash sale backend + React frontend built as a take-home engineering assessment. A limited-stock product is offered during a configurable time window; thousands of concurrent users attempt to purchase simultaneously. The system prevents overselling, enforces one-purchase-per-user, and remains correct under concurrent load — all running locally.

---

## Quick Start

**Prerequisites:** Node.js ≥18, Docker + Docker Compose

```bash
# 1. Configure the sale
cp .env.example .env
# Edit .env: set SALE_START, SALE_END, STOCK_QUANTITY

# 2. Start Redis
docker compose up -d

# 3. Install dependencies
npm run install:all

# 4. Start both server and client
npm run dev
```

Open `http://localhost:5173`. The API server runs on `:3001`.

---

## Architecture

```
Browser (React + Vite :5173)
        │  HTTP/JSON  (Vite proxy in dev / same origin in prod)
        ▼
Express API Server (:3001)
  routes → service → redis/adapter
        │  node-redis (TCP)
        ▼
Redis 7 (Docker :6379)
  flash:stock              ← inventory counter
  flash:purchased:{userId} ← purchase record (ISO 8601 timestamp)
```

**The centrepiece:** stock check + decrement + purchase record are executed as a single Redis Lua script (`EVALSHA`). No two concurrent requests can both succeed when only one unit of stock remains — this is enforced at the Redis level, not the application level.

### Why Redis Lua instead of alternatives?

| Approach | Problem |
|----------|---------|
| In-memory lock (Node.js mutex) | Breaks under horizontal scaling; not Redis-backed |
| `WATCH`/`MULTI`/`EXEC` (optimistic locking) | Requires a client-side retry loop; degrades badly under high contention because every collision means a wasted round-trip and a retry |
| Database transactions (PostgreSQL) | Adds infrastructure complexity — a relational DB for a single integer counter is overkill |
| **Redis Lua (chosen)** | Atomic by design, executes server-side in a single round-trip, no retry logic needed, scales to thousands of concurrent requests on a single Redis instance |

The Lua script runs as 5 atomic steps:

```
1. EXISTS flash:purchased:{userId}  → already_purchased?
2. GET flash:stock <= 0             → sold_out?
3. DECR flash:stock
4. SET flash:purchased:{userId} <ISO-timestamp>
5. return 0 (success)
```

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/sale/status` | Sale state, remaining stock, window times |
| `POST` | `/api/purchase` | Attempt a purchase (atomic) |
| `GET` | `/api/purchase/status?userId=` | Check if a user has purchased |

Full request/response schemas: [`docs/api-contracts-server.md`](docs/api-contracts-server.md)

### Response shape

All responses use `{ result: string, ...extras }` — no separate `error` key.

```jsonc
// POST /api/purchase — success
{ "result": "success", "userId": "alice", "purchasedAt": "2026-06-25T10:03:41.000Z" }

// POST /api/purchase — duplicate
{ "result": "already_purchased" }

// POST /api/purchase — no stock
{ "result": "sold_out" }
```

---

## Environment Variables

All five are required — the server exits with a descriptive message if any are missing.

| Variable | Example | Description |
|----------|---------|-------------|
| `STOCK_QUANTITY` | `100` | Number of items available |
| `SALE_START` | `2026-06-25T10:00:00.000Z` | ISO 8601 sale open time |
| `SALE_END` | `2026-06-25T11:00:00.000Z` | ISO 8601 sale close time |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `PORT` | `3001` | Express listen port |

---

## Testing

```bash
# All unit + integration tests (requires Redis running)
cd server && npm test

# Stress test (requires server + Redis running)
npm run stress        # from repo root
```

### Stress test scenarios

**Scenario A — Unique buyers race:** N concurrent connections each with a unique `userId`. Asserts: total successes == `STOCK_QUANTITY`, `flash:stock` == 0.

**Scenario B — Same-user storm:** 500 concurrent connections all using the same `userId`. Asserts: exactly 1 success, rest return `already_purchased`.

Output includes: total requests · req/sec · p99 latency · success/already_purchased/sold_out breakdown.

---

## Project Structure

```
flash-sale/
├── package.json          ← Root: "dev" (concurrently) + "install:all"
├── docker-compose.yml    ← Redis 7 with AOF persistence
├── .env.example          ← All required env vars with defaults
├── server/               ← Express API + Redis + tests
│   └── src/
│       ├── index.ts      ← Entry: env validation → Redis init → listen
│       ├── redis/        ← client, adapter, purchase.lua
│       ├── service/      ← saleService, purchaseService
│       ├── routes/       ← sale.ts, purchase.ts
│       └── __tests__/    ← unit/ + integration/
└── client/               ← React 18 + Vite 5 SPA
    └── src/
        ├── main.tsx      ← Mount entry
        ├── App.tsx       ← All state + UI
        └── api.ts        ← Typed fetch wrappers
```

---

## Design Trade-offs

**Single Node.js process:** Sufficient for interview scope. Horizontal scaling is straightforward — multiple Node processes behind a load balancer all share the same Redis instance; the Lua script's atomicity holds regardless of how many app servers are running.

**Redis persistence (AOF):** `appendonly yes` + `appendfsync everysec` means purchased records and stock survive container restarts. `SET flash:stock NX` at startup preserves in-flight sale state — an unconditional write would reset stock on a server restart mid-sale.

**Fail-fast on startup errors:** Missing env vars or Redis unreachable → `process.exit(1)` with a descriptive message. Running in a degraded state with partial configuration is worse than not running at all.

**No authentication:** Per spec — `userId` is a self-reported string (email or username) trusted as-is. The backend enforces uniqueness via Redis keys, not identity verification.

**CORS dev-only:** Vite proxies `/api` to Express in development, so no CORS headers are needed. In production, Express serves `client/dist/` directly — single origin, no cross-origin requests.

---

## Resetting Sale State

```bash
# Wipe Redis volume and restart fresh
docker compose down -v
docker compose up -d
```

---

## Documentation

Full documentation is in [`docs/`](docs/):

- [`docs/index.md`](docs/index.md) — documentation index
- [`docs/architecture-server.md`](docs/architecture-server.md) — server architecture
- [`docs/architecture-client.md`](docs/architecture-client.md) — client architecture
- [`docs/api-contracts-server.md`](docs/api-contracts-server.md) — API reference
- [`docs/integration-architecture.md`](docs/integration-architecture.md) — system data flow
- [`docs/development-guide-server.md`](docs/development-guide-server.md) — server dev guide
- [`docs/development-guide-client.md`](docs/development-guide-client.md) — client dev guide