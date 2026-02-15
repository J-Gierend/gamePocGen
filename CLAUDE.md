<!-- GENERATED:ARCHITECTURE -->

# System Architecture

```mermaid
graph TB
    subgraph "Frontend [nginx :80/:443]"
        DOCS["Docs Site\nindex.html 1125 lines\ngamepocgen.namjo-games.com"]
        GALLERY["Gallery\ngallery.js 776 lines\n/gallery/ path"]
    end

    subgraph "Backend [Express :3010]"
        API["REST API\napi.js 298 lines\n10 endpoints"]
        POLLER["Job Poller\nindex.js 1047 lines\n5s interval"]
        QM["QueueManager\n287 lines\nPostgreSQL queue"]
        CM["ContainerManager\n220 lines\nDocker lifecycle"]
        DM["DeploymentManager\n526 lines\nnginx + Traefik"]
        GT["gameTester.js\n119 lines\nPlaywright quality\ngraduated scoring"]
    end

    subgraph "Data [PostgreSQL :5432]"
        DB[("postgres:15-alpine\njobs + job_logs tables\nJSONB phase_outputs")]
    end

    subgraph "Worker Pipeline [gamepocgen-worker]"
        ENTRY["entrypoint.sh 443 lines\n7-phase router"]
        CLAUDE["Claude Code CLI\nclaude-opus-4-6 via z.ai"]
        PROMPTS["13 prompt templates\n4838 lines total"]
    end

    subgraph "Game Framework [vanilla JS]"
        CORE["Core: GameLoop BigNum\nSaveManager EventBus"]
        MECH["Mechanics: Currency\nGenerator Multiplier\nPrestige Unlockable"]
        UI["UI: ResourceBar\nUpgradeButton ProgressBar\nTabSystem SkillTree"]
        SPRITES["Sprites: Renderer\nData ProceduralSprite"]
        CSS["game.css 643 lines\nDark theme"]
    end

    subgraph "Game Containers [nginx:alpine]"
        G1["gamedemo0-9\n.namjo-games.com\nStatic HTML games"]
    end

    GALLERY -->|"GET /api/jobs"| API
    API -->|"SQL queries"| QM
    QM -->|"pg Pool"| DB
    POLLER -->|"getNextJob()"| QM
    POLLER -->|"spawnContainer()"| CM
    POLLER -->|"testGame()"| GT
    CM -->|"Dockerode API"| ENTRY
    ENTRY -->|"claude -p prompt"| CLAUDE
    CLAUDE -->|"reads"| PROMPTS
    POLLER -->|"deployGame()"| DM
    DM -->|"creates nginx container"| G1
    CORE --> MECH
    MECH --> UI
```

# Framework Module Dependencies

```mermaid
graph TD
    subgraph "Core [zero dependencies]"
        GL["GameLoop\n213 lines"]
        EB["EventBus\n92 lines"]
        BN["BigNum\n324 lines"]
        SM["SaveManager\n246 lines"]
    end

    subgraph "Mechanics [depends on BigNum]"
        CM2["CurrencyManager\n186 lines"]
        GM["GeneratorManager\n188 lines"]
        MM["MultiplierManager\n112 lines"]
        PM["PrestigeManager\n153 lines"]
        UM["UnlockManager\n109 lines"]
    end

    subgraph "UI [depends on BigNum + CSS]"
        RB["ResourceBar 132"]
        UB["UpgradeButton 191"]
        PB["ProgressBar 140"]
        TS["TabSystem 151"]
        SK["SkillTree 222"]
    end

    subgraph "Sprites [CommonJS + Canvas]"
        SR["SpriteRenderer 150"]
        SD["SpriteData 80"]
        PS["ProceduralSprite 158"]
    end

    BN --> CM2
    BN --> GM
    CM2 --> GM
    BN --> PM
    CM2 --> PM
    GM --> PM
    BN --> RB
    BN --> UB
    BN --> SK
```

---

# Infrastructure Topology

```mermaid
graph TB
    INET((Internet\nHTTPS :443))

    subgraph "Proxmox Host pve.grossmann.at"
        subgraph "LXC 102 webservices 192.168.138.11"
            TRAEFIK["Traefik\n:80 → redirect\n:443 TLS termination\nLet's Encrypt auto-SSL\nDocker provider auto-discovery"]

            subgraph "Backend Stack docker/docker-compose.yml 64 lines"
                BACK["gamepocgen-backend\nNode 22 slim :3010→:3000\nDockerfile.backend 18 lines\nExpress + job poller + Playwright"]
                PG["postgres:15-alpine\n:5432\nvol: pgdata\nhealthcheck: pg_isready"]
            end

            subgraph "Docs Stack docs/docker-compose.yml 19 lines"
                NGINX_DOCS["nginx:alpine\nDocs + Gallery\nvol: index.html gallery/\npriority=1"]
            end

            subgraph "Worker Containers ephemeral"
                WORKER["gamepocgen-worker\ndocker/Dockerfile 28 lines\nNode 22 + Claude Code CLI\nclaude-opus-4-6 + effort=high\nHost mounts: prompts framework\nMem: 2GB CPU: 0.5\nTimeout: 43200s phases1-4\n3600s phase5"]
            end

            subgraph "Game Containers persistent"
                GAME["nginx:alpine x10\ngamedemo0-9.namjo-games.com\nvol: deploy dir bind mount"]
            end

            DOCKER_SOCK["/var/run/docker.sock\nmounted into backend"]
        end
    end

    INET -->|"HTTPS"| TRAEFIK
    TRAEFIK -->|"Host: gamepocgen...\nPathPrefix: /api /health\npriority=10"| BACK
    TRAEFIK -->|"Host: gamepocgen...\npriority=1 catch-all"| NGINX_DOCS
    TRAEFIK -->|"Host: gamedemoN..."| GAME
    BACK -->|"pg Pool TCP :5432\nvia internal network"| PG
    BACK -->|"Dockerode via socket"| DOCKER_SOCK
    DOCKER_SOCK -->|"create+start"| WORKER
    DOCKER_SOCK -->|"create+start"| GAME
```

# Docker Compose Services

```mermaid
graph TD
    subgraph "docker/docker-compose.yml 64 lines"
        B_SVC["backend service\nbuild: context ../ dockerfile Dockerfile.backend\nports: 3010:3000\nvolumes:\n  /var/run/docker.sock\n  ./workspaces:/data/workspaces\n  ./deployed:/data/deployed\nenv: DATABASE_URL ZAI_API_KEY ZAI_BASE_URL\n  CLAUDE_CODE_OAUTH_TOKEN\n  CLAUDE_CODE_REFRESH_TOKEN\n  CLAUDE_CODE_TOKEN_EXPIRES\n  MAX_CONCURRENT WORKSPACE_PATH\n  HOST_WORKSPACE_PATH DEPLOY_DIR\n  HOST_DEPLOY_DIR GALLERY_DATA_PATH\n  DOMAIN WORKER_IMAGE\n  HOST_PROJECT_ROOT\ndepends_on: postgres condition service_healthy\nlabels: traefik priority=10\nnetworks: traefik + internal\nrestart: unless-stopped"]

        P_SVC["postgres service\nimage: postgres:15-alpine\nvolumes: pgdata\nenv: POSTGRES_DB POSTGRES_USER\n  POSTGRES_PASSWORD\nhealthcheck: pg_isready -U gamepocgen\n  interval 5s timeout 5s retries 5\nnetworks: internal ONLY\nrestart: unless-stopped"]
    end

    subgraph "docs/docker-compose.yml 19 lines"
        D_SVC["web service\nimage: nginx:alpine\nvolumes:\n  ./index.html :ro\n  ../gallery/index.html :ro\n  ../gallery/gallery.js :ro\nlabels: traefik priority=1\nnetworks: traefik\nrestart: unless-stopped"]
    end

    subgraph "Dynamic created by DeploymentManager"
        G_SVC["gamedemoN container\nimage: nginx:alpine\nvolumes: hostDeployDir/gamedemoN/html :ro\nlabels:\n  Host gamedemoN.namjo-games.com\n  tls certresolver=letsencrypt\nnetworks: traefik\nrestart: unless-stopped"]
    end
```

# Filesystem Layout LXC 102

```mermaid
graph TD
    subgraph "/root/apps/"
        T_DIR["traefik/\ndocker-compose.yml\ntraefik.yml\nacme.json\ndynamic/"]
        G_DIR["gamepocgen/\n├── Dockerfile.backend 18 lines\n├── docker/\n│   ├── Dockerfile 28 lines worker\n│   ├── docker-compose.yml 63 lines\n│   ├── .env\n│   ├── entrypoint.sh 443 lines\n│   ├── workspaces/\n│   │   └── job-N/\n│   └── deployed/\n│       ├── gamedemoN/\n│       │   ├── html/\n│       │   ├── metadata.json\n│       │   └── docker-compose.yml\n│       └── gallery/games.json\n├── docs/\n│   ├── docker-compose.yml 19 lines\n│   └── index.html\n├── gallery/\n│   ├── index.html\n│   └── gallery.js\n├── framework/\n├── prompts/\n├── scripts/\n├── backend/\n└── AI/"]
    end
```

# Docker Network

```mermaid
graph LR
    subgraph "traefik network external bridge"
        TF["Traefik"]
        BE["Backend :3010"]
        DOC["Docs nginx"]
        GD0["gamedemo0 nginx"]
        GD1["gamedemo1 nginx"]
    end

    subgraph "internal network bridge"
        BE2["Backend :3010"]
        PG2["PostgreSQL :5432"]
    end

    subgraph "default bridge"
        WK["Worker containers\nephemeral\nno Traefik routing needed"]
    end

    TF --- BE
    TF --- DOC
    TF --- GD0
    TF --- GD1
    BE2 --- PG2
```

# Build and Deploy Commands

```mermaid
flowchart TD
    subgraph "Build Worker Image"
        BW1["cd /root/apps/gamepocgen"] --> BW2["docker build -t gamepocgen-worker\n-f docker/Dockerfile ."]
    end

    subgraph "Build + Start Backend"
        BB1["cd /root/apps/gamepocgen/docker"] --> BB2["docker compose build --no-cache"] --> BB3["docker compose up -d"]
    end

    subgraph "Start Docs"
        BD1["cd /root/apps/gamepocgen/docs"] --> BD2["docker compose up -d"]
    end

    subgraph "Monitor"
        M1["docker compose logs -f backend"]
        M2["docker ps --filter name=gamedemo"]
        M3["docker ps --filter name=gamepocgen-worker"]
    end
```

---

## Architecture Detail Reference

Detailed subsystem documentation lives in `AI/document/`. Read these on-demand when working on specific areas:

| File | Covers |
|------|--------|
| `AI/document/00-system-overview.md` | High-level system overview, component relationships, and design philosophy |
| `AI/document/01-file-map.md` | Every file's purpose, line count, and dependency graph |
| `AI/document/02-user-flows.md` | Job submission, polling, 5-phase execution, Phase 5 repair loop, gallery auth, deployment |
| `AI/document/03-api-surface.md` | All REST API endpoints, request/response shapes, error codes, comparison mode |
| `AI/document/04-data-models.md` | Database schema (jobs + job_logs tables), JSONB structures, SQL operations |
| `AI/document/05-data-pipelines.md` | 5-phase generation pipeline, workspace accumulation, bind mount paths, env translation |
| `AI/document/06-state-lifecycle.md` | Job status transitions (queued/running/phase_1-5/completed/failed), container lifecycles |
| `AI/document/07-deployment.md` | Deployment flow, nginx container creation, Traefik label routing, game URL assignment |
| `AI/document/08-config.md` | Environment variables, config files, hardcoded values, container resource limits |
| `AI/document/09-boot-sequence.md` | Backend boot, worker boot (apikey vs OAuth), polling loop, Phase 5 repair loop |
| `AI/document/10-error-handling.md` | API errors, job processing errors, Phase 5 repair errors, gallery error states |
| `AI/document/11-security.md` | Security boundaries, OAuth flow, container isolation, secret management |
