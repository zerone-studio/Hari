export class GameState {
  constructor(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
    this.storage = storage;

    this.score = 0;
    this.highScore = 0;
    this.credits = 0;
    this.totalCredits = 0;
    this.wave = 1;
    this.multiplier = 1;
    this.multiplierTimer = 0;
    this.combo = 0;

    // Upgrades state
    this.upgrades = {
      fireRate: { level: 1, maxLevel: 5, baseCost: 100, costMultiplier: 1.8 },
      shieldMax: { level: 1, maxLevel: 5, baseCost: 150, costMultiplier: 2.0 },
      bulletSpread: { level: 1, maxLevel: 3, baseCost: 250, costMultiplier: 2.5 },
      plasmaBeam: { level: 0, maxLevel: 1, baseCost: 500, costMultiplier: 1.0 },
      magnetRange: { level: 1, maxLevel: 5, baseCost: 80, costMultiplier: 1.5 }
    };

    this.load();
  }

  resetGame() {
    this.score = 0;
    this.wave = 1;
    this.multiplier = 1;
    this.multiplierTimer = 0;
    this.combo = 0;
  }

  addScore(points) {
    const totalPoints = Math.round(points * this.multiplier);
    this.score += totalPoints;

    this.combo += 1;
    this.multiplier = Math.min(8, 1 + Math.floor(this.combo / 5) * 0.5);
    this.multiplierTimer = 3.0; // seconds before multiplier resets

    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.save();
    }
    return totalPoints;
  }

  updateMultiplier(dt) {
    if (this.multiplierTimer > 0) {
      this.multiplierTimer -= dt;
      if (this.multiplierTimer <= 0) {
        this.multiplier = 1;
        this.combo = 0;
        this.multiplierTimer = 0;
      }
    }
  }

  addCredits(amount) {
    this.credits += amount;
    this.totalCredits += amount;
    this.save();
  }

  getUpgradeCost(key) {
    const upg = this.upgrades[key];
    if (!upg) return Infinity;
    if (upg.level >= upg.maxLevel) return Infinity;
    return Math.round(upg.baseCost * Math.pow(upg.costMultiplier, upg.level - (upg.baseCost === 500 && upg.level === 0 ? 0 : 1)));
  }

  buyUpgrade(key) {
    const upg = this.upgrades[key];
    if (!upg) return false;
    const cost = this.getUpgradeCost(key);
    if (this.credits >= cost && upg.level < upg.maxLevel) {
      this.credits -= cost;
      upg.level += 1;
      this.save();
      return true;
    }
    return false;
  }

  nextWave() {
    this.wave += 1;
    return this.wave;
  }

  save() {
    if (!this.storage) return;
    try {
      const data = {
        highScore: this.highScore,
        credits: this.credits,
        totalCredits: this.totalCredits,
        upgrades: this.upgrades
      };
      this.storage.setItem('synth_invaders_data', JSON.stringify(data));
    } catch (e) {
      console.warn('Unable to save to localStorage:', e);
    }
  }

  load() {
    if (!this.storage) return;
    try {
      const raw = this.storage.getItem('synth_invaders_data');
      if (raw) {
        const data = JSON.parse(raw);
        if (data.highScore !== undefined) this.highScore = data.highScore;
        if (data.credits !== undefined) this.credits = data.credits;
        if (data.totalCredits !== undefined) this.totalCredits = data.totalCredits;
        if (data.upgrades) {
          for (const key in data.upgrades) {
            if (this.upgrades[key]) {
              this.upgrades[key].level = data.upgrades[key].level;
            }
          }
        }
      }
    } catch (e) {
      console.warn('Unable to load from localStorage:', e);
    }
  }
}
