# System Architecture

```mermaid
graph TB
    subgraph "Frontend [nginx :80/:443]"
        DOCS["Docs Site\nindex.html 1125 lines\ngamepocgen.namjo-games.com"]
        GALLERY["Gallery\ngallery.js 754 lines\n/gallery/ path"]
    end

    subgraph "Backend [Express :3010]"
        API["REST API\napi.js 298 lines\n10 endpoints"]
        POLLER["Job Poller\nindex.js 761 lines\n5s interval"]
        QM["QueueManager\n287 lines\nPostgreSQL queue"]
        CM["ContainerManager\n220 lines\nDocker lifecycle"]
        DM["DeploymentManager\n526 lines\nnginx + Traefik"]
        GT["gameTester.js\n48 lines\nPlaywright quality"]
    end

    subgraph "Data [PostgreSQL :5432]"
        DB[("postgres:15-alpine\njobs + job_logs tables\nJSONB phase_outputs")]
    end

    subgraph "Worker Pipeline [gamepocgen-worker]"
        ENTRY["entrypoint.sh 443 lines\n7-phase router"]
        CLAUDE["Claude Code CLI\nclaude-opus-4-6 via z.ai"]
        PROMPTS["13 prompt templates\n4838 lines total"]
    end

    subgraph "Game Framework [vanilla JS]"
        CORE["Core: GameLoop BigNum\nSaveManager EventBus"]
        MECH["Mechanics: Currency\nGenerator Multiplier\nPrestige Unlockable"]
        UI["UI: ResourceBar\nUpgradeButton ProgressBar\nTabSystem SkillTree"]
        SPRITES["Sprites: Renderer\nData ProceduralSprite"]
        CSS["game.css 643 lines\nDark theme"]
    end

    subgraph "Game Containers [nginx:alpine]"
        G1["gamedemo0-9\n.namjo-games.com\nStatic HTML games"]
    end

    GALLERY -->|"GET /api/jobs"| API
    API -->|"SQL queries"| QM
    QM -->|"pg Pool"| DB
    POLLER -->|"getNextJob()"| QM
    POLLER -->|"spawnContainer()"| CM
    POLLER -->|"testGame()"| GT
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
        GL["GameLoop\n213 lines"]
        EB["EventBus\n92 lines"]
        BN["BigNum\n324 lines"]
        SM["SaveManager\n246 lines"]
    end

    subgraph "Mechanics [depends on BigNum]"
        CM2["CurrencyManager\n186 lines"]
        GM["GeneratorManager\n188 lines"]
        MM["MultiplierManager\n112 lines"]
        PM["PrestigeManager\n153 lines"]
        UM["UnlockManager\n109 lines"]
    end

    subgraph "UI [depends on BigNum + CSS]"
        RB["ResourceBar 132"]
        UB["UpgradeButton 191"]
        PB["ProgressBar 140"]
        TS["TabSystem 151"]
        SK["SkillTree 222"]
    end

    subgraph "Sprites [CommonJS + Canvas]"
        SR["SpriteRenderer 150"]
        SD["SpriteData 80"]
        PS["ProceduralSprite 158"]
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
