// Keyboard and pointer input. Held keys give a steering direction; one-shot
// presses (start, pause, pebble, restart) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost or counted
// twice. Clicking the canvas throws a pebble at that spot while playing.
import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_PEBBLE = 8;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const SNEAK = new Set(['ShiftLeft', 'ShiftRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const RESTART = new Set(['KeyR']);

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let throwAt = null;

  function toField(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * FIELD.width,
      y: ((clientY - rect.top) / rect.height) * FIELD.height,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code) || SNEAK.has(event.code)) {
      held.add(event.code);
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) {
        actions |= ACTION_CONFIRM;
        if (event.code === 'Space') actions |= ACTION_PEBBLE;
      }
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (RESTART.has(event.code)) {
      if (!event.repeat) actions |= ACTION_RESTART;
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of
  // everything on blur.
  window.addEventListener('blur', () => held.clear());

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button === 0) {
      const point = toField(event.clientX, event.clientY);
      if (throwAt === null) throwAt = point;
      actions |= ACTION_CONFIRM;
    }
  });

  return {
    /** Normalised steering direction (-1..1 on each axis). */
    direction() {
      let dx = 0;
      let dy = 0;
      for (const code of held) {
        if (LEFT.has(code)) dx -= 1;
        if (RIGHT.has(code)) dx += 1;
        if (UP.has(code)) dy -= 1;
        if (DOWN.has(code)) dy += 1;
      }
      const len = Math.hypot(dx, dy);
      return len > 0 ? { x: dx / len, y: dy / len } : { x: 0, y: 0 };
    },
    sneaking() {
      for (const code of held) if (SNEAK.has(code)) return true;
      return false;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** A click point to throw a pebble at, taken once. */
    takeThrowAt() {
      const point = throwAt;
      throwAt = null;
      return point;
    },
  };
}
