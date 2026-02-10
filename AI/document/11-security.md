# Security Boundaries

```mermaid
graph TB
    subgraph "Public (no auth)"
        HEALTH["GET /health<br/>status + uptime"]
        GENERATE["POST /api/generate<br/>no auth required"]
        JOBS["GET /api/jobs<br/>GET /api/jobs/:id<br/>GET /api/jobs/:id/logs<br/>GET /api/stats"]
        GAMES["GET /api/games<br/>DELETE /api/games/:id"]
    end

    subgraph "Client-Side Password (sessionStorage)"
        DOCS["Docs site<br/>gamepocgen.namjo-games.com<br/>password: gamepoc2024"]
        GALLERY["Gallery page<br/>/gallery/<br/>password: gamepoc2024"]
    end

    subgraph "No Auth Required"
        GAME_SITES["Game sites<br/>gamedemoN.namjo-games.com<br/>public static HTML"]
    end

    subgraph "Infrastructure Secrets"
        ZAI["ZAI_API_KEY<br/>z.ai proxy API credentials"]
        OAUTH["CLAUDE_CODE_OAUTH_TOKEN<br/>CLAUDE_CODE_REFRESH_TOKEN<br/>CLAUDE_CODE_TOKEN_EXPIRES<br/>Anthropic OAuth credentials"]
        PG_CRED["POSTGRES_PASSWORD<br/>Database credentials"]
        DOCKER_SOCK["Docker socket<br/>/var/run/docker.sock<br/>mounted into backend"]
    end

    REQ((Internet)) --> HEALTH
    REQ --> GENERATE
    REQ --> JOBS
    REQ --> GAMES
    REQ --> DOCS
    REQ --> GALLERY
    REQ --> GAME_SITES

    ZAI -->|"forwarded to worker env<br/>(apikey mode)"| WORKER["Worker containers"]
    OAUTH -->|"forwarded to worker env<br/>(subscription mode)"| WORKER
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
        INPUT["API response data<br/>game.title game.url game.description"] --> CREATE["document.createElement('div')"]
        CREATE --> SET["div.textContent = untrustedString"]
        SET --> READ["return div.innerHTML<br/>(auto-escaped)"]
        READ --> SAFE["Safe HTML output<br/>< becomes &lt; etc"]
    end

    subgraph "Applied to"
        CARD_TITLE["Game card titles"]
        CARD_DESC["Game descriptions"]
        CARD_URL["Game URLs"]
        CARD_DATE["Date strings"]
    end

    SAFE --> CARD_TITLE
    SAFE --> CARD_DESC
    SAFE --> CARD_URL
    SAFE --> CARD_DATE
```

# Container Security

```mermaid
graph TD
    subgraph "Worker Container Isolation"
        NONROOT["Runs as user claude UID 1001<br/>not root"]
        TINI["tini init system<br/>proper signal handling<br/>zombie process reaping"]
        MEM["Memory limit: 2GB<br/>OOM kill if exceeded"]
        CPU["CPU limit: 0.5 cores<br/>NanoCpus: 500000000"]
        TIMEOUT["Phase timeouts:<br/>phase1-4: 43200s (12h)<br/>phase5: 3600s (1h)"]
        BIND["Single bind mount<br/>/workspace only"]
        PERMS["--dangerously-skip-permissions<br/>on ALL phases (1-5)"]
    end

    subgraph "Backend Container"
        SOCK["Docker socket mounted<br/>can create/stop/remove containers<br/>elevated privilege"]
        WS_VOL["Workspace volume<br/>shared with workers via host path"]
    end

    subgraph "Game Containers"
        READONLY["Static file serving only<br/>nginx:alpine<br/>no dynamic code execution"]
        TRAEFIK_NET["Connected to traefik network<br/>for routing only"]
        RESTART["RestartPolicy: unless-stopped"]
    end
```

# Worker Auth Mode Security

```mermaid
graph TD
    subgraph "Auth Mode: apikey (z.ai proxy)"
        AK_SET["ANTHROPIC_AUTH_TOKEN = ZAI_API_KEY<br/>ANTHROPIC_BASE_URL = ZAI_BASE_URL"]
        AK_SETTINGS["settings.json includes API key env vars"]
        AK_CLEAN["rm -f .credentials.json<br/>Force API key auth only"]
    end

    subgraph "Auth Mode: subscription (OAuth)"
        SUB_CREDS[".credentials.json written with:<br/>accessToken (CLAUDE_CODE_OAUTH_TOKEN)<br/>refreshToken (CLAUDE_CODE_REFRESH_TOKEN)<br/>expiresAt (CLAUDE_CODE_TOKEN_EXPIRES)"]
        SUB_REFRESH["Token refresh via curl POST to<br/>console.anthropic.com/v1/oauth/token<br/>client_id: 9d1c250a-e61b-44d9-88ed-5944d1962f5e"]
        SUB_NO_EXPORT["ANTHROPIC_AUTH_TOKEN NOT set<br/>ANTHROPIC_BASE_URL NOT set<br/>Auth goes through .credentials.json only"]
        SUB_BEFORE["refresh_oauth_token() called<br/>before EACH claude -p invocation"]
        SUB_BUFFER["5-minute buffer before expiry<br/>triggers refresh"]
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
            Entry->>Anthropic: POST /v1/oauth/token<br/>{grant_type: refresh_token,<br/>refresh_token: ...,<br/>client_id: 9d1c250a...}
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
        DOTENV[".env file on LXC 102<br/>/root/apps/gamepocgen/docker/.env<br/>not in git repo"]
    end

    subgraph "Secret Values"
        PG["POSTGRES_PASSWORD<br/>DB access"]
        ZAI2["ZAI_API_KEY<br/>z.ai proxy billing"]
        ZAI_B["ZAI_BASE_URL<br/>API endpoint"]
        OAUTH_T["CLAUDE_CODE_OAUTH_TOKEN<br/>Anthropic OAuth access token"]
        OAUTH_R["CLAUDE_CODE_REFRESH_TOKEN<br/>Anthropic OAuth refresh token"]
        OAUTH_E["CLAUDE_CODE_TOKEN_EXPIRES<br/>Token expiry epoch ms"]
    end

    subgraph "Propagation"
        DC2["docker-compose.yml<br/>env_file: .env<br/>interpolation: $POSTGRES_PASSWORD"]
        CM3["ContainerManager<br/>forwards ZAI_API_KEY to all workers"]
        PJ["processJob()<br/>forwards OAuth tokens to workers<br/>when provider=anthropic"]
        ENTRY_AK["entrypoint.sh (apikey mode)<br/>translates to ANTHROPIC_AUTH_TOKEN"]
        ENTRY_SUB["entrypoint.sh (subscription mode)<br/>writes to .credentials.json"]
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
        ALLOWED["Allowed tools:<br/>Bash, Read, Write, Edit,<br/>Glob, Grep, Task,<br/>WebFetch(domain:*), WebSearch"]
        DENIED["Denied tools: none"]
        SKIP["--dangerously-skip-permissions flag<br/>on ALL phases (phase1 through phase5)"]
    end

    subgraph "Claude Code config (~/.claude.json)"
        ONBOARD["hasCompletedOnboarding: true"]
        TRUST["hasTrustDialogAccepted: true<br/>for workspace directory"]
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
```
