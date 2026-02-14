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
    participant Gallery as gallery.js
    participant API as Backend :3010
    participant QM as QueueManager
    participant DB as PostgreSQL

    Note over User,DB: Gallery polls GET /api/jobs every 5s
    loop Every 5 seconds
        Gallery->>API: GET /api/jobs
        API->>QM: getJobs({limit: 50})
        QM->>DB: SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50
        DB-->>QM: job rows
        QM-->>API: jobs array
        API-->>Gallery: 200 {jobs: [...]}
        Gallery->>Gallery: Compare JSON hash to skip re-render if unchanged
        Gallery->>Gallery: sortJobs by status priority then date
        Gallery->>Gallery: renderJobs with phase dots + score + sparkline
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
    Poller->>Poller: Check queuePaused flag (process improvement)
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
        else Normal phase1
            Poller->>Poller: Select GENRE_SEED from unused pool (16 genres)
            Poller->>Poller: Get EXISTING_GAME_NAMES for diversity
            Poller->>QM: updatePhaseOutput(id, 'genreSeed', seed)
        end

        Poller->>CM: spawnContainer(job, phaseN)
        CM->>Docker: createContainer({Image: gamepocgen-worker, Env, Memory:2GB, CPU:0.5})
        Note over Docker: Binds: hostWorkspace:/workspace + hostProjectRoot/prompts + hostProjectRoot/framework
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
    DM->>DM: port = 8080 + jobId
    DM->>FS: mkdir deployDir/gamedemo{jobId}/html
    DM->>FS: cp sourceDir/* to html/

    DM->>DM: extractMetadata(workspaceDir, htmlPath)
    Note over DM: Read idea.md for title/description/guide
    DM->>FS: Write metadata.json

    DM->>DM: generateGuideHtml(workspaceDir, title)
    Note over DM: Reads idea.md + gdd/*.md + gdd/*.json
    Note over DM: Renders HTML with Mermaid + marked.js support
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

        alt 5 consecutive ETIMEDOUT
            Backend->>QM: updateStatus(id, 'failed', {error: Infrastructure failure})
            Note over Backend: Return early
        end

        Backend->>QM: addLog(id, 'info', 'Test score: N/10')
        Backend->>QM: updatePhaseOutput(id, 'repair_N', {score, defectCount, defects, timestamp})
        Backend->>QM: updatePhaseOutput(id, 'latest_score', {score, attempt, defectCount})
        Backend->>Backend: updateScoreBadge(score, attempt)
        Backend->>Backend: updateRepairLog() to html/repair-log.json + .html

        alt score >= 10
            Note over Backend: Quality gate passed - break
        else attempt = 100 AND score < 4
            Backend->>DM: removeGame(jobId)
            Backend->>QM: updateStatus(id, 'failed', {error})
            Note over Backend: Return early
        else attempt = 100 AND score >= 4
            Note over Backend: Keep game - break
        else score < 10
            alt Plateau detected (last 5 scores within 0.5 delta)
                Backend->>CM: spawnContainer(job, 'phase5-strategy')
                Note over CM: Env: GAME_URL, DEFECT_REPORT=repair history
                Note over CM: Writes repair-strategy.md to workspace
            end

            opt Process improvement trigger
                Backend->>Backend: maybeRunProcessImprovement(jobId)
                Note over Backend: 1-hour cooldown between runs
            end

            Backend->>QM: getUserFeedback(jobId)
            Note over Backend: Append user feedback to DEFECT_REPORT if present

            Backend->>CM: spawnContainer(job, 'phase5')
            Note over CM: Env: GAME_URL, DEFECT_REPORT=JSON + user feedback
            Note over CM: Reads repair-strategy.md if present

            Backend->>DM: deployGame(jobId, gameName, dist/, {workspaceDir})
            Backend->>Backend: injectBadgeScript() + updateScoreBadge()
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
        Note over Claude: Reads repair-strategy.md if present
        Claude->>FS: Fix defects in dist/
    else PHASE = phase5-strategy
        Entry->>Claude: claude -p phase5-strategy-review.md
        Note over Claude: Env: GAME_URL, DEFECT_REPORT=repair history
        Claude->>FS: Write repair-strategy.md
    else PHASE = process-improvement
        Entry->>Claude: claude -p process-improvement-agent.md
        Note over Claude: Reads /workspace/cross-job-data.md
        Note over Claude: RW access to /home/claude/prompts + /framework + /scripts
        Claude->>FS: Write improvements/ reports
        Claude->>Claude: Edit prompts/framework/scripts directly
    end

    Entry->>FS: Write status/{phase}.json = completed|failed|timeout
```

# Gallery Authentication + Job Browsing

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant Gallery as gallery.js
    participant Session as sessionStorage
    participant API as Backend /api/jobs

    Note over User,API: Password auth + job listing with live updates
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
    Gallery->>API: fetch(/api/jobs)
    alt response.ok with jobs
        API-->>Gallery: {jobs: [{id, status, game_name, phase_outputs, ...}]}
        Gallery->>Gallery: sortJobs by status priority then date
        Gallery->>Gallery: renderJobs: procedural thumbnails, phase dots, score sparklines, defect list
        Gallery->>Browser: Render card grid + game count
    else response.ok no jobs
        API-->>Gallery: {jobs: []}
        Gallery->>Browser: Show empty state
    else 404
        Gallery->>Browser: Show empty state (API not ready)
    else Other HTTP error
        Gallery->>Browser: Show error message
    end

    Note over Gallery,API: Also polls GET /api/improvements every 5s
    Gallery->>API: fetch(/api/improvements)
    API-->>Gallery: {log: {reports}, reports: [{filename, content}]}
    Gallery->>Gallery: renderImprovements timeline
```

# User Feedback Flow

```mermaid
sequenceDiagram
    actor User
    participant Gallery as gallery.js
    participant API as Backend /api
    participant QM as QueueManager
    participant DB as PostgreSQL

    Note over User,DB: POST /api/jobs/:id/feedback
    User->>Gallery: Click feedback button on game card
    Gallery->>Gallery: openFeedbackModal(jobId)
    User->>Gallery: Type feedback + click Send
    Gallery->>API: POST /api/jobs/{id}/feedback {feedback: text}

    API->>QM: getJob(id)
    QM->>DB: SELECT * FROM jobs WHERE id=$1
    DB-->>QM: job row

    API->>API: Append timestamped entry to existing user_feedback
    API->>QM: setUserFeedback(id, combined)
    QM->>DB: UPDATE jobs SET user_feedback=$1 WHERE id=$2

    alt job.status === 'completed'
        API->>QM: updateStatus(id, 'phase_5')
        Note over QM: Resets to phase_5 to trigger new repair run
        API-->>Gallery: {jobId, feedback, willRepair: true}
    else job.status !== 'completed'
        API-->>Gallery: {jobId, feedback, willRepair: false}
    end

    Note over API,DB: During next repair iteration
    Note over API: processJob reads getUserFeedback(id)
    Note over API: Appends to DEFECT_REPORT env var
```

# Process Improvement Agent Flow

```mermaid
sequenceDiagram
    participant Backend as processJob() repair loop
    participant PIA as maybeRunProcessImprovement()
    participant QM as QueueManager
    participant CM as ContainerManager
    participant Docker
    participant Agent as Process Improvement Container

    Note over Backend,Agent: Triggered during repair loop, 1h cooldown

    Backend->>PIA: maybeRunProcessImprovement(jobId)
    PIA->>PIA: Check 1-hour cooldown

    alt Cooldown not expired
        Note over PIA: Skip
    else Cooldown expired
        PIA->>QM: getJobs({limit: 50})
        PIA->>PIA: Build cross-job analysis data
        Note over PIA: Score progressions, recurring defects, strategy reviews, user feedback

        PIA->>PIA: Write cross-job-data.md to shared workspace
        PIA->>PIA: Copy scripts + prompts to shared workspace
        PIA->>PIA: Pause job queue

        PIA->>Docker: createContainer(gamepocgen-worker)
        Note over Docker: PHASE=process-improvement
        Note over Docker: Binds: shared:/workspace, hostProjectRoot/prompts, /framework, /scripts
        Note over Docker: Memory: 2GB, CPU: 1.0, Network: traefik

        Docker->>Agent: tini -> entrypoint.sh
        Agent->>Agent: claude -p process-improvement-agent.md
        Note over Agent: RW access to prompts, framework, scripts via bind mounts
        Agent->>Agent: Analyze patterns, edit pipeline files directly

        loop Poll every 10s
            PIA->>Docker: container.inspect()
        end

        Agent-->>Docker: Container exits
        PIA->>PIA: Read improvements/log.json
        PIA->>PIA: Resume job queue
    end
```
