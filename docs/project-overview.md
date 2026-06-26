# Project Overview — Flash Sale System

**Project:** Flash Sale System  
**Type:** Monorepo · Backend API + React SPA  
**Purpose:** Take-home engineering assessment — high-throughput flash sale with atomic concurrency guarantees

---

## What It Does

A limited-stock product is offered during a configurable time window. Thousands of users can attempt to purchase simultaneously. The system prevents overselling, enforces one-purchase-per-user, and remains correct under concurrent load — all running locally on a single machine.

The evaluation centrepiece is the **atomic purchase operation**: a Redis Lua script makes it structurally impossible for two concurrent requests to both succeed when only one unit of stock remains.

---

## Quick Reference

| Aspect | Detail |
|--------|--------|
| Primary language | TypeScript (both parts) |
| Architecture | Multi-part monorepo (server + client) |
| Server framework | Express 4.18 on Node.js |
| Frontend framework | React 18.3 + Vite 5 |
| Data store | Redis 7 (Docker) |
| Atomicity mechanism | Redis Lua script (EVALSHA) |
| Test coverage | Unit + Integration + Stress (autocannon) |
| Deployment | Docker Compose (Redis) + Node.js process |

---

## Repository Structure

```
flash-sale/
├── package.json          ← Root: "dev" (concurrently) + "install:all"
├── docker-compose.yml    ← Redis 7 with AOF persistence
├── .env.example          ← All required env vars
├── server/               ← Express API + Redis + tests
└── client/               ← React SPA + Vite
```

---

## Tech Stack Summary

### Server (`flash-sale/server/`)

| Category | Technology |
|----------|-----------|
| Language | TypeScript 5.4 (strict, CommonJS) |
| Framework | Express 4.18 |
| Database | Redis 7 via node-redis 4.6 |
| Atomicity | Redis Lua (5-step purchase script) |
| Tests | Jest 29 + ts-jest · autocannon stress |
| Rate limiting | express-rate-limit 8.5 |

### Client (`flash-sale/client/`)

| Category | Technology |
|----------|-----------|
| Language | TypeScript 5.5 (strict, ESNext) |
| Framework | React 18.3 |
| Build | Vite 5.3 |
| State | React useState/useEffect (no external library) |
| API calls | Native fetch wrapped in typed helpers |

---

## Architecture Overview

```
Browser (React + Vite :5173)
        │  HTTP/JSON via Vite proxy in dev
        │  Same origin in production
        ▼
Express API Server (:3001)
  routes → service → redis/adapter
        │  node-redis (TCP)
        ▼
Redis 7 (Docker :6379)
  flash:stock  ·  flash:purchased:{userId}
```

The key design invariant: stock check + decrement + purchase record are a **single atomic Lua script execution** — no concurrent request can interleave between these steps.

---

## Success Criteria

| Goal | How verified |
|------|-------------|
| No overselling | `flash:stock` never goes negative — verified by stress test |
| One item per user | Duplicate attempts return `already_purchased` under concurrent load |
| ≥500 concurrent requests | autocannon Scenario B: 500 connections, no 5xx |
| Persistence across restarts | Redis AOF + `SET NX` at startup preserves state |
| 3-command fresh start | `docker compose up -d` → `npm run install:all` → `npm run dev` |

---

## Getting Started

See [Development Guide — Server](./development-guide-server.md) and [Development Guide — Client](./development-guide-client.md) for full setup instructions.

**Shortest path to a running stack:**

```bash
cd flash-sale
cp .env.example .env
docker compose up -d
npm run install:all
npm run dev
```

Then open `http://localhost:5173`.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Redis Lua for atomicity | Single round-trip, server-side execution, no retry loop needed; beats `WATCH`/`MULTI` under high contention |
| `SET flash:stock NX` at startup | Preserves mid-sale inventory across server restarts — unconditional write would reset stock |
| Fail-fast on missing env vars | Prevents running in a broken state; errors surface at boot not at request time |
| CORS dev-only | Vite proxy eliminates CORS in dev; same origin in production |
| No auth | Per spec — userId is trusted as-is; out of assessment scope |

---

## Documentation Map

| Document | Purpose |
|----------|---------|
| [Architecture — Server](./architecture-server.md) | Layers, Redis model, Lua script, testing strategy |
| [Architecture — Client](./architecture-client.md) | Component model, state, API layer, effects |
| [API Contracts — Server](./api-contracts-server.md) | All endpoints, request/response schemas |
| [Integration Architecture](./integration-architecture.md) | Client↔Server↔Redis data flow, port map, production model |
| [Source Tree Analysis](./source-tree-analysis.md) | Annotated directory tree, layer map |
| [Development Guide — Server](./development-guide-server.md) | Setup, test, stress test, Redis commands |
| [Development Guide — Client](./development-guide-client.md) | Setup, build, manual testing scenarios |