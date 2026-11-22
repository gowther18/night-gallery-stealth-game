// Every tuning number, colour and the fixed level layout in one place. The
// playfield is a fixed 1280x720 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 170,
  sneakSpeed: 85,
  pebbles: 3,
  pebbleRange: 320,
  pickupRadius: 34,
};

export const LIVES = 3;

export const GUARD = {
  coneAngle: (75 * Math.PI) / 180,
  coneRange: 260,
  coneRays: 24,
  chaseSpeed: 150,
  catchRadius: 26,
  /** Detection fills this fast at point blank, before light/sneak factors. */
  detectBase: 40,
  detectClose: 60,
  /** Detection drains this fast per second while the player is hidden. */
  detectDrain: 35,
  /** Crossing this meter turns a patrolling guard suspicious. */
  suspiciousAt: 45,
  /** Seconds a suspicious guard looks around before giving up. */
  suspiciousLook: 3,
  /** Seconds an alerted guard keeps chasing after losing sight. */
  chaseMemory: 4,
  /** Seconds a searching guard checks the last seen spot. */
  searchTime: 3,
};

export const LIGHT = {
  shadowFactor: 0.33,
  litFactor: 1.5,
  sneakFactor: 0.5,
};

export const SCORE = { loot: 100, opal: 500, ghostBonus: 300 };

export const PALETTE = {
  backdrop: '#0d0f16',
  floorA: '#232838',
  floorB: '#1d2230',
  carpet: '#5e1f28',
  carpetEdge: '#7a2a35',
  shadow: '#141c33',
  lightPool: '#3a3220',
  wall: '#0a0c12',
  wallTop: '#2e3444',
  caseGlass: '#9fc4d8',
  caseFrame: '#6b4f2a',
  planter: '#2f5d3a',
  bench: '#4a3626',
  rope: '#8a1f2d',
  guard: '#2b3a67',
  guardCap: '#1c2745',
  conePatrol: 'rgba(242, 201, 76, 0.28)',
  coneSuspicious: 'rgba(242, 140, 60, 0.34)',
  coneAlerted: 'rgba(229, 83, 75, 0.36)',
  player: '#191923',
  playerMask: '#e8e4d8',
  opal: '#7fe7e0',
  exit: '#39d98a',
  panel: '#171b28',
  panelEdge: '#3a4157',
  text: '#eef1f5',
  muted: '#9aa1b5',
  danger: '#e5534b',
  gold: '#f2c94c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best escape time is kept between visits (this browser only). */
export const BEST_KEY = 'night-gallery.best';
