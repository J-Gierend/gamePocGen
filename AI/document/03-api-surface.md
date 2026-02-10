# REST API Endpoints

```mermaid
graph LR
    subgraph "Job Management [/api]"
        POST_GEN["POST /generate\nBody: {count?, options?}\nNormal: 201 {jobIds, count}\nCompare: 201 {jobIds, count,\ncomparison:{pairs, pairCount}}\nErrors: 500 service error"]
        GET_JOBS["GET /jobs\nQuery: ?status=&limit=&offset=\nReturns: 200 {jobs: [...]}\nDefault: limit=50 offset=0\nOrder: created_at DESC"]
        GET_JOB["GET /jobs/:id\nParams: id (integer)\nReturns: 200 {job}\nAll columns from jobs table\nErrors: 404 'Job N not found'"]
        GET_LOGS["GET /jobs/:id/logs\nParams: id (integer)\nReturns: 200 {logs: [...]}\nFrom job_logs table\nOrder: created_at ASC\nErrors: 404 job not found"]
        GET_STATS["GET /stats\nReturns: 200 {stats}\n{queued, running, completed,\nfailed, total}"]
    end
```

```mermaid
graph LR
    subgraph "Game Management [/api]"
        GET_GAMES["GET /games\nReturns: 200 {games: [...]}\nEach: {gameId, name, title,\ndescription, guide, url,\nport, createdAt}"]
        DEL_GAME["DELETE /games/:id\nParams: id (integer)\nReturns: 200 {gameId, removed: true}\nErrors: 500 removal error"]
    end

    subgraph "Health [root]"
        HEALTH["GET /health\nReturns: 200\n{status: 'ok', uptime: seconds}"]
    end
```

# POST /generate Request Shapes

```mermaid
graph TD
    subgraph "Normal Mode"
        NRM_REQ["Body: {count?: number, options?: {name?: string}}"]
        NRM_RES["201: {jobIds: number[], count: number}"]
    end

    subgraph "Comparison Mode (options.compare=true)"
        CMP_REQ["Body: {count?: number, options: {compare: true, name?: string, model?: string}}"]
        CMP_RES["201: {jobIds: number[], count: number, comparison: {pairs: [{zai: number, anthropic: number}], pairCount: number}}"]
    end

    subgraph "Per pair created"
        PAIR_A["Job A: provider='zai', name='ZAI-baseName'"]
        PAIR_B["Job B: provider='anthropic', sourceJobId=jobAId, name='Claude-baseName', model=options.model||'claude-opus-4-6'"]
    end

    CMP_REQ --> PAIR_A
    CMP_REQ --> PAIR_B
```

# GET /api/jobs/:id Response Shape

```mermaid
graph TD
    subgraph "job object (all columns from jobs table)"
        JOB["id: SERIAL\nstatus: VARCHAR(20)\ngame_name: VARCHAR(255)\nphase_outputs: JSONB\nconfig: JSONB\nerror: TEXT\ncreated_at: TIMESTAMP\nupdated_at: TIMESTAMP\nstarted_at: TIMESTAMP\ncompleted_at: TIMESTAMP"]
    end

    subgraph "Valid statuses"
        STAT["queued | running\nphase_1 | phase_2 | phase_3\nphase_4 | phase_5\ncompleted | failed"]
    end

    JOB --> STAT
```

# GET /api/jobs/:id/logs Response Shape

```mermaid
graph TD
    subgraph "logs array (from job_logs table)"
        LOG["Each: {id, job_id, level, message, created_at}\nlevel: info | warn | error | debug\nOrder: created_at ASC"]
    end
```

# GET /api/games Response Shape

```mermaid
graph TD
    subgraph "games array (from DeploymentManager.listDeployedGames)"
        GAME["Each: {\ngameId: number,\nname: string (gamedemoN),\ntitle: string,\ndescription: string,\nguide: string,\nurl: string (https://gamedemoN.namjo-games.com),\nport: number (basePort + gameId),\ncreatedAt: string (ISO8601)\n}"]
    end

    subgraph "Metadata source"
        META["metadata.json in deployDir/gamedemoN/\nFallback: title from index.html tag"]
    end

    GAME --> META
```

# Handler to Service Method Mapping

```mermaid
graph TD
    subgraph "createHandlers(services) -> handler functions"
        H1["generateGames\nPOST /generate"]
        H2["listJobs\nGET /jobs"]
        H3["getJob\nGET /jobs/:id"]
        H4["getJobLogs\nGET /jobs/:id/logs"]
        H5["getStats\nGET /stats"]
        H6["listGames\nGET /games"]
        H7["removeGame\nDELETE /games/:id"]
    end

    subgraph "QueueManager methods"
        QA["addJob({count, options})"]
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
