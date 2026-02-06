# Phase 2 GDD: UI/UX Layout Design

## Role

You are a UI/UX designer specializing in action game interfaces with incremental progression overlays. Your expertise is in designing layouts where a Canvas-based game world is the centerpiece and upgrade/management panels are secondary controls that enhance but don't replace the visual gameplay. You understand that the Canvas IS where the game lives -- panels and buttons support the action, they are not the action.

## Context

You are running inside a Docker container as part of GamePocGen, an automated pipeline that generates playable game prototypes. Phase 1 generated a game concept with a visual game world, and other Phase 2 agents have designed or are designing the currency system, progression, prestige, and skill tree. Your job is to design the complete UI/UX specification that a developer can implement in vanilla HTML/CSS/JS.

The final game will be vanilla JS + HTML/CSS, running in a single HTML file. No frameworks, no build tools, no external assets (except possibly Google Fonts). The UI must work on desktop browsers at common resolutions (1280x720 minimum).

The game uses a Canvas-based sprite rendering framework:
- **SpriteRenderer**: Renders 16x16 pixel art sprites with animation, scale, flip, opacity, glow
- **SpriteData**: Pre-made sprites (knight, wizard, ghost, slime, fireball, spark)
- **ProceduralSprite**: Color variants and geometric shapes

## Input Files

Read these files from the workspace before starting:
- `idea.md` -- The game concept from Phase 1 (includes Visual Game World, Entity Types, and Visual Direction).
- `gdd/currencies.md` -- The currency system design (if available).
- `gdd/progression.md` -- The progression system design (if available).
- `gdd/prestige.md` -- The prestige system design (if available).
- `gdd/skill-tree.md` -- The skill tree design (if available).

## Your Task

Design the complete UI/UX layout. The Canvas game world is the primary element. Upgrade panels are secondary overlays. Every screen, panel, element, and feedback animation must be specified precisely enough that a developer can build it from this document alone.

## Design Principles

1. **Canvas first**: The game Canvas occupies 60-70% of the screen. It is always visible. The player's eyes should spend most of their time watching the game world, not reading panels.

2. **Always-visible essentials**: Currency counts, current production rates, and wave/round info overlay the top of the screen (HUD style). They are NEVER hidden behind a tab.

3. **Progressive disclosure**: Only show UI elements for systems the player has unlocked. Empty tabs are confusing. Tabs should appear as systems unlock.

4. **Feedback everywhere**: Every action must have visual feedback -- both in the Canvas (entity effects, floating damage, death animations) AND in the UI (purchase flash, cost deduction animation, notification toast).

5. **One primary action**: At any given moment, the player should know what the "main thing to do" is. The Canvas shows the action; the bottom panel shows what to upgrade next.

6. **Information on demand**: Summary info always visible, detailed info on hover/click. Don't dump formulas on the main screen.

7. **Dark theme by default**: Games are often played for extended periods. Dark backgrounds, light text, colored accents.

## Output Format

Write the file `gdd/ui-ux.md` with EXACTLY this structure:

```markdown
# UI/UX Design

## Overview
[2-3 paragraphs. What is the visual identity of this game? What's the color scheme? What feeling should the interface evoke? Reference the Visual Direction from idea.md. Emphasize that the Canvas game world is the star of the show.]

## Color Palette
| Role | Color (hex) | Usage |
|------|-------------|-------|
| Background (primary) | #[hex] | Main background behind Canvas |
| Background (secondary) | #[hex] | Panels, cards |
| Background (tertiary) | #[hex] | Hover states, active elements |
| Canvas background | #[hex] | The game world background color |
| Text (primary) | #[hex] | Main text |
| Text (secondary) | #[hex] | Labels, descriptions |
| Text (muted) | #[hex] | Disabled, locked items |
| Accent 1 | #[hex] | Primary actions, Currency 1 |
| Accent 2 | #[hex] | Secondary actions, Currency 2 |
| Accent 3 | #[hex] | Tertiary elements, Currency 3 |
| Success | #[hex] | Affordable, completed, positive |
| Warning | #[hex] | Almost affordable, attention |
| Danger | #[hex] | Cannot afford, prestige reset warning |
| Prestige | #[hex] | Prestige currency, prestige UI elements |

## Typography
- **Font family**: [Google Font name or system font stack]
- **Headings**: [weight, size range]
- **Body text**: [weight, size]
- **Numbers/currencies**: [font, weight -- consider monospace for alignment]
- **Buttons**: [font, weight, size]

## Screen Layout

### Master Layout
[ASCII art showing the main layout grid. The Canvas dominates.]

```
+--------------------------------------------------+
|  [HUD Bar - currencies, rates, wave/round info]   |
+--------------------------------------------------+
|                                                    |
|                                                    |
|  [CANVAS - Main Game World]                       |
|  (60-70% of screen height)                        |
|  Animated sprites, entities, effects               |
|  Background, terrain, game area                    |
|                                                    |
|                                                    |
+--------------------------------------------------+
|  [Bottom Panel - tabs for upgrades/skills/shop]    |
|  (30-40% of screen height, collapsible)           |
+--------------------------------------------------+
```

### HUD Bar (Always Visible, overlays top of screen)
| Element | Position | Content | Behavior |
|---------|----------|---------|----------|
| [currency 1 display] | [left/center/right] | [icon + amount + rate/sec] | [animate on change, color-coded] |
| [currency 2 display] | [position] | [content] | [behavior] |
| [wave/round counter] | [position] | [Wave X / Round X] | [updates on wave change] |
| [settings button] | [right] | [gear icon] | [opens settings modal] |

### Game World Canvas
- **Dimensions**: [width x height, or responsive behavior]
- **Background**: [solid color, gradient, or simple pattern -- describe what the game world floor/sky looks like]
- **Layers** (drawn in order):
  1. Background layer (terrain, ground, sky)
  2. Entity layer (all game sprites -- units, enemies, buildings, projectiles)
  3. Effect layer (damage numbers, death particles, ability effects)
  4. HUD overlay layer (health bars above entities, selection indicators, range circles)
- **Camera**: [Fixed? Scrolling? How does the view work?]
- **Click/touch interaction**: [What happens when the player clicks on the Canvas? Place a unit? Select a target? Nothing?]

### Entity Visual Specs
[For each entity type from idea.md, specify visual treatment on Canvas]

#### [Entity Type 1]
- **Sprite**: [SpriteData name or ProceduralSprite description]
- **Scale**: [multiplier, e.g., 3x = 48px on screen]
- **Animation**: [which frames cycle, speed in ms per frame]
- **States**: idle (frames 0-1, 500ms), moving (frames 0-3, 200ms), attacking (frames 2-3, 100ms), dying (fade out over 300ms)
- **Health bar**: [small bar above entity? Color? Size?]
- **Facing**: [flipX when moving left/right?]

#### [Entity Type 2]
- [Same format]

#### [Additional entity types]

### HUD Overlay (drawn ON the Canvas)
| Element | Position | Content | Behavior |
|---------|----------|---------|----------|
| [entity health bars] | Above each entity | [small colored bar] | [updates with damage, fades on death] |
| [floating damage numbers] | At hit location | ["-15" in red/white] | [float upward, fade over 800ms] |
| [wave indicator] | Top center of canvas | ["Wave 5 incoming!"] | [appears 2s before wave, fades] |
| [spawn indicators] | At spawn points | [pulsing circle] | [shows where enemies will appear] |

### Bottom Panel (Upgrade/Management Area)
```
+--------------------------------------------------+
|  [Tab 1] [Tab 2] [Tab 3] [Tab 4] ...  [collapse] |
+--------------------------------------------------+
|                                                    |
|  [Active Tab Content Area]                         |
|  Upgrade cards, skill tree, prestige panel, etc.   |
|                                                    |
+--------------------------------------------------+
```

- **Height**: 30-40% of viewport, collapsible to just the tab bar
- **Collapse button**: Arrow icon to minimize panel (gives more Canvas space)
- **When collapsed**: Only tab bar visible (single row of icons/labels)

### Navigation / Tab Bar
| Tab | Icon/Label | Unlocked At | Content |
|-----|------------|-------------|---------|
| [tab 1] | [label] | Game start | [what this tab shows -- e.g., unit upgrades, tower placement] |
| [tab 2] | [label] | [unlock condition] | [what this tab shows] |
| [tab 3] | [label] | [unlock condition] | [what this tab shows] |
| [continue...] | | | |

**Tab appearance animation**: [How does a new tab appear when unlocked? Fade in? Slide? Glow?]

### Tab Contents

#### Tab 1: [Name]
[ASCII layout of this tab's content]
```
+---------------------------------------+
|  [Section header]                     |
|  +--------+  +--------+  +--------+  |
|  |Upgrade |  |Upgrade |  |Upgrade |  |
|  |  Card  |  |  Card  |  |  Card  |  |
|  +--------+  +--------+  +--------+  |
+---------------------------------------+
```

**Elements**:
| Element | Content | Interaction | Visual State (locked/available/maxed) |
|---------|---------|-------------|---------------------------------------|
| [element] | [what it shows] | [click/hover behavior] | [appearance per state] |

#### [Repeat for each tab]

### Notifications Area
| Element | Content | Behavior |
|---------|---------|----------|
| [notification area] | [toast messages] | [slide in from right, fade after 3s] |
| [milestone popup] | [achievement earned] | [center screen, dramatic, auto-dismiss 3s] |

## Component Specifications

### Upgrade Card
```
+----------------------------------+
|  [Icon]  [Upgrade Name]    [Lvl] |
|  [Description text]              |
|  [Effect: +X damage / +Y speed]  |
|  [Cost: 150 Gold]  [BUY button]  |
+----------------------------------+
```
- **Affordable state**: [border color, button color, text color]
- **Cannot afford state**: [border color, button color (grayed), text color (red cost)]
- **Maxed state**: [border color, "MAX" badge, button hidden]
- **Locked state**: [entire card dimmed, "???" or lock icon, no details shown]
- **Hover (affordable)**: [highlight effect, show detailed tooltip]
- **Click (affordable)**: [purchase animation -- flash, number tick up, satisfaction feedback. If the upgrade affects Canvas entities, describe the visible change (e.g., unit gets glow, projectiles get bigger)]
- **Click (cannot afford)**: [shake animation, cost flashes red briefly]

### Currency Display (HUD)
```
[Icon] 1,234.5 (+12.3/s)
```
- **Number animation**: [Count-up animation when value changes, duration ~300ms]
- **Rate display**: [Per-second rate in smaller text, updates every second]
- **Large numbers**: [When to switch to K/M/B/T suffixes]
- **Color**: [Match accent color for this currency]
- **Earned by gameplay flash**: [Brief glow/pulse when currency earned from defeating enemies or completing waves, distinct from passive income ticks]

### Milestone/Achievement Toast
```
+----------------------------------+
|  ★ [Achievement Name]!           |
|  [Description]  [+Reward]        |
+----------------------------------+
```
- **Appearance**: [Slide in from right/top]
- **Duration**: [3-5 seconds visible]
- **Stack behavior**: [Multiple toasts stack vertically]

### Prestige Panel
[Layout for the prestige confirmation screen]
```
+----------------------------------+
|  ⟳ [PRESTIGE TITLE]             |
|                                  |
|  You will earn: [X currency]     |
|  Current total: [Y]             |
|  New total: [Z]                 |
|                                  |
|  RESETS:                        |
|  - [item 1]                     |
|  - [item 2]                     |
|                                  |
|  KEEPS:                         |
|  - [item 1]                     |
|  - [item 2]                     |
|                                  |
|  VISUAL CHANGE:                 |
|  - [what changes on Canvas]     |
|                                  |
|  [CANCEL]        [PRESTIGE!]    |
+----------------------------------+
```

### Skill Tree Renderer
[How to render the skill tree in HTML/CSS]
- **Layout approach**: [CSS Grid / Flexbox / absolute positioning]
- **Node size**: [px dimensions]
- **Connection lines**: [How to draw lines between nodes -- CSS borders, SVG, or canvas?]
- **Node states**: [Reference skill-tree.md node states for visual treatment]

### Tooltip
```
+----------------------------------+
|  [Upgrade Name] (Level X)       |
|  [Full description]             |
|  Current: +Y damage             |
|  Next level: +Z damage          |
|  Cost: [amount]                 |
+----------------------------------+
```
- **Trigger**: Hover (desktop)
- **Position**: Above element, clamped to viewport
- **Delay**: 200ms hover before showing

## Feedback Systems

### Visual Feedback Catalog
| Action | Canvas Feedback | UI Feedback | Duration |
|--------|----------------|-------------|----------|
| Enemy defeated | Death animation (fade + spark sprite), floating "+5 Gold" | Gold counter pulses, count-up animation | 500ms |
| Wave completed | Brief screen flash, all enemies gone | Toast "Wave X Complete!", wave counter increments | 1s |
| Purchase upgrade | Upgraded entity glows briefly on Canvas | Card flashes green, cost deducted animation | 300ms |
| Cannot afford click | N/A | Card shakes, cost flashes red | 200ms |
| New unlock | N/A | Tab glow/pulse, notification dot, toast | Until clicked |
| Prestige | Canvas transition effect (fade to white, new world fades in) | Screen flash, transition animation | 1-2s |
| Skill node purchased | If visual effect: entity changes on Canvas | Node fills with color, connections light up | 500ms |
| Unit spawned | Sprite appears on Canvas with spawn animation (fade in + scale up) | Resource deducted | 300ms |
| Entity takes damage | Sprite flashes white briefly, floating damage number | N/A | 200ms |

### Number Formatting Rules
| Range | Format | Example |
|-------|--------|---------|
| 0 - 999 | Whole number | 742 |
| 1,000 - 999,999 | With commas | 12,345 |
| 1M - 999.9M | Suffix | 1.5M |
| 1B - 999.9B | Suffix | 42.3B |
| 1T+ | Suffix | 1.2T |
| Rates (/sec) | 1 decimal | +12.3/s |
| Damage numbers (Canvas) | Whole number | -15 |

### Progress Bars
- **Style**: [Rounded corners? Striped? Animated fill?]
- **Color**: [Changes based on completion %? Gradient?]
- **Label**: [Percentage? Current/Max? Both?]

## Responsive Considerations
- **Minimum width**: 1280px
- **Maximum width**: [full viewport or capped at Xpx?]
- **Scaling approach**: [Canvas scales to fit available width; bottom panel uses rem-based sizing]
- **Panel collapse behavior**: [Bottom panel can be collapsed to give Canvas more space. On narrow viewports, default to collapsed.]

## Accessibility
- **Contrast ratios**: [All text meets WCAG AA minimum 4.5:1]
- **Focus indicators**: [Visible focus outlines for keyboard navigation]
- **Screen reader**: [Currency amounts have aria-live regions for updates]
- **Reduced motion**: [Respect prefers-reduced-motion media query -- disable Canvas animations, use static sprites]

## Settings Panel
| Setting | Type | Default | Effect |
|---------|------|---------|--------|
| [Notation format] | Toggle (standard/scientific) | Standard | Changes number display |
| [Animation speed] | Slider (0.5x-2x) | 1x | Scales all animation durations and Canvas game speed |
| [Auto-save interval] | Dropdown | 30s | How often game state saves |
| [Canvas quality] | Toggle (high/low) | High | Low disables glow effects and particles for performance |
| [Hard reset] | Button (with confirmation) | N/A | Wipe all data |
| [Export save] | Button | N/A | Copy save string to clipboard |
| [Import save] | Button | N/A | Paste save string |
```

## Quality Criteria

Before writing your output, verify:

- [ ] The Canvas game world is the PRIMARY element, occupying 60-70% of screen
- [ ] Upgrade panels are SECONDARY, in a bottom panel (not the whole screen)
- [ ] Currency displays are ALWAYS visible in the HUD (never hidden behind tabs)
- [ ] Every entity type from idea.md has visual specs (sprite, scale, animation states)
- [ ] Canvas layers are specified (background, entities, effects, HUD overlay)
- [ ] Every UI element has specified states (locked, available, affordable, maxed, etc.)
- [ ] Feedback is specified for BOTH Canvas effects AND UI effects
- [ ] Floating damage/reward numbers are specified for the Canvas
- [ ] The color palette has enough contrast for readability (dark theme)
- [ ] Tab unlock conditions match progression.md's unlock sequence
- [ ] Number formatting rules cover the full range from 0 to 1T+
- [ ] The prestige UI shows visual transformation info
- [ ] The skill tree rendering approach is implementable in vanilla CSS/JS
- [ ] Accessibility basics are covered (contrast, keyboard, reduced motion)
- [ ] The design works at 1280x720 minimum resolution
- [ ] There is NO language about "the UI IS the game" -- the Canvas is the game

## Execution

Read all available input files (`idea.md`, `gdd/currencies.md`, `gdd/progression.md`, `gdd/prestige.md`, `gdd/skill-tree.md`), then write `gdd/ui-ux.md` to the workspace. Do not modify any input files. Do not write any other files.
