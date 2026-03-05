*Inherits global rules from ~/.claude/CLAUDE.md. Quality rules (TDD, verification, SRT) enforced by ship pipeline.*
*All project knowledge (stack, deployment, commands, key files) lives in the Second Brain. Query it: `brain_query("gamePocGen ...", detail="full")`*

# GamePocGen

AI-powered incremental game generator.

## Brain Queries for This Project

brain_query("gamePocGen overview, stack, and deployment")

## Architecture Detail Reference

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
