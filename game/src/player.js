// Wren, the cat burglar: movement (walk/sneak), the pebble toss, loot and
// lives. Pure simulation — no DOM, no audio — so the balance sims can import
// it in Node.
import { PLAYER, SCORE } from './config.js';
import { circleHitsRects } from './level.js';

export function createPlayer(start) {
  return {
    x: start.x,
    y: start.y,
    sneaking: false,
    moving: false,
    pebbles: PLAYER.pebbles,
    pebbleCooldown: 0,
    hasOpal: false,
    loot: 0,
    lives: 3,
    caught: 0,
    alertedEver: false,
    facing: -Math.PI / 2,
  };
}

/** Move the player by a unit direction for a step, sliding along solids. */
export function movePlayer(player, dx, dy, sneaking, solids, dt) {
  const speed = sneaking ? PLAYER.sneakSpeed : PLAYER.walkSpeed;
  player.sneaking = sneaking;
  const len = Math.hypot(dx, dy);
  player.moving = len > 0.01;
  if (!player.moving) return;
  const step = speed * dt;
  const nx = player.x + (dx / len) * step;
  const ny = player.y + (dy / len) * step;
  player.facing = Math.atan2(dy, dx);
  if (!circleHitsRects(nx, ny, PLAYER.radius, solids)) {
    player.x = nx;
    player.y = ny;
  } else if (!circleHitsRects(nx, player.y, PLAYER.radius, solids)) {
    player.x = nx;
  } else if (!circleHitsRects(player.x, ny, PLAYER.radius, solids)) {
    player.y = ny;
  }
}

/**
 * Toss a pebble toward (tx, ty), clamped to pebble range. Returns the
 * landing point, or null when out of pebbles / on cooldown.
 */
export function tossPebble(player, tx, ty) {
  if (player.pebbles <= 0 || player.pebbleCooldown > 0) return null;
  const dx = tx - player.x;
  const dy = ty - player.y;
  const dist = Math.hypot(dx, dy);
  const reach = Math.min(dist, PLAYER.pebbleRange);
  const landing = {
    x: player.x + (dist > 1e-6 ? (dx / dist) * reach : 0),
    y: player.y + (dist > 1e-6 ? (dy / dist) * reach : 0),
  };
  player.pebbles -= 1;
  player.pebbleCooldown = 0.5;
  return landing;
}

/** Pick up loot / the Opal within reach. Returns the points gained. */
export function collectNearby(player, level) {
  let gained = 0;
  for (const item of level.loot) {
    if (!item.taken && Math.hypot(item.x - player.x, item.y - player.y) < PLAYER.pickupRadius) {
      item.taken = true;
      player.loot += 1;
      gained += SCORE.loot;
    }
  }
  if (
    !player.hasOpal &&
    Math.hypot(level.plinth.x - player.x, level.plinth.y - player.y) < PLAYER.pickupRadius + 6
  ) {
    player.hasOpal = true;
    gained += SCORE.opal;
  }
  return gained;
}

/** True when the player stands at the skylight exit holding the Opal. */
export function atExit(player, level) {
  return (
    player.hasOpal && Math.hypot(level.exit.x - player.x, level.exit.y - player.y) < 42
  );
}

/** The escape rating: Ghost (never alerted), Shadow (never caught), Seen. */
export function escapeRating(player) {
  if (!player.alertedEver) return 'Ghost';
  if (player.caught === 0) return 'Shadow';
  return 'Seen';
}

/** Respawn at the service door after being caught. */
export function respawnPlayer(player, start) {
  player.x = start.x;
  player.y = start.y;
  player.lives -= 1;
  player.caught += 1;
}
