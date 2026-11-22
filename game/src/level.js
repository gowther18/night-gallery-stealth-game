// The Marlowe Gallery: one fixed hand-designed level. Walls and solid cover
// block movement and line of sight; the velvet rope blocks sight only (the
// player ducks under it). Shadow zones slow detection, light pools and the
// red carpet runner speed it up. The seed only jitters guard patrol starts,
// so the level is the same for every player and every screenshot.

export function buildLevel(rng) {
  const walls = [
    // Outer walls.
    { x: 0, y: 0, w: 1280, h: 24 },
    { x: 0, y: 696, w: 1280, h: 24 },
    { x: 0, y: 0, w: 24, h: 720 },
    { x: 1256, y: 0, w: 24, h: 720 },
    // Interior wall A: separates the west wing from the central hall.
    { x: 420, y: 150, w: 24, h: 320 },
    // Interior wall B: separates the central hall from the east wing.
    { x: 836, y: 250, w: 24, h: 320 },
    // Interior wall C: a partition inside the east wing.
    { x: 920, y: 380, w: 230, h: 24 },
  ];

  // Cover: display cases, planters and benches are solid; the rope is not.
  const cover = [
    { x: 300, y: 200, w: 70, h: 50, kind: 'case', solid: true },
    { x: 300, y: 480, w: 70, h: 50, kind: 'case', solid: true },
    { x: 560, y: 150, w: 70, h: 50, kind: 'case', solid: true },
    { x: 640, y: 520, w: 70, h: 50, kind: 'case', solid: true },
    { x: 950, y: 180, w: 70, h: 50, kind: 'case', solid: true },
    { x: 1050, y: 480, w: 70, h: 50, kind: 'case', solid: true },
    { x: 200, y: 330, w: 40, h: 40, kind: 'planter', solid: true },
    { x: 700, y: 300, w: 40, h: 40, kind: 'planter', solid: true },
    { x: 700, y: 430, w: 40, h: 40, kind: 'planter', solid: true },
    { x: 1150, y: 300, w: 40, h: 40, kind: 'planter', solid: true },
    { x: 520, y: 300, w: 90, h: 28, kind: 'bench', solid: true },
    { x: 760, y: 420, w: 90, h: 28, kind: 'bench', solid: true },
    // Velvet rope across the central hall: blocks sight, duck under it.
    { x: 560, y: 296, w: 160, h: 8, kind: 'rope', solid: false },
  ];

  // The red carpet runner down the central hall: fast to cross, lit, exposed.
  const carpet = { x: 560, y: 24, w: 160, h: 672 };
  // Dark floor patches where detection fills 3x slower.
  const shadows = [
    { x: 60, y: 520, w: 200, h: 140 },
    { x: 460, y: 560, w: 160, h: 110 },
    { x: 900, y: 60, w: 200, h: 110 },
  ];
  // Warm light pools under the ceiling lamps: detection fills 1.5x faster.
  const lightPools = [
    { x: 580, y: 140, w: 120, h: 80 },
    { x: 580, y: 500, w: 120, h: 80 },
    { x: 180, y: 120, w: 120, h: 80 },
    { x: 1000, y: 520, w: 120, h: 80 },
  ];

  const plinth = { x: 640, y: 360 };
  const loot = [
    { id: 'cat', name: 'Jade Cat', x: 180, y: 150, taken: false },
    { id: 'watch', name: 'Gold Pocket Watch', x: 1120, y: 150, taken: false },
    { id: 'vase', name: 'Blue Vase', x: 1120, y: 560, taken: false },
  ];
  const exit = { x: 1180, y: 80 };
  const playerStart = { x: 80, y: 620 };

  // Four guards, one per wing plus a hall crosser. The seed staggers where
  // each guard starts on its loop and jitters its speed a little, so patrols
  // stay learnable but never identical between seeds.
  const guardDefs = [
    {
      name: 'Marco', speed: 70,
      waypoints: [
        { x: 600, y: 120 }, { x: 700, y: 120 }, { x: 700, y: 600 }, { x: 600, y: 600 },
      ],
    },
    {
      name: 'Iris', speed: 60,
      waypoints: [
        { x: 150, y: 120 }, { x: 380, y: 120 }, { x: 380, y: 600 }, { x: 150, y: 600 },
      ],
    },
    {
      name: 'Dante', speed: 80,
      waypoints: [
        { x: 900, y: 120 }, { x: 1180, y: 120 }, { x: 1180, y: 600 }, { x: 900, y: 600 },
      ],
    },
    {
      name: 'Sable', speed: 65,
      waypoints: [
        { x: 480, y: 200 }, { x: 800, y: 200 }, { x: 800, y: 520 }, { x: 480, y: 520 },
      ],
    },
  ].map((def) => {
    const startIndex = Math.floor(rng.next() * def.waypoints.length);
    const start = def.waypoints[startIndex];
    return {
      ...def,
      speed: def.speed * rng.range(0.92, 1.08),
      startIndex,
      x: start.x,
      y: start.y,
    };
  });

  return { walls, cover, carpet, shadows, lightPools, plinth, loot, exit, playerStart, guardDefs };
}

/** True when the point is inside any of the rectangles. */
export function pointInRects(x, y, rects) {
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return true;
  }
  return false;
}

/** True when a circle of `radius` at (x, y) overlaps any rectangle. */
export function circleHitsRects(x, y, radius, rects) {
  for (let i = 0; i < rects.length; i += 1) {
    const r = rects[i];
    const cx = Math.max(r.x, Math.min(x, r.x + r.w));
    const cy = Math.max(r.y, Math.min(y, r.y + r.h));
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < radius * radius) return true;
  }
  return false;
}
