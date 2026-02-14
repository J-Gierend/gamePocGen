# Backend Source File Map

```mermaid
graph LR
    subgraph "backend/src/"
        IDX["index.js 761 lines\nEntry: wires services\nstarts Express + poller\n+ Phase 5 repair loop\n+ process improvement agent\n+ plateau detection\n+ user feedback integration"]
        API["routes/api.js 298 lines\ncreateHandlers + createRouter\n10 REST endpoints\n+ comparison mode\n+ feedback endpoint\n+ improvements endpoints"]
        QM["services/queueManager.js 287 lines\nPostgreSQL job queue\natomic claiming\njob_logs table\nuser_feedback column"]
        CM["services/containerManager.js 220 lines\nDocker container lifecycle\nspawn + poll + logs\nhostProjectRoot bind mounts"]
        DM["services/deploymentManager.js 526 lines\nnginx container creation\nTraefik labels\ngallery data\nguide.html generation"]
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
        QMT["queueManager.test.js 431 lines\nMock pg Pool"]
        CMT["containerManager.test.js 717 lines\nMock Dockerode"]
        DMT["deploymentManager.test.js 342 lines\nMock Docker + fs"]
        GTT["gameTester.test.js 142 lines\nMock execSync"]
    end

    subgraph "backend/src/routes/__tests__/"
        RRR["run-tests.js 44 lines\nImports + runs 1 suite"]
        AT["api.test.js 604 lines\nMock req/res pattern"]
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

    subgraph "framework/core/__tests__/"
        GLT["GameLoop.test.js 273"]
        EBT["EventBus.test.js 133"]
        BNT["BigNum.test.js 222"]
        SMT["SaveManager.test.js 241"]
        TR["TestRunner.js 148"]
        RR["run-tests.js 64"]
        RH["run-tests.html 91"]
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

    subgraph "framework/mechanics/__tests__/"
        CUT["Currency.test.js 204"]
        GET["Generator.test.js 307"]
        MUT["Multiplier.test.js 131"]
        PRT["Prestige.test.js 228"]
        UNT["Unlockable.test.js 165"]
        MRR["run-tests.js 65"]
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

    subgraph "framework/ui/__tests__/"
        RBT["ResourceBar.test.js 144"]
        UBT["UpgradeButton.test.js 203"]
        PBT["ProgressBar.test.js 169"]
        TST["TabSystem.test.js 220"]
        SKT["SkillTree.test.js 253"]
        DM2["DomMock.js 163"]
        URR["run-tests.js 58"]
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
        DC["docker-compose.yml 64 lines\nbackend + postgres services"]
        ENT["entrypoint.sh 443 lines\n7-phase worker router\nOAuth + apikey support"]
        DW["Dockerfile 28 lines\nWorker image"]
    end

    subgraph "root"
        DBK["Dockerfile.backend 19 lines\nNode 22 slim + Playwright"]
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
        GIX["index.html 868 lines\nPassword screen + card grid\n+ improvement timeline"]
        GJS["gallery.js 754 lines\nAuth + fetch + render\n+ procedural thumbnails\n+ sparklines + defects\n+ feedback modal\n+ improvement timeline"]
    end

    DDC -->|"mounts"| DIX
    DDC -->|"mounts"| GIX
    DDC -->|"mounts"| GJS
```

# Prompts File Map

```mermaid
graph LR
    subgraph "prompts/"
        P1["phase1-idea-generator.md 297"]
        P3["phase3-implementation-guide.md 375"]
        P4["phase4-orchestrator.md 1081"]
        P5R["phase5-repair-agent.md 190"]
        P5V["phase5-review-agent.md 135"]
        P5S["phase5-strategy-review.md 85"]
        PI["process-improvement-agent.md 142"]
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
    ENT -->|"reads"| P4
    ENT -->|"reads"| P5R
    ENT -->|"reads"| P5S
    ENT -->|"reads"| PI
```

# Scripts + Test File Map

```mermaid
graph LR
    subgraph "scripts/"
        TG["test-game.js 814 lines\nPlaywright game tester\n15 checks across 5 tiers\ntier-based scoring with caps\nno-scroll viewport check"]
        SP["package.json 1 line\nPlaywright dependency"]
    end

    GT["gameTester.js 48 lines\nExec wrapper"] -->|"execSync"| TG
```
