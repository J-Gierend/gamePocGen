/**
 * Main Game Class — CUSTOMIZE THIS FILE
 * This is a working base game. Modify it to match your game concept.
 */
import { Entity } from './entities.js';

export class Game {
  constructor({ GameLoop, BigNum, SaveManager, EventBus, CurrencyManager,
                SpriteRenderer, SPRITE_DATA, PALETTES, ProceduralSprite,
                config, root, canvas }) {
    this.BigNum = BigNum;
    this.config = config;
    this.root = root;
    this.canvas = canvas;

    this.events = new EventBus();
    this.loop = new GameLoop({ tickRate: config.ui?.tickRate || 20 });
    this.saves = new SaveManager({
      gameId: config.gameId,
      autoSaveInterval: config.ui?.autoSaveInterval || 30000,
      version: config.version || '1.0.0'
    });
    this.currencies = new CurrencyManager();

    this.renderer = new SpriteRenderer(canvas);
    this.SPRITE_DATA = SPRITE_DATA;
    this.PALETTES = PALETTES;
    this.ProceduralSprite = ProceduralSprite;

    this.entities = [];
    this.structures = [];
    this.collectibles = [];
    this.effects = [];
    this.world = { wave: 0, waveActive: false, prestigeTier: 0 };
    this.frameCount = 0;
    this.generators = {};
    this.unlocks = null;
    this.prestige = null;
    this.ui = {};
    this._clickDamage = 10;
    this._waveTimer = 0;
    this._passiveTimer = 0;
  }

  init() {
    this._registerSprites();
    this._registerCurrencies();
    this._setupUI();
    this._setupClickHandler();
    this._resizeCanvas();
    this._loadSave();
    window.addEventListener('resize', () => this._resizeCanvas());
    // Auto-start first wave
    this._startWave();
  }

  start() {
    this.loop.onTick((dt) => this._tick(dt));
    this.loop.onRender((dt) => this._render(dt));
    this.loop.start();
    this.saves.startAutoSave(() => this._getState());
    this.events.emit('gameStarted');
  }

  _registerSprites() {
    for (const [name, frames] of Object.entries(this.SPRITE_DATA)) {
      if (this.PALETTES[name]) {
        this.renderer.registerSprite(name, frames, this.PALETTES[name]);
      }
    }
    this.renderer.prerenderAll();
  }

  _registerCurrencies() {
    if (this.config.currencies) {
      for (const [id, def] of Object.entries(this.config.currencies)) {
        this.currencies.register({ id, ...def });
      }
    }
  }

  _setupUI() {
    // Currency displays in HUD
    const resources = document.getElementById('resources');
    if (resources && this.config.currencies) {
      for (const [id, def] of Object.entries(this.config.currencies)) {
        const el = document.createElement('div');
        el.className = 'currency';
        el.id = `currency-${id}`;
        el.innerHTML = '<span>' + (def.name || id) + '</span>: <span class="amount" id="display-' + id + '">0</span>';
        resources.appendChild(el);
      }
    }

    // Tab setup
    const tabNav = document.getElementById('tabs');
    if (tabNav) {
      const tabs = [
        { id: 'upgrades', label: 'Upgrades' },
        { id: 'skills', label: 'Skills' },
      ];
      tabNav.innerHTML = '';
      tabs.forEach((tab, i) => {
        const btn = document.createElement('button');
        btn.textContent = tab.label;
        btn.setAttribute('data-tab', tab.id);
        btn.setAttribute('role', 'tab');
        if (i === 0) btn.classList.add('active');
        btn.addEventListener('click', () => {
          tabNav.querySelectorAll('button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          document.querySelectorAll('.game-panel').forEach(p => {
            p.style.display = p.id === 'panel-' + tab.id ? 'flex' : 'none';
          });
        });
        tabNav.appendChild(btn);
      });
    }

    // Upgrade buttons
    const upgradePanel = document.getElementById('panel-upgrades');
    if (upgradePanel && this.config.upgrades) {
      for (const [id, upg] of Object.entries(this.config.upgrades)) {
        const card = document.createElement('button');
        card.className = 'upgrade-btn';
        card.style.cssText = 'padding:8px 12px;background:#2d2d4e;color:#ccc;border:1px solid #555;border-radius:4px;cursor:pointer;min-width:120px;';
        card.innerHTML = '<div>' + (upg.name || id) + '</div><div style="font-size:11px">Cost: ' + (upg.baseCost || 10) + '</div>';
        card.addEventListener('click', () => {
          const cost = upg.baseCost || 10;
          const cId = upg.currencyId || this.config.primaryCurrency;
          if (this.currencies.canAfford(cId, cost)) {
            this.currencies.sub(cId, cost);
            this._clickDamage += 5;
          }
        });
        upgradePanel.appendChild(card);
      }
    }
  }

  _setupClickHandler() {
    this.canvas.addEventListener('click', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Try to place a player entity
      const playerTypes = Object.entries(this.config.entities || {})
        .filter(([, def]) => def.team === 'player')
        .map(([id]) => id);
      const placeType = playerTypes[0] || Object.keys(this.config.entities || {})[0];

      if (placeType) {
        this.spawnEntity(placeType, x - 24, y - 24, 'player');
      }

      // Earn currency on click
      const primaryId = this.config.primaryCurrency || Object.keys(this.config.currencies || {})[0];
      if (primaryId) {
        this.currencies.add(primaryId, this._clickDamage);
      }

      // Visual feedback
      this.effects.push({
        x, y, text: '+' + this._clickDamage, alpha: 1, vy: -40, timer: 0.8,
        update(dt) { this.y += this.vy * dt; this.timer -= dt; this.alpha = Math.max(0, this.timer); },
        isDone() { return this.timer <= 0; },
        draw(ctx) {
          ctx.globalAlpha = this.alpha;
          ctx.fillStyle = '#4ade80';
          ctx.font = 'bold 16px monospace';
          ctx.fillText(this.text, this.x, this.y);
          ctx.globalAlpha = 1;
        }
      });
    });
  }

  spawnEntity(type, x, y, team) {
    const def = this.config.entities?.[type];
    if (!def) return null;
    const entity = new Entity({
      type,
      spriteId: def.sprite || type,
      x, y,
      team: team || def.team || 'enemy',
      hp: def.hp || 50,
      damage: def.damage || 5,
      speed: def.speed || 20,
      attackSpeed: def.attackSpeed || 1,
      scale: def.scale || 3,
      reward: def.reward || 0,
    });
    this.entities.push(entity);
    return entity;
  }

  _startWave() {
    this.world.wave++;
    this.world.waveActive = true;
    const count = Math.min(3 + this.world.wave, 12);
    const enemyTypes = Object.entries(this.config.entities || {})
      .filter(([, def]) => def.team === 'enemy' || !def.team)
      .map(([id]) => id);
    const enemyType = enemyTypes[this.world.wave % enemyTypes.length] || enemyTypes[0] || Object.keys(this.config.entities || {})[0];
    if (!enemyType) return;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * this.canvas.width * 0.4 + this.canvas.width * 0.55;
      const y = Math.random() * this.canvas.height * 0.7 + this.canvas.height * 0.1;
      this.spawnEntity(enemyType, x, y, 'enemy');
    }
    const waveEl = document.getElementById('wave-info');
    if (waveEl) waveEl.textContent = 'Wave ' + this.world.wave;
  }

  _resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.renderer.resize(rect.width, rect.height);
  }

  _tick(deltaTime) {
    // Update entities
    for (let i = this.entities.length - 1; i >= 0; i--) {
      const entity = this.entities[i];
      entity.update(deltaTime, this);
      if (!entity.isAlive() && entity.deathTimer <= 0) {
        this.entities.splice(i, 1);
      }
    }

    // Update effects
    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].update(deltaTime);
      if (this.effects[i].isDone()) this.effects.splice(i, 1);
    }

    // Passive income
    this._passiveTimer += deltaTime;
    if (this._passiveTimer >= 2.0) {
      this._passiveTimer = 0;
      const primaryId = this.config.primaryCurrency || Object.keys(this.config.currencies || {})[0];
      if (primaryId) this.currencies.add(primaryId, 1);
    }

    // Auto-advance waves when all enemies dead
    const enemies = this.entities.filter(e => e.team === 'enemy' && e.isAlive());
    if (this.world.waveActive && enemies.length === 0) {
      this.world.waveActive = false;
      this._waveTimer = 0;
    }
    if (!this.world.waveActive) {
      this._waveTimer += deltaTime;
      if (this._waveTimer >= (this.config.waves?.waveCooldown || 3)) {
        this._startWave();
      }
    }

    this.events.emit('tick', { deltaTime });
  }

  _render(deltaTime) {
    this.frameCount++;
    const ctx = this.canvas.getContext('2d');

    this.renderer.clear();
    ctx.fillStyle = this.config.canvas?.backgroundColor || '#1a1a2e';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw entities
    for (const entity of this.entities) {
      entity.draw(this.renderer, this.frameCount);
      // Health bars
      if (entity.hp < entity.maxHp && entity.isAlive()) {
        const barW = 32, barH = 4;
        const bx = entity.x + (entity.width - barW) / 2;
        const by = entity.y - 8;
        const fill = entity.hp / entity.maxHp;
        ctx.fillStyle = '#333'; ctx.fillRect(bx, by, barW, barH);
        ctx.fillStyle = fill > 0.5 ? '#4ade80' : fill > 0.25 ? '#fbbf24' : '#f87171';
        ctx.fillRect(bx, by, barW * fill, barH);
      }
    }

    // Draw effects
    for (const effect of this.effects) {
      if (effect.draw) effect.draw(ctx);
    }

    // Update HUD currency displays
    if (this.config.currencies) {
      for (const id of Object.keys(this.config.currencies)) {
        const el = document.getElementById('display-' + id);
        if (el) {
          const c = this.currencies.get(id);
          el.textContent = c?.amount?.format?.(1) ?? '0';
        }
      }
    }

    this.events.emit('render', { deltaTime });
  }

  _getState() {
    return {
      currencies: this.currencies.serialize(),
      world: { ...this.world },
    };
  }

  _loadSave() {
    const state = this.saves.load('auto');
    if (state) {
      if (state.currencies) this.currencies.deserialize(state.currencies);
      if (state.world) Object.assign(this.world, state.world);
    }
  }
}
