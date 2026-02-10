# Game Generation Pipeline

```mermaid
flowchart LR
    A["User Prompt\ntext string"] -->|"POST /api/generate"| B["Job Record\nstatus: queued\nPostgreSQL"]
    B -->|"poller claims\nFOR UPDATE SKIP LOCKED"| C["Phase 1 Container\nClaude Code CLI"]
    C -->|"idea-generator prompt"| D["idea.json\nGame concept\ntheme + mechanics"]
    D -->|"shared workspace\nbind mount"| E["Phase 2 Container\n3 sequential agents"]
    E -->|"3 GDD prompts\ncurrencies → progression → ui-ux"| F["gdd/*.json\n3 design documents\ncurrencies progression ui-ux"]
    F -->|"shared workspace"| G["Phase 3 Container\nimplementation planner"]
    G -->|"implementation-guide prompt\nreads all GDD"| H["implementation-plan.json\nTDD phases"]
    H -->|"shared workspace\n+ framework/ copy"| I["Phase 4 Container\nTDD orchestrator"]
    I -->|"orchestrator prompt\nwrite tests → implement"| J["dist/\nindex.html"]
    J -->|"copy to deploy dir"| K["nginx:alpine\ngamedemoN.namjo-games.com\nTraefik auto-SSL"]
    K -->|"Playwright test\nrunPlaywrightTest()"| L["Phase 5 Repair Loop\nup to 100 iterations\ntarget 10/10 score"]
    L -->|"redeploy after\neach repair"| K
```

# Workspace File Accumulation

```mermaid
flowchart TD
    subgraph "After Phase 1"
        W1["workspace/job-N/\n├── idea.json"]
    end

    subgraph "After Phase 2"
        W2["workspace/job-N/\n├── idea.json\n└── gdd/\n    ├── currencies.json\n    ├── progression.json\n    └── ui-ux.json"]
    end

    subgraph "After Phase 3"
        W3["workspace/job-N/\n├── idea.json\n├── gdd/ (3 files)\n└── implementation-plan.json"]
    end

    subgraph "After Phase 4"
        W4["workspace/job-N/\n├── idea.json\n├── gdd/ (3 files)\n├── implementation-plan.json\n├── framework/ (copied in)\n└── dist/\n    └── index.html"]
    end

    subgraph "After Phase 5 Repair"
        W5["deployed/gamedemoN/html/\n├── index.html\n├── score-badge.js\n├── repair-log.json\n└── repair-log.html"]
    end

    W1 --> W2 --> W3 --> W4 --> W5
```

# Docker Bind Mount Path Translation

```mermaid
flowchart LR
    subgraph "Backend Container Sees"
        BC_WS["/data/workspaces/job-N\nWORKSPACE_PATH"]
        BC_DD["/data/deployed\nDEPLOY_DIR"]
    end

    subgraph "Host LXC 102 Actual"
        HOST_WS["/root/apps/gamepocgen/docker/workspaces/job-N\nHOST_WORKSPACE_PATH"]
        HOST_DD["/root/apps/gamepocgen/docker/deployed\nHOST_DEPLOY_DIR"]
    end

    subgraph "Worker Container Sees"
        WC["/workspace\nBind from HOST path"]
    end

    subgraph "Game Container Sees"
        GC["/usr/share/nginx/html\nBind from HOST deploy dir"]
    end

    BC_WS -.->|"reads/writes via\ncontainer mount"| HOST_WS
    HOST_WS -->|"Docker bind mount\npassed to createContainer"| WC
    BC_DD -.->|"reads/writes via\ncontainer mount"| HOST_DD
    HOST_DD -->|"Docker bind mount\npassed to createContainer"| GC
```

# Environment Variable Translation

```mermaid
flowchart TD
    subgraph "API Key Mode AUTH_MODE=apikey"
        ENV_A[".env file\nZAI_API_KEY=sk-xxx\nZAI_BASE_URL=https://api.z.ai/..."]
        -->|"docker-compose env"| BACKEND_A["Backend Container\nenv: ZAI_API_KEY"]
        -->|"passed to container env"| WORKER_A["Worker Container\nenv: ZAI_API_KEY ZAI_BASE_URL"]
        WORKER_A -->|"entrypoint.sh\nexport ANTHROPIC_AUTH_TOKEN=$ZAI_API_KEY\nexport ANTHROPIC_BASE_URL=$ZAI_BASE_URL"| CLAUDE_A["Claude Code CLI\nreads ANTHROPIC_AUTH_TOKEN\nreads ANTHROPIC_BASE_URL"]
    end

    subgraph "Subscription Mode AUTH_MODE=subscription"
        ENV_B[".env file\nCLAUDE_CODE_OAUTH_TOKEN=...\nCLAUDE_CODE_REFRESH_TOKEN=...\nCLAUDE_CODE_TOKEN_EXPIRES=..."]
        -->|"docker-compose env"| BACKEND_B["Backend Container\nenv: CLAUDE_CODE_OAUTH_TOKEN"]
        -->|"processJob() builds\nproviderEnv array"| WORKER_B["Worker Container\nenv: AUTH_MODE=subscription\nCLAUDE_CODE_OAUTH_TOKEN\nCLAUDE_CODE_REFRESH_TOKEN\nCLAUDE_CODE_TOKEN_EXPIRES\nMODEL"]
        WORKER_B -->|"entrypoint.sh\nwrites .credentials.json\nrefresh_oauth_token()"| CLAUDE_B["Claude Code CLI\nreads OAuth credentials\nfrom .credentials.json"]
    end
```

# Worker Container Environment Variables

```mermaid
flowchart LR
    subgraph "All Phases"
        BASE["PHASE\nJOB_ID\nGAME_NAME\nZAI_API_KEY\nZAI_BASE_URL\nTIMEOUT_SECONDS\nWORKSPACE_DIR=/workspace"]
    end

    subgraph "Subscription Mode Extra"
        SUB["AUTH_MODE=subscription\nCLAUDE_CODE_OAUTH_TOKEN\nCLAUDE_CODE_REFRESH_TOKEN\nCLAUDE_CODE_TOKEN_EXPIRES\nMODEL"]
    end

    subgraph "Phase 1 Extra"
        P1["GENRE_SEED\nEXISTING_GAME_NAMES"]
    end

    subgraph "Phase 5 Extra"
        P5["GAME_URL\nDEFECT_REPORT"]
    end

    BASE --> P1
    BASE --> P5
    SUB --> P1
    SUB --> P5
```

# Phase 5 Repair Loop

```mermaid
flowchart TD
    DEPLOY["Game deployed\ngamedemoN.namjo-games.com"] --> INJECT["Inject score-badge.js\nscript tag into index.html"]
    INJECT --> TEST["runPlaywrightTest\nhttp://gamedemoN internal URL"]
    TEST --> SCORE{"Score?"}

    SCORE -->|"score >= 10"| PASS["Quality gate passed\nstatus: completed"]
    SCORE -->|"attempt = 100\nscore >= 4"| KEEP["Keep game\nstatus: completed"]
    SCORE -->|"attempt = 100\nscore < 4"| REMOVE["removeGame()\nstatus: failed"]
    SCORE -->|"score < 10\nattempt < 100"| REPAIR["Spawn phase5 container\nwith DEFECT_REPORT"]

    REPAIR --> REDEPLOY["Redeploy dist/\nRe-inject badge"]
    REDEPLOY --> UPDATE["Update score-badge.js\nUpdate repair-log.json\nUpdate repair-log.html"]
    UPDATE --> TEST
```

# Worker Phase Execution

```mermaid
sequenceDiagram
    participant Entry as entrypoint.sh
    participant FS as Workspace /workspace
    participant Claude as Claude Code CLI

    Note over Entry,Claude: Single phase inside worker container
    Entry->>Entry: Validate: PHASE, JOB_ID, GAME_NAME
    Entry->>Entry: Validate: ZAI_API_KEY (apikey mode only)
    Entry->>FS: mkdir workspace/ status/
    Entry->>Entry: Configure auth (apikey or subscription)
    Entry->>Entry: Write ~/.claude/settings.json
    Entry->>Entry: Write ~/.claude.json (skip onboarding)
    Entry->>FS: Copy framework/ into workspace
    Entry->>FS: Write status/phase.json = running

    alt PHASE = phase1
        Entry->>Claude: claude -p --dangerously-skip-permissions phase1-idea-generator.md
        Claude->>FS: Write idea.json
    else PHASE = phase2
        loop currencies, progression, ui-ux
            Entry->>Claude: claude -p --dangerously-skip-permissions phase2-gdd/agent.md
            Claude->>FS: Write gdd/agent.json
        end
    else PHASE = phase3
        Entry->>Claude: claude -p --dangerously-skip-permissions phase3-implementation-guide.md
        Claude->>FS: Write implementation-plan.json
    else PHASE = phase4
        Entry->>Claude: claude -p --dangerously-skip-permissions phase4-orchestrator.md
        Claude->>FS: Write dist/index.html
    else PHASE = phase5
        Entry->>Claude: claude -p --dangerously-skip-permissions phase5-repair-agent.md
        Claude->>FS: Fix files in dist/
    end

    Entry->>FS: Write status/phase.json = completed|failed|timeout
```

# Phase Timeout Configuration

```mermaid
flowchart LR
    subgraph "containerManager.js DEFAULT_TIMEOUTS"
        T1["phase1: 43200s (12h)"]
        T2["phase2: 43200s (12h)"]
        T3["phase3: 43200s (12h)"]
        T4["phase4: 43200s (12h)"]
        T5["phase5: 3600s (1h per repair)"]
    end

    subgraph "Resource Limits"
        MEM["Memory: 2GB"]
        CPU["CPU: 0.5 core"]
    end
```

# Comparison Job Pipeline

```mermaid
sequenceDiagram
    participant API as POST /api/generate
    participant QM as QueueManager
    participant JobA as Job A (z.ai)
    participant JobB as Job B (anthropic)

    Note over API,JobB: options.compare = true

    API->>QM: addJob(provider=zai, name=ZAI-BaseName)
    QM-->>API: jobAId
    API->>QM: addJob(provider=anthropic, sourceJobId=jobAId, name=Claude-BaseName)
    QM-->>API: jobBId

    Note over JobA,JobB: Both jobs enter queue as status=queued

    JobA->>JobA: Phase 1: generate idea.json
    JobB->>JobB: Phase 1: wait for JobA phase1 completion
    JobB->>JobB: Copy idea.json from JobA workspace
    JobA->>JobA: Phases 2-5: independent execution
    JobB->>JobB: Phases 2-5: independent execution
```
