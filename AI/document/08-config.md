# Environment Variables

```mermaid
graph TD
    subgraph "docker/.env secrets"
        PG_PASS["POSTGRES_PASSWORD\nPostgreSQL password\nRequired no default"]
        ZAI_KEY["ZAI_API_KEY\nClaude API key via z.ai\nRequired no default"]
        ZAI_URL["ZAI_BASE_URL\nz.ai API endpoint\nDefault: https://api.z.ai/api/anthropic"]
    end

    subgraph "docker-compose.yml env"
        DB_URL["DATABASE_URL\npostgresql://gamepocgen:$PG_PASS@postgres:5432/gamepocgen"]
        MAX_CON["MAX_CONCURRENT\nParallel job limit\nDefault: 5"]
        WS_PATH["WORKSPACE_PATH\n/data/workspaces\ncode default: /app/workspaces"]
        HOST_WS["HOST_WORKSPACE_PATH\n/root/apps/gamepocgen/docker/workspaces"]
        DEPLOY["DEPLOY_DIR\n/data/deployed\ncode default: /root/apps"]
        HOST_DD["HOST_DEPLOY_DIR\n/root/apps/gamepocgen/docker/deployed"]
        GAL_PATH["GALLERY_DATA_PATH\n/data/deployed/gallery/games.json"]
        DOMAIN["DOMAIN\nnamjo-games.com"]
        W_IMG["WORKER_IMAGE\ngamepocgen-worker"]
        HOST_PR["HOST_PROJECT_ROOT\n/root/apps/gamepocgen\nEnables live prompt/framework editing"]
        OAUTH["CLAUDE_CODE_OAUTH_TOKEN\nOAuth access token\nOptional empty default"]
        REFRESH["CLAUDE_CODE_REFRESH_TOKEN\nOAuth refresh token\nOptional empty default"]
        EXPIRES["CLAUDE_CODE_TOKEN_EXPIRES\nToken expiry epoch ms\nOptional empty default"]
    end

    subgraph "backend/src/index.js defaults"
        PORT["PORT\nExpress listen port\nDefault: 3000"]
        POLL_INT["POLL_INTERVAL\nQueue check frequency ms\nDefault: 5000"]
    end

    subgraph "Worker container env set by containerManager + processJob"
        W_PHASE["PHASE\nphase1-phase5 + phase5-strategy\n+ process-improvement\nRequired"]
        W_JOB["JOB_ID\nJob identifier\nRequired"]
        W_NAME["GAME_NAME\nGenerated game title\nRequired"]
        W_ZAI["ZAI_API_KEY\nForwarded from backend\nRequired in apikey mode"]
        W_ZURL["ZAI_BASE_URL\nForwarded from backend"]
        W_DIR["WORKSPACE_DIR\n/workspace"]
        W_TIME["TIMEOUT_SECONDS\nphase1-4: 43200 12h\nphase5: 3600 1h"]
        W_MODEL["MODEL\nclaude-opus-4-6"]
        W_EFFORT["CLAUDE_CODE_EFFORT_LEVEL\nhigh"]
        W_AUTH["AUTH_MODE\napikey or subscription\nDefault: apikey"]
        W_OAUTH["CLAUDE_CODE_OAUTH_TOKEN\nForwarded for subscription mode"]
        W_GENRE["GENRE_SEED\nGenre hint for phase1\n16 built-in genres"]
        W_EXISTING["EXISTING_GAME_NAMES\nComma-separated deployed titles"]
        W_GAMEURL["GAME_URL\nDeployed game URL\nphase5 only"]
        W_DEFECT["DEFECT_REPORT\nJSON defect list or repair history\nphase5 + phase5-strategy"]
    end

    PG_PASS -->|"interpolated"| DB_URL
    DB_URL --> QM["QueueManager\nnew Pool"]
    ZAI_KEY --> W_ZAI
    ZAI_URL --> W_ZURL
    PORT --> EXPRESS["Express app.listen"]
    MAX_CON --> POLLER["pollQueue concurrency gate"]
    POLL_INT --> POLLER
    WS_PATH --> CM2["ContainerManager"]
    HOST_WS --> CM2
    HOST_PR --> CM2
    DEPLOY --> DM2["DeploymentManager"]
    HOST_DD --> DM2
    GAL_PATH --> DM2
    DOMAIN --> DM2
    W_IMG --> CM2
```

# Config Files

```mermaid
graph TD
    subgraph "Configuration Files"
        PKG["backend/package.json 17 lines\ntype: module ESM\ndeps: express pg dockerode cors\nscripts: start test test:routes test:all"]
        DC["docker/docker-compose.yml 64 lines\n2 services: backend postgres\npostgres:15-alpine with healthcheck\n2 networks: traefik internal\n1 volume: pgdata"]
        DDC["docs/docker-compose.yml 19 lines\n1 service: nginx:alpine\n3 volume mounts :ro\nnetwork: traefik external"]
        DBK["Dockerfile.backend 19 lines\nFROM node:22-slim\nnpm install --production\nPlaywright chromium install\nCOPY scripts/ for game testing\nCMD node src/index.js"]
        DW["docker/Dockerfile 28 lines\nFROM node:22-slim\nInstall git curl jq tini\nNon-root user claude UID 1001\nInstall Claude Code CLI\nCOPY framework/ prompts/ entrypoint.sh"]
        ENT["docker/entrypoint.sh 443 lines\n7-phase router\nphase1 phase2 phase3 phase4 phase5\nphase5-strategy process-improvement\nOAuth token refresh\nDual auth: apikey + subscription\nClaude Code settings.json + .claude.json\nStatus JSON writing"]
    end

    PKG -->|"defines deps for"| DBK
    DC -->|"references"| DBK
```

# Hardcoded Configuration

```mermaid
graph LR
    subgraph "Hardcoded Values"
        PW["Password: gamepoc2024\ngallery/gallery.js line 11\nsessionStorage key: gamepocgen_auth"]
        SLOTS["Game slots: gamedemo{gameId}\nsubdomain = gamedemo + gameId directly\nno modulo, no max limit"]
        TICK["GameLoop tickRate: 20/sec\ndefault fixed timestep"]
        SUFFIXES["BigNum suffixes:\nK M B T Qa Qi Sx Sp Oc No Dc\nthen scientific notation"]
        AGENTS["Phase 2 agents order:\ncurrencies progression ui-ux\n3 sequential agents"]
        RES["Worker resource limits:\nMemory: 2GB\nCPU: 0.5 cores\nphase1-4 timeout: 43200s 12h\nphase5 timeout: 3600s 1h"]
        REPAIR["Repair loop:\nMAX_REPAIR_ATTEMPTS: 100\nPASS_SCORE: 10/10\nFAIL_SCORE: 4/10 remove threshold\nMAX_CONSECUTIVE_TIMEOUTS: 5\nPLATEAU_WINDOW: 5\nPLATEAU_THRESHOLD: 0.5"]
        GENRES["16 genre seeds:\ndungeon-crawler space-combat\nfishing-and-gathering factory-automation\nmonster-tamer lane-battle\ntower-defense wave-survival\nexploration-and-mapping racing-and-dodging\nfarming-and-ecosystem puzzle-combat\npirate-ship-battles spell-crafting-arena\ntrain-network underwater-exploration"]
        PROMPTS["13 prompt templates\n4838 lines total\nphase1: 1 + phase2: 6 (3 used)\nphase3: 1 + phase4: 1\nphase5: 2 repair + review\n+ strategy-review\n+ process-improvement"]
        BASEPORT["Game container base port: 8080\nport = 8080 + gameId"]
        OAUTH_CLIENT["OAuth client_id:\n9d1c250a-e61b-44d9-88ed-5944d1962f5e\nconsole.anthropic.com"]
        PIA_COOL["Process improvement:\nCooldown: 1 hour\nCPU: 1.0 core\nNetwork: traefik"]
        VIEWPORT["Viewport test: 1400x900\nfitsViewport: 2px tolerance\nincomplete tier cap 6.0"]
    end
```
