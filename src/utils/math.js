export function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

export function lerp(start, end, amt) {
  return (1 - amt) * start + amt * end;
}

export function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.hypot(dx, dy);
}

export function distanceSq(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return dx * dx + dy * dy;
}

export function angleTo(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

export function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

export function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function circleIntersect(c1, c2) {
  const distSq = distanceSq(c1.x, c1.y, c2.x, c2.y);
  const rSum = c1.radius + c2.radius;
  return distSq <= rSum * rSum;
}

export function pointInCircle(px, py, circle) {
  return distanceSq(px, py, circle.x, circle.y) <= circle.radius * circle.radius;
}

export function boxIntersect(r1, r2) {
  return !(
    r1.x + r1.w < r2.x ||
    r1.x > r2.x + r2.w ||
    r1.y + r1.h < r2.y ||
    r1.y > r2.y + r2.h
  );
}

export function circleBoxIntersect(circle, box) {
  const closestX = clamp(circle.x, box.x, box.x + box.w);
  const closestY = clamp(circle.y, box.y, box.y + box.h);
  return pointInCircle(closestX, closestY, circle);
}

export function lineCircleIntersect(p1, p2, circle) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return pointInCircle(p1.x, p1.y, circle);

  const u = clamp(((circle.x - p1.x) * dx + (circle.y - p1.y) * dy) / (len * len), 0, 1);
  const nearestX = p1.x + u * dx;
  const nearestY = p1.y + u * dy;

  return pointInCircle(nearestX, nearestY, circle);
}
