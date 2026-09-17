export class Bullet {
  constructor(x, y, vx, vy, color = '#00f3ff', radius = 4, damage = 1, isEnemy = false) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.radius = radius;
    this.damage = damage;
    this.isEnemy = isEnemy;
    this.dead = false;
  }

  update(dt, canvasWidth, canvasHeight) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (
      this.x < -20 ||
      this.x > canvasWidth + 20 ||
      this.y < -20 ||
      this.y > canvasHeight + 20
    ) {
      this.dead = true;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 12;
    ctx.shadowColor = this.color;

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Laser trail line
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 0) {
      const tailLength = Math.min(20, speed * 0.03);
      const nx = this.vx / speed;
      const ny = this.vy / speed;

      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.radius * 1.5;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.x - nx * tailLength, this.y - ny * tailLength);
      ctx.stroke();
    }

    ctx.restore();
  }
}

export class PowerUp {
  constructor(x, y, type = 'credit') {
    this.x = x;
    this.y = y;
    this.type = type; // 'credit', 'shield', 'multiplier'
    this.radius = 8;
    this.vy = 60;
    this.dead = false;
    this.angle = 0;

    if (type === 'credit') {
      this.color = '#ffd700'; // Gold
      this.symbol = '⚡';
    } else if (type === 'shield') {
      this.color = '#00ff88'; // Neon Green
      this.symbol = '🛡️';
    } else {
      this.color = '#ff00ff'; // Neon Magenta
      this.symbol = '★';
    }
  }

  update(dt, player, canvasHeight) {
    this.angle += dt * 3;
    this.y += this.vy * dt;

    // Magnet effect towards player if close
    if (player && player.magnetRange > 0) {
      const dx = player.x - this.x;
      const dy = player.y - this.y;
      const dist = Math.hypot(dx, dy);
      if (dist < player.magnetRange) {
        const pull = (1 - dist / player.magnetRange) * 300;
        this.x += (dx / dist) * pull * dt;
        this.y += (dy / dist) * pull * dt;
      }
    }

    if (this.y > canvasHeight + 20) {
      this.dead = true;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.sin(this.angle) * 0.2);

    ctx.fillStyle = this.color;
    ctx.shadowBlur = 12;
    ctx.shadowColor = this.color;

    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.symbol, 0, 0);

    ctx.restore();
  }
}
