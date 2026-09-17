import { describe, it, expect, beforeEach } from 'vitest';
import { GameState } from '../src/engine/state.js';

class MockStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, val) {
    this.store[key] = String(val);
  }
}

describe('GameState Engine', () => {
  let mockStorage;
  let state;

  beforeEach(() => {
    mockStorage = new MockStorage();
    state = new GameState(mockStorage);
  });

  it('initializes with default values', () => {
    expect(state.score).toBe(0);
    expect(state.highScore).toBe(0);
    expect(state.credits).toBe(0);
    expect(state.wave).toBe(1);
    expect(state.multiplier).toBe(1);
  });

  it('addScore increases score and multiplier with combos', () => {
    state.addScore(100);
    expect(state.score).toBe(100);
    expect(state.highScore).toBe(100);

    // Build combo to 5
    for (let i = 0; i < 4; i++) {
      state.addScore(100);
    }
    expect(state.multiplier).toBe(1.5);
    expect(state.score).toBe(100 + 400); // 100 base + 4 * 100 * 1
  });

  it('updateMultiplier decreases timer and resets multiplier on expire', () => {
    state.addScore(100);
    expect(state.multiplierTimer).toBe(3.0);

    state.updateMultiplier(1.5);
    expect(state.multiplierTimer).toBe(1.5);

    state.updateMultiplier(2.0);
    expect(state.multiplierTimer).toBe(0);
    expect(state.multiplier).toBe(1);
  });

  it('credits can be added and spent on upgrades', () => {
    state.addCredits(500);
    expect(state.credits).toBe(500);

    const cost = state.getUpgradeCost('fireRate');
    expect(cost).toBe(100);

    const success = state.buyUpgrade('fireRate');
    expect(success).toBe(true);
    expect(state.credits).toBe(400);
    expect(state.upgrades.fireRate.level).toBe(2);
  });

  it('persists data to storage and reloads properly', () => {
    state.addCredits(300);
    state.addScore(1500);
    state.buyUpgrade('fireRate');

    const newState = new GameState(mockStorage);
    expect(newState.highScore).toBe(1500);
    expect(newState.credits).toBe(200);
    expect(newState.upgrades.fireRate.level).toBe(2);
  });

  it('nextWave increments wave counter', () => {
    expect(state.wave).toBe(1);
    state.nextWave();
    expect(state.wave).toBe(2);
  });
});
