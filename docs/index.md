# Project Documentation Index — Flash Sale System

**Generated:** 2026-06-26  
**Scan level:** Quick (pattern-based)  
**Repository type:** Monorepo with 2 parts

---

## Project Overview

- **Type:** Monorepo — backend API + React SPA
- **Primary Language:** TypeScript (both parts)
- **Architecture:** Layered service (server) · Single-component SPA (client)
- **Data store:** Redis 7 (Docker) — all state; no relational database

---

## Quick Reference

### server (Flash Sale API Server)

- **Type:** backend
- **Tech stack:** Node.js · Express 4.18 · TypeScript 5.4 · Redis 7 · Jest 29
- **Root:** `flash-sale/server/`
- **Entry point:** `server/src/index.ts`
- **Port:** 3001

### client (Flash Sale React SPA)

- **Type:** web
- **Tech stack:** React 18.3 · Vite 5.3 · TypeScript 5.5
- **Root:** `flash-sale/client/`
- **Entry point:** `client/src/main.tsx`
- **Port:** 5173

---

## Generated Documentation

### Top-Level

- [Project Overview](./project-overview.md) — What it does, design decisions, getting started
- [Integration Architecture](./integration-architecture.md) — Client↔Server↔Redis data flow, port map, production serving model
- [Source Tree Analysis](./source-tree-analysis.md) — Annotated directory tree with layer map

### Server (`flash-sale/server/`)

- [Architecture — Server](./architecture-server.md) — Layers, Redis data model, Lua atomicity design, testing strategy
- [API Contracts — Server](./api-contracts-server.md) — All 3 endpoints with request/response schemas and Redis key reference
- [Development Guide — Server](./development-guide-server.md) — Setup, env vars, test commands, Redis debugging

### Client (`flash-sale/client/`)

- [Architecture — Client](./architecture-client.md) — State model, effects, API layer, deferred items
- [Development Guide — Client](./development-guide-client.md) — Setup, build, manual test scenarios

---

## Existing Documentation

No pre-existing README, CONTRIBUTING, or ARCHITECTURE files were found in the repository.

---

## Getting Started

**Full stack in 4 commands:**

```bash
cd flash-sale
cp .env.example .env           # configure SALE_START, SALE_END, STOCK_QUANTITY
docker compose up -d           # start Redis
npm run install:all            # install server + client deps
npm run dev                    # start both (server :3001, client :5173)
```

Then open `http://localhost:5173`.

**Run tests:**
```bash
cd flash-sale/server && npm test
```

**Run stress test:**
```bash
cd flash-sale && npm run stress
```

---

## Metadata

| Key | Value |
|-----|-------|
| Workflow version | 1.2.0 |
| Scan mode | initial_scan |
| Scan level | quick |
| State file | [project-scan-report.json](./project-scan-report.json) |
| Parts file | [project-parts.json](./project-parts.json) |