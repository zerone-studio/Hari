import { Bullet } from './bullet.js';
import { soundFx } from '../audio/sound.js';
import { randomRange } from '../utils/math.js';

export class Enemy {
  constructor(x, y, type = 'scout', wave = 1) {
    this.x = x;
    this.y = y;
    this.type = type; // 'scout', 'hunter', 'cruiser', 'kamikaze', 'boss'
    this.dead = false;
    this.shootTimer = randomRange(0.5, 2.0);
    this.time = 0;

    this.configureStats(wave);
  }

  configureStats(wave) {
    const waveMult = 1 + (wave - 1) * 0.15;

    switch (this.type) {
      case 'scout':
        this.hp = Math.round(2 * waveMult);
        this.maxHp = this.hp;
        this.radius = 14;
        this.speed = 150;
        this.scoreValue = 100;
        this.creditValue = 10;
        this.color = '#00ff88'; // Neon Green
        break;

      case 'hunter':
        this.hp = Math.round(5 * waveMult);
        this.maxHp = this.hp;
        this.radius = 18;
        this.speed = 180;
        this.scoreValue = 250;
        this.creditValue = 25;
        this.color = '#ff9900'; // Orange
        break;

      case 'kamikaze':
        this.hp = Math.round(1 * waveMult);
        this.maxHp = this.hp;
        this.radius = 12;
        this.speed = 280;
        this.scoreValue = 150;
        this.creditValue = 15;
        this.color = '#ff0055'; // Neon Red
        break;

      case 'cruiser':
        this.hp = Math.round(18 * waveMult);
        this.maxHp = this.hp;
        this.radius = 28;
        this.speed = 80;
        this.scoreValue = 600;
        this.creditValue = 60;
        this.color = '#b026ff'; // Purple
        break;

      case 'boss':
        this.hp = Math.round(120 * waveMult);
        this.maxHp = this.hp;
        this.radius = 50;
        this.speed = 60;
        this.scoreValue = 3000;
        this.creditValue = 300;
        this.color = '#ff007f'; // Neon Magenta
        this.phase = 1;
        break;
    }
  }

  update(dt, player, bullets, canvasWidth, canvasHeight, particleManager) {
    this.time += dt;
    this.shootTimer -= dt;

    if (this.type === 'scout') {
      // Zig zag downward motion
      this.y += this.speed * dt;
      this.x += Math.sin(this.time * 4) * 120 * dt;

      if (this.shootTimer <= 0) {
        bullets.push(new Bullet(this.x, this.y + 10, 0, 260, this.color, 4, 1, true));
        this.shootTimer = randomRange(1.8, 3.2);
      }
    } else if (this.type === 'hunter') {
      // Tracks player x position while moving down
      this.y += this.speed * dt * 0.7;
      if (player) {
        const dx = player.x - this.x;
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), 140 * dt);
      }

      if (this.shootTimer <= 0 && player) {
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        bullets.push(new Bullet(this.x, this.y + 10, Math.cos(angle) * 280, Math.sin(angle) * 280, this.color, 4, 1, true));
        this.shootTimer = randomRange(1.5, 2.5);
      }
    } else if (this.type === 'kamikaze') {
      // Dives directly at player at high speed
      if (player) {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const len = Math.hypot(dx, dy);
        if (len > 0) {
          this.x += (dx / len) * this.speed * dt;
          this.y += (dy / len) * this.speed * dt;
        }
      } else {
        this.y += this.speed * dt;
      }
      if (particleManager) {
        particleManager.addThrust(this.x, this.y - 10, -Math.PI / 2, this.color);
      }
    } else if (this.type === 'cruiser') {
      // Moves slowly down, fires 3-bullet fan spread
      this.y += this.speed * dt;

      if (this.shootTimer <= 0) {
        [-0.3, 0, 0.3].forEach(ang => {
          bullets.push(new Bullet(this.x, this.y + 15, Math.sin(ang) * 220, Math.cos(ang) * 220, this.color, 5, 1, true));
        });
        this.shootTimer = randomRange(2.0, 3.5);
      }
    } else if (this.type === 'boss') {
      // Moves into top area and hovers side to side
      if (this.y < 120) {
        this.y += this.speed * dt;
      } else {
        this.x += Math.sin(this.time * 1.5) * 100 * dt;
      }

      // Dynamic Boss Phases based on HP %
      const hpPct = this.hp / this.maxHp;
      if (hpPct < 0.4 && this.phase === 1) {
        this.phase = 2;
        soundFx.playBossWarning();
      }

      if (this.shootTimer <= 0) {
        if (this.phase === 1) {
          // Circular ring bullet attack
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2 + this.time;
            bullets.push(new Bullet(this.x, this.y, Math.cos(ang) * 200, Math.sin(ang) * 200, '#ff007f', 5, 1, true));
          }
          this.shootTimer = 2.0;
        } else {
          // Intense Phase 2 spiral attack
          for (let i = 0; i < 12; i++) {
            const ang = (i / 12) * Math.PI * 2 + this.time * 2;
            bullets.push(new Bullet(this.x, this.y, Math.cos(ang) * 240, Math.sin(ang) * 240, '#00f3ff', 5, 1, true));
          }
          this.shootTimer = 1.2;
        }
      }
    }

    // Despawn off bottom screen (non-boss)
    if (this.type !== 'boss' && this.y > canvasHeight + 50) {
      this.dead = true;
    }
  }

  takeDamage(dmg, particleManager) {
    this.hp -= dmg;
    if (particleManager) {
      particleManager.addText(this.x + (Math.random() - 0.5) * 20, this.y - 10, `-${dmg}`, '#ffffff', 12);
    }

    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  draw(ctx) {
    if (this.dead) return;

    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 12;
    ctx.shadowColor = this.color;

    if (this.type === 'scout') {
      ctx.beginPath();
      ctx.moveTo(0, 14);
      ctx.lineTo(-12, -10);
      ctx.lineTo(0, -4);
      ctx.lineTo(12, -10);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (this.type === 'hunter') {
      ctx.beginPath();
      ctx.moveTo(0, 18);
      ctx.lineTo(-16, -14);
      ctx.lineTo(16, -14);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (this.type === 'kamikaze') {
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (this.type === 'cruiser') {
      ctx.beginPath();
      ctx.rect(-24, -20, 48, 40);
      ctx.fill();
      ctx.stroke();
    } else if (this.type === 'boss') {
      ctx.beginPath();
      ctx.moveTo(0, 45);
      ctx.lineTo(-45, -25);
      ctx.lineTo(-20, -45);
      ctx.lineTo(20, -45);
      ctx.lineTo(45, -25);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Boss HP Bar
      const barWidth = 80;
      const barHeight = 6;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(-barWidth / 2, -60, barWidth, barHeight);
      ctx.fillStyle = this.phase === 2 ? '#00f3ff' : '#ff007f';
      ctx.fillRect(-barWidth / 2, -60, barWidth * (this.hp / this.maxHp), barHeight);
    }

    ctx.restore();
  }
}
