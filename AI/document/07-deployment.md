# Infrastructure Topology

```mermaid
graph TB
    INET((Internet\nHTTPS :443))

    subgraph "Proxmox Host pve.grossmann.at"
        subgraph "LXC 102 webservices 192.168.138.11"
            TRAEFIK["Traefik\n:80 redirect\n:443 TLS termination\nLet's Encrypt auto-SSL\nDocker provider auto-discovery"]

            subgraph "Backend Stack docker/docker-compose.yml 64 lines"
                BACK["gamepocgen-backend\nNode 22 slim :3010->:3000\nDockerfile.backend 19 lines\nExpress + job poller + Playwright"]
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
        G_DIR["gamepocgen/\n  Dockerfile.backend 19 lines\n  docker/\n    Dockerfile 28 lines worker\n    docker-compose.yml 64 lines\n    .env\n    entrypoint.sh 443 lines\n    workspaces/\n      job-N/\n      shared/ (process improvement)\n    deployed/\n      gamedemoN/\n        html/\n        metadata.json\n        docker-compose.yml\n      gallery/games.json\n  docs/\n    docker-compose.yml 19 lines\n    index.html\n  gallery/\n    index.html\n    gallery.js\n  framework/\n  prompts/\n  scripts/\n  backend/\n  AI/"]
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
        PI["Process Improvement\ncontainer (when running)"]
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
        M4["docker ps --filter name=gamepocgen-process"]
    end
```
