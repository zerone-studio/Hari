export class Particle {
  constructor(x, y, vx, vy, color, size, life, shape = 'circle') {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.maxLife = life;
    this.life = life;
    this.shape = shape; // 'circle', 'line', 'star'
    this.angle = Math.random() * Math.PI * 2;
    this.vRot = (Math.random() - 0.5) * 0.2;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    this.angle += this.vRot;
    this.vx *= 0.98; // Friction
    this.vy *= 0.98;
  }

  draw(ctx) {
    if (this.life <= 0) return;
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.strokeStyle = this.color;
    ctx.shadowBlur = 10;
    ctx.shadowColor = this.color;

    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    if (this.shape === 'line') {
      ctx.lineWidth = this.size;
      ctx.beginPath();
      ctx.moveTo(-this.size * 2, 0);
      ctx.lineTo(this.size * 2, 0);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(0.5, this.size * alpha), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export class FloatingText {
  constructor(x, y, text, color = '#00f3ff', fontSize = 16) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.fontSize = fontSize;
    this.life = 1.0;
    this.maxLife = 1.0;
    this.vy = -40; // float upwards
  }

  update(dt) {
    this.y += this.vy * dt;
    this.life -= dt;
  }

  draw(ctx) {
    if (this.life <= 0) return;
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = this.color;
    ctx.font = `bold ${this.fontSize}px 'Orbitron', 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

export class ParticleManager {
  constructor() {
    this.particles = [];
    this.floatingTexts = [];
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.update(dt);
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.update(dt);
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }
  }

  draw(ctx) {
    for (const p of this.particles) {
      p.draw(ctx);
    }
    for (const ft of this.floatingTexts) {
      ft.draw(ctx);
    }
  }

  addExplosion(x, y, color = '#ff007f', count = 30, speed = 200) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = (Math.random() * 0.8 + 0.2) * speed;
      const vx = Math.cos(angle) * spd;
      const vy = Math.sin(angle) * spd;
      const size = Math.random() * 4 + 2;
      const life = Math.random() * 0.5 + 0.3;
      const shape = Math.random() > 0.5 ? 'line' : 'circle';
      this.particles.push(new Particle(x, y, vx, vy, color, size, life, shape));
    }
  }

  addThrust(x, y, dirAngle, color = '#00f3ff') {
    const spread = 0.4;
    const angle = dirAngle + Math.PI + (Math.random() - 0.5) * spread;
    const spd = Math.random() * 120 + 60;
    const vx = Math.cos(angle) * spd;
    const vy = Math.sin(angle) * spd;
    const size = Math.random() * 3 + 1.5;
    const life = Math.random() * 0.2 + 0.1;
    this.particles.push(new Particle(x, y, vx, vy, color, size, life, 'circle'));
  }

  addText(x, y, text, color = '#00f3ff', fontSize = 16) {
    this.floatingTexts.push(new FloatingText(x, y, text, color, fontSize));
  }

  clear() {
    this.particles = [];
    this.floatingTexts = [];
  }
}
