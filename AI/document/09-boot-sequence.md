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
    participant GT as gameTester.js

    Note over DC,GT: docker compose up -d

    DC->>PG: start postgres:16-alpine
    PG->>PG: init DB gamepocgen
    PG-->>DC: ready

    DC->>BE: start backend (depends_on: postgres)
    BE->>BE: import express pg Dockerode
    BE->>BE: import runPlaywrightTest from gameTester.js
    BE->>BE: define GENRE_SEEDS array (16 genre seeds)
    BE->>BE: parse env: PORT=3000 MAX_CONCURRENT=5 POLL_INTERVAL=5000

    BE->>QM: new QueueManager(pool)
    BE->>QM: queueManager.init()
    QM->>PG: CREATE TABLE IF NOT EXISTS jobs (...)
    QM->>PG: CREATE TABLE IF NOT EXISTS job_logs (...)
    PG-->>QM: tables ready

    BE->>CM: new ContainerManager(docker, {workspacePath, hostWorkspacePath})
    BE->>DM: new DeploymentManager({deployDir, hostDeployDir, galleryDataPath, domain, docker})

    BE->>EXP: app.use(cors())
    BE->>EXP: app.use(express.json())
    BE->>EXP: const router = await createRouter({qm, cm, dm})
    Note over EXP: dynamic import('express') inside createRouter
    Note over EXP: asyncHandler wraps all routes with .catch(next)
    BE->>EXP: app.use('/api', router)
    BE->>EXP: app.get('/health', ...)
    BE->>EXP: app.use(globalErrorHandler)

    BE->>BE: setInterval(pollQueue, POLL_INTERVAL)
    BE->>EXP: app.listen(PORT)
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
    Note over NG: index.html -> /usr/share/nginx/html/<br/>gallery/index.html -> .../gallery/<br/>gallery/gallery.js -> .../gallery/

    NG-->>TF: Docker labels discovered
    Note over TF: Router: gamepocgen-docs<br/>Rule: Host(gamepocgen.namjo-games.com)<br/>Priority: 1

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
    Note over Docker: Env: PHASE JOB_ID GAME_NAME<br/>ZAI_API_KEY ZAI_BASE_URL<br/>WORKSPACE_DIR TIMEOUT_SECONDS<br/>+ extraEnv (AUTH_MODE, OAUTH tokens, GENRE_SEED, etc.)
    Note over Docker: HostConfig:<br/>  Memory: 2GB<br/>  NanoCpus: 0.5e9 (0.5 cores)<br/>  Binds: [hostWorkspace:/workspace]

    CM->>Docker: container.start()
    Docker->>Worker: tini -> entrypoint.sh

    Worker->>Entry: validate required env vars (PHASE, JOB_ID, GAME_NAME)
    Entry->>Entry: determine AUTH_MODE (apikey or subscription)
    Entry->>Entry: mkdir -p $WORKSPACE_DIR $STATUS_DIR /home/claude/.claude

    alt AUTH_MODE = apikey (default, z.ai)
        Entry->>Entry: export ANTHROPIC_AUTH_TOKEN=$ZAI_API_KEY
        Entry->>Entry: export ANTHROPIC_BASE_URL=$ZAI_BASE_URL
        Entry->>Entry: write settings.json with API key env vars
        Entry->>Entry: rm -f .credentials.json
    else AUTH_MODE = subscription (OAuth)
        Entry->>Entry: write .credentials.json with OAuth tokens
        Entry->>Entry: define refresh_oauth_token() function
        Entry->>Entry: write settings.json without API key overrides
    end

    Entry->>Entry: write ~/.claude.json (skip onboarding)
    Entry->>Entry: git config --global safe.directory
    Entry->>Entry: git init workspace (if needed)
    Entry->>Entry: cp -rn framework/* to workspace (ALL phases)
    Entry->>Entry: write status/{phase}.json = running

    Entry->>Entry: run_claude() helper: refresh token if subscription mode

    Entry->>Claude: claude -p --dangerously-skip-permissions --verbose -- "prompt"
    Note over Claude: --dangerously-skip-permissions on ALL phases<br/>--output-file NOT used (prompts write to workspace directly)
    Claude-->>Entry: exit code

    Entry->>Entry: write status/{phase}.json = completed|failed|timeout
    Worker-->>Docker: container exits
```

# Worker Auth Modes

```mermaid
graph TD
    subgraph "entrypoint.sh Auth Configuration"
        CHECK{"AUTH_MODE?"}

        subgraph "apikey mode (default)"
            AK1["export ANTHROPIC_AUTH_TOKEN=$ZAI_API_KEY"]
            AK2["export ANTHROPIC_BASE_URL=$ZAI_BASE_URL"]
            AK3["settings.json includes API key env vars"]
            AK4["rm -f .credentials.json"]
        end

        subgraph "subscription mode (OAuth)"
            SUB1["Write .credentials.json with:<br/>accessToken, refreshToken, expiresAt<br/>scopes, subscriptionType: max"]
            SUB2["Define refresh_oauth_token() function:<br/>curl POST console.anthropic.com/v1/oauth/token<br/>Parse response, update .credentials.json"]
            SUB3["settings.json without API key overrides"]
            SUB4["Token refresh before each claude -p call"]
        end

        CHECK -->|"apikey"| AK1
        AK1 --> AK2 --> AK3 --> AK4

        CHECK -->|"subscription"| SUB1
        SUB1 --> SUB2 --> SUB3 --> SUB4
    end
```

# Phase 2 Sub-Agents

```mermaid
graph LR
    subgraph "Phase 2: 3 Sequential GDD Agents"
        A1["currencies<br/>phase2-gdd/currencies.md"]
        A2["progression<br/>phase2-gdd/progression.md"]
        A3["ui-ux<br/>phase2-gdd/ui-ux.md"]

        A1 -->|"sequential"| A2
        A2 -->|"sequential"| A3
    end

    NOTE["Each agent reads prior GDD sections<br/>from workspace/gdd/ for context"]
```

# Job Polling Loop

```mermaid
sequenceDiagram
    participant Timer as setInterval (POLL_INTERVAL ms)
    participant Poller as pollQueue()
    participant QM as QueueManager
    participant Process as processJob()

    Note over Timer,Process: Continuous polling with concurrency gate

    loop Every POLL_INTERVAL ms
        Timer->>Poller: invoke
        Poller->>Poller: check: running >= MAX_CONCURRENT?
        alt At capacity
            Poller-->>Timer: return (skip)
        else Has capacity
            Poller->>QM: getNextJob()
            alt No queued jobs
                QM-->>Poller: null
                Poller-->>Timer: return (skip)
            else Job available
                QM-->>Poller: job row (status set to running)
                Poller->>Poller: running++
                Poller->>Process: processJob(job).finally(() => running--)
                Note over Process: Phases 1-4 sequentially<br/>then deploy<br/>then Phase 5 repair loop (up to 100 iterations)
            end
        end
    end
```

# Job Processing Pipeline (processJob)

```mermaid
sequenceDiagram
    participant PJ as processJob()
    participant QM as QueueManager
    participant CM as ContainerManager
    participant DM as DeploymentManager
    participant GT as runPlaywrightTest()

    Note over PJ,GT: Full job lifecycle: phases 1-4, deploy, phase 5 repair

    PJ->>PJ: Determine provider (zai or anthropic) from job.config
    PJ->>PJ: Build providerEnv array (AUTH_MODE, OAuth tokens if anthropic)
    PJ->>QM: addLog(id, info, provider info)

    loop phase1 through phase4
        PJ->>QM: updateStatus(id, phase_N)

        alt phase1 + sourceJobId (comparison job)
            PJ->>PJ: Poll source job until past phase1 (30min timeout)
            PJ->>PJ: Copy idea.md + idea.json from source workspace
            Note over PJ: Skip container spawn, continue to phase2
        else phase1 (normal)
            PJ->>PJ: Select GENRE_SEED from unused pool (16 seeds)
            PJ->>PJ: Get existing game names for diversity
            PJ->>QM: updatePhaseOutput(id, genreSeed, seed)
        end

        PJ->>CM: spawnContainer(job, phaseN) with extraEnv
        loop Poll every 5s
            PJ->>CM: getContainerStatus(containerId)
        end
        PJ->>CM: getContainerLogs(containerId)

        alt exitCode !== 0
            PJ->>QM: updateStatus(id, failed)
            Note over PJ: return early
        end
    end

    PJ->>DM: deployGame(jobId, gameName, dist/, {workspaceDir})
    PJ->>QM: updatePhaseOutput(id, deployment, result)
    PJ->>DM: listDeployedGames()
    PJ->>DM: updateGalleryData(games)

    Note over PJ,GT: Phase 5 Repair Loop (max 100 attempts, target 10/10)

    PJ->>PJ: injectBadgeScript() into deployed index.html

    loop attempt 1 to MAX_REPAIR_ATTEMPTS (100)
        PJ->>GT: runPlaywrightTest(internal Docker URL)
        GT-->>PJ: {score, defects, checks}
        PJ->>PJ: updateScoreBadge(score, attempt)
        PJ->>PJ: updateRepairLog() (JSON + HTML)

        alt score >= 10 (PASS_SCORE)
            Note over PJ: Break - game passes quality gate
        else attempt == 100 and score < 4 (FAIL_SCORE)
            PJ->>DM: removeGame(jobId)
            PJ->>QM: updateStatus(id, failed)
            PJ->>DM: listDeployedGames() + updateGalleryData()
            Note over PJ: return
        else attempt == 100 and score >= 4
            Note over PJ: Break - keep game despite imperfect score
        else score < 10
            PJ->>CM: spawnContainer(job, phase5) with DEFECT_REPORT
            PJ->>DM: deployGame() redeploy after repair
            PJ->>PJ: injectBadgeScript() re-inject after redeploy
        end
    end

    PJ->>QM: updateStatus(id, completed)
```

# Comparison/Provider System

```mermaid
graph TD
    subgraph "POST /api/generate with compare=true"
        REQ["Request: {count: N, options: {compare: true}}"]
        REQ --> LOOP["For each of N pairs"]

        LOOP --> JOB_A["Job A: provider=zai<br/>name=ZAI-BaseName<br/>Normal pipeline"]
        LOOP --> JOB_B["Job B: provider=anthropic<br/>name=Claude-BaseName<br/>sourceJobId=Job A id"]

        JOB_B --> WAIT["Phase 1: Wait for Job A phase1<br/>Poll every 5s, 30min timeout"]
        WAIT --> COPY["Copy idea.md + idea.json<br/>from Job A workspace"]
        COPY --> SKIP["Skip phase1 container spawn<br/>Continue to phase2 with same idea"]
    end

    subgraph "Provider Env Vars"
        ZAI["zai (default):<br/>AUTH_MODE=apikey<br/>ZAI_API_KEY forwarded"]
        ANTHROPIC["anthropic:<br/>AUTH_MODE=subscription<br/>CLAUDE_CODE_OAUTH_TOKEN<br/>CLAUDE_CODE_REFRESH_TOKEN<br/>CLAUDE_CODE_TOKEN_EXPIRES<br/>MODEL (default: claude-opus-4-6)"]
    end
```

# Phase Timeouts

```mermaid
graph LR
    subgraph "ContainerManager DEFAULT_TIMEOUTS"
        P1["phase1: 43200s (12h)"]
        P2["phase2: 43200s (12h)"]
        P3["phase3: 43200s (12h)"]
        P4["phase4: 43200s (12h)"]
        P5["phase5: 3600s (1h per repair)"]
    end
```
