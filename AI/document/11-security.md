# Security Boundaries

```mermaid
graph TB
    subgraph "Public (no auth)"
        HEALTH["GET /health\nstatus + uptime"]
        GENERATE["POST /api/generate\nno auth required"]
        JOBS["GET /api/jobs\nGET /api/jobs/:id\nGET /api/jobs/:id/logs\nGET /api/stats"]
        GAMES["GET /api/games\nDELETE /api/games/:id"]
        FEEDBACK["POST /api/jobs/:id/feedback"]
        IMPROVEMENTS["POST /api/improvements/run\nGET /api/improvements"]
    end

    subgraph "Client-Side Password (sessionStorage)"
        GALLERY["Gallery page\n/gallery/\npassword: gamepoc2024"]
    end

    subgraph "No Auth Required"
        GAME_SITES["Game sites\ngamedemoN.namjo-games.com\npublic static HTML"]
    end

    subgraph "Infrastructure Secrets"
        ZAI["ZAI_API_KEY\nz.ai proxy API credentials"]
        OAUTH["CLAUDE_CODE_OAUTH_TOKEN\nCLAUDE_CODE_REFRESH_TOKEN\nCLAUDE_CODE_TOKEN_EXPIRES\nAnthropic OAuth credentials"]
        PG_CRED["POSTGRES_PASSWORD\nDatabase credentials"]
        DOCKER_SOCK["Docker socket\n/var/run/docker.sock\nmounted into backend"]
    end

    REQ((Internet)) --> HEALTH
    REQ --> GENERATE
    REQ --> JOBS
    REQ --> GAMES
    REQ --> FEEDBACK
    REQ --> IMPROVEMENTS
    REQ --> GALLERY
    REQ --> GAME_SITES

    ZAI -->|"forwarded to worker env\n(apikey mode)"| WORKER["Worker containers"]
    OAUTH -->|"forwarded to worker env\n(subscription mode)"| WORKER
    PG_CRED -->|"connection string"| DB["PostgreSQL"]
    DOCKER_SOCK -->|"container management"| BACKEND["Backend service"]
```

# Authentication Flow

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant Gallery as gallery.js
    participant Session as sessionStorage

    Note over User,Session: Client-side password check (not server auth)

    User->>Browser: Visit /gallery/
    Browser->>Gallery: load page
    Gallery->>Session: get(gamepocgen_auth)

    alt Not set
        Gallery->>Browser: show password overlay
        User->>Gallery: enter password
        Gallery->>Gallery: input === 'gamepoc2024' ?
        alt Match
            Gallery->>Session: set gamepocgen_auth = true
            Gallery->>Browser: hide overlay show gallery
        else No match
            Gallery->>Browser: show error 3 seconds
            Gallery->>Browser: clear input refocus
        end
    else Already set
        Gallery->>Browser: show gallery directly
    end
```

# XSS Prevention

```mermaid
graph TD
    subgraph "gallery.js escapeHtml()"
        INPUT["API response data\njob.game_name job.error"] --> CREATE["document.createElement('div')"]
        CREATE --> SET["div.textContent = untrustedString"]
        SET --> READ["return div.innerHTML\n(auto-escaped)"]
        READ --> SAFE["Safe HTML output\n< becomes &lt; etc"]
    end

    subgraph "Applied to"
        CARD_TITLE["Game card titles"]
        CARD_ERR["Error messages"]
        CARD_DATE["Date strings"]
        CARD_DEFECTS["Defect descriptions"]
        CARD_IMP["Improvement report content"]
    end

    SAFE --> CARD_TITLE
    SAFE --> CARD_ERR
    SAFE --> CARD_DATE
    SAFE --> CARD_DEFECTS
    SAFE --> CARD_IMP
```

# Container Security

```mermaid
graph TD
    subgraph "Worker Container Isolation"
        NONROOT["Runs as user claude UID 1001\nnot root"]
        TINI["tini init system\nproper signal handling\nzombie process reaping"]
        MEM["Memory limit: 2GB\nOOM kill if exceeded"]
        CPU["CPU limit: 0.5 cores\nNanoCpus: 500000000"]
        TIMEOUT["Phase timeouts:\nphase1-4: 43200s (12h)\nphase5: 3600s (1h)"]
        BIND["Bind mounts:\n/workspace (job data)\n/home/claude/prompts (host prompts)\n/home/claude/framework (host framework)"]
        PERMS["--dangerously-skip-permissions\non ALL phases (1-5 + strategy + process-improvement)"]
    end

    subgraph "Process Improvement Container"
        PI_MEM["Memory: 2GB CPU: 1.0 core"]
        PI_BIND["Additional bind mounts:\nhostProjectRoot/prompts (RW)\nhostProjectRoot/framework (RW)\nhostProjectRoot/scripts (RW)"]
        PI_NET["Network: traefik\n(for accessing game URLs)"]
    end

    subgraph "Backend Container"
        SOCK["Docker socket mounted\ncan create/stop/remove containers\nelevated privilege"]
        WS_VOL["Workspace volume\nshared with workers via host path"]
    end

    subgraph "Game Containers"
        READONLY["Static file serving only\nnginx:alpine\nno dynamic code execution"]
        TRAEFIK_NET["Connected to traefik network\nfor routing only"]
        RESTART["RestartPolicy: unless-stopped"]
    end
```

# Worker Auth Mode Security

```mermaid
graph TD
    subgraph "Auth Mode: apikey (z.ai proxy)"
        AK_SET["ANTHROPIC_AUTH_TOKEN = ZAI_API_KEY\nANTHROPIC_BASE_URL = ZAI_BASE_URL"]
        AK_SETTINGS["settings.json includes API key env vars"]
        AK_CLEAN["rm -f .credentials.json\nForce API key auth only"]
    end

    subgraph "Auth Mode: subscription (OAuth)"
        SUB_CREDS[".credentials.json written with:\naccessToken (CLAUDE_CODE_OAUTH_TOKEN)\nrefreshToken (CLAUDE_CODE_REFRESH_TOKEN)\nexpiresAt (CLAUDE_CODE_TOKEN_EXPIRES)\nsubscriptionType: max\nrateLimitTier: default_claude_max_20x"]
        SUB_REFRESH["Token refresh via curl POST to\nconsole.anthropic.com/v1/oauth/token\nclient_id: 9d1c250a-e61b-44d9-88ed-5944d1962f5e"]
        SUB_NO_EXPORT["ANTHROPIC_AUTH_TOKEN NOT set\nANTHROPIC_BASE_URL NOT set\nAuth goes through .credentials.json only"]
        SUB_BEFORE["refresh_oauth_token() called\nbefore EACH claude -p invocation"]
        SUB_BUFFER["5-minute buffer before expiry\ntriggers refresh"]
    end
```

# OAuth Token Refresh Flow

```mermaid
sequenceDiagram
    participant Entry as entrypoint.sh
    participant CredFile as .credentials.json
    participant Anthropic as console.anthropic.com

    Note over Entry,Anthropic: refresh_oauth_token() - called before each claude -p

    Entry->>CredFile: Read expiresAt
    alt Token still valid (current + 5min buffer < expiresAt)
        Note over Entry: Skip refresh
    else Token expired or expiring soon
        Entry->>CredFile: Read refreshToken
        alt No refresh token
            Note over Entry: return 1 (failure, proceed anyway)
        else Has refresh token
            Entry->>Anthropic: POST /v1/oauth/token\n{grant_type: refresh_token,\nrefresh_token: ...,\nclient_id: 9d1c250a...}
            alt Refresh succeeds
                Anthropic-->>Entry: {access_token, refresh_token, expires_in}
                Entry->>CredFile: Write updated tokens + new expiresAt
            else Refresh fails
                Note over Entry: Log failure, proceed with stale token
            end
        end
    end
```

# Secret Management

```mermaid
graph LR
    subgraph "Secrets Storage"
        DOTENV[".env file on LXC 102\n/root/apps/gamepocgen/docker/.env\nnot in git repo"]
    end

    subgraph "Secret Values"
        PG["POSTGRES_PASSWORD\nDB access"]
        ZAI2["ZAI_API_KEY\nz.ai proxy billing"]
        ZAI_B["ZAI_BASE_URL\nAPI endpoint"]
        OAUTH_T["CLAUDE_CODE_OAUTH_TOKEN\nAnthropic OAuth access token"]
        OAUTH_R["CLAUDE_CODE_REFRESH_TOKEN\nAnthropic OAuth refresh token"]
        OAUTH_E["CLAUDE_CODE_TOKEN_EXPIRES\nToken expiry epoch ms"]
    end

    subgraph "Propagation"
        DC2["docker-compose.yml\nenv interpolation: $POSTGRES_PASSWORD"]
        CM3["ContainerManager\nforwards ZAI_API_KEY to all workers"]
        PJ["processJob()\nforwards OAuth tokens to workers\nwhen provider=anthropic"]
        ENTRY_AK["entrypoint.sh (apikey mode)\ntranslates to ANTHROPIC_AUTH_TOKEN"]
        ENTRY_SUB["entrypoint.sh (subscription mode)\nwrites to .credentials.json"]
    end

    DOTENV --> PG
    DOTENV --> ZAI2
    DOTENV --> ZAI_B
    DOTENV --> OAUTH_T
    DOTENV --> OAUTH_R
    DOTENV --> OAUTH_E
    PG --> DC2
    ZAI2 --> CM3
    ZAI_B --> CM3
    OAUTH_T --> PJ
    OAUTH_R --> PJ
    OAUTH_E --> PJ
    CM3 --> ENTRY_AK
    PJ --> ENTRY_SUB
```

# Claude Code Permissions in Workers

```mermaid
graph TD
    subgraph "entrypoint.sh settings.json permissions"
        ALLOWED["Allowed tools:\nBash, Read, Write, Edit,\nGlob, Grep, Task,\nWebFetch(domain:*), WebSearch"]
        DENIED["Denied tools: none"]
        SKIP["--dangerously-skip-permissions flag\non ALL phases"]
    end

    subgraph "Claude Code config (~/.claude.json)"
        ONBOARD["hasCompletedOnboarding: true"]
        TRUST["hasTrustDialogAccepted: true\nfor workspace directory"]
        TOOLS["allowedTools matches settings.json"]
    end
```

# Container Name Collision Prevention

```mermaid
graph TD
    subgraph "ContainerManager.spawnContainer()"
        NAME["containerName = gamepocgen-worker-{jobId}-{phase}"]
        NAME --> CHECK["Try docker.getContainer(name)"]
        CHECK -->|"exists"| REMOVE["container.remove({force: true})"]
        REMOVE --> CREATE["docker.createContainer()"]
        CHECK -->|"not found"| CREATE
    end

    subgraph "DeploymentManager._startGameContainer()"
        GNAME["containerName = gamedemo{gameId}"]
        GNAME --> GCHECK["Try docker.getContainer(name)"]
        GCHECK -->|"exists"| GSTOP["container.stop() then container.remove()"]
        GSTOP --> GCREATE["docker.createContainer()"]
        GCHECK -->|"not found"| GCREATE
    end

    subgraph "Process Improvement Container"
        PINAME["containerName = gamepocgen-process-improvement-{timestamp}"]
        PINAME --> PICREATE["docker.createContainer()\nUnique name via Date.now()"]
    end
```
