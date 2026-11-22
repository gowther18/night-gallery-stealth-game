// The screenshot scenes behind ?shot=cover|start|alert|win (with &seed=N).
// Each one plays the real rules forward from a fresh world, steered by the
// careful autopilot, so the frame is what a short game really looks like and
// the same seed always gives the same frame.
import { STEP } from './config.js';
import { createAutopilot, heistTargets } from './autopilot.js';
import { STATE_SUSPICIOUS } from './guard.js';
import { escapeRating } from './player.js';
import { SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { circleHitsRects } from './level.js';

const START_SECONDS = 5;
const COVER_SECONDS = 45;
const ALERT_SECONDS = 100;
const WIN_SECONDS = 300;

/** The cover staging point: crouched behind the mid-hall display case. */
const COVER_SPOT = { x: 675, y: 600 };

/** Run the world forward with the careful autopilot for up to `seconds`,
 *  stopping early when `stop(state)` is true. */
function playForward(world, seconds, stop) {
  const pilot = createAutopilot(heistTargets(world.state));
  const limit = Math.floor(seconds / STEP);
  for (let i = 0; i < limit; i += 1) {
    const input = pilot.input(world.state, STEP);
    world.step(STEP, input, false);
    if (world.state.won || world.state.over) break;
    if (stop && stop(world.state)) break;
  }
  return pilot;
}

/** Force a near-miss frame: guard 0 suspicious, meter half full, Wren just
 *  outside the cone edge. Only used when no guard turned suspicious on its
 *  own during the staged approach. */
function forceAlertFrame(state) {
  const guard = state.guards[0];
  const player = state.player;
  const angles = [0.75, -0.75, 1.05, -1.05, 1.57, -1.57];
  const distances = [180, 140, 220];
  for (const da of angles) {
    for (const dist of distances) {
      const angle = guard.dir + da;
      const x = guard.x + Math.cos(angle) * dist;
      const y = guard.y + Math.sin(angle) * dist;
      if (x < 40 || x > 1240 || y < 60 || y > 680) continue;
      if (circleHitsRects(x, y, 14, state.solids)) continue;
      player.x = x;
      player.y = y;
      player.sneaking = true;
      guard.state = STATE_SUSPICIOUS;
      guard.stateTime = 0;
      guard.investigate = { x, y };
      guard.detection = 55;
      guard.dir = Math.atan2(y - guard.y, x - guard.x);
      return true;
    }
  }
  return false;
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Any unknown name is the title scene.
 */
export function stageShot(name, world) {
  world.reset();
  if (name === 'cover') {
    const pilot = createAutopilot([{ x: COVER_SPOT.x, y: COVER_SPOT.y }]);
    const limit = Math.floor(COVER_SECONDS / STEP);
    for (let i = 0; i < limit; i += 1) {
      world.step(STEP, pilot.input(world.state, STEP), false);
      if (Math.hypot(world.state.player.x - COVER_SPOT.x, world.state.player.y - COVER_SPOT.y) < 20) break;
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'alert') {
    let found = false;
    playForward(world, ALERT_SECONDS, (state) => {
      for (const guard of state.guards) {
        if (guard.state === STATE_SUSPICIOUS && guard.detection >= 40 && guard.detection < 95) {
          found = true;
          return true;
        }
      }
      return false;
    });
    if (!found) forceAlertFrame(world.state);
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'win') {
    playForward(world, WIN_SECONDS, null);
    const state = world.state;
    if (!state.won) {
      // The autopilot did not finish in time: stage the win honestly from
      // the real end state — Opal and loot in hand, Wren at the skylight.
      state.player.hasOpal = true;
      for (const item of state.level.loot) item.taken = true;
      state.player.loot = state.level.loot.length;
      state.player.x = state.level.exit.x;
      state.player.y = state.level.exit.y + 10;
      state.score += 500 + 100 * state.level.loot.length;
      state.won = true;
      state.rating = escapeRating(state.player);
      if (state.rating === 'Ghost') state.score += 300;
      if (state.time < 60) state.time = 187;
    }
    return { screen: SCREEN_WIN, best: 0 };
  }
  // start (default): the title over a live, patrolling gallery. Attract
  // mode runs the guards with no player to spot.
  for (let i = 0; i < Math.floor(START_SECONDS / STEP); i += 1) {
    world.step(STEP, { dx: 0, dy: 0, sneak: false, throwAt: null }, true);
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
