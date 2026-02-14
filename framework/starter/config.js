/**
 * Game Configuration — CUSTOMIZE THIS FILE
 * Replace placeholder values with game-specific values from the GDD.
 */
export const CONFIG = {
  gameId: 'starter-game',
  version: '1.0.0',
  primaryCurrency: 'gold',

  canvas: {
    width: 800,
    height: 450,
    backgroundColor: '#1a1a2e',
  },

  entities: {
    knight: { sprite: 'knight', hp: 100, damage: 20, speed: 40, attackSpeed: 1.5, scale: 3, team: 'player' },
    slime: { sprite: 'slime', hp: 50, damage: 5, speed: 20, attackSpeed: 0.8, scale: 3, team: 'enemy', reward: 5 },
    ghost: { sprite: 'ghost', hp: 30, damage: 8, speed: 40, attackSpeed: 1.2, scale: 3, team: 'enemy', reward: 8 },
  },

  waves: {
    baseEnemyCount: 3,
    enemyCountGrowth: 1.2,
    spawnDelay: 0.5,
    waveCooldown: 2,
  },

  currencies: {
    gold: { name: 'Gold', icon: 'coin', initial: 0 },
    gems: { name: 'Gems', icon: 'gem', initial: 0 },
  },

  generators: {
    miner: { currencyId: 'gold', baseRate: 1, baseCost: 10, costMultiplier: 1.15, name: 'Gold Miner' },
  },

  upgrades: {
    clickPower: { name: 'Click Power', baseCost: 25, costMultiplier: 1.5, currencyId: 'gold', effect: 'clickDamage', baseValue: 5 },
    spawnRate: { name: 'Spawn Rate', baseCost: 50, costMultiplier: 1.8, currencyId: 'gold', effect: 'spawnSpeed', baseValue: 0.9 },
  },

  prestige: {
    currencyId: 'gems',
    threshold: 1000,
    formula: 'sqrt',
  },

  unlocks: {},

  skillTree: {},

  ui: {
    tickRate: 20,
    autoSaveInterval: 30000,
    theme: 'dark',
  }
};
