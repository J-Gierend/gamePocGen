# GamePocGen

Overnight generation of browser-playable 2D incremental games using agentic AI.

Each game gets 15-30 minutes of gameplay with interlocking currencies, prestige mechanics, and skill trees. Games deploy automatically to `gamedemoN.namjo-games.com` subdomains.

## Architecture

```
POST /api/generate → Queue → Docker Container → 4 Phases → Deploy
```

**Phase 1** - Idea generation (10 min)
**Phase 2** - Game design document via 6 specialized agents (60 min)
**Phase 3** - Implementation guide (15 min)
**Phase 4** - TDD game building (120 min)
**Phase 5** - Auto-deploy to subdomain (5 min)

## Stack

| Component | Technology |
|-----------|-----------|
| Games | Vanilla JS + HTML/CSS (no build step) |
| Backend | Express + PostgreSQL |
| Containers | Docker (one per game) |
| AI | Claude Code CLI in containers |
| Hosting | LXC102 + Traefik |

## Quick Start

```bash
# Deploy to LXC102
cd docker && cp .env.example .env
# Edit .env with your values
docker compose up -d

# Docs site
cd docs && docker compose up -d

# Generate 5 games
curl -X POST https://gamepocgen.namjo-games.com/api/generate -H 'Content-Type: application/json' -d '{"count": 5}'
```

## Running Tests

```bash
cd framework/core && node __tests__/run-tests.js      # 71 tests
cd framework/mechanics && node __tests__/run-tests.js  # 75 tests
cd framework/ui && node __tests__/run-tests.js         # 95 tests
cd backend && npm run test:all                         # 103 tests
```

## Project Structure

```
framework/     Game framework (core, mechanics, UI, sprites, CSS)
backend/       Express API + job processing services
docker/        Docker infrastructure (worker, compose)
prompts/       AI agent prompts (phases 1-4)
docs/          Documentation website
gallery/       Game listing page
workspaces/    Generated game workspaces (gitignored)
```
