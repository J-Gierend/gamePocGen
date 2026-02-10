# API Error Flow

```mermaid
graph TD
    REQ["Incoming Request"] --> CORS["cors() middleware"]
    CORS --> JSON["express.json() parser"]
    JSON --> ROUTER["Router /api/*"]

    ROUTER --> ASYNC["asyncHandler(fn) wrapper<br/>fn(req, res, next).catch(next)"]
    ASYNC --> HANDLER["Handler function<br/>(generateGames, getJob, etc)"]

    HANDLER -->|"try block succeeds"| SUCCESS["res.status(200/201).json(data)"]
    HANDLER -->|"catch block"| CATCH["catch(err)"]
    CATCH --> ERR500["res.status(500).json(<br/>{error: err.message})"]

    ASYNC -->|"unhandled rejection<br/>.catch(next)"| GLOBAL["Global error handler<br/>app.use((err, req, res, _next))"]
    GLOBAL --> LOG["console.error('Unhandled error:', err)"]
    LOG --> ERR500_G["res.status(500).json(<br/>{error: 'Internal server error'})"]
```

# Specific API Error Responses

```mermaid
graph LR
    subgraph "404 Errors"
        JOB_404["GET /jobs/:id<br/>job not found<br/>-> 404 {error: 'Job [id] not found'}"]
        LOG_404["GET /jobs/:id/logs<br/>job not found<br/>-> 404 {error: 'Job [id] not found'}"]
    end

    subgraph "500 Errors"
        GEN_500["POST /generate<br/>addJob throws<br/>-> 500 {error: message}"]
        LIST_500["GET /jobs<br/>getJobs throws<br/>-> 500 {error: message}"]
        STAT_500["GET /stats<br/>getStats throws<br/>-> 500 {error: message}"]
        GAME_500["GET /games<br/>listDeployedGames throws<br/>-> 500 {error: message}"]
        DEL_500["DELETE /games/:id<br/>removeGame throws<br/>-> 500 {error: message}"]
    end
```

# Job Processing Error Flow (Phases 1-4)

```mermaid
sequenceDiagram
    participant PJ as processJob()
    participant CM as ContainerManager
    participant QM as QueueManager
    participant Docker

    Note over PJ,Docker: Phase 1-4 failure handling

    PJ->>CM: spawnContainer(job, phaseN)

    alt Container creation fails
        CM-->>PJ: throws Error
        PJ->>QM: addLog(id, 'error', 'phaseN error: message')
        PJ->>QM: updateStatus(id, 'failed', {error: 'phaseN: message'})
        Note over PJ: return early (stop processing)
    end

    loop Poll container every 5s
        PJ->>CM: getContainerStatus(containerId)
        CM->>Docker: container.inspect()
    end

    PJ->>CM: getContainerLogs(containerId)

    alt exitCode !== 0
        Note over PJ: throw new Error('phaseN failed with exit code N')
        PJ->>QM: addLog(id, 'error', 'phaseN error: message')
        PJ->>QM: updateStatus(id, 'failed', {error: 'phaseN: message'})
        Note over PJ: return early (stop processing)
    else exitCode === 0
        PJ->>QM: addLog(id, 'info', 'phaseN completed successfully')
        Note over PJ: Continue to next phase
    end
```

# Deployment Error Handling

```mermaid
sequenceDiagram
    participant PJ as processJob()
    participant DM as DeploymentManager
    participant QM as QueueManager

    Note over PJ,QM: Deploy error marks job completed and returns early

    PJ->>DM: deployGame(jobId, gameName, dist/, {workspaceDir})
    alt Deploy succeeds
        DM-->>PJ: {gameId, url, deployPath, port}
        PJ->>QM: updatePhaseOutput(id, 'deployment', result)
        PJ->>QM: addLog(id, 'info', 'Deployed to url')
        PJ->>DM: listDeployedGames()
        PJ->>DM: updateGalleryData(games)
        Note over PJ: Continue to Phase 5 repair loop
    else Deploy fails
        DM-->>PJ: throws Error
        PJ->>QM: addLog(id, 'error', 'Deploy error: message')
        PJ->>QM: updateStatus(id, 'completed')
        Note over PJ: return early (no repair loop)
    end
```

# Phase 5 Repair Loop Error Handling

```mermaid
sequenceDiagram
    participant PJ as processJob()
    participant GT as runPlaywrightTest()
    participant CM as ContainerManager
    participant DM as DeploymentManager
    participant QM as QueueManager

    Note over PJ,QM: Score-based pass/fail over up to 100 iterations

    loop attempt 1 to 100
        PJ->>GT: runPlaywrightTest(internalDockerUrl)
        GT-->>PJ: {score, defects, checks}
        PJ->>PJ: updateScoreBadge + updateRepairLog

        alt score >= 10 (PASS_SCORE)
            Note over PJ: Break loop - quality gate passed
        else attempt == 100 and score < 4 (FAIL_SCORE)
            PJ->>QM: addLog(id, 'error', 'Score N < 4 after 100 attempts')
            PJ->>DM: removeGame(jobId)
            PJ->>QM: updateStatus(id, 'failed', {error: quality gate message})
            PJ->>DM: listDeployedGames()
            PJ->>DM: updateGalleryData(games)
            Note over PJ: return (game removed)
        else attempt == 100 and score >= 4
            PJ->>QM: addLog(id, 'info', 'Score N >= 4, keeping game')
            Note over PJ: Break loop - game kept despite imperfect score
        else score < 10 (needs repair)
            PJ->>CM: spawnContainer(job, phase5) with DEFECT_REPORT
            loop Poll container every 5s
                PJ->>CM: getContainerStatus(containerId)
            end

            alt Repair container exitCode !== 0
                PJ->>QM: addLog(id, 'error', 'Repair container failed')
                Note over PJ: continue to next iteration (re-test, NOT stop)
            else Repair container exitCode === 0
                PJ->>DM: deployGame() redeploy fixed game
                PJ->>PJ: injectBadgeScript() re-inject
                PJ->>QM: addLog(id, 'info', 'Redeployed after repair')
            end
        end

        alt Entire iteration throws
            PJ->>QM: addLog(id, 'error', 'Repair iteration N error: message')
            Note over PJ: continue to next iteration (caught, NOT fatal)
        end
    end

    PJ->>QM: updateStatus(id, 'completed')
```

# Comparison Job Error Handling

```mermaid
sequenceDiagram
    participant PJ as processJob()
    participant QM as QueueManager

    Note over PJ,QM: Phase 1 skip for comparison jobs

    PJ->>PJ: sourceJobId from job.config

    alt Source job not found
        PJ->>PJ: throw Error('Source job N not found')
        PJ->>QM: updateStatus(id, 'failed')
        Note over PJ: return early
    else Source job failed
        PJ->>PJ: throw Error('Source job N failed')
        PJ->>QM: updateStatus(id, 'failed')
        Note over PJ: return early
    else 30min timeout waiting for source
        PJ->>PJ: throw Error('Timeout waiting for source job N')
        PJ->>QM: updateStatus(id, 'failed')
        Note over PJ: return early
    else Source phase1 complete
        PJ->>PJ: Copy idea.md + idea.json from source workspace
        PJ->>QM: updatePhaseOutput(id, phase1, {copied_from: sourceJobId})
        Note over PJ: Continue to phase2
    end
```

# Gallery Error States

```mermaid
graph TD
    FETCH["fetch('/api/games')"] --> CHECK{"response.ok?"}

    CHECK -->|"yes"| PARSE["response.json()"]
    PARSE --> GAMES{"games.length > 0?"}
    GAMES -->|"yes"| RENDER["renderGames(games)<br/>show card grid sorted by date"]
    GAMES -->|"no"| EMPTY["showEmpty()"]

    CHECK -->|"404"| RENDER_EMPTY["renderGames([])<br/>treated as empty (API not ready)"]
    CHECK -->|"other HTTP error"| THROW["throw new Error('HTTP status: statusText')"]
    THROW --> CATCH["catch block"]

    FETCH -->|"TypeError (network/fetch error)"| TYPE_CHECK{"error.name === TypeError<br/>and message includes 'fetch'?"}
    TYPE_CHECK -->|"yes"| EMPTY2["renderGames([])<br/>show empty state"]
    TYPE_CHECK -->|"no"| ERROR["showError('Unable to connect<br/>to the game server.')"]
    CATCH --> ERROR
```

# Redeploy After Repair Error

```mermaid
graph TD
    subgraph "Phase 5 Redeploy Error (non-fatal)"
        REPAIR["Repair container exits 0"]
        REPAIR --> REDEPLOY{"deployGame()"}
        REDEPLOY -->|"success"| INJECT["injectBadgeScript()<br/>updateScoreBadge()"]
        INJECT --> LOG_OK["addLog: Redeployed after repair"]
        REDEPLOY -->|"throws"| LOG_ERR["addLog: Redeploy error: message"]
        LOG_ERR --> CONTINUE["Continue to next test iteration<br/>(non-fatal)"]
    end
```

# gameTester.js Error Handling

```mermaid
graph TD
    subgraph "runPlaywrightTest(url)"
        EXEC["execSync(node test-game.js url)"]
        EXEC -->|"exit 0"| PARSE["JSON.parse(stdout)<br/>{score, defects, checks}"]
        EXEC -->|"non-zero exit"| CHECK_STDOUT{"err.stdout exists?"}
        CHECK_STDOUT -->|"yes"| TRY_PARSE["Try JSON.parse(err.stdout)"]
        TRY_PARSE -->|"valid JSON"| RETURN["Return parsed result<br/>(score < 5 exits non-zero but has valid output)"]
        TRY_PARSE -->|"invalid JSON"| FALLBACK["Return {score: 0,<br/>defects: [{severity: critical,<br/>description: Test runner error}],<br/>checks: {}}"]
        CHECK_STDOUT -->|"no"| FALLBACK
        EXEC -->|"timeout (120s)"| FALLBACK
    end
```
