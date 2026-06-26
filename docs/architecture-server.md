# Architecture — Server

**Part:** `flash-sale-server`  
**Type:** Backend API  
**Pattern:** Layered service architecture (routes → service → redis adapter)

---

## Executive Summary

The server is a single Node.js / Express process that exposes three REST endpoints for a time-boxed flash sale. Its defining characteristic is **atomic correctness under concurrent load**: stock decrement and purchase-record creation are executed as an indivisible Redis Lua script, making overselling and duplicate purchases structurally impossible.

---

## Technology Stack

| Category | Technology | Version | Notes |
|----------|-----------|---------|-------|
| Language | TypeScript | 5.4 | Strict mode, CommonJS output |
| Runtime | Node.js | ≥18 | Single process |
| Framework | Express | 4.18 | REST API |
| Data store | Redis | 7 (Docker) | node-redis 4.6 client |
| Atomicity | Redis Lua | — | EVALSHA, single round-trip |
| Rate limiting | express-rate-limit | 8.5 | Applied per endpoint |
| Tests | Jest + ts-jest | 29 / 1.2 | Unit + integration |
| Stress test | autocannon | 7.15 | Node API (not CLI) |
| Dev reload | ts-node-dev | 2.0 | `--respawn --transpile-only` |
| Env loading | dotenv | 17 | Loaded in `index.ts` |
| CORS | cors | 2.8 | Development only |

---

## Architecture Pattern

**Strict layered architecture — one-way dependency chain:**

```
HTTP Request
    │
    ▼
routes/           ← HTTP in/out, input validation, status mapping
    │
    ▼
service/          ← Business logic (sale window, purchase orchestration)
    │
    ▼
redis/adapter.ts  ← Lua script loading, EVALSHA, result decoding
    │
    ▼
redis/client.ts   ← node-redis connection (fail-fast on error)
    │
    ▼
Redis Server      ← State store (flash:stock, flash:purchased:{userId})
```

**Key invariant (AD-1):** Stock check + decrement + purchase record are a single `EVALSHA` call — never split across two Redis commands.

---

## Data Architecture

No relational database. All state lives in Redis:

| Key pattern | Type | Set by | Purpose |
|-------------|------|--------|---------|
| `flash:stock` | Integer | Startup (`SET NX`) | Remaining inventory counter |
| `flash:purchased:{userId}` | String | Lua script | Purchase record; value = ISO 8601 timestamp |

**Startup behavior (`SET NX`):** Stock is initialized only if the key does not already exist, preserving mid-sale state across server restarts. A full reset requires `docker compose down -v`.

**Persistence:** Redis runs with `appendonly yes` + `appendfsync everysec` — purchased records and stock survive container restarts.

---

## API Design

See [api-contracts-server.md](./api-contracts-server.md) for full endpoint specification.

**Summary:**

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/sale/status` | Sale state + remaining stock |
| POST | `/api/purchase` | Attempt purchase (atomic) |
| GET | `/api/purchase/status` | Check if userId has purchased |

---

## Application Entry Point (`index.ts`)

Startup sequence (order is enforced — deviating breaks invariants):

1. Load `.env` via dotenv
2. Validate all 5 env vars — `process.exit(1)` on any missing/malformed value
3. Connect Redis client — `process.exit(1)` on connection failure
4. `SCRIPT LOAD` the Lua script — cache SHA
5. `SET flash:stock {STOCK_QUANTITY} NX` — preserve existing value on restart
6. Mount routes (`/api/sale`, `/api/purchase`)
7. CORS middleware (development only, guarded by `NODE_ENV`)
8. Static file middleware for `../client/dist` (production only)
9. Catch-all route `/^(?!\/api).*/` → serve `index.html` (SPA fallback)
10. `app.listen(PORT)`

---

## Atomic Purchase — Design Centrepiece

**Why Redis Lua over alternatives:**

| Approach | Problem |
|----------|---------|
| In-memory lock (Node.js mutex) | Breaks under horizontal scaling; not Redis-backed |
| `WATCH`/`MULTI`/`EXEC` (optimistic locking) | Requires client retry loop; adds latency under contention |
| Database transaction (PostgreSQL) | Adds infrastructure complexity for a single counter |
| **Redis Lua (chosen)** | Atomic by design, runs server-side in O(1), no client retry needed |

**Lua script logic (`purchase.lua`):**

```lua
-- KEYS[1] = flash:stock
-- ARGV[1] = userId
-- ARGV[2] = ISO 8601 timestamp
-- Returns: 0=success, 1=already_purchased, 2=sold_out

local purchased_key = "flash:purchased:" .. ARGV[1]
if redis.call("EXISTS", purchased_key) == 1 then return 1 end
if tonumber(redis.call("GET", KEYS[1])) <= 0 then return 2 end
redis.call("DECR", KEYS[1])
redis.call("SET", purchased_key, ARGV[2])
return 0
```

Integer codes keep the script lean; `adapter.ts` maps them to domain strings.

---

## Testing Strategy

| Layer | Tool | Scope |
|-------|------|-------|
| Unit | Jest + ts-jest | `saleService` (mocked timestamps) · `purchaseService` (mocked adapter) |
| Integration | Jest + live Redis | Full purchase flow: happy path, duplicate, exhaustion, window enforcement |
| Stress | autocannon | Scenario A: N unique buyers race; Scenario B: same-user storm (500 concurrent) |

**Run all tests:** `cd server && npm test` (requires Redis via `docker compose up -d`)  
**Run stress test:** `npm run stress` from repo root

---

## Environment Variables

| Variable | Example | Required | Notes |
|----------|---------|----------|-------|
| `STOCK_QUANTITY` | `100` | Yes | Integer; parsed at startup |
| `SALE_START` | `2026-06-25T10:00:00.000Z` | Yes | ISO 8601 |
| `SALE_END` | `2026-06-25T11:00:00.000Z` | Yes | ISO 8601 |
| `REDIS_URL` | `redis://localhost:6379` | Yes | Used by node-redis `createClient` |
| `PORT` | `3001` | Yes | Express listen port |

---

## Non-Functional Characteristics

| Concern | Approach |
|---------|---------|
| Concurrency correctness | Lua atomicity — no app-level locks |
| Throughput | Sustained ≥500 concurrent requests (autocannon verified) |
| Fail-fast | Server exits on missing env vars or Redis unreachable |
| Durability | Redis AOF — purchased records survive restarts |
| Observability | Structured log line per purchase attempt (result + latency ms) |
| Rate limiting | `express-rate-limit` applied at route level |