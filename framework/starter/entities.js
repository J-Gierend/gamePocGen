/**
 * Entity - A game object on the Canvas.
 */
export class Entity {
  constructor({ type, spriteId, x, y, team, hp, damage, speed, attackSpeed, scale, reward }) {
    this.type = type;
    this.spriteId = spriteId;
    this.x = x;
    this.y = y;
    this.team = team || 'enemy';
    this.hp = hp || 50;
    this.maxHp = this.hp;
    this.damage = damage || 5;
    this.speed = speed || 20;
    this.attackSpeed = attackSpeed || 1;
    this.scale = scale || 3;
    this.reward = reward || 0;
    this.width = 16 * this.scale;
    this.height = 16 * this.scale;
    this.facingLeft = false;
    this.attackCooldown = 0;
    this.deathTimer = 0.3;
    this.frame = 0;
    this.frameTimer = 0;
    this.state = 'idle';
    this.target = null;
  }

  update(deltaTime, game) {
    if (!this.isAlive()) {
      this.deathTimer -= deltaTime;
      return;
    }
    this.target = this._findTarget(game.entities);
    if (this.target) {
      const dist = this._distanceTo(this.target);
      if (dist > this.width) {
        this.state = 'moving';
        const dx = this.target.x - this.x;
        const dy = this.target.y - this.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        this.x += (dx / len) * this.speed * deltaTime;
        this.y += (dy / len) * this.speed * deltaTime;
        this.facingLeft = dx < 0;
      } else {
        this.state = 'attacking';
        this.attackCooldown -= deltaTime;
        if (this.attackCooldown <= 0) {
          this.target.takeDamage(this.damage, game);
          this.attackCooldown = 1 / this.attackSpeed;
        }
      }
    } else {
      this.state = 'idle';
    }
    this.frameTimer += deltaTime;
    const frameSpeed = this.state === 'attacking' ? 0.1 : this.state === 'moving' ? 0.2 : 0.5;
    if (this.frameTimer >= frameSpeed) {
      this.frameTimer = 0;
      this.frame++;
    }
  }

  takeDamage(amount, game) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dying';
      if (this.team === 'enemy' && this.reward > 0) {
        const primaryId = game.config.primaryCurrency || Object.keys(game.config.currencies)[0];
        if (primaryId) game.currencies.add(primaryId, this.reward);
        game.events.emit('enemyDefeated', { entity: this, reward: this.reward });
      }
    }
  }

  draw(renderer, frameCount) {
    const opacity = this.isAlive() ? 1 : Math.max(0, this.deathTimer / 0.3);
    try {
      renderer.draw(this.spriteId, this.x, this.y, this.frame, {
        scale: this.scale, flipX: this.facingLeft, opacity, glow: false
      });
    } catch {
      // Fallback: draw colored rectangle
      const ctx = renderer._canvas?.getContext?.('2d');
      if (ctx) {
        ctx.fillStyle = this.team === 'player' ? '#4ade80' : '#f87171';
        ctx.globalAlpha = opacity;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        ctx.globalAlpha = 1;
      }
    }
  }

  isAlive() { return this.hp > 0; }

  _findTarget(entities) {
    let nearest = null, nearestDist = Infinity;
    for (const e of entities) {
      if (e.team !== this.team && e.isAlive()) {
        const d = this._distanceTo(e);
        if (d < nearestDist) { nearestDist = d; nearest = e; }
      }
    }
    return nearest;
  }

  _distanceTo(other) {
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  serialize() {
    return { type: this.type, x: this.x, y: this.y, team: this.team, hp: this.hp };
  }
}
