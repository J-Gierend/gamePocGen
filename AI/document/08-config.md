# Environment Variables

```mermaid
graph TD
    subgraph "docker/.env (secrets)"
        PG_PASS["POSTGRES_PASSWORD\nPostgreSQL password\nRequired no default"]
        ZAI_KEY["ZAI_API_KEY\nClaude API key via z.ai\nRequired no default"]
        ZAI_URL["ZAI_BASE_URL\nz.ai API endpoint\nDefault: https://api.z.ai/api/anthropic"]
    end

    subgraph "docker-compose.yml env"
        DB_URL["DATABASE_URL\npostgresql://gamepocgen:$PG_PASS@postgres:5432/gamepocgen"]
        PORT["PORT\nExpress listen port\nDefault: 3000"]
        MAX_CON["MAX_CONCURRENT\nParallel job limit\nDefault: 5"]
        POLL_INT["POLL_INTERVAL\nQueue check frequency ms\nDefault: 5000"]
        WS_PATH["WORKSPACE_PATH\nContainer workspace dir\nDefault: /app/workspaces"]
        HOST_WS["HOST_WORKSPACE_PATH\nHost bind mount path\nDefault: WORKSPACE_PATH"]
        DEPLOY["DEPLOY_DIR\nGame deploy directory\nDefault: /root/apps"]
        HOST_DD["HOST_DEPLOY_DIR\nHost deploy path\nDefault: DEPLOY_DIR"]
        GAL_PATH["GALLERY_DATA_PATH\ngames.json location\nDefault: /root/apps/gallery/games.json"]
        DOMAIN["DOMAIN\nBase domain for games\nDefault: namjo-games.com"]
        W_IMG["WORKER_IMAGE\nDocker image name\nDefault: gamepocgen-worker"]
    end

    subgraph "Worker container env (set by containerManager)"
        W_PHASE["PHASE\nphase1|phase2|phase3|phase4\nRequired"]
        W_JOB["JOB_ID\nJob identifier\nRequired"]
        W_NAME["GAME_NAME\nGenerated game title\nRequired"]
        W_ZAI["ZAI_API_KEY\nForwarded from backend\nRequired"]
        W_ZURL["ZAI_BASE_URL\nForwarded from backend"]
        W_DIR["WORKSPACE_DIR\n/workspace\nDefault"]
        W_TIME["TIMEOUT_SECONDS\nPhase timeout\nDefault: 3600"]
    end

    PG_PASS -->|"interpolated"| DB_URL
    DB_URL --> QM["QueueManager\nnew Pool()"]
    ZAI_KEY --> W_ZAI
    ZAI_URL --> W_ZURL
    PORT --> EXPRESS["Express app.listen()"]
    MAX_CON --> POLLER["pollQueue() concurrency gate"]
    POLL_INT --> POLLER
    WS_PATH --> CM2["ContainerManager"]
    HOST_WS --> CM2
    DEPLOY --> DM2["DeploymentManager"]
    HOST_DD --> DM2
    DOMAIN --> DM2
    W_IMG --> CM2
    W_PHASE --> ENTRY["entrypoint.sh phase routing"]
    W_ZAI -->|"translated to\nANTHROPIC_AUTH_TOKEN"| CLAUDE["Claude Code CLI"]
    W_ZURL -->|"translated to\nANTHROPIC_BASE_URL"| CLAUDE
```

# Config Files

```mermaid
graph TD
    subgraph "Configuration Files"
        PKG["backend/package.json 18 lines\ntype: module (ESM)\ndeps: express pg dockerode cors\nscripts: start test:all"]
        DC["docker/docker-compose.yml 61 lines\n2 services: backend postgres\n2 volumes: workspaces pgdata\nnetwork: traefik external"]
        DDC["docs/docker-compose.yml 20 lines\n1 service: nginx\n3 volume mounts :ro\nnetwork: traefik external"]
        DBK["Dockerfile.backend 13 lines\nFROM node:22-slim\nWORKDIR /app\nnpm ci --omit=dev\nCMD node src/index.js"]
        ENT["docker/entrypoint.sh 221 lines\nPhase routing logic\nClaude Code settings.json\nStatus JSON writing\ntimeout handling"]
        ENV[".env.example 4 lines\nPOSTGRES_PASSWORD\nZAI_API_KEY\nZAI_BASE_URL"]
    end

    PKG -->|"defines deps for"| DBK
    DC -->|"references"| DBK
    DC -->|"loads"| ENV
    DC -->|"mounts"| ENT
```

# Hardcoded Configuration

```mermaid
graph LR
    subgraph "Hardcoded Values"
        PW["Password: gamepoc2024\ndocs/index.html line 1090\ngallery/gallery.js line 11\nsessionStorage key: gamepocgen_auth"]
        SLOTS["Game slots: 0-9\nsubdomain = gamedemo{jobId % 10}\nmax 10 concurrent games"]
        TICK["GameLoop tickRate: 20/sec\ndefault fixed timestep"]
        SUFFIXES["BigNum suffixes:\nK M B T Qa Qi Sx Sp Oc No Dc\nthen scientific notation"]
        AGENTS["Phase 2 agents order:\ncurrencies progression prestige\nskill-tree ui-ux psychology-review"]
        RES["Worker resource limits:\nMemory: 2GB\nCPU: 1 core\nTimeout: 3600s"]
    end
```
