# Job Status Lifecycle

```mermaid
stateDiagram-v2
    [*] --> queued: POST /api/generate\nINSERT status=queued

    queued --> running: getNextJob()\nFOR UPDATE SKIP LOCKED\nUPDATE status=running

    running --> phase_1: updateStatus(id, phase_1)\nspawnContainer(job, phase1)

    phase_1 --> phase_2: exitCode=0\nupdateStatus(id, phase_2)
    phase_1 --> failed: exitCode!=0\nor container error

    phase_2 --> phase_3: exitCode=0\n3 sub-agents complete
    phase_2 --> failed: any sub-agent fails

    phase_3 --> phase_4: exitCode=0\nimplementation-plan.json written
    phase_3 --> failed: exitCode!=0

    phase_4 --> deployed: exitCode=0\ndist/ created\ndeployGame() succeeds
    phase_4 --> failed: exitCode!=0\nor deploy error

    deployed --> phase_5: Playwright test\nscore < 7

    phase_5 --> phase_5: repair + redeploy\nscore < 7 and attempt < 100
    phase_5 --> completed: score >= 7 GOOD_ENOUGH\nor attempt=100 and score >= 4
    phase_5 --> failed: attempt=100 and score < 4 game removed\nor 5 consecutive ETIMEDOUT

    deployed --> completed: score >= 7\non first test

    completed --> phase_5: user feedback submitted\nPOST /api/jobs/:id/feedback

    completed --> [*]
    failed --> [*]
```

# Valid Status Values

```mermaid
flowchart LR
    subgraph "VALID_STATUSES queueManager.js"
        S1["queued"]
        S2["running"]
        S3["phase_1"]
        S4["phase_2"]
        S5["phase_3"]
        S6["phase_4"]
        S7["phase_5"]
        S8["completed"]
        S9["failed"]
    end

    S1 --> S2 --> S3 --> S4 --> S5 --> S6 --> S7 --> S8
    S3 --> S9
    S4 --> S9
    S5 --> S9
    S6 --> S9
    S7 --> S9
    S8 -->|"feedback"| S7
```

# Worker Container Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Created: containerManager.spawnContainer()\nDockerode createContainer()

    Created --> Running: container.start()\ntini -> entrypoint.sh

    state Running {
        [*] --> ValidatingEnv: check PHASE JOB_ID GAME_NAME\ncheck ZAI_API_KEY (apikey mode only)
        ValidatingEnv --> ConfiguringAuth: apikey: export ANTHROPIC_AUTH_TOKEN\nsubscription: write .credentials.json
        ConfiguringAuth --> WritingSettings: write settings.json\nwrite .claude.json
        WritingSettings --> CopyingFramework: cp framework/* workspace/
        CopyingFramework --> ExecutingPhase: claude -p --dangerously-skip-permissions --verbose
        ExecutingPhase --> WritingStatus: write status JSON
    }

    Running --> Exited_0: Success\nall outputs written
    Running --> Exited_1: Error\nnon-zero exit code
    Running --> Timeout: exit code 124\ntimeout --signal=TERM exceeded

    Exited_0 --> LogsCollected: getContainerLogs()
    Exited_1 --> LogsCollected: getContainerLogs()
    Timeout --> LogsCollected: getContainerLogs()

    LogsCollected --> [*]: Container left for cleanup
```

# Worker Status File States

```mermaid
stateDiagram-v2
    [*] --> running: write_status running\nStarting phase

    running --> running: write_status running\nPhase 2: agent_name (sub-agent progress)

    running --> completed: exit code 0\nwrite_status completed Success
    running --> failed: exit code != 0\nwrite_status failed Exit code N
    running --> timeout: exit code 124\nwrite_status timeout Timed out after Ns
```

# Game Container Lifecycle

```mermaid
stateDiagram-v2
    [*] --> CheckExisting: deployGame(jobId, name, src)

    CheckExisting --> RemoveOld: Container exists\nwith same gamedemoN name
    CheckExisting --> CopyFiles: No existing container

    RemoveOld --> CopyFiles: container.stop()\ncontainer.remove()

    CopyFiles --> WriteMetadata: mkdir + copy dist/*\nto deployed/gamedemoN/html/

    WriteMetadata --> GenerateGuide: extractMetadata()\nwrite metadata.json

    GenerateGuide --> WriteCompose: generateGuideHtml()\ninjectGuideButton()

    WriteCompose --> ConnectNetwork: write docker-compose.yml\ncreateContainer(nginx:alpine)

    ConnectNetwork --> Running: connect traefik network\ncontainer.start()

    Running --> [*]: Serves game at\ngamedemoN.namjo-games.com

    state Running {
        [*] --> TraefikDiscovery: Docker label auto-detection
        TraefikDiscovery --> SSLProvisioned: Let's Encrypt cert
        SSLProvisioned --> ServingTraffic: HTTPS ready
    }
```

# Phase 5 Repair Iteration Lifecycle

```mermaid
stateDiagram-v2
    [*] --> InjectBadge: injectBadgeScript()\nupdateScoreBadge(0, 0)

    InjectBadge --> PlaywrightTest: runPlaywrightTest(internal URL)

    PlaywrightTest --> CheckTimeout: Check ETIMEDOUT count

    CheckTimeout --> BailOut: 5 consecutive ETIMEDOUT\nstatus: failed
    CheckTimeout --> UpdateBadge: Not infrastructure failure

    UpdateBadge --> BackupBest: score > bestScore\ncp dist/ to dist-best/
    BackupBest --> CheckRegression: Compare to bestScore

    CheckRegression --> RestoreAndRetest: score < bestScore - 1\nRestore dist-best/ and redeploy
    CheckRegression --> Passed: score >= 7 GOOD_ENOUGH_SCORE

    CheckRegression --> MaxAttemptKeep: attempt=100\nscore >= 4

    CheckRegression --> MaxAttemptFail: attempt=100\nscore < 4

    CheckRegression --> CheckPlateau: score < 7\nattempt < 100

    CheckPlateau --> StrategyReview: Last 5 scores within 0.5 delta\nSpawn phase5-strategy container
    CheckPlateau --> WriteRepairPrompt: No plateau detected

    StrategyReview --> WriteRepairPrompt: Writes repair-strategy.md

    WriteRepairPrompt --> WaitForRepair: Write repair-prompt.txt\non-idle.sh picks up prompt\nfeeds to persistent Claude session

    WaitForRepair --> Redeploy: Claude goes idle\nsyncRootToDist + deployGame

    RestoreAndRetest --> PlaywrightTest
    Redeploy --> PlaywrightTest

    Passed --> [*]: status: completed
    MaxAttemptKeep --> [*]: status: completed
    MaxAttemptFail --> [*]: removeGame()\nstatus: failed
    BailOut --> [*]: status: failed
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

    Authenticated --> Loading: showLoading()\nfetch /api/jobs

    Loading --> GamesDisplayed: response.ok\njobs array rendered\nphase dots + scores + sparklines
    Loading --> EmptyState: jobs.length === 0\nor 404 response\nor TypeError with fetch
    Loading --> ErrorState: non-TypeError exception\nshows Unable to connect to the game server
```

# Entrypoint Auth Mode Branching

```mermaid
stateDiagram-v2
    [*] --> CheckAuthMode: AUTH_MODE env var

    CheckAuthMode --> ApiKeyMode: AUTH_MODE=apikey (default)
    CheckAuthMode --> SubscriptionMode: AUTH_MODE=subscription

    state ApiKeyMode {
        [*] --> ValidateApiKey: require ZAI_API_KEY
        ValidateApiKey --> ExportTokens: export ANTHROPIC_AUTH_TOKEN\nexport ANTHROPIC_BASE_URL
        ExportTokens --> WriteApiSettings: settings.json with API env vars
        WriteApiSettings --> RemoveCredentials: rm .credentials.json
    }

    state SubscriptionMode {
        [*] --> CheckOAuthToken: CLAUDE_CODE_OAUTH_TOKEN set?
        CheckOAuthToken --> WriteCredentials: write .credentials.json\naccessToken + refreshToken + expiresAt
        CheckOAuthToken --> SkipCredentials: no token provided
        WriteCredentials --> WriteSubSettings: settings.json without API env vars
        SkipCredentials --> WriteSubSettings
    }

    ApiKeyMode --> PhaseRouting: proceed to phase execution
    SubscriptionMode --> PhaseRouting

    state PhaseRouting {
        [*] --> RefreshToken: subscription mode only\nrefresh_oauth_token()
        RefreshToken --> RunClaude: claude -p --dangerously-skip-permissions --verbose
    }
```
