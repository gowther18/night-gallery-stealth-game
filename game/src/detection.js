// Line of sight, vision cones and the detection meter. Pure geometry and
// arithmetic — no DOM, no audio — so the balance sims can import it in Node.
import { GUARD, LIGHT } from './config.js';
import { pointInRects } from './level.js';

/** Distance from (x0, y0) along direction (dx, dy) to the first hit on a
 *  rectangle, or Infinity when the ray misses it. */
function rayHitRect(x0, y0, dx, dy, rect) {
  let tMin = 0;
  let tMax = Infinity;
  const axes = [
    { o: x0, d: dx, min: rect.x, max: rect.x + rect.w },
    { o: y0, d: dy, min: rect.y, max: rect.y + rect.h },
  ];
  for (let i = 0; i < 2; i += 1) {
    const a = axes[i];
    if (Math.abs(a.d) < 1e-9) {
      if (a.o < a.min || a.o > a.max) return Infinity;
    } else {
      let t1 = (a.min - a.o) / a.d;
      let t2 = (a.max - a.o) / a.d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
      if (tMin > tMax) return Infinity;
    }
  }
  return tMin;
}

/** Nearest distance along the ray to any of the rectangles, or Infinity. */
export function raycast(x0, y0, dx, dy, rects) {
  let best = Infinity;
  for (let i = 0; i < rects.length; i += 1) {
    const hit = rayHitRect(x0, y0, dx, dy, rects[i]);
    if (hit < best) best = hit;
  }
  return best;
}

/** True when a wall or cover rectangle sits between (x0, y0) and (x1, y1). */
export function lineOfSightBlocked(x0, y0, x1, y1, blockers) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return false;
  const hit = raycast(x0, y0, dx / dist, dy / dist, blockers);
  return hit < dist;
}

/** All rectangles that block sight: walls plus every cover piece (the rope
 *  blocks sight too — the player ducks under it, the guard's eyes don't). */
export function sightBlockers(level) {
  return level.walls.concat(level.cover);
}

/** The light factor at a point: shadow slows detection, lit floor and the
 *  carpet speed it up. */
export function lightFactorAt(x, y, level) {
  if (pointInRects(x, y, level.shadows)) return LIGHT.shadowFactor;
  const c = level.carpet;
  if (x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return LIGHT.litFactor;
  if (pointInRects(x, y, level.lightPools)) return LIGHT.litFactor;
  return 1;
}

/** True when the player at (px, py) is inside the guard's cone with a clear
 *  line of sight. */
export function playerVisible(guard, px, py, blockers) {
  const dx = px - guard.x;
  const dy = py - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist > GUARD.coneRange) return false;
  if (dist < 1e-6) return true;
  const angle = Math.atan2(dy, dx);
  let diff = angle - guard.dir;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  if (Math.abs(diff) > GUARD.coneAngle / 2) return false;
  return !lineOfSightBlocked(guard.x, guard.y, px, py, blockers);
}

/** The vision cone as a polygon (guard position + raycast edge points), for
 *  rendering and for the autopilot's danger map. */
export function castVisionCone(guard, blockers) {
  const points = [{ x: guard.x, y: guard.y }];
  for (let i = 0; i <= GUARD.coneRays; i += 1) {
    const angle = guard.dir - GUARD.coneAngle / 2 + (GUARD.coneAngle * i) / GUARD.coneRays;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const hit = raycast(guard.x, guard.y, dx, dy, blockers);
    const reach = Math.min(hit, GUARD.coneRange);
    points.push({ x: guard.x + dx * reach, y: guard.y + dy * reach });
  }
  return points;
}

/** True when the point is inside the guard's cone (range + angle + sight). */
export function pointInCone(guard, x, y, blockers) {
  return playerVisible(guard, x, y, blockers);
}

/**
 * Advance one guard's detection meter for a step. Returns how much the meter
 * moved (positive = filling). A visible player fills it by proximity, light
 * and sneak; a hidden player drains it.
 */
export function updateDetection(guard, px, py, sneaking, level, blockers, dt) {
  const visible = playerVisible(guard, px, py, blockers);
  if (visible) {
    const dist = Math.hypot(px - guard.x, py - guard.y);
    const proximity = 1 - dist / GUARD.coneRange;
    let rate = (GUARD.detectBase + GUARD.detectClose * proximity) * lightFactorAt(px, py, level);
    if (sneaking) rate *= LIGHT.sneakFactor;
    guard.detection = Math.min(100, guard.detection + rate * dt);
    return rate * dt;
  }
  guard.detection = Math.max(0, guard.detection - GUARD.detectDrain * dt);
  return -GUARD.detectDrain * dt;
}
