import { describe, it, expect } from 'vitest';
import {
  clamp,
  lerp,
  distance,
  distanceSq,
  angleTo,
  circleIntersect,
  pointInCircle,
  boxIntersect,
  circleBoxIntersect,
  lineCircleIntersect
} from '../src/utils/math.js';

describe('Math utilities', () => {
  it('clamp restricts values to min/max', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('lerp interpolates correctly', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('distance calculations are accurate', () => {
    expect(distance(0, 0, 3, 4)).toBe(5);
    expect(distanceSq(0, 0, 3, 4)).toBe(25);
  });

  it('angleTo computes correct radians', () => {
    expect(angleTo(0, 0, 10, 0)).toBe(0);
    expect(angleTo(0, 0, 0, 10)).toBeCloseTo(Math.PI / 2);
  });

  it('circleIntersect detects overlap', () => {
    const c1 = { x: 0, y: 0, radius: 10 };
    const c2 = { x: 15, y: 0, radius: 10 };
    const c3 = { x: 25, y: 0, radius: 10 };

    expect(circleIntersect(c1, c2)).toBe(true);
    expect(circleIntersect(c1, c3)).toBe(false);
  });

  it('pointInCircle works as expected', () => {
    const circle = { x: 5, y: 5, radius: 5 };
    expect(pointInCircle(5, 5, circle)).toBe(true);
    expect(pointInCircle(12, 12, circle)).toBe(false);
  });

  it('boxIntersect detects rectangle collisions', () => {
    const r1 = { x: 0, y: 0, w: 10, h: 10 };
    const r2 = { x: 5, y: 5, w: 10, h: 10 };
    const r3 = { x: 20, y: 20, w: 10, h: 10 };

    expect(boxIntersect(r1, r2)).toBe(true);
    expect(boxIntersect(r1, r3)).toBe(false);
  });

  it('circleBoxIntersect detects overlap between circle and box', () => {
    const box = { x: 10, y: 10, w: 20, h: 20 };
    const c1 = { x: 5, y: 15, radius: 10 };
    const c2 = { x: 0, y: 0, radius: 5 };

    expect(circleBoxIntersect(c1, box)).toBe(true);
    expect(circleBoxIntersect(c2, box)).toBe(false);
  });

  it('lineCircleIntersect detects ray/beam hits', () => {
    const circle = { x: 5, y: 5, radius: 2 };
    const p1 = { x: 0, y: 5 };
    const p2 = { x: 10, y: 5 };
    const p3 = { x: 0, y: 0 };
    const p4 = { x: 10, y: 0 };

    expect(lineCircleIntersect(p1, p2, circle)).toBe(true);
    expect(lineCircleIntersect(p3, p4, circle)).toBe(false);
  });
});
