# Backend Source File Map

```mermaid
graph LR
    subgraph "backend/src/"
        IDX["index.js 411 lines\nEntry: wires services\nstarts Express + poller\n+ Phase 5 repair loop"]
        API["routes/api.js 195 lines\ncreateHandlers + createRouter\n7 REST endpoints\n+ comparison mode"]
        QM["services/queueManager.js 255 lines\nPostgreSQL job queue\natomic claiming\njob_logs table"]
        CM["services/containerManager.js 210 lines\nDocker container lifecycle\nspawn + poll + logs"]
        DM["services/deploymentManager.js 526 lines\nnginx container creation\nTraefik labels\ngallery data"]
        GT["services/gameTester.js 48 lines\nPlaywright-based\ngame quality testing"]
    end

    IDX -->|"imports"| API
    IDX -->|"imports"| QM
    IDX -->|"imports"| CM
    IDX -->|"imports"| DM
    IDX -->|"imports"| GT
    API -->|"injected via createHandlers"| QM
    API -->|"injected via createHandlers"| CM
    API -->|"injected via createHandlers"| DM
    IDX -->|"processJob calls"| CM
    IDX -->|"processJob calls"| DM
    IDX -->|"Phase 5 calls"| GT
```

# Backend Test File Map

```mermaid
graph LR
    subgraph "backend/src/services/__tests__/"
        SRR["run-tests.js 46 lines\nImports + runs 4 suites"]
        QMT["queueManager.test.js\nMock pg Pool"]
        CMT["containerManager.test.js\nMock Dockerode"]
        DMT["deploymentManager.test.js\nMock Docker + fs"]
        GTT["gameTester.test.js\nMock Playwright"]
    end

    subgraph "backend/src/routes/__tests__/"
        RRR["run-tests.js 44 lines\nImports + runs 1 suite"]
        AT["api.test.js 483 lines\nMock req/res pattern\n25 tests"]
    end

    SRR -->|"imports"| QMT
    SRR -->|"imports"| CMT
    SRR -->|"imports"| DMT
    SRR -->|"imports"| GTT
    RRR -->|"imports"| AT
    AT -->|"imports createHandlers"| API2["routes/api.js"]
```

# Framework Core File Map

```mermaid
graph LR
    subgraph "framework/core/"
        GL["GameLoop.js 213\nFixed tick + RAF render"]
        EB["EventBus.js 92\nMap-based pub/sub"]
        BN["BigNum.js 324\nMantissa+exponent math"]
        SM["SaveManager.js 246\nlocalStorage + slots"]
        CI["index.js 13\nRe-exports + VERSION"]
    end

    CI -->|"exports"| GL
    CI -->|"exports"| EB
    CI -->|"exports"| BN
    CI -->|"exports"| SM
```

# Framework Mechanics File Map

```mermaid
graph LR
    subgraph "framework/mechanics/"
        CU["Currency.js 186\nMulti-currency + converters"]
        GE["Generator.js 188\nAuto-production + scaling"]
        MU["Multiplier.js 112\nAdd + multiply stacking"]
        PR["Prestige.js 153\nReset layers + formula"]
        UN["Unlockable.js 109\nCondition checking"]
        MI["index.js 11\nRe-exports all"]
    end

    CU -->|"uses"| BN["BigNum.js"]
    GE -->|"uses"| BN
    GE -->|"uses"| CU
    PR -->|"uses"| BN
    PR -->|"uses"| CU
    PR -->|"uses"| GE
```

# Framework UI File Map

```mermaid
graph LR
    subgraph "framework/ui/"
        RB["ResourceBar.js 132\nCurrency display"]
        UB["UpgradeButton.js 191\nPurchase button + states"]
        PB["ProgressBar.js 140\nFill bar indicator"]
        TS["TabSystem.js 151\nTab switching"]
        SK["SkillTree.js 222\nNode graph + connectors"]
        UI["index.js 14\nRe-exports + UI_VERSION"]
    end

    RB -->|"uses"| BN["BigNum.js"]
    UB -->|"uses"| BN
    SK -->|"uses"| BN
```

# Framework Sprites File Map

```mermaid
graph LR
    subgraph "framework/sprites/"
        SR["SpriteRenderer.js 150\nCanvas rendering"]
        SD["SpriteData.js 80\nSprite definitions"]
        PS["ProceduralSprite.js 158\nProcedural generation"]
        SI["index.js 19\nRe-exports"]
    end

    SR -->|"uses"| SD
    SR -->|"uses"| PS
```

# Infrastructure: Docker + Root

```mermaid
graph LR
    subgraph "docker/"
        DC["docker-compose.yml 63 lines\nbackend + postgres services"]
        ENT["entrypoint.sh 368 lines\n5-phase worker router\nOAuth support"]
        ENV[".env.example 3 lines\nPG password + API key"]
        DW["Dockerfile 28 lines\nWorker image"]
    end

    subgraph "root"
        DBK["Dockerfile.backend 18 lines\nNode 22 slim + Playwright"]
    end

    DC -->|"builds from"| DBK
    DC -->|"mounts"| ENT
```

# Infrastructure: Docs + Gallery

```mermaid
graph LR
    subgraph "docs/"
        DDC["docker-compose.yml 19 lines\nnginx + Traefik priority=1"]
        DIX["index.html 1125 lines\nDocs + marketing site"]
    end

    subgraph "gallery/"
        GIX["index.html 459 lines\nPassword screen + card grid"]
        GJS["gallery.js 418 lines\nAuth + fetch + render"]
    end

    DDC -->|"mounts"| DIX
    DDC -->|"mounts"| GIX
    DDC -->|"mounts"| GJS
```

# Prompts: Phase 1-3

```mermaid
graph LR
    subgraph "prompts/"
        P1["phase1-idea-generator.md 297"]
        P3["phase3-implementation-guide.md 375"]
    end

    subgraph "prompts/phase2-gdd/"
        P2C["currencies.md 352"]
        P2P["progression.md 392"]
        P2PR["prestige.md 382"]
        P2S["skill-tree.md 323"]
        P2U["ui-ux.md 788"]
        P2PS["psychology-review.md 296"]
    end

    ENT["entrypoint.sh"] -->|"reads"| P1
    ENT -->|"reads"| P2C
    ENT -->|"reads"| P3
```

# Prompts: Phase 4-5

```mermaid
graph LR
    subgraph "prompts/"
        P4["phase4-orchestrator.md 1077"]
        P5R["phase5-repair-agent.md 182"]
        P5V["phase5-review-agent.md 135"]
    end

    ENT["entrypoint.sh"] -->|"reads"| P4
    ENT -->|"reads"| P5R
    ENT -->|"reads"| P5V
```
