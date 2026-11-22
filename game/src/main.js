// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps (several in a slow frame, none in a fast one), and the
// renderer paints what is there. The game moves between six screens:
// title, play, paused, caught, win and game over.
//
// ?seed=N fixes the patrol starts. ?shot=cover|start|alert|win (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createWorld, EVENT_CAUGHT, EVENT_LOOT, EVENT_OVER, EVENT_SPOTTED, EVENT_WIN } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_PEBBLE, ACTION_RESTART, createInput } from './input.js';
import { createRenderer, SCREEN_CAUGHT, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';
import {
  playAlarm, playCaught, playFootstep, playOpal, playPebble, playPickup, playSuspicion, playWin,
} from './audio.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** Seconds the SPOTTED interstitial stays up before play resumes. */
const CAUGHT_SECONDS = 1.4;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best time then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(scene.screen, world.state, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let caughtTimer = 0;
  let pendingThrow = null;
  let lastOpal = false;

  // The play test drives and inspects the game through this handle.
  window.__nightgallery = {
    get screen() {
      return screen;
    },
    get world() {
      return world.state;
    },
  };

  // Screen readers (and anyone watching the page's text) hear the screen changes and each catch.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    caughtTimer = 0;
    lastOpal = false;
    screen = SCREEN_PLAY;
    announce('Playing. Steal the Moon Opal, then reach the skylight unseen.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    announce(`Caught three times. Score ${world.state.score}.`);
  }

  function winGame() {
    screen = SCREEN_WIN;
    const time = Math.floor(world.state.time);
    if (world.state.rating === 'Ghost' && (best === 0 || time < best)) {
      best = time;
      saveBest(best);
    }
    announce(`Escaped! Rating ${world.state.rating}. Time ${time} seconds.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    const clickThrow = input.takeThrowAt();
    if (screen === SCREEN_PLAY) {
      if (clickThrow) pendingThrow = clickThrow;
      if (actions & ACTION_PEBBLE) {
        const p = world.state.player;
        pendingThrow = {
          x: p.x + Math.cos(p.facing) * 200,
          y: p.y + Math.sin(p.facing) * 200,
        };
      }
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      startGame();
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { dx: 0, dy: 0, sneak: false, throwAt: null }, true);
      return;
    }
    if (screen === SCREEN_CAUGHT) {
      caughtTimer -= STEP;
      if (caughtTimer <= 0) screen = SCREEN_PLAY;
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const dir = input.direction();
    const throwAt = pendingThrow;
    pendingThrow = null;
    const hadPebbles = world.state.player.pebbles;
    const events = world.step(STEP, {
      dx: dir.x, dy: dir.y, sneak: input.sneaking(), throwAt,
    }, false);
    if (throwAt && world.state.player.pebbles < hadPebbles) playPebble();
    if (events & EVENT_LOOT) {
      if (world.state.player.hasOpal && !lastOpal) playOpal();
      else playPickup();
    }
    lastOpal = world.state.player.hasOpal;
    if (events & EVENT_SPOTTED) playSuspicion();
    if (events & EVENT_CAUGHT) {
      playCaught();
      playAlarm();
      if (world.state.lives > 0) {
        screen = SCREEN_CAUGHT;
        caughtTimer = CAUGHT_SECONDS;
        announce('Spotted! Back to the service door.');
      }
    }
    if (events & EVENT_WIN) {
      playWin();
      winGame();
    } else if (events & EVENT_OVER) {
      playAlarm();
      endGame();
    }
    // Positional footsteps: the nearest moving guard, panned by direction.
    let nearest = null;
    let nearestDist = Infinity;
    for (const guard of world.state.guards) {
      if (!guard.stepped) continue;
      const d = Math.hypot(guard.x - world.state.player.x, guard.y - world.state.player.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = guard;
      }
    }
    if (nearest) {
      const pan = (nearest.x - world.state.player.x) / 400;
      playFootstep(nearestDist, Math.max(-1, Math.min(1, pan)));
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_CAUGHT) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY || screen === SCREEN_CAUGHT)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(screen, world.state, best);
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Night Gallery. Press Space or click to start the heist.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
