import { GameState } from './engine/state.js';
import { ParticleManager } from './engine/particles.js';
import { soundFx } from './audio/sound.js';
import { Player } from './entities/player.js';
import { Enemy } from './entities/enemy.js';
import { PowerUp } from './entities/bullet.js';
import { circleIntersect } from './utils/math.js';

class GameApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');

    this.state = new GameState();
    this.particles = new ParticleManager();

    this.player = null;
    this.enemies = [];
    this.bullets = [];
    this.powerups = [];

    this.keys = {};
    this.touchPos = null;
    this.isPaused = false;
    this.isPlaying = false;

    this.waveTimer = 0;
    this.spawnTimer = 0;
    this.enemiesRemainingInWave = 0;
    this.screenShakeTime = 0;
    this.screenShakeIntensity = 0;
    this.enableScreenShake = true;

    this.lastTime = performance.now();

    this.initDOM();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    this.bindEvents();
    this.updateShopUI();

    requestAnimationFrame((t) => this.loop(t));
  }

  resizeCanvas() {
    const container = document.getElementById('game-container');
    const rect = container.getBoundingClientRect();

    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;

    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;
  }

  initDOM() {
    this.hud = document.getElementById('hud');
    this.hudScore = document.getElementById('hud-score');
    this.hudWave = document.getElementById('hud-wave');
    this.hudCredits = document.getElementById('hud-credits');
    this.shieldBarInner = document.getElementById('shield-bar-inner');
    this.shieldText = document.getElementById('shield-text');
    this.multiplierBadge = document.getElementById('multiplier-badge');
    this.startHighScore = document.getElementById('start-high-score');

    this.screenStart = document.getElementById('screen-start');
    this.screenShop = document.getElementById('screen-shop');
    this.screenSettings = document.getElementById('screen-settings');
    this.screenGameover = document.getElementById('screen-gameover');
    this.screenPause = document.getElementById('screen-pause');

    this.startHighScore.textContent = this.state.highScore.toLocaleString();
  }

  bindEvents() {
    // Keyboard inputs
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (this.isPlaying) this.togglePause();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    // Mouse / Touch Controls
    const container = document.getElementById('game-container');
    const updateTouch = (e) => {
      if (!this.isPlaying || this.isPaused) return;
      const rect = container.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      this.touchPos = {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    };

    container.addEventListener('mousemove', updateTouch);
    container.addEventListener('touchmove', updateTouch);
    container.addEventListener('touchstart', updateTouch);
    container.addEventListener('touchend', () => { this.touchPos = null; });

    // Menu Buttons
    document.getElementById('btn-start').addEventListener('click', () => this.startGame());
    document.getElementById('btn-restart').addEventListener('click', () => this.startGame());

    document.getElementById('btn-open-shop').addEventListener('click', () => {
      this.screenStart.classList.add('hidden');
      this.screenShop.classList.remove('hidden');
      this.updateShopUI();
    });

    document.getElementById('btn-go-shop').addEventListener('click', () => {
      this.screenGameover.classList.add('hidden');
      this.screenShop.classList.remove('hidden');
      this.updateShopUI();
    });

    document.getElementById('btn-close-shop').addEventListener('click', () => {
      this.screenShop.classList.add('hidden');
      this.screenStart.classList.remove('hidden');
    });

    document.getElementById('btn-open-settings').addEventListener('click', () => {
      this.screenStart.classList.add('hidden');
      this.screenSettings.classList.remove('hidden');
    });

    document.getElementById('btn-close-settings').addEventListener('click', () => {
      this.screenSettings.classList.add('hidden');
      this.screenStart.classList.remove('hidden');
    });

    document.getElementById('btn-resume').addEventListener('click', () => this.togglePause());
    document.getElementById('btn-quit').addEventListener('click', () => {
      this.togglePause();
      this.endGame();
    });

    // Volume sliders
    document.getElementById('slider-sfx').addEventListener('input', (e) => {
      soundFx.setSFXVolume(parseFloat(e.target.value));
    });
    document.getElementById('slider-music').addEventListener('input', (e) => {
      soundFx.setMusicVolume(parseFloat(e.target.value));
    });
    document.getElementById('chk-screenshake').addEventListener('change', (e) => {
      this.enableScreenShake = e.target.checked;
    });

    // Shop Upgrade Buy Buttons
    ['fireRate', 'shieldMax', 'bulletSpread', 'plasmaBeam', 'magnetRange'].forEach(key => {
      document.getElementById(`btn-buy-${key}`).addEventListener('click', () => {
        if (this.state.buyUpgrade(key)) {
          soundFx.playPowerup();
          this.updateShopUI();
        }
      });
    });
  }

  updateShopUI() {
    document.getElementById('shop-credits').textContent = `⚡ ${this.state.credits}`;

    const upgs = this.state.upgrades;
    for (const key in upgs) {
      const u = upgs[key];
      const cost = this.state.getUpgradeCost(key);
      const lvlElem = document.getElementById(`lvl-${key}`);
      const btnElem = document.getElementById(`btn-buy-${key}`);

      if (key === 'plasmaBeam') {
        lvlElem.textContent = u.level > 0 ? 'UNLOCKED: YES' : 'UNLOCKED: NO';
      } else {
        lvlElem.textContent = `LVL ${u.level} / ${u.maxLevel}`;
      }

      if (u.level >= u.maxLevel) {
        btnElem.textContent = 'MAXED';
        btnElem.disabled = true;
      } else {
        btnElem.textContent = `UPGRADE (⚡ ${cost})`;
        btnElem.disabled = this.state.credits < cost;
      }
    }
  }

  startGame() {
    this.state.resetGame();
    this.particles.clear();

    this.player = new Player(this.width / 2, this.height - 80);
    this.player.applyUpgrades(this.state.upgrades);

    this.enemies = [];
    this.bullets = [];
    this.powerups = [];

    this.screenStart.classList.add('hidden');
    this.screenGameover.classList.add('hidden');
    this.screenPause.classList.add('hidden');
    this.hud.classList.remove('hidden');

    this.isPlaying = true;
    this.isPaused = false;

    soundFx.startMusic();
    this.startWave(1);
  }

  startWave(waveNum) {
    this.enemiesRemainingInWave = 10 + waveNum * 5;
    this.spawnTimer = 0;
    this.particles.addText(this.width / 2, this.height / 2, `WAVE ${waveNum}`, '#ff007f', 32);

    // Spawn Boss on Wave 5, 10, etc.
    if (waveNum % 5 === 0) {
      soundFx.playBossWarning();
      this.enemies.push(new Enemy(this.width / 2, -60, 'boss', waveNum));
    }
  }

  spawnEnemy() {
    if (this.enemiesRemainingInWave <= 0) return;

    const rand = Math.random();
    let type = 'scout';

    if (rand < 0.3) type = 'hunter';
    else if (rand < 0.5) type = 'kamikaze';
    else if (rand < 0.7) type = 'cruiser';

    const spawnX = Math.random() * (this.width - 60) + 30;
    this.enemies.push(new Enemy(spawnX, -30, type, this.state.wave));
    this.enemiesRemainingInWave--;
  }

  triggerScreenShake(intensity = 10) {
    if (!this.enableScreenShake) return;
    this.screenShakeTime = 0.25;
    this.screenShakeIntensity = intensity;
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      this.screenPause.classList.remove('hidden');
    } else {
      this.screenPause.classList.add('hidden');
    }
  }

  endGame() {
    this.isPlaying = false;
    soundFx.stopMusic();

    document.getElementById('go-score').textContent = this.state.score.toLocaleString();
    document.getElementById('go-wave').textContent = this.state.wave;
    document.getElementById('go-credits').textContent = `⚡ ${this.state.totalCredits}`;

    this.hud.classList.add('hidden');
    this.screenGameover.classList.remove('hidden');
    this.startHighScore.textContent = this.state.highScore.toLocaleString();
  }

  loop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    if (this.isPlaying && !this.isPaused) {
      this.update(dt);
    }

    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    this.state.updateMultiplier(dt);

    // Player Update
    this.player.update(dt, this.keys, this.touchPos, this.width, this.height, this.particles, this.bullets);

    // Wave Spawner
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.enemiesRemainingInWave > 0) {
      this.spawnEnemy();
      this.spawnTimer = Math.max(0.4, 1.5 - this.state.wave * 0.1);
    }

    // Next Wave Check
    if (this.enemiesRemainingInWave <= 0 && this.enemies.length === 0) {
      const nextW = this.state.nextWave();
      this.startWave(nextW);
    }

    // Bullets Update
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.update(dt, this.width, this.height);
      if (b.dead) {
        this.bullets.splice(i, 1);
      }
    }

    // Powerups Update
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.update(dt, this.player, this.height);

      if (circleIntersect(p, this.player)) {
        p.dead = true;
        soundFx.playPowerup();
        if (p.type === 'credit') {
          this.state.addCredits(25);
          this.particles.addText(p.x, p.y, '+⚡25 CREDITS', '#ffd700', 14);
        } else if (p.type === 'shield') {
          this.player.heal(30);
          this.particles.addText(p.x, p.y, '+SHIELD REPAIR', '#00ff88', 14);
        }
      }

      if (p.dead) {
        this.powerups.splice(i, 1);
      }
    }

    // Enemies Update & Collisions
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, this.player, this.bullets, this.width, this.height, this.particles);

      // Enemy - Player collision
      if (circleIntersect(e, this.player)) {
        this.player.takeDamage(20);
        this.triggerScreenShake(12);
        this.particles.addExplosion(e.x, e.y, e.color, 20);
        e.dead = true;
      }

      // Enemy - Player Bullet collisions
      for (const b of this.bullets) {
        if (!b.isEnemy && !b.dead && circleIntersect(e, b)) {
          b.dead = true;
          const killed = e.takeDamage(b.damage, this.particles);

          if (killed) {
            soundFx.playExplosion(e.type === 'boss');
            this.triggerScreenShake(e.type === 'boss' ? 18 : 6);

            const scoreGained = this.state.addScore(e.scoreValue);
            this.state.addCredits(e.creditValue);

            this.particles.addExplosion(e.x, e.y, e.color, e.type === 'boss' ? 60 : 25);
            this.particles.addText(e.x, e.y, `+${scoreGained}`, '#00f3ff', 16);

            // Powerup drop chance
            if (Math.random() < 0.35) {
              const pType = Math.random() < 0.7 ? 'credit' : 'shield';
              this.powerups.push(new PowerUp(e.x, e.y, pType));
            }
          }
        }
      }

      if (e.dead) {
        this.enemies.splice(i, 1);
      }
    }

    // Enemy Bullets - Player Collision
    for (const b of this.bullets) {
      if (b.isEnemy && !b.dead && circleIntersect(b, this.player)) {
        b.dead = true;
        this.player.takeDamage(15);
        this.triggerScreenShake(8);
        this.particles.addExplosion(this.player.x, this.player.y, '#ff0055', 15);
      }
    }

    // Game Over Check
    if (this.player.dead) {
      this.endGame();
    }

    // Particle System Update
    this.particles.update(dt);

    // Screen Shake Timer
    if (this.screenShakeTime > 0) {
      this.screenShakeTime -= dt;
    }

    this.updateHUD();
  }

  updateHUD() {
    this.hudScore.textContent = this.state.score.toLocaleString('en-US', { minimumIntegerDigits: 6 });
    this.hudWave.textContent = String(this.state.wave).padStart(2, '0');
    this.hudCredits.textContent = `⚡ ${this.state.credits}`;

    const shieldPct = Math.max(0, Math.round((this.player.shield / this.player.maxShield) * 100));
    this.shieldBarInner.style.width = `${shieldPct}%`;
    this.shieldText.textContent = `${shieldPct}%`;

    this.multiplierBadge.textContent = `${this.state.multiplier.toFixed(1)}x MULTIPLIER`;
  }

  render() {
    this.ctx.save();
    this.ctx.clearRect(0, 0, this.width, this.height);

    // Apply Screen Shake Camera Translation
    if (this.screenShakeTime > 0) {
      const offsetX = (Math.random() - 0.5) * this.screenShakeIntensity;
      const offsetY = (Math.random() - 0.5) * this.screenShakeIntensity;
      this.ctx.translate(offsetX, offsetY);
    }

    // Draw Entities
    for (const p of this.powerups) p.draw(this.ctx);
    for (const b of this.bullets) b.draw(this.ctx);
    for (const e of this.enemies) e.draw(this.ctx);

    if (this.player) this.player.draw(this.ctx);

    this.particles.draw(this.ctx);

    this.ctx.restore();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new GameApp();
});
