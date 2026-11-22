// Guards: patrol waypoints, state machine (PATROL -> SUSPICIOUS -> ALERTED
// -> SEARCH -> PATROL) and the chase. Pure simulation — no DOM, no audio —
// so the balance sims can import it in Node.
import { GUARD } from './config.js';
import { playerVisible, updateDetection } from './detection.js';
import { circleHitsRects } from './level.js';

export const STATE_PATROL = 'patrol';
export const STATE_SUSPICIOUS = 'suspicious';
export const STATE_ALERTED = 'alerted';
export const STATE_SEARCH = 'search';

export function createGuard(def) {
  const first = def.waypoints[def.startIndex];
  const next = def.waypoints[(def.startIndex + 1) % def.waypoints.length];
  return {
    name: def.name,
    x: first.x,
    y: first.y,
    dir: Math.atan2(next.y - first.y, next.x - first.x),
    speed: def.speed,
    waypoints: def.waypoints,
    wpIndex: (def.startIndex + 1) % def.waypoints.length,
    state: STATE_PATROL,
    stateTime: 0,
    detection: 0,
    pauseLeft: 0,
    lookDir: 0,
    investigate: null,
    lastSeen: null,
    chaseLost: 0,
    steps: 0,
    stepTimer: 0,
    stepped: false,
  };
}

/** Move toward (tx, ty) at `speed`, sliding along solid rects; returns true
 *  when the target is reached. Facing turns toward the movement. */
function moveToward(guard, tx, ty, speed, solids, dt) {
  const dx = tx - guard.x;
  const dy = ty - guard.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return true;
  const step = Math.min(dist, speed * dt);
  const nx = guard.x + (dx / dist) * step;
  const ny = guard.y + (dy / dist) * step;
  guard.dir = Math.atan2(dy, dx);
  // Slide: try the full step, then each axis alone.
  if (!circleHitsRects(nx, ny, 12, solids)) {
    guard.x = nx;
    guard.y = ny;
  } else if (!circleHitsRects(nx, guard.y, 12, solids)) {
    guard.x = nx;
  } else if (!circleHitsRects(guard.x, ny, 12, solids)) {
    guard.y = ny;
  }
  guard.stepped = true;
  return dist <= step + 2;
}

function lookAround(guard, dt) {
  guard.lookDir += dt * 1.6;
  guard.dir = guard.lookDir;
}

/**
 * Advance one guard for a step. `events` collects what happened: 'spotted'
 * (a guard turned alerted this step), 'step' (a footstep tick for audio).
 * Returns the events object.
 */
export function updateGuardState(guard, player, level, solids, blockers, dt, events) {
  guard.stateTime += dt;
  guard.stepped = false;
  const visible = playerVisible(guard, player.x, player.y, blockers);
  const wasAlerted = guard.state === STATE_ALERTED;

  // The detection meter runs in every state; a full meter means ALERTED.
  updateDetection(guard, player.x, player.y, player.sneaking, level, blockers, dt);
  if (guard.detection >= 100 && guard.state !== STATE_ALERTED) {
    guard.state = STATE_ALERTED;
    guard.stateTime = 0;
    guard.chaseLost = 0;
    guard.lastSeen = { x: player.x, y: player.y };
    events.spotted = true;
  }

  if (guard.state === STATE_PATROL) {
    if (guard.pauseLeft > 0) {
      guard.pauseLeft -= dt;
      lookAround(guard, dt);
    } else {
      const target = guard.waypoints[guard.wpIndex];
      if (moveToward(guard, target.x, target.y, guard.speed, solids, dt)) {
        guard.wpIndex = (guard.wpIndex + 1) % guard.waypoints.length;
        guard.pauseLeft = 1.2;
        guard.lookDir = guard.dir;
      }
    }
    // A glimpse (half meter) makes a patrolling guard turn suspicious.
    if (guard.detection >= GUARD.suspiciousAt) {
      guard.state = STATE_SUSPICIOUS;
      guard.stateTime = 0;
      guard.investigate = { x: player.x, y: player.y };
    }
  } else if (guard.state === STATE_SUSPICIOUS) {
    if (guard.investigate) {
      if (moveToward(guard, guard.investigate.x, guard.investigate.y, guard.speed * 1.15, solids, dt)) {
        guard.investigate = null;
        guard.lookDir = guard.dir;
      }
    } else {
      lookAround(guard, dt);
      if (guard.stateTime > GUARD.suspiciousLook + 1.2) {
        guard.state = STATE_PATROL;
        guard.stateTime = 0;
        guard.pauseLeft = 0.5;
      }
    }
    if (visible) guard.lastSeen = { x: player.x, y: player.y };
  } else if (guard.state === STATE_ALERTED) {
    if (visible) {
      guard.lastSeen = { x: player.x, y: player.y };
      guard.chaseLost = 0;
      moveToward(guard, player.x, player.y, GUARD.chaseSpeed, solids, dt);
    } else {
      guard.chaseLost += dt;
      if (guard.lastSeen) moveToward(guard, guard.lastSeen.x, guard.lastSeen.y, GUARD.chaseSpeed, solids, dt);
      if (guard.chaseLost > GUARD.chaseMemory) {
        guard.state = STATE_SEARCH;
        guard.stateTime = 0;
      }
    }
  } else if (guard.state === STATE_SEARCH) {
    if (guard.lastSeen) {
      if (moveToward(guard, guard.lastSeen.x, guard.lastSeen.y, guard.speed * 1.2, solids, dt)) {
        guard.lastSeen = null;
        guard.lookDir = guard.dir;
      }
    } else {
      lookAround(guard, dt);
      if (guard.stateTime > GUARD.searchTime + 1.5) {
        guard.state = STATE_PATROL;
        guard.stateTime = 0;
        guard.pauseLeft = 0.5;
      }
    }
  }

  // Footstep tick: one per stride while the guard is moving.
  if (guard.stepped) {
    guard.stepTimer -= dt;
    if (guard.stepTimer <= 0) {
      guard.stepTimer = guard.state === STATE_ALERTED ? 0.32 : 0.55;
      guard.steps += 1;
      events.step = true;
    }
  }
  if (!wasAlerted && guard.state === STATE_ALERTED) events.spotted = true;
  return events;
}

/** Send a guard to investigate a noise (a pebble landing). */
export function investigateNoise(guard, x, y) {
  if (guard.state === STATE_ALERTED) return;
  guard.state = STATE_SUSPICIOUS;
  guard.stateTime = 0;
  guard.investigate = { x, y };
  guard.detection = Math.max(guard.detection, 30);
}

/** Reset a guard to its spawn, patrolling, unseen. */
export function resetGuard(guard, def) {
  const start = def.waypoints[def.startIndex];
  const next = def.waypoints[(def.startIndex + 1) % def.waypoints.length];
  guard.x = start.x;
  guard.y = start.y;
  guard.dir = Math.atan2(next.y - start.y, next.x - start.x);
  guard.wpIndex = (def.startIndex + 1) % def.waypoints.length;
  guard.state = STATE_PATROL;
  guard.stateTime = 0;
  guard.detection = 0;
  guard.pauseLeft = 0;
  guard.investigate = null;
  guard.lastSeen = null;
  guard.chaseLost = 0;
}
