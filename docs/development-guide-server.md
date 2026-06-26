# Development Guide — Server

**Part:** `flash-sale-server`  
**Runtime:** Node.js ≥18  
**Language:** TypeScript 5.4

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥18 | [nodejs.org](https://nodejs.org) |
| npm | ≥9 | Included with Node.js |
| Docker + Docker Compose | any recent | [docker.com](https://docker.com) |

---

## Environment Setup

1. Copy the example env file:

   ```bash
   cp flash-sale/.env.example flash-sale/.env
   ```

2. Edit `flash-sale/.env` as needed:

   ```env
   STOCK_QUANTITY=100
   SALE_START=2026-06-25T10:00:00.000Z
   SALE_END=2026-06-25T11:00:00.000Z
   REDIS_URL=redis://localhost:6379
   PORT=3001
   ```

   All five variables are **required** — the server exits with a descriptive message on any missing or malformed value.

3. Start Redis:

   ```bash
   cd flash-sale
   docker compose up -d
   ```

4. Install dependencies:

   ```bash
   cd flash-sale/server
   npm install
   ```

---

## Local Development

**Start the dev server (from repo root):**

```bash
cd flash-sale
npm run dev
```

This uses `concurrently` to start both server and client. To start the server alone:

```bash
cd flash-sale/server
npm run dev
```

The server uses `ts-node-dev` with `--respawn --transpile-only` — it reloads on file changes.

**Expected startup log:**
```
Redis connected
Lua script loaded (SHA: <sha1>)
flash:stock initialized to 100
Listening on :3001
```

---

## Build

```bash
cd flash-sale/server
npm run build
```

Output: `server/dist/` (CommonJS, ES2022 target).

**Run production build:**

```bash
node flash-sale/server/dist/index.js
```

---

## Testing

### Unit tests

```bash
cd flash-sale/server
npm test
```

Tests use ts-jest. Unit tests mock all Redis interactions — no Redis required.

### Integration tests

```bash
# Redis must be running
docker compose -f flash-sale/docker-compose.yml up -d
cd flash-sale/server
npm test
```

Integration tests connect to a live Redis instance. They use dedicated test keys and flush `flash:*` keys in `afterEach`. Set `REDIS_URL` to a separate test instance to avoid data collision if needed.

Test file locations:

| Suite | Path |
|-------|------|
| Unit — saleService | `server/src/__tests__/unit/saleService.test.ts` |
| Unit — purchaseService | `server/src/__tests__/unit/purchaseService.test.ts` |
| Integration — purchase flow | `server/src/__tests__/integration/purchase.test.ts` |

**All suites pass → exit code 0.**

---

## Stress Test

```bash
# Server must be running with Redis
cd flash-sale
npm run stress
```

Two autocannon scenarios:

| Scenario | Description | Assertion |
|----------|-------------|-----------|
| A — Unique buyers race | N concurrent connections, each with a unique userId | Successes == `STOCK_QUANTITY`; `flash:stock` == 0 |
| B — Same-user storm | 500 concurrent connections, same userId | Exactly 1 success; rest `already_purchased` |

Output includes: total requests, req/sec, p99 latency, success / already_purchased / sold_out breakdown.

After Scenario A, verify Redis directly:

```bash
docker exec flash-sale-redis redis-cli GET flash:stock
# Expected: "0"
```

---

## Resetting Sale State

To fully reset stock and purchase records:

```bash
docker compose -f flash-sale/docker-compose.yml down -v
docker compose -f flash-sale/docker-compose.yml up -d
```

The `-v` flag removes the Redis volume, clearing all persisted data.

---

## Useful Development Commands

| Task | Command |
|------|---------|
| Start Redis | `docker compose up -d` (from `flash-sale/`) |
| Stop Redis | `docker compose down` |
| Check stock | `docker exec flash-sale-redis redis-cli GET flash:stock` |
| Check purchase | `docker exec flash-sale-redis redis-cli GET "flash:purchased:alice"` |
| List all flash keys | `docker exec flash-sale-redis redis-cli KEYS "flash:*"` |
| Full reset (wipe Redis) | `docker compose down -v && docker compose up -d` |
| Verify sale status | `curl http://localhost:3001/api/sale/status` |
| Test purchase | `curl -X POST http://localhost:3001/api/purchase -H "Content-Type: application/json" -d '{"userId":"alice"}'` |

---

## Layered Architecture Reminder

```
routes/ → service/ → redis/adapter.ts → redis/client.ts
```

- **Routes** — validate HTTP input, map domain results to HTTP status codes
- **Service** — business logic only; no `req`/`res` objects; no direct Redis calls
- **Adapter** — all Redis interaction; returns domain strings (`success`, `already_purchased`, etc.)
- **Client** — raw node-redis connection; exported singleton