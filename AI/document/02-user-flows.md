# Submit Game Generation Job

```mermaid
sequenceDiagram
    actor User
    participant API as Backend :3010
    participant QM as QueueManager
    participant DB as PostgreSQL

    Note over User,DB: POST /api/generate
    User->>API: POST /api/generate {count?, options?}
    API->>API: parseInt(count) || 1

    alt options.compare = true
        loop N pairs
            API->>QM: addJob({count:1, options:{provider:'zai', name:'ZAI-...'}})
            QM->>DB: INSERT INTO jobs (status='queued', game_name, config)
            DB-->>QM: jobAId
            API->>QM: addJob({count:1, options:{provider:'anthropic', sourceJobId:jobAId, name:'Claude-...'}})
            QM->>DB: INSERT INTO jobs (status='queued', game_name, config)
            DB-->>QM: jobBId
        end
        API-->>User: 201 {jobIds, count, comparison:{pairs, pairCount}}
    else Normal mode
        API->>QM: addJob({count: n, options})
        QM->>DB: INSERT INTO jobs (status='queued', game_name=generated, config=options)
        DB-->>QM: [jobId1, jobId2, ...]
        QM-->>API: id array
        API-->>User: 201 {jobIds, count}
    end

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
            DB-->>QM: job row (all columns)
            QM-->>API: {id, status, game_name, phase_outputs, config, error, created_at, updated_at, started_at, completed_at}
            API-->>User: 200 {job}
        else Job not found
            DB-->>QM: null
            API-->>User: 404 {error: 'Job N not found'}
        end
    end
```

# Job Execution Pipeline (Phases 1-4)

```mermaid
sequenceDiagram
    participant Poller as Job Poller (5s)
    participant QM as QueueManager
    participant DB as PostgreSQL
    participant CM as ContainerManager
    participant Docker
    participant Worker as Worker Container

    Note over Poller,Worker: Background job processing
    Poller->>QM: getNextJob()
    QM->>DB: UPDATE SET status='running', started_at=NOW() WHERE id=(SELECT ... status='queued' FOR UPDATE SKIP LOCKED LIMIT 1)
    DB-->>QM: job row

    loop phase1 through phase4
        Poller->>QM: updateStatus(id, 'phase_N')

        alt Comparison job + phase1
            Note over Poller: Wait for sourceJobId phase1 to finish (poll 5s, 30min timeout)
            Poller->>QM: getJob(sourceJobId) repeatedly
            Poller->>Poller: Copy idea.md + idea.json from source workspace
            Poller->>QM: updatePhaseOutput(id, 'phase1', {copied_from: sourceJobId})
        else Normal execution
            Poller->>QM: addLog(id, 'info', 'Starting phaseN')
            Poller->>CM: spawnContainer(job, phaseN)
            CM->>Docker: createContainer({Image: gamepocgen-worker, Env, Memory:2GB, CPU:0.5})
            CM->>Docker: container.start()

            loop Poll every 5s until exit
                Poller->>CM: getContainerStatus(containerId)
                CM->>Docker: container.inspect()
            end

            Poller->>CM: getContainerLogs(containerId)
            alt exitCode !== 0
                Poller->>QM: addLog(id, 'error', 'phaseN error')
                Poller->>QM: updateStatus(id, 'failed', {error})
                Note over Poller: Return early
            end
        end
    end

    Note over Poller: Continue to deployment
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
    Backend->>DM: deployGame(jobId, gameName, sourceDir, {workspaceDir})
    DM->>DM: name = gamedemo{jobId}
    DM->>DM: port = basePort + jobId
    DM->>FS: mkdir deployDir/gamedemo{jobId}/html
    DM->>FS: cp sourceDir/* to html/

    DM->>DM: extractMetadata(workspaceDir, htmlPath)
    Note over DM: Read idea.md for title/description/guide
    DM->>FS: Write metadata.json

    DM->>DM: generateGuideHtml(workspaceDir, title)
    DM->>FS: Write html/guide.html
    DM->>DM: injectGuideButton(htmlPath)
    DM->>FS: Write docker-compose.yml

    opt Docker available
        DM->>Docker: getContainer(gamedemo{jobId}).stop().remove()
        DM->>Docker: createContainer(nginx:alpine)
        Note over Docker: Labels: Host(gamedemo{jobId}.namjo-games.com), tls.certresolver=letsencrypt
        DM->>Docker: network.connect(traefik)
        DM->>Docker: container.start()
    end

    DM-->>Backend: {gameId, url, deployPath, port}

    Backend->>DM: listDeployedGames()
    Backend->>DM: updateGalleryData(games)
    DM->>FS: Write games.json
```

# Phase 5 Repair Loop

```mermaid
sequenceDiagram
    participant Backend as processJob()
    participant Tester as runPlaywrightTest()
    participant QM as QueueManager
    participant CM as ContainerManager
    participant DM as DeploymentManager

    Note over Backend,DM: Phase 5: up to 100 repair iterations, target 10/10

    Backend->>Backend: injectBadgeScript() into deployed index.html
    Backend->>Backend: updateScoreBadge(0, 0)

    loop attempt 1..100
        Backend->>Tester: runPlaywrightTest(http://gamedemo{jobId})
        Tester-->>Backend: {score, defects, checks}
        Backend->>QM: addLog(id, 'info', 'Test score: N/10')
        Backend->>QM: updatePhaseOutput(id, 'repair_N', {score, defectCount})
        Backend->>Backend: updateScoreBadge(score, attempt)
        Backend->>Backend: updateRepairLog() to html/repair-log.json + .html

        alt score >= 10
            Note over Backend: Quality gate passed
            Backend->>QM: addLog(id, 'info', 'passes quality gate')
            Note over Backend: Break loop
        else attempt = 100 AND score < 4
            Backend->>QM: addLog(id, 'error', 'removing game')
            Backend->>DM: removeGame(jobId)
            Backend->>QM: updateStatus(id, 'failed', {error})
            Backend->>DM: updateGalleryData()
            Note over Backend: Return early
        else attempt = 100 AND score >= 4
            Backend->>QM: addLog(id, 'info', 'keeping game')
            Note over Backend: Break loop
        else score < 10
            Backend->>CM: spawnContainer(job, 'phase5')
            Note over CM: Env: GAME_URL, DEFECT_REPORT=JSON
            CM-->>Backend: {containerId}

            loop Poll every 5s until exit
                Backend->>CM: getContainerStatus(containerId)
            end

            Backend->>CM: getContainerLogs(containerId)

            alt exitCode === 0
                Backend->>DM: deployGame(jobId, gameName, dist/, {workspaceDir})
                Backend->>Backend: injectBadgeScript() + updateScoreBadge()
            else exitCode !== 0
                Backend->>QM: addLog(id, 'error', 'repair container failed')
                Note over Backend: Continue to next iteration (re-test)
            end
        end
    end

    Backend->>QM: updateStatus(id, 'completed')
```

# Worker Phase Execution

```mermaid
sequenceDiagram
    participant Entry as entrypoint.sh
    participant FS as Workspace /workspace
    participant Claude as Claude Code CLI

    Note over Entry,Claude: Single phase inside worker container
    Entry->>Entry: Validate: PHASE, JOB_ID, GAME_NAME
    Entry->>Entry: Check AUTH_MODE (apikey or subscription)
    Entry->>FS: mkdir workspace/ status/

    alt AUTH_MODE = subscription
        Entry->>Entry: Write ~/.claude/.credentials.json (OAuth)
        Entry->>Entry: Write settings.json (no API key)
    else AUTH_MODE = apikey (default)
        Entry->>Entry: export ANTHROPIC_AUTH_TOKEN=$ZAI_API_KEY
        Entry->>Entry: export ANTHROPIC_BASE_URL=$ZAI_BASE_URL
        Entry->>Entry: Write settings.json with API key
        Entry->>Entry: rm ~/.claude/.credentials.json
    end

    Entry->>FS: Copy framework/ into workspace
    Entry->>FS: Write status/{phase}.json = running

    alt PHASE = phase1
        Entry->>Claude: claude -p phase1-idea-generator.md
        Claude->>FS: Write idea.json
    else PHASE = phase2
        loop currencies, progression, ui-ux
            Entry->>Claude: claude -p phase2-gdd/{agent}.md
            Claude->>FS: Write gdd/{agent}.json
        end
    else PHASE = phase3
        Entry->>Claude: claude -p phase3-implementation-guide.md
        Claude->>FS: Write implementation-plan.json
    else PHASE = phase4
        Entry->>Claude: claude -p phase4-orchestrator.md
        Claude->>FS: TDD build to dist/
    else PHASE = phase5
        Entry->>Claude: claude -p phase5-repair-agent.md
        Note over Claude: Env: GAME_URL, DEFECT_REPORT
        Claude->>FS: Fix defects in dist/
    end

    Entry->>FS: Write status/{phase}.json = completed|failed|timeout
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
    Browser->>Gallery: DOMContentLoaded or immediate
    Gallery->>Session: check gamepocgen_auth

    alt Not authenticated
        Gallery->>Browser: Show password overlay, focus input
        User->>Gallery: Enter password + Enter/click
        Gallery->>Gallery: validate === 'gamepoc2024'
        alt Wrong password
            Gallery->>Browser: Show error (3s auto-hide), clear input, refocus
        else Correct
            Gallery->>Session: set gamepocgen_auth = true
        end
    end

    Gallery->>Browser: Show loading spinner
    Gallery->>API: fetch(/api/games)
    alt response.ok with games
        API-->>Gallery: {games: [{gameId, name, title, description, guide, url, port, createdAt}]}
        Gallery->>Gallery: Sort by createdAt desc
        Gallery->>Gallery: escapeHtml() each field
        Gallery->>Gallery: renderPixelIcon() per card
        Gallery->>Browser: Render card grid + game count
    else response.ok no games
        API-->>Gallery: {games: []}
        Gallery->>Browser: Show empty state
    else 404
        Gallery->>Browser: Show empty state (API not ready)
    else Other HTTP error
        Gallery->>Browser: Show error message
    else Network error (fetch throws TypeError)
        Gallery->>Browser: Show empty state
    end

    User->>Browser: Click "Play Now"
    Browser->>Browser: window.open(gamedemo{gameId}.namjo-games.com, _blank)
```
