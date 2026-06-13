# Architecture

GamePocGen is a Node.js **service** that generates browser-playable 2D incremental games
via an agentic AI pipeline, then auto-deploys each game to a `gamedemoN.namjo-games.com`
subdomain.

## High-level flow

```
POST /api/generate → Queue → Docker container (Claude Code CLI) → 5 phases → Deploy
```

| Phase | What it does |
|-------|--------------|
| 1 | Idea generation |
| 2 | Game design document (6 specialized agents) |
| 3 | Implementation guide |
| 4 | TDD game building |
| 5 | Review/repair + auto-deploy to subdomain |

## Components

- `backend/` — Express API + PostgreSQL job store + services (queue, container, deployment, game-tester).
- `framework/` — the vanilla-JS game framework the pipeline produces games from (core, mechanics, ui, sprites, css, starter).
- `docker/` — worker container, compose stack, idle-shutdown.
- `harness/` — shell orchestration for running Claude Code CLI sessions in containers.
- `prompts/` — the agent prompts for each pipeline phase.
- `docs/` (website) — `index.html` + `docker-compose.yml` for the public docs site.
- `gallery/` — generated-game listing page.

## Detailed subsystem docs (generated)

Full diagrams and per-subsystem detail live in `docs/architecture/` (auto-generated; marked
`<!-- GENERATED -->`):

| File | Covers |
|------|--------|
| `architecture/00-system-overview.md` | High-level system overview |
| `architecture/01-file-map.md` | Every file's purpose and dependency graph |
| `architecture/02-user-flows.md` | Job submission, 5-phase execution, deployment |
| `architecture/03-api-surface.md` | All REST API endpoints |
| `architecture/04-data-models.md` | Database schema |
| `architecture/05-data-pipelines.md` | 5-phase generation pipeline |
| `architecture/06-state-lifecycle.md` | Job status transitions |
| `architecture/07-deployment.md` | Deployment flow, Traefik routing |
| `architecture/08-config.md` | Environment variables |
| `architecture/09-boot-sequence.md` | Backend + worker boot sequence |
| `architecture/10-error-handling.md` | Error handling across components |
| `architecture/11-security.md` | Security boundaries |
