import { Bullet } from './bullet.js';
import { soundFx } from '../audio/sound.js';
import { clamp } from '../utils/math.js';

export class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.radius = 18;
    this.speed = 320;

    this.maxShield = 100;
    this.shield = 100;
    this.invulnerableTimer = 0;

    this.fireTimer = 0;
    this.fireRateLevel = 1;
    this.spreadLevel = 1;
    this.hasBeam = false;
    this.magnetRange = 100;

    this.tilt = 0; // visual lean
    this.dead = false;
  }

  applyUpgrades(upgrades) {
    if (!upgrades) return;
    this.fireRateLevel = upgrades.fireRate ? upgrades.fireRate.level : 1;
    this.spreadLevel = upgrades.bulletSpread ? upgrades.bulletSpread.level : 1;
    this.hasBeam = upgrades.plasmaBeam ? upgrades.plasmaBeam.level > 0 : false;
    this.maxShield = 100 + (upgrades.shieldMax ? (upgrades.shieldMax.level - 1) * 25 : 0);
    this.magnetRange = 80 + (upgrades.magnetRange ? upgrades.magnetRange.level * 40 : 40);
    this.shield = Math.min(this.shield, this.maxShield);
  }

  update(dt, keys, touchPos, canvasWidth, canvasHeight, particleManager, bullets) {
    let dx = 0;
    let dy = 0;

    if (keys['ArrowLeft'] || keys['KeyA']) dx -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) dx += 1;
    if (keys['ArrowUp'] || keys['KeyW']) dy -= 1;
    if (keys['ArrowDown'] || keys['KeyS']) dy += 1;

    // Direct touch / mouse tracking
    if (touchPos) {
      const tx = touchPos.x - this.x;
      const ty = touchPos.y - this.y;
      const dist = Math.hypot(tx, ty);
      if (dist > 5) {
        dx = tx / dist;
        dy = ty / dist;
      }
    }

    // Normalize diagonal velocity
    if (dx !== 0 && dy !== 0 && !touchPos) {
      dx *= 0.7071;
      dy *= 0.7071;
    }

    this.x += dx * this.speed * dt;
    this.y += dy * this.speed * dt;

    this.x = clamp(this.x, this.radius, canvasWidth - this.radius);
    this.y = clamp(this.y, this.radius, canvasHeight - this.radius);

    // Visual tilt
    this.tilt = dx * 0.3;

    // Thruster particles
    if (particleManager) {
      particleManager.addThrust(this.x, this.y + 16, Math.PI / 2, '#00f3ff');
    }

    // Invulnerability timer
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer -= dt;
    }

    // Weapon Auto Firing
    this.fireTimer -= dt;
    const cooldown = Math.max(0.08, 0.25 - (this.fireRateLevel - 1) * 0.035);

    if ((keys['Space'] || touchPos || keys['KeyZ']) && this.fireTimer <= 0) {
      this.shoot(bullets);
      this.fireTimer = cooldown;
    }
  }

  shoot(bullets) {
    soundFx.playLaser(900, 0.12, 'sawtooth');

    const bSpeed = 650;
    if (this.spreadLevel === 1) {
      bullets.push(new Bullet(this.x, this.y - 15, 0, -bSpeed, '#00f3ff', 4, 1));
    } else if (this.spreadLevel === 2) {
      bullets.push(new Bullet(this.x - 8, this.y - 12, -40, -bSpeed, '#00f3ff', 4, 1));
      bullets.push(new Bullet(this.x + 8, this.y - 12, 40, -bSpeed, '#00f3ff', 4, 1));
    } else {
      // 3-way spread
      bullets.push(new Bullet(this.x, this.y - 15, 0, -bSpeed, '#00f3ff', 5, 1));
      bullets.push(new Bullet(this.x - 12, this.y - 10, -100, -bSpeed * 0.95, '#00f3ff', 4, 1));
      bullets.push(new Bullet(this.x + 12, this.y - 10, 100, -bSpeed * 0.95, '#00f3ff', 4, 1));
    }

    // Heavy Plasma Beam sub-weapon
    if (this.hasBeam && Math.random() < 0.4) {
      soundFx.playPlasma();
      bullets.push(new Bullet(this.x, this.y - 20, 0, -850, '#ff007f', 7, 2.5));
    }
  }

  takeDamage(amount) {
    if (this.invulnerableTimer > 0) return false;

    this.shield -= amount;
    this.invulnerableTimer = 0.5; // half second I-frames
    soundFx.playShieldHit();

    if (this.shield <= 0) {
      this.shield = 0;
      this.dead = true;
      soundFx.playExplosion(true);
    }
    return true;
  }

  heal(amount) {
    this.shield = Math.min(this.maxShield, this.shield + amount);
  }

  draw(ctx) {
    if (this.dead) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.tilt);

    // Invulnerability flashing
    if (this.invulnerableTimer > 0 && Math.floor(Date.now() / 50) % 2 === 0) {
      ctx.globalAlpha = 0.4;
    }

    // Ship Cyberpunk Hull
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f3ff';

    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(16, 14);
    ctx.lineTo(8, 10);
    ctx.lineTo(0, 16);
    ctx.lineTo(-8, 10);
    ctx.lineTo(-16, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit Glow
    ctx.fillStyle = '#ff007f';
    ctx.shadowColor = '#ff007f';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, -4, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
