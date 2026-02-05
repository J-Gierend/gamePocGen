# System Architecture

```mermaid
graph TB
    subgraph "Frontend [nginx :80/:443]"
        DOCS["Docs Site\nindex.html 1125 lines\ngamepocgen.namjo-games.com"]
        GALLERY["Gallery\ngallery.js 279 lines\n/gallery/ path"]
    end

    subgraph "Backend [Express :3010]"
        API["REST API\napi.js 151 lines\n8 endpoints"]
        POLLER["Job Poller\nindex.js 148 lines\n5s interval"]
        QM["QueueManager\n255 lines\nPostgreSQL queue"]
        CM["ContainerManager\n200 lines\nDocker lifecycle"]
        DM["DeploymentManager\n255 lines\nnginx + Traefik"]
    end

    subgraph "Data [PostgreSQL :5432]"
        DB[("jobs table\nJSONB phase_outputs\nJSONB logs")]
    end

    subgraph "Worker Pipeline [gamepocgen-worker]"
        ENTRY["entrypoint.sh 221 lines\n4-phase router"]
        CLAUDE["Claude Code CLI\nz.ai API"]
        PROMPTS["9 prompt templates\n2540 lines total"]
    end

    subgraph "Game Framework [vanilla JS]"
        CORE["Core: GameLoop BigNum\nSaveManager EventBus"]
        MECH["Mechanics: Currency\nGenerator Multiplier\nPrestige Unlockable"]
        UI["UI: ResourceBar\nUpgradeButton ProgressBar\nTabSystem SkillTree"]
        SPRITES["Sprites: Renderer\nData ProceduralSprite"]
        CSS["game.css 637 lines\nDark theme"]
    end

    subgraph "Game Containers [nginx:alpine]"
        G1["gamedemo0-9\n.namjo-games.com\nStatic HTML games"]
    end

    GALLERY -->|"GET /api/games"| API
    API -->|"SQL queries"| QM
    QM -->|"pg Pool"| DB
    POLLER -->|"getNextJob()"| QM
    POLLER -->|"spawnContainer()"| CM
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
        GL["GameLoop\n214 lines"]
        EB["EventBus\n93 lines"]
        BN["BigNum\n325 lines"]
        SM["SaveManager\n247 lines"]
    end

    subgraph "Mechanics [depends on BigNum]"
        CM2["CurrencyManager\n187 lines"]
        GM["GeneratorManager\n189 lines"]
        MM["MultiplierManager\n113 lines"]
        PM["PrestigeManager\n154 lines"]
        UM["UnlockManager\n110 lines"]
    end

    subgraph "UI [depends on BigNum + CSS]"
        RB["ResourceBar 133"]
        UB["UpgradeButton 192"]
        PB["ProgressBar 141"]
        TS["TabSystem 152"]
        SK["SkillTree 223"]
    end

    subgraph "Sprites [CommonJS + Canvas]"
        SR["SpriteRenderer 151"]
        SD["SpriteData 80"]
        PS["ProceduralSprite 159"]
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

# Backend File Map

```mermaid
graph LR
    subgraph "backend/src/"
        IDX["index.js 148 lines\nEntry: wires services\nstarts Express + poller"]
        API["routes/api.js 151 lines\ncreateHandlers + createRouter\n8 REST endpoints"]
        QM["services/queueManager.js 255 lines\nPostgreSQL job queue\natomic claiming"]
        CM["services/containerManager.js 200 lines\nDocker container lifecycle\nspawn + poll + logs"]
        DM["services/deploymentManager.js 255 lines\nnginx container creation\nTraefik label injection"]
    end

    IDX -->|"imports"| API
    IDX -->|"imports"| QM
    IDX -->|"imports"| CM
    IDX -->|"imports"| DM
    API -->|"injected via createHandlers"| QM
    API -->|"injected via createHandlers"| CM
    API -->|"injected via createHandlers"| DM
    IDX -->|"processJob calls"| CM
    IDX -->|"processJob calls"| DM
```

# Backend Test File Map

```mermaid
graph LR
    subgraph "backend/src/services/__tests__/"
        SRR["run-tests.js 45 lines\nImports + runs 3 suites"]
        QMT["queueManager.test.js\nMock pg Pool\n30+ tests"]
        CMT["containerManager.test.js\nMock Dockerode\n25+ tests"]
        DMT["deploymentManager.test.js\nMock Docker + fs\n26+ tests"]
    end

    subgraph "backend/src/routes/__tests__/"
        RRR["run-tests.js 45 lines\nImports + runs 1 suite"]
        AT["api.test.js 411 lines\nMock req/res pattern\n22 tests"]
    end

    SRR -->|"imports"| QMT
    SRR -->|"imports"| CMT
    SRR -->|"imports"| DMT
    RRR -->|"imports"| AT
    AT -->|"imports createHandlers"| API2["routes/api.js"]
```

# Framework File Map

```mermaid
graph LR
    subgraph "framework/core/"
        GL["GameLoop.js 214\nFixed tick + RAF render"]
        EB["EventBus.js 93\nMap-based pub/sub"]
        BN["BigNum.js 325\nMantissa+exponent math"]
        SM["SaveManager.js 247\nlocalStorage + slots"]
        CI["index.js 14\nRe-exports + VERSION"]
    end

    subgraph "framework/mechanics/"
        CU["Currency.js 187\nMulti-currency + converters"]
        GE["Generator.js 189\nAuto-production + scaling"]
        MU["Multiplier.js 113\nAdd + multiply stacking"]
        PR["Prestige.js 154\nReset layers + formula"]
        UN["Unlockable.js 110\nCondition checking"]
        MI["index.js 12\nRe-exports all"]
    end

    subgraph "framework/ui/"
        RB["ResourceBar.js 133\nCurrency display"]
        UB["UpgradeButton.js 192\nPurchase button + states"]
        PB["ProgressBar.js 141\nFill bar indicator"]
        TS["TabSystem.js 152\nTab switching"]
        SK["SkillTree.js 223\nNode graph + connectors"]
        UI["index.js 15\nRe-exports + UI_VERSION"]
    end

    CI -->|"exports"| GL
    CI -->|"exports"| EB
    CI -->|"exports"| BN
    CI -->|"exports"| SM
    CU -->|"uses"| BN
    GE -->|"uses"| BN
    GE -->|"uses"| CU
    PR -->|"uses"| BN
    PR -->|"uses"| CU
    PR -->|"uses"| GE
    RB -->|"uses"| BN
    UB -->|"uses"| BN
    SK -->|"uses"| BN
```

# Infrastructure File Map

```mermaid
graph LR
    subgraph "docker/"
        DC["docker-compose.yml 61 lines\nbackend + postgres services"]
        ENT["entrypoint.sh 221 lines\n4-phase worker router"]
        ENV[".env.example 4 lines\nPG password + API key"]
    end

    subgraph "root"
        DBK["Dockerfile.backend 13 lines\nNode 22 slim image"]
    end

    subgraph "docs/"
        DDC["docker-compose.yml 20 lines\nnginx + Traefik priority=1"]
        DIX["index.html 1125 lines\nDocs + marketing site"]
    end

    subgraph "gallery/"
        GIX["index.html 410 lines\nPassword screen + card grid"]
        GJS["gallery.js 279 lines\nAuth + fetch + render"]
    end

    subgraph "prompts/"
        P1["phase1-idea-generator.md 169"]
        P2C["phase2-gdd/currencies.md 140"]
        P2P["phase2-gdd/progression.md 193"]
        P2PR["phase2-gdd/prestige.md 190"]
        P2S["phase2-gdd/skill-tree.md 215"]
        P2U["phase2-gdd/ui-ux.md 297"]
        P2PS["phase2-gdd/psychology-review.md 300"]
        P3["phase3-implementation-guide.md 296"]
        P4["phase4-orchestrator.md 740"]
    end

    DC -->|"builds from"| DBK
    DC -->|"mounts"| ENT
    DDC -->|"mounts"| DIX
    DDC -->|"mounts"| GIX
    DDC -->|"mounts"| GJS
    ENT -->|"reads"| P1
    ENT -->|"reads"| P2C
    ENT -->|"reads"| P3
    ENT -->|"reads"| P4
```


---

# Submit Game Generation Job

```mermaid
sequenceDiagram
    actor User
    participant API as Backend :3010
    participant QM as QueueManager
    participant DB as PostgreSQL

    Note over User,DB: POST /api/generate
    User->>API: POST /api/generate {prompt, count?}
    API->>API: parseInt(count) || 1
    API->>QM: addJob({count, prompt, options})
    QM->>DB: INSERT INTO jobs (status='pending', game_name=generated)
    DB-->>QM: job rows
    QM-->>API: [jobId1, jobId2, ...]
    API-->>User: 201 {jobIds, count}
    alt Service error
        QM-->>API: throws Error
        API-->>User: 500 {error: message}
    end
```

# Poll Job Status

```mermaid
sequenceDiagram
    actor User
    participant API as Backend :3010
    participant QM as QueueManager
    participant DB as PostgreSQL

    Note over User,DB: GET /api/jobs/:id (polling)
    loop Every 2-5 seconds
        User->>API: GET /api/jobs/{id}
        API->>QM: getJob(parseInt(id))
        QM->>DB: SELECT * FROM jobs WHERE id=$1
        alt Job found
            DB-->>QM: job row
            QM-->>API: {id, status, game_name, phase_outputs, logs}
            API-->>User: 200 {job}
        else Job not found
            DB-->>QM: null
            API-->>User: 404 {error: 'Job not found'}
        end
    end
```

# Job Execution Pipeline

```mermaid
sequenceDiagram
    participant Poller as Job Poller (5s)
    participant QM as QueueManager
    participant DB as PostgreSQL
    participant CM as ContainerManager
    participant Docker
    participant Worker as Worker Container
    participant ZAI as z.ai API

    Note over Poller,ZAI: Background job processing
    Poller->>QM: getNextJob()
    QM->>DB: SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1
    QM->>DB: UPDATE status='processing'
    DB-->>QM: job row

    loop phase1 through phase4
        Poller->>QM: updateStatus(id, 'phase_N')
        Poller->>CM: spawnContainer(job, phaseN)
        CM->>Docker: createContainer({Image: worker, Env, HostConfig})
        CM->>Docker: container.start()

        loop Poll every 5s until exit
            Poller->>CM: getContainerStatus(containerId)
            CM->>Docker: container.inspect()
        end

        Poller->>CM: getContainerLogs(containerId)
        alt exitCode !== 0
            Poller->>QM: updateStatus(id, 'failed', {error})
            Note over Poller: Stop processing
        end
    end

    Poller->>Poller: deploymentManager.deployGame(id, name, dist/)
    Poller->>QM: updateStatus(id, 'completed')
```

# Gallery Authentication + Game Browsing

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant Gallery as gallery.js
    participant Session as sessionStorage
    participant API as GET /api/games

    Note over User,API: Password auth + game listing
    User->>Browser: Visit /gallery/
    Browser->>Gallery: DOMContentLoaded
    Gallery->>Session: check gamepocgen_auth

    alt Not authenticated
        Gallery->>Browser: Show password overlay
        User->>Gallery: Enter password
        Gallery->>Gallery: validate === 'gamepoc2024'
        alt Wrong password
            Gallery->>Browser: Show error (3s auto-hide)
        else Correct
            Gallery->>Session: set gamepocgen_auth = true
        end
    end

    Gallery->>Browser: Show loading spinner
    Gallery->>API: GET /api/games
    alt Success with games
        API-->>Gallery: {games: [{name, url, created_at}]}
        Gallery->>Gallery: escapeHtml() each field
        Gallery->>Browser: Render card grid + game count
    else Success no games
        API-->>Gallery: {games: []}
        Gallery->>Browser: Show empty state
    else API error / 404
        Gallery->>Browser: Show error message
    end

    User->>Browser: Click "Play Now"
    Browser->>Browser: window.open(gamedemoN.namjo-games.com)
```

# Game Deployment

```mermaid
sequenceDiagram
    participant Backend as processJob()
    participant DM as DeploymentManager
    participant FS as Host Filesystem
    participant Docker
    participant Traefik

    Note over Backend,Traefik: Deploy game after Phase 4
    Backend->>DM: deployGame(jobId, gameName, sourceDir)
    DM->>DM: slot = jobId % 10
    DM->>DM: subdomain = gamedemo{slot}
    DM->>FS: mkdir deployDir/gamedemo{slot}
    DM->>FS: copy dist/* to deploy dir

    DM->>Docker: listContainers(name=gamedemo{slot})
    opt Container already exists
        DM->>Docker: container.stop()
        DM->>Docker: container.remove()
    end

    DM->>Docker: createContainer(nginx:alpine)
    Note over Docker: Labels: Host(gamedemo{slot}.namjo-games.com)\ntls.certresolver=letsencrypt
    DM->>Docker: container.start()
    Docker-->>Traefik: Auto-discover via Docker labels
    DM-->>Backend: {url, subdomain, containerId}

    Backend->>DM: listDeployedGames()
    Backend->>DM: updateGalleryData(games)
    DM->>FS: Write games.json
```

# Worker Phase Execution

```mermaid
sequenceDiagram
    participant Entry as entrypoint.sh
    participant FS as Workspace /workspace
    participant Claude as Claude Code CLI
    participant ZAI as z.ai API

    Note over Entry,ZAI: Single phase inside worker container
    Entry->>Entry: Validate: PHASE, JOB_ID, GAME_NAME, ZAI_API_KEY
    Entry->>FS: mkdir workspace/ status/
    Entry->>Entry: ANTHROPIC_AUTH_TOKEN = ZAI_API_KEY
    Entry->>Entry: Write ~/.claude/settings.json
    Entry->>FS: Write status/{phase}.json = running

    alt PHASE = phase1
        Entry->>Claude: claude -p phase1-idea-generator.md
        Claude->>ZAI: Generate game concept
        Claude->>FS: Write idea.md
    else PHASE = phase2
        loop currencies, progression, prestige, skill-tree, ui-ux, psychology-review
            Entry->>Claude: claude -p phase2-gdd/{agent}.md
            Claude->>ZAI: Generate GDD section
            Claude->>FS: Write gdd/{agent}.md
        end
    else PHASE = phase3
        Entry->>Claude: claude -p phase3-implementation-guide.md
        Claude->>FS: Write implementation-guide.md
    else PHASE = phase4
        Entry->>FS: Copy framework/ to workspace
        Entry->>Claude: claude -p phase4-orchestrator.md
        Claude->>FS: TDD build → dist/index.html
    end

    Entry->>FS: Write status/{phase}.json = completed
```


---

# REST API Endpoints

```mermaid
graph LR
    subgraph "Job Management [/api]"
        POST_GEN["POST /generate\nBody: {prompt, count?, options?}\nReturns: 201 {jobIds, count}\nErrors: 500 service error"]
        GET_JOBS["GET /jobs\nQuery: ?status=&limit=&offset=\nReturns: 200 {jobs: [...]}"]
        GET_JOB["GET /jobs/:id\nParams: id (integer)\nReturns: 200 {job}\nErrors: 404 not found"]
        GET_LOGS["GET /jobs/:id/logs\nParams: id (integer)\nReturns: 200 {logs: [...]}\nErrors: 404 job not found"]
        GET_STATS["GET /stats\nReturns: 200 {stats}\n{queued, running, completed, failed, total}"]
    end
```

```mermaid
graph LR
    subgraph "Game Management [/api]"
        GET_GAMES["GET /games\nReturns: 200 {games: [...]}\nEach: {gameId, name, url, port}"]
        DEL_GAME["DELETE /games/:id\nParams: id (integer)\nReturns: 200 {gameId, removed: true}\nErrors: 500 container in use"]
    end

    subgraph "Health [root]"
        HEALTH["GET /health\nReturns: 200 {status: 'ok', uptime: seconds}"]
    end
```

# Handler → Service Method Mapping

```mermaid
graph TD
    subgraph "createHandlers(services) → handler functions"
        H1["generateGames\nPOST /generate"]
        H2["listJobs\nGET /jobs"]
        H3["getJob\nGET /jobs/:id"]
        H4["getJobLogs\nGET /jobs/:id/logs"]
        H5["getStats\nGET /stats"]
        H6["listGames\nGET /games"]
        H7["removeGame\nDELETE /games/:id"]
    end

    subgraph "QueueManager methods"
        QA["addJob({count, prompt, options})"]
        QJ["getJobs({status?, limit?, offset?})"]
        QG["getJob(id)"]
        QL["getJobLogs(id)"]
        QS["getStats()"]
    end

    subgraph "DeploymentManager methods"
        DL["listDeployedGames()"]
        DR["removeGame(id)"]
    end

    H1 --> QA
    H2 --> QJ
    H3 --> QG
    H4 --> QG
    H4 --> QL
    H5 --> QS
    H6 --> DL
    H7 --> DR
```


---

# Database Schema

```mermaid
erDiagram
    JOBS {
        SERIAL id PK
        VARCHAR game_name "auto-generated if empty"
        TEXT prompt "user input prompt"
        VARCHAR status "pending|processing|phase_1-4|completed|failed"
        JSONB phase_outputs "per-phase results including deployment"
        JSONB logs "array of {level, message, timestamp}"
        JSONB error "failure details {phase, message}"
        JSONB config "job options from request"
        TIMESTAMP created_at "DEFAULT NOW()"
        TIMESTAMP updated_at "DEFAULT NOW()"
    }
```

# Phase Outputs JSONB Structure

```mermaid
graph TD
    subgraph "phase_outputs JSONB"
        PO["phase_outputs {}"]
        DEP["deployment:\n{url, subdomain, containerId}"]
        P1O["phase1:\n{status, detail, timestamp}"]
        P2O["phase2:\n{status, detail, timestamp}"]
        P3O["phase3:\n{status, detail, timestamp}"]
        P4O["phase4:\n{status, detail, timestamp}"]
    end

    PO --> DEP
    PO --> P1O
    PO --> P2O
    PO --> P3O
    PO --> P4O
```

# Logs JSONB Array Structure

```mermaid
graph LR
    subgraph "logs JSONB array"
        L1["{ level: 'info'\nmessage: 'Starting phase1'\ntimestamp: ISO8601 }"]
        L2["{ level: 'info'\nmessage: 'phase1 completed'\ntimestamp: ISO8601 }"]
        L3["{ level: 'error'\nmessage: 'phase2 error: ...'\ntimestamp: ISO8601 }"]
    end

    L1 --> L2 --> L3
```

# SQL Operations

```mermaid
graph TD
    subgraph "QueueManager SQL"
        INIT["init()\nCREATE TABLE IF NOT EXISTS jobs\n(id, game_name, prompt, status, ...)\nwith DEFAULT NOW() timestamps"]
        CREATE["createJob(name, prompt, config)\nINSERT INTO jobs\nRETURNING *"]
        CLAIM["getNextJob()\nSELECT ... WHERE status='pending'\nORDER BY created_at\nFOR UPDATE SKIP LOCKED\nLIMIT 1\nthen UPDATE status='processing'"]
        GET["getJob(id)\nSELECT * FROM jobs WHERE id=$1"]
        LIST["getJobs({status?, limit?, offset?})\nSELECT * with optional WHERE\nORDER BY created_at DESC\nLIMIT $limit OFFSET $offset"]
        UPDATE["updateStatus(id, status, error?)\nUPDATE jobs SET status=$2\nupdated_at=NOW()"]
        LOG["addLog(id, level, message)\nUPDATE jobs SET logs=\nlogs || jsonb_build_object(...)"]
        PHASE["updatePhaseOutput(id, phase, data)\nUPDATE jobs SET phase_outputs=\nphase_outputs || jsonb_build_object(...)"]
        STATS["getStats()\nSELECT status, COUNT(*)\nFROM jobs GROUP BY status"]
    end

    INIT --> CREATE
    CREATE --> CLAIM
    CLAIM --> UPDATE
    UPDATE --> LOG
    LOG --> PHASE
```


---

# Game Generation Pipeline

```mermaid
flowchart LR
    A["User Prompt\ntext string"] -->|"POST /api/generate"| B["Job Record\nstatus: pending\npostgresql"]
    B -->|"poller claims\nFOR UPDATE SKIP LOCKED"| C["Phase 1 Container\nClaude Code CLI"]
    C -->|"idea-generator prompt\n+ z.ai API"| D["idea.md\nGame concept\ntheme + mechanics"]
    D -->|"shared workspace\nbind mount"| E["Phase 2 Container\n6 sequential agents"]
    E -->|"6 GDD prompts\ncurrencies → psychology"| F["gdd/*.md\n6 design documents\ncurrencies progression\nprestige skill-tree\nui-ux psychology-review"]
    F -->|"shared workspace"| G["Phase 3 Container\nimplementation planner"]
    G -->|"implementation-guide prompt\nreads all GDD"| H["implementation-guide.md\n6-10 TDD phases"]
    H -->|"shared workspace\n+ framework/ copy"| I["Phase 4 Container\nTDD orchestrator"]
    I -->|"orchestrator prompt\nwrite tests → implement"| J["dist/\nindex.html\ntests.html\nconfig.js"]
    J -->|"copy to deploy dir"| K["nginx:alpine\ngamedemoN.namjo-games.com\nTraefik auto-SSL"]
```

# Workspace File Accumulation

```mermaid
flowchart TD
    subgraph "After Phase 1"
        W1["workspace/job-N/\n├── idea.md"]
    end

    subgraph "After Phase 2"
        W2["workspace/job-N/\n├── idea.md\n└── gdd/\n    ├── currencies.md\n    ├── progression.md\n    ├── prestige.md\n    ├── skill-tree.md\n    ├── ui-ux.md\n    └── psychology-review.md"]
    end

    subgraph "After Phase 3"
        W3["workspace/job-N/\n├── idea.md\n├── gdd/ (6 files)\n└── implementation-guide.md"]
    end

    subgraph "After Phase 4"
        W4["workspace/job-N/\n├── idea.md\n├── gdd/ (6 files)\n├── implementation-guide.md\n├── framework/ (copied in)\n└── dist/\n    ├── index.html\n    ├── tests.html\n    └── config.js"]
    end

    W1 --> W2 --> W3 --> W4
```

# Docker Bind Mount Path Translation

```mermaid
flowchart LR
    subgraph "Backend Container Sees"
        BC_WS["/app/workspaces/job-N\nWORKSPACE_PATH"]
        BC_DD["/root/apps\nDEPLOY_DIR"]
    end

    subgraph "Host (LXC 102) Actual"
        HOST_WS["/root/apps/gamepocgen/workspaces/job-N\nHOST_WORKSPACE_PATH"]
        HOST_DD["/root/apps\nHOST_DEPLOY_DIR"]
    end

    subgraph "Worker Container Sees"
        WC["/workspace\nBind from HOST path"]
    end

    subgraph "Game Container Sees"
        GC["/usr/share/nginx/html\nBind from HOST deploy dir"]
    end

    BC_WS -.->|"reads/writes via\ncontainer mount"| HOST_WS
    HOST_WS -->|"Docker Bind mount\npassed to createContainer"| WC
    BC_DD -.->|"reads/writes via\ncontainer mount"| HOST_DD
    HOST_DD -->|"Docker Bind mount\npassed to createContainer"| GC
```

# Environment Variable Translation

```mermaid
flowchart LR
    ENV[".env file\nZAI_API_KEY=sk-xxx\nZAI_BASE_URL=https://api.z.ai/..."]
    -->|"docker-compose env"| BACKEND["Backend Container\nenv: ZAI_API_KEY"]
    -->|"passed to container env"| WORKER["Worker Container\nenv: ZAI_API_KEY"]

    WORKER -->|"entrypoint.sh\nexport ANTHROPIC_AUTH_TOKEN=$ZAI_API_KEY\nexport ANTHROPIC_BASE_URL=$ZAI_BASE_URL"| CLAUDE["Claude Code CLI\nreads ANTHROPIC_AUTH_TOKEN\nreads ANTHROPIC_BASE_URL"]
```


---

# Job Status Lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending: POST /api/generate\nINSERT status=pending

    pending --> processing: getNextJob()\nFOR UPDATE SKIP LOCKED\nUPDATE status=processing

    processing --> phase_1: updateStatus(id, phase_1)\nspawnContainer(job, phase1)

    phase_1 --> phase_2: exitCode=0\nupdateStatus(id, phase_2)
    phase_1 --> failed: exitCode!=0\nor container error

    phase_2 --> phase_3: exitCode=0\n6 sub-agents complete
    phase_2 --> failed: any sub-agent fails

    phase_3 --> phase_4: exitCode=0\nimplementation-guide.md written
    phase_3 --> failed: exitCode!=0

    phase_4 --> completed: exitCode=0\ndist/ created\ndeployGame() succeeds
    phase_4 --> failed: exitCode!=0\nor deploy error

    completed --> [*]
    failed --> [*]
```

# Worker Container Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: containerManager.spawnContainer()\nDockerode createContainer()

    Created --> Running: container.start()\nentrypoint.sh begins

    state Running {
        [*] --> ValidatingEnv: check PHASE JOB_ID\nGAME_NAME ZAI_API_KEY
        ValidatingEnv --> WritingConfig: export ANTHROPIC_AUTH_TOKEN\nwrite settings.json
        WritingConfig --> ExecutingPhase: claude -p prompt
        ExecutingPhase --> WritingStatus: write status JSON
    }

    Running --> Exited_0: Success\nall outputs written
    Running --> Exited_N: Error\nnon-zero exit code

    Exited_0 --> LogsCollected: getContainerLogs()
    Exited_N --> LogsCollected: getContainerLogs()

    LogsCollected --> [*]: Container left for cleanup
```

# Game Container Lifecycle

```mermaid
stateDiagram-v2
    [*] --> CheckExisting: deployGame(jobId, name, src)

    CheckExisting --> RemoveOld: Container exists\nwith same gamedemoN name
    CheckExisting --> CopyFiles: No existing container

    RemoveOld --> CopyFiles: container.stop()\ncontainer.remove()

    CopyFiles --> CreateNginx: mkdir + copy dist/*\nto deploy dir

    CreateNginx --> Running: createContainer(nginx:alpine)\nwith Traefik labels\ncontainer.start()

    Running --> [*]: Serves game at\ngamedemoN.namjo-games.com

    state Running {
        [*] --> TraefikDiscovery: Docker label auto-detection
        TraefikDiscovery --> SSLProvisioned: Let's Encrypt cert
        SSLProvisioned --> ServingTraffic: HTTPS ready
    }
```

# Gallery Auth State

```mermaid
stateDiagram-v2
    [*] --> CheckSession: page load\ncheck sessionStorage

    CheckSession --> PasswordScreen: gamepocgen_auth not set
    CheckSession --> Authenticated: gamepocgen_auth = true

    PasswordScreen --> ValidateInput: user submits password

    ValidateInput --> PasswordError: input !== gamepoc2024\nshow error 3s
    ValidateInput --> Authenticated: input === gamepoc2024\nset sessionStorage

    PasswordError --> PasswordScreen: auto-clear error

    Authenticated --> Loading: showLoading()\nfetch /api/games

    Loading --> GamesDisplayed: games.length > 0\nrender card grid
    Loading --> EmptyState: games.length === 0
    Loading --> ErrorState: fetch failed or 500
```


---

# Infrastructure Topology

```mermaid
graph TB
    INET((Internet\nHTTPS :443))

    subgraph "Proxmox Host pve.grossmann.at"
        subgraph "LXC 102 webservices 192.168.138.11"
            TRAEFIK["Traefik\n:80 → redirect\n:443 TLS termination\nLet's Encrypt auto-SSL\nDocker provider auto-discovery"]

            subgraph "Backend Stack docker/docker-compose.yml"
                BACK["gamepocgen-backend\nNode 22 slim :3010→:3000\nDockerfile.backend 13 lines\nExpress + job poller"]
                PG["postgres:16-alpine\n:5432\nvol: pgdata"]
            end

            subgraph "Docs Stack docs/docker-compose.yml"
                NGINX_DOCS["nginx:alpine\nDocs + Gallery\nvol: index.html gallery/\npriority=1"]
            end

            subgraph "Worker Containers ephemeral"
                WORKER["gamepocgen-worker\nNode 22 + Claude Code CLI\nMem: 2GB CPU: 1\nTimeout: 3600s"]
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
    BACK -->|"pg Pool TCP :5432"| PG
    BACK -->|"Dockerode via socket"| DOCKER_SOCK
    DOCKER_SOCK -->|"create+start"| WORKER
    DOCKER_SOCK -->|"create+start"| GAME
```

# Docker Compose Services

```mermaid
graph TD
    subgraph "docker/docker-compose.yml"
        B_SVC["backend service\nbuild: ..\nports: 3010:3000\nvolumes:\n  docker.sock\n  workspaces vol\nenv: DATABASE_URL\n  ZAI_API_KEY ZAI_BASE_URL\n  HOST_WORKSPACE_PATH\n  HOST_DEPLOY_DIR\n  WORKER_IMAGE\nlabels: traefik priority=10\nnetworks: traefik"]

        P_SVC["postgres service\nimage: postgres:16-alpine\nvolumes: pgdata\nenv: POSTGRES_USER\n  POSTGRES_PASSWORD\n  POSTGRES_DB\nnetworks: traefik"]
    end

    subgraph "docs/docker-compose.yml"
        D_SVC["web service\nimage: nginx:alpine\nvolumes:\n  index.html :ro\n  gallery/index.html :ro\n  gallery/gallery.js :ro\nlabels: traefik priority=1\nnetworks: traefik"]
    end

    subgraph "Dynamic (created by DeploymentManager)"
        G_SVC["gamedemoN container\nimage: nginx:alpine\nvolumes: deploy dir\nlabels:\n  Host gamedemoN.namjo-games.com\n  tls certresolver=letsencrypt\nnetworks: traefik"]
    end
```

# Filesystem Layout LXC 102

```mermaid
graph TD
    subgraph "/root/apps/"
        T_DIR["traefik/\ndocker-compose.yml\ntraefik.yml\nacme.json\ndynamic/"]
        G_DIR["gamepocgen/\n├── docker/\n│   ├── docker-compose.yml\n│   ├── .env\n│   └── entrypoint.sh\n├── docs/\n│   ├── docker-compose.yml\n│   └── index.html\n├── gallery/\n│   ├── index.html\n│   └── gallery.js\n├── framework/\n├── prompts/\n└── workspaces/\n    └── job-N/"]
        DEMO["gamedemo0/\n└── index.html\ngamedemo1/\n└── index.html\n..."]
    end
```

# Docker Network

```mermaid
graph LR
    subgraph "traefik network (external bridge)"
        TF["Traefik"]
        BE["Backend :3010"]
        PG2["PostgreSQL :5432"]
        DOC["Docs nginx"]
        GD0["gamedemo0 nginx"]
        GD1["gamedemo1 nginx"]
    end

    subgraph "default bridge"
        WK["Worker containers\nephemeral\nno Traefik routing needed"]
    end

    TF --- BE
    TF --- DOC
    TF --- GD0
    TF --- GD1
    BE --- PG2
```

# Build and Deploy Commands

```mermaid
flowchart TD
    subgraph "Build Worker Image"
        BW1["cd /root/apps/gamepocgen"] --> BW2["docker build -t gamepocgen-worker\n-f Dockerfile.worker ."]
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
    end
```


---

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


---

# Backend Boot Sequence

```mermaid
sequenceDiagram
    participant DC as Docker Compose
    participant PG as PostgreSQL :5432
    participant BE as Backend :3010
    participant EXP as Express App
    participant QM as QueueManager
    participant CM as ContainerManager
    participant DM as DeploymentManager

    Note over DC,DM: docker compose up -d

    DC->>PG: start postgres:16-alpine
    PG->>PG: init DB gamepocgen
    PG-->>DC: ready

    DC->>BE: start backend (depends_on: postgres)
    BE->>BE: import express pg Dockerode
    BE->>BE: parse env: PORT=3000 MAX_CONCURRENT=5 POLL_INTERVAL=5000

    BE->>QM: new QueueManager(pool)
    BE->>QM: queueManager.init()
    QM->>PG: CREATE TABLE IF NOT EXISTS jobs (...)
    PG-->>QM: table ready

    BE->>CM: new ContainerManager(docker, {workspacePath, hostWorkspacePath})
    BE->>DM: new DeploymentManager({deployDir, hostDeployDir, domain, docker})

    BE->>EXP: app.use(cors())
    BE->>EXP: app.use(express.json())
    BE->>EXP: const router = await createRouter({qm, cm, dm})
    Note over EXP: dynamic import('express') inside createRouter
    BE->>EXP: app.use('/api', router)
    BE->>EXP: app.get('/health', ...)
    BE->>EXP: app.use(errorHandler)

    BE->>BE: setInterval(pollQueue, 5000)
    BE->>EXP: app.listen(3000)
    EXP-->>DC: Backend ready on :3010
```

# Docs + Gallery Boot

```mermaid
sequenceDiagram
    participant DC as Docker Compose
    participant NG as nginx:alpine
    participant TF as Traefik

    Note over DC,TF: docs/docker-compose up -d

    DC->>NG: start nginx container
    NG->>NG: mount volumes :ro
    Note over NG: index.html → /usr/share/nginx/html/\ngallery/index.html → .../gallery/\ngallery/gallery.js → .../gallery/

    NG-->>TF: Docker labels discovered
    Note over TF: Router: gamepocgen-docs\nRule: Host(gamepocgen.namjo-games.com)\nPriority: 1

    TF->>TF: Provision Let's Encrypt cert
    TF-->>NG: Route traffic
```

# Worker Container Boot

```mermaid
sequenceDiagram
    participant CM as ContainerManager
    participant Docker
    participant Worker as Worker Container
    participant Entry as entrypoint.sh
    participant Claude as Claude Code CLI

    Note over CM,Claude: Per-phase container lifecycle

    CM->>Docker: createContainer(gamepocgen-worker)
    Note over Docker: Env: PHASE JOB_ID GAME_NAME\nZAI_API_KEY ZAI_BASE_URL\nWORKSPACE_DIR TIMEOUT_SECONDS
    Note over Docker: HostConfig:\n  Memory: 2GB\n  NanoCpus: 1e9\n  Binds: [hostWorkspace:/workspace]

    CM->>Docker: container.start()
    Docker->>Worker: tini → entrypoint.sh

    Worker->>Entry: validate required env vars
    Entry->>Entry: mkdir -p $WORKSPACE_DIR $STATUS_DIR
    Entry->>Entry: export ANTHROPIC_AUTH_TOKEN=$ZAI_API_KEY
    Entry->>Entry: export ANTHROPIC_BASE_URL=$ZAI_BASE_URL
    Entry->>Entry: write ~/.claude/settings.json
    Entry->>Entry: write status/{phase}.json = running

    Entry->>Claude: claude -p "prompt content"
    Note over Claude: --dangerously-skip-permissions (phase4)\n--output-file target.md (phase1-3)
    Claude-->>Entry: exit code

    Entry->>Entry: write status/{phase}.json = completed|failed
    Worker-->>Docker: container exits
```

# Job Polling Loop

```mermaid
sequenceDiagram
    participant Timer as setInterval 5000ms
    participant Poller as pollQueue()
    participant QM as QueueManager
    participant Process as processJob()

    Note over Timer,Process: Continuous polling with concurrency gate

    loop Every 5 seconds
        Timer->>Poller: invoke
        Poller->>Poller: check: running >= MAX_CONCURRENT?
        alt At capacity
            Poller-->>Timer: return (skip)
        else Has capacity
            Poller->>QM: getNextJob()
            alt No pending jobs
                QM-->>Poller: null
                Poller-->>Timer: return (skip)
            else Job available
                QM-->>Poller: job row
                Poller->>Poller: running++
                Poller->>Process: processJob(job).finally(() => running--)
                Note over Process: Runs phases 1-4 sequentially\nthen deploys game
            end
        end
    end
```


---

# API Error Flow

```mermaid
graph TD
    REQ["Incoming Request"] --> CORS["cors() middleware"]
    CORS --> JSON["express.json() parser"]
    JSON --> ROUTER["Router /api/*"]

    ROUTER --> HANDLER["Handler function\n(generateGames, getJob, etc)"]

    HANDLER -->|"try block succeeds"| SUCCESS["res.status(200/201).json(data)"]
    HANDLER -->|"catch block"| CATCH["catch(err)"]
    CATCH --> LOG["console.error(err)"]
    LOG --> ERR500["res.status(500).json(\n{error: err.message})"]

    ROUTER -->|"unmatched route"| MISS["No route match\nfalls through"]

    MISS --> GLOBAL["Global error handler\napp.use((err, req, res, next))"]
    GLOBAL --> LOG2["console.error('Unhandled error:', err)"]
    LOG2 --> ERR500_2["res.status(500).json(\n{error: 'Internal server error'})"]
```

# Specific API Error Responses

```mermaid
graph LR
    subgraph "404 Errors"
        JOB_404["GET /jobs/:id\njob not found\n→ 404 {error: 'Job not found'}"]
        LOG_404["GET /jobs/:id/logs\njob not found\n→ 404 {error: 'Job not found'}"]
    end

    subgraph "500 Errors"
        GEN_500["POST /generate\naddJob throws\n→ 500 {error: message}"]
        LIST_500["GET /jobs\ngetJobs throws\n→ 500 {error: message}"]
        DEL_500["DELETE /games/:id\nremoveGame throws\n→ 500 {error: message}"]
    end
```

# Job Processing Error Flow

```mermaid
sequenceDiagram
    participant Poller as processJob()
    participant CM as ContainerManager
    participant QM as QueueManager
    participant Docker

    Note over Poller,Docker: Phase failure handling

    Poller->>CM: spawnContainer(job, phaseN)

    alt Container creation fails
        CM-->>Poller: throws Error
        Poller->>QM: addLog(id, 'error', 'phaseN error: message')
        Poller->>QM: updateStatus(id, 'failed', {error: 'phaseN: message'})
        Note over Poller: Stop processing (return early)
    end

    loop Poll container
        Poller->>CM: getContainerStatus(containerId)
        CM->>Docker: container.inspect()
    end

    Poller->>CM: getContainerLogs(containerId)

    alt exitCode !== 0
        Poller->>QM: addLog(id, 'error', 'phaseN error: message')
        Poller->>QM: updateStatus(id, 'failed', {error})
        Note over Poller: Stop processing (no retry)
    else exitCode === 0
        Poller->>QM: addLog(id, 'info', 'phaseN completed')
        Note over Poller: Continue to next phase
    end
```

# Deployment Error Handling

```mermaid
sequenceDiagram
    participant Poller as processJob()
    participant DM as DeploymentManager
    participant QM as QueueManager

    Note over Poller,QM: Deploy error is non-fatal to job

    Poller->>DM: deployGame(jobId, gameName, sourceDir)
    alt Deploy succeeds
        DM-->>Poller: {url, subdomain, containerId}
        Poller->>QM: updatePhaseOutput(id, 'deployment', result)
        Poller->>QM: addLog(id, 'info', 'Deployed to url')
    else Deploy fails
        DM-->>Poller: throws Error
        Poller->>QM: addLog(id, 'error', 'Deploy error: message')
        Note over Poller: Job still marked completed\n(deploy error caught separately)
    end

    Poller->>QM: updateStatus(id, 'completed')
```

# Gallery Error States

```mermaid
graph TD
    FETCH["fetch(/api/games)"] --> CHECK{Response OK?}

    CHECK -->|"yes"| PARSE["response.json()"]
    PARSE --> GAMES{games.length > 0?}
    GAMES -->|"yes"| RENDER["renderGames(games)\nshow card grid"]
    GAMES -->|"no"| EMPTY["showEmpty()\n'No games generated yet'"]

    CHECK -->|"404"| EMPTY2["showEmpty()\nAPI not ready treated as empty"]
    CHECK -->|"500 or other"| ERROR["showError(message)\nred error banner"]

    FETCH -->|"network error\nfetch throws"| ERROR2["showError('Failed to load games')\ncaught by try/catch"]
```


---

# Security Boundaries

```mermaid
graph TB
    subgraph "Public (no auth)"
        HEALTH["GET /health\nstatus + uptime"]
        GENERATE["POST /api/generate\nno auth required"]
        JOBS["GET /api/jobs\nGET /api/jobs/:id\nGET /api/jobs/:id/logs\nGET /api/stats"]
        GAMES["GET /api/games\nDELETE /api/games/:id"]
    end

    subgraph "Client-Side Password (sessionStorage)"
        DOCS["Docs site\ngamepocgen.namjo-games.com\npassword: gamepoc2024"]
        GALLERY["Gallery page\n/gallery/\npassword: gamepoc2024"]
    end

    subgraph "No Auth Required"
        GAME_SITES["Game sites\ngamedemoN.namjo-games.com\npublic static HTML"]
    end

    subgraph "Infrastructure Secrets"
        ZAI["ZAI_API_KEY\nClaude API credentials\nin .env file only"]
        PG_CRED["POSTGRES_PASSWORD\nDatabase credentials\nin .env file only"]
        DOCKER_SOCK["Docker socket\n/var/run/docker.sock\nmounted into backend"]
    end

    REQ((Internet)) --> HEALTH
    REQ --> GENERATE
    REQ --> JOBS
    REQ --> GAMES
    REQ --> DOCS
    REQ --> GALLERY
    REQ --> GAME_SITES

    ZAI -->|"forwarded to worker env"| WORKER["Worker containers"]
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
        INPUT["API response data\ngame.name game.url"] --> CREATE["document.createElement('div')"]
        CREATE --> SET["div.textContent = untrustedString"]
        SET --> READ["return div.innerHTML\n(auto-escaped)"]
        READ --> SAFE["Safe HTML output\n< becomes &lt; etc"]
    end

    subgraph "Applied to"
        CARD_TITLE["Game card titles"]
        CARD_URL["Game URLs"]
        CARD_DATE["Date strings"]
    end

    SAFE --> CARD_TITLE
    SAFE --> CARD_URL
    SAFE --> CARD_DATE
```

# Container Security

```mermaid
graph TD
    subgraph "Worker Container Isolation"
        NONROOT["Runs as user claude UID 1001\nnot root"]
        TINI["tini init system\nproper signal handling\nzombie process reaping"]
        MEM["Memory limit: 2GB\nOOM kill if exceeded"]
        CPU["CPU limit: 1 core\nNanoCpus: 1000000000"]
        TIMEOUT["Phase timeout: 3600s\nkill if exceeded"]
        BIND["Single bind mount\n/workspace only"]
    end

    subgraph "Backend Container"
        SOCK["Docker socket mounted\ncan create/stop/remove containers\nelevated privilege"]
        WS_VOL["Workspace volume\nshared with workers via host path"]
    end

    subgraph "Game Containers"
        READONLY["Static file serving only\nnginx:alpine\nno dynamic code execution"]
        TRAEFIK_NET["Connected to traefik network\nfor routing only"]
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
        ZAI2["ZAI_API_KEY\nClaude API billing"]
        ZAI_B["ZAI_BASE_URL\nAPI endpoint"]
    end

    subgraph "Propagation"
        DC2["docker-compose.yml\nenv_file: .env\ninterpolation: $POSTGRES_PASSWORD"]
        CM3["ContainerManager\nforwards ZAI_API_KEY to worker env"]
        ENTRY2["entrypoint.sh\ntranslates to ANTHROPIC_AUTH_TOKEN"]
    end

    DOTENV --> PG
    DOTENV --> ZAI2
    DOTENV --> ZAI_B
    PG --> DC2
    ZAI2 --> CM3
    ZAI_B --> CM3
    CM3 --> ENTRY2
```
