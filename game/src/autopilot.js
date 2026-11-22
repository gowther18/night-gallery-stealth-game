// The careful autopilot: A* over a coarse grid whose cost is raised inside
// guard vision cones and lit floor and lowered in shadow, so it routes
// around patrols, sneaks near cones and waits out a rising meter. Pure
// simulation — no DOM — shared by the balance sims and the staged shots.
import { FIELD } from './config.js';
import { lineOfSightBlocked, playerVisible, lightFactorAt } from './detection.js';
import { circleHitsRects } from './level.js';

const CELL = 24;
const COLS = Math.ceil(FIELD.width / CELL);
const ROWS = Math.ceil(FIELD.height / CELL);

function cellCenter(cx, cy) {
  return { x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 };
}

function toCell(x, y) {
  return {
    cx: Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL))),
    cy: Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL))),
  };
}

function cellBlocked(cx, cy, solids) {
  const c = cellCenter(cx, cy);
  return circleHitsRects(c.x, c.y, 15, solids);
}

/** Cost of standing on a cell: cones are expensive, lit floor is risky,
 *  shadow is cheap. */
function cellCost(cx, cy, state) {
  const c = cellCenter(cx, cy);
  let cost = 1;
  for (const guard of state.guards) {
    if (playerVisible(guard, c.x, c.y, state.blockers)) cost += 12;
  }
  const light = lightFactorAt(c.x, c.y, state.level);
  if (light > 1) cost += 1;
  else if (light < 1) cost -= 0.4;
  return Math.max(0.6, cost);
}

const DIRS = [
  { dx: 1, dy: 0, cost: 1 }, { dx: -1, dy: 0, cost: 1 },
  { dx: 0, dy: 1, cost: 1 }, { dx: 0, dy: -1, cost: 1 },
  { dx: 1, dy: 1, cost: 1.41 }, { dx: 1, dy: -1, cost: 1.41 },
  { dx: -1, dy: 1, cost: 1.41 }, { dx: -1, dy: -1, cost: 1.41 },
];

/** A* from (sx, sy) to (tx, ty) in field coordinates. Returns a list of
 *  field points, or null when no route exists. */
export function findPath(state, sx, sy, tx, ty) {
  const start = toCell(sx, sy);
  const goal = toCell(tx, ty);
  if (cellBlocked(goal.cx, goal.cy, state.solids)) return null;
  const key = (cx, cy) => cy * COLS + cx;
  const open = [{ cx: start.cx, cy: start.cy, g: 0, f: 0, parent: null }];
  const best = new Map([[key(start.cx, start.cy), 0]]);
  const closed = new Set();
  let found = null;
  while (open.length > 0) {
    let bi = 0;
    for (let i = 1; i < open.length; i += 1) if (open[i].f < open[bi].f) bi = i;
    const node = open.splice(bi, 1)[0];
    const k = key(node.cx, node.cy);
    if (closed.has(k)) continue;
    closed.add(k);
    if (node.cx === goal.cx && node.cy === goal.cy) {
      found = node;
      break;
    }
    for (const d of DIRS) {
      const nx = node.cx + d.dx;
      const ny = node.cy + d.dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (cellBlocked(nx, ny, state.solids)) continue;
      // No cutting corners through a blocked cell.
      if (d.dx !== 0 && d.dy !== 0) {
        if (cellBlocked(node.cx + d.dx, node.cy, state.solids) || cellBlocked(node.cx, node.cy + d.dy, state.solids)) continue;
      }
      const nk = key(nx, ny);
      const g = node.g + d.cost * cellCost(nx, ny, state);
      if (best.has(nk) && best.get(nk) <= g) continue;
      best.set(nk, g);
      const h = Math.hypot(goal.cx - nx, goal.cy - ny);
      open.push({ cx: nx, cy: ny, g, f: g + h, parent: node });
    }
  }
  if (!found) return null;
  const cells = [];
  let node = found;
  while (node) {
    cells.unshift(cellCenter(node.cx, node.cy));
    node = node.parent;
  }
  // String-pull: drop waypoints with a clear corridor. The line test is not
  // enough — Wren has a body, so sample the segment and require a 15 px
  // circle to fit everywhere, or the path wedges on a wall corner.
  const path = [cells[0]];
  const corridorClear = (a, b) => {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(dist / 10));
    for (let s = 0; s <= steps; s += 1) {
      const x = a.x + ((b.x - a.x) * s) / steps;
      const y = a.y + ((b.y - a.y) * s) / steps;
      if (circleHitsRects(x, y, 15, state.solids)) return false;
    }
    return true;
  };
  let i = 0;
  while (i < cells.length - 1) {
    let j = cells.length - 1;
    for (; j > i + 1; j -= 1) {
      if (corridorClear(cells[i], cells[j])) break;
    }
    path.push(cells[j]);
    i = j;
  }
  path.push({ x: tx, y: ty });
  return path;
}

/** True when a 15 px circle can travel the segment (a, b) without touching
 *  a solid. Used to skip waypoints the player can cut across to directly. */
function corridorClear(state, ax, ay, bx, by) {
  const dist = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(dist / 10));
  for (let s = 0; s <= steps; s += 1) {
    const x = ax + ((bx - ax) * s) / steps;
    const y = ay + ((by - ay) * s) / steps;
    if (circleHitsRects(x, y, 15, state.solids)) return false;
  }
  return true;
}
export function inAnyCone(state, x, y) {
  for (const guard of state.guards) {
    if (playerVisible(guard, x, y, state.blockers)) return true;
  }
  return false;
}

/** The worst detection meter across guards. */
export function worstDetection(state) {
  let worst = 0;
  for (const guard of state.guards) worst = Math.max(worst, guard.detection);
  return worst;
}

/**
 * A careful thief: follows `targets` in order (field points, or functions
 * returning a point), routing around cones, sneaking near them, and hiding
 * when a meter climbs. `done(state)` ends the run early.
 */
export function createAutopilot(targets) {
  let targetIndex = 0;
  let path = null;
  let pathIndex = 0;
  let replanIn = 0;
  let hiding = false;
  let hideTarget = null;

  function currentTarget(state) {
    const t = targets[targetIndex];
    if (!t) return null;
    return typeof t === 'function' ? t(state) : t;
  }

  function replan(state) {
    const target = hiding ? hideTarget : currentTarget(state);
    if (!target) {
      path = null;
      return;
    }
    path = findPath(state, state.player.x, state.player.y, target.x, target.y);
    pathIndex = 0;
    replanIn = 0.5;
  }

  return {
    /** The input for one step: {dx, dy, sneak, throwAt}. */
    input(state, dt) {
      const player = state.player;
      const worst = worstDetection(state);
      // A climbing meter: break off and hide in the nearest safe cell.
      if (!hiding && worst > 60) {
        hiding = true;
        const here = toCell(player.x, player.y);
        let bestCell = null;
        let bestDist = Infinity;
        for (let r = 0; r < 14; r += 1) {
          for (let cy = Math.max(0, here.cy - r); cy <= Math.min(ROWS - 1, here.cy + r); cy += 1) {
            for (let cx = Math.max(0, here.cx - r); cx <= Math.min(COLS - 1, here.cx + r); cx += 1) {
              if (Math.max(Math.abs(cx - here.cx), Math.abs(cy - here.cy)) !== r) continue;
              if (cellBlocked(cx, cy, state.solids)) continue;
              const c = cellCenter(cx, cy);
              if (inAnyCone(state, c.x, c.y)) continue;
              const d = Math.hypot(c.x - player.x, c.y - player.y);
              if (d < bestDist) {
                bestDist = d;
                bestCell = c;
              }
            }
          }
          if (bestCell) break;
        }
        hideTarget = bestCell || { x: player.x, y: player.y };
        replan(state);
      }
      if (hiding && worst < 25) {
        hiding = false;
        hideTarget = null;
        replan(state);
      }

      const target = hiding ? hideTarget : currentTarget(state);
      if (!target) return { dx: 0, dy: 0, sneak: false, throwAt: null };
      const distToTarget = Math.hypot(target.x - player.x, target.y - player.y);
      if (!hiding && distToTarget < 28) {
        targetIndex += 1;
        replan(state);
        return { dx: 0, dy: 0, sneak: false, throwAt: null };
      }

      replanIn -= dt;
      if (!path || replanIn <= 0) replan(state);
      if (!path || path.length === 0) {
        // No route: walk straight at the target and hope the slide helps.
        const len = Math.max(1, distToTarget);
        return { dx: (target.x - player.x) / len, dy: (target.y - player.y) / len, sneak: true, throwAt: null };
      }
      // Advance along the path: skip a waypoint only when the NEXT one is
      // reachable from where Wren actually stands. Skipping on distance
      // alone discards the waypoint that routes around a wall corner and
      // wedges her on it.
      while (pathIndex < path.length - 1) {
        const next = path[pathIndex + 1];
        if (next && corridorClear(state, player.x, player.y, next.x, next.y)) {
          pathIndex += 1;
          continue;
        }
        break;
      }
      const wp = path[Math.min(pathIndex, path.length - 1)];
      const dx = wp.x - player.x;
      const dy = wp.y - player.y;
      const len = Math.hypot(dx, dy) || 1;
      const nextX = player.x + (dx / len) * 30;
      const nextY = player.y + (dy / len) * 30;
      const sneak = inAnyCone(state, nextX, nextY) || worst > 25 || hiding;
      return { dx: dx / len, dy: dy / len, sneak, throwAt: null };
    },
    get targetIndex() {
      return targetIndex;
    },
    get hiding() {
      return hiding;
    },
  };
}

/** The full heist route: jade cat, Opal, blue vase, gold watch, skylight. */
export function heistTargets(state) {
  const cat = state.level.loot.find((l) => l.id === 'cat');
  const vase = state.level.loot.find((l) => l.id === 'vase');
  const watch = state.level.loot.find((l) => l.id === 'watch');
  return [
    (s) => (cat.taken ? s.level.plinth : { x: cat.x, y: cat.y }),
    (s) => (s.player.hasOpal ? { x: vase.x, y: vase.y } : s.level.plinth),
    (s) => (vase.taken ? { x: watch.x, y: watch.y } : { x: vase.x, y: vase.y }),
    (s) => (watch.taken ? s.level.exit : { x: watch.x, y: watch.y }),
    (s) => s.level.exit,
  ];
}

/** The reckless thief: straight lines, full speed, no sneak, no waiting. */
export function recklessInput(state) {
  const player = state.player;
  const target = player.hasOpal ? state.level.exit : state.level.plinth;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const len = Math.hypot(dx, dy) || 1;
  return { dx: dx / len, dy: dy / len, sneak: false, throwAt: null };
}
