*Inherits global rules (TDD, smoke testing, SRT, Ralph Loop, quality gates) from ~/.claude/CLAUDE.md.*

# GamePocGen

## Overview
AI-powered incremental game generator. Users submit a game concept, the system generates a complete browser-playable incremental game using Claude Code in Docker workers.

## Tech Stack
- **Backend**: Node.js + Express + PostgreSQL (Docker Compose on LXC 102)
- **Worker**: Docker container with Claude Code CLI (claude-opus-4-6 via z.ai)
- **Frontend**: Static HTML docs site + gallery
- **Games**: nginx:alpine containers (gamedemo0-9.namjo-games.com)
- **Framework**: Vanilla JS incremental game library (Core, Mechanics, UI, Sprites)

## Commands
- **Deploy backend**: `ssh <LXC102> 'cd /root/apps/gamepocgen/docker && docker compose build --no-cache && docker compose up -d'`
- **Build worker image**: `ssh <LXC102> 'cd /root/apps/gamepocgen && docker build -t gamepocgen-worker -f docker/Dockerfile .'`
- **Deploy docs**: `ssh <LXC102> 'cd /root/apps/gamepocgen/docs && docker compose up -d'`
- **Monitor jobs**: `ssh <LXC102> 'cd /root/apps/gamepocgen/docker && docker compose logs -f backend'`
- **Check games**: `ssh <LXC102> 'docker ps --filter name=gamedemo'`

## Key Files
| File | Purpose |
|------|---------|
| `backend/api.js` | REST API (10 endpoints) |
| `backend/index.js` | Job poller (5s interval) |
| `docker/Dockerfile` | Worker container |
| `docker/entrypoint.sh` | 7-phase worker router |
| `prompts/` | 13 prompt templates |
| `framework/` | Vanilla JS game framework |
| `gallery/` | Game gallery site |

## Deployment
- **Live URL**: https://gamepocgen.namjo-games.com
- **Server**: LXC 102, standard deploy (see global CLAUDE.md)
- **Server path**: `/root/apps/gamepocgen/`

## Architecture
See `AI/document/` for detailed diagrams and subsystem docs:

| File | Covers |
|------|--------|
| `AI/document/00-system-overview.md` | High-level system overview |
| `AI/document/01-file-map.md` | Every file's purpose and dependency graph |
| `AI/document/02-user-flows.md` | Job submission, 5-phase execution, deployment |
| `AI/document/03-api-surface.md` | All REST API endpoints |
| `AI/document/04-data-models.md` | Database schema |
| `AI/document/05-data-pipelines.md` | 5-phase generation pipeline |
| `AI/document/06-state-lifecycle.md` | Job status transitions |
| `AI/document/07-deployment.md` | Deployment flow, Traefik routing |
| `AI/document/08-config.md` | Environment variables |
| `AI/document/09-boot-sequence.md` | Backend + worker boot sequence |
| `AI/document/10-error-handling.md` | Error handling across components |
| `AI/document/11-security.md` | Security boundaries |
