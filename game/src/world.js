// The world: level + guards + player, stepped in fixed 1/60 s ticks. Pure
// simulation — no DOM, no audio, no canvas — so the balance sims and the
// staged screenshots run it in Node and in the browser alike.
import { FIELD, GUARD, LIVES, SCORE, STEP } from './config.js';
import { createRandom } from './random.js';
import { buildLevel } from './level.js';
import { sightBlockers } from './detection.js';
import { createGuard, resetGuard, investigateNoise, updateGuardState, STATE_ALERTED } from './guard.js';
import { createPlayer, movePlayer, tossPebble, collectNearby, atExit, respawnPlayer, escapeRating } from './player.js';

export const EVENT_NONE = 0;
export const EVENT_CAUGHT = 1;
export const EVENT_WIN = 2;
export const EVENT_OVER = 4;
export const EVENT_LOOT = 8;
export const EVENT_SPOTTED = 16;

export function createWorld(seed) {
  const rng = createRandom(seed);
  const level = buildLevel(rng);
  const solids = level.walls.concat(level.cover.filter((c) => c.solid));
  const blockers = sightBlockers(level);
  const state = {
    seed,
    level,
    solids,
    blockers,
    player: createPlayer(level.playerStart),
    guards: level.guardDefs.map((def) => createGuard(def)),
    score: 0,
    time: 0,
    lives: LIVES,
    over: false,
    won: false,
    rating: null,
    pebbleRings: [],
    caughtFlash: 0,
  };
  return {
    state,
    reset() {
      // Rebuild from the same seed: reset() is deterministic per seed.
      const fresh = createWorld(state.seed).state;
      state.level = fresh.level;
      state.solids = fresh.solids;
      state.blockers = fresh.blockers;
      state.player = createPlayer(state.level.playerStart);
      state.guards = state.level.guardDefs.map((def) => createGuard(def));
      state.score = 0;
      state.time = 0;
      state.lives = LIVES;
      state.over = false;
      state.won = false;
      state.rating = null;
      state.pebbleRings = [];
      state.caughtFlash = 0;
    },
    /**
     * Advance one fixed step. `input` is {dx, dy, sneak, throwAt} — the
     * throwAt point is acted on once by the caller, not held. `attract`
     * runs the guards with no player (title screen background). Returns an
     * EVENT_* bitmask.
     */
    step(dt, input, attract) {
      if (state.over || state.won) return EVENT_NONE;
      let events = EVENT_NONE;
      state.time += dt;
      if (state.caughtFlash > 0) state.caughtFlash -= dt;
      const player = state.player;

      if (!attract) {
        if (input.throwAt) {
          const landing = tossPebble(player, input.throwAt.x, input.throwAt.y);
          if (landing) {
            state.pebbleRings.push({ x: landing.x, y: landing.y, age: 0 });
            for (const guard of state.guards) {
              if (Math.hypot(guard.x - landing.x, guard.y - landing.y) < 420) {
                investigateNoise(guard, landing.x, landing.y);
              }
            }
          }
        }
        movePlayer(player, input.dx, input.dy, input.sneak, state.solids, dt);
        if (player.pebbleCooldown > 0) player.pebbleCooldown -= dt;
        const gained = collectNearby(player, state.level);
        if (gained > 0) {
          state.score += gained;
          events |= EVENT_LOOT;
        }
        if (atExit(player, state.level)) {
          state.won = true;
          state.rating = escapeRating(player);
          if (state.rating === 'Ghost') state.score += SCORE.ghostBonus;
          return events | EVENT_WIN;
        }
      }

      // Guards move and watch; a hidden player stands in for attract mode.
      const watchPlayer = attract
        ? { x: -1000, y: -1000, sneaking: true }
        : player;
      for (const guard of state.guards) {
        const guardEvents = { spotted: false, step: false };
        updateGuardState(guard, watchPlayer, state.level, state.solids, state.blockers, dt, guardEvents);
        if (guardEvents.spotted) {
          player.alertedEver = true;
          events |= EVENT_SPOTTED;
        }
      }

      if (!attract) {
        for (const guard of state.guards) {
          if (
            guard.state === STATE_ALERTED &&
            Math.hypot(guard.x - player.x, guard.y - player.y) < GUARD.catchRadius
          ) {
            respawnPlayer(player, state.level.playerStart);
            state.lives = player.lives;
            state.caughtFlash = 1.2;
            for (let i = 0; i < state.guards.length; i += 1) {
              resetGuard(state.guards[i], state.level.guardDefs[i]);
            }
            events |= EVENT_CAUGHT;
            if (player.lives <= 0) {
              state.over = true;
              events |= EVENT_OVER;
            }
            break;
          }
        }
      }

      for (const ring of state.pebbleRings) ring.age += dt;
      state.pebbleRings = state.pebbleRings.filter((r) => r.age < 0.9);
      return events;
    },
  };
}

/** Convenience: run `steps` fixed steps with a per-step input function. */
export function runSteps(world, steps, inputForStep) {
  let events = EVENT_NONE;
  for (let i = 0; i < steps; i += 1) {
    events |= world.step(STEP, inputForStep(i, world.state), false);
    if (world.state.over || world.state.won) break;
  }
  return events;
}
