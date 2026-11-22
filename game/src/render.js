// All drawing: floor, cover, vision cones, guards, Wren, HUD and the
// screens. The canvas is scaled to the window; every coordinate below is in
// the 1280x720 logical field.
import { FIELD, FONT, PALETTE } from './config.js';
import { castVisionCone, playerVisible } from './detection.js';
import { STATE_ALERTED, STATE_SUSPICIOUS } from './guard.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';
export const SCREEN_CAUGHT = 'caught';

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function formatTime(seconds) {
  const total = Math.floor(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || FIELD.width;
    const h = canvas.clientHeight || FIELD.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  function frame() {
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    const ox = (canvas.width - FIELD.width * scale) / 2;
    const oy = (canvas.height - FIELD.height * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
  }

  function drawFloor(state) {
    const { level } = state;
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Two-tone marble checker.
    const tile = 40;
    for (let y = 0; y < FIELD.height; y += tile) {
      for (let x = 0; x < FIELD.width; x += tile) {
        ctx.fillStyle = ((x / tile + y / tile) % 2 === 0) ? PALETTE.floorA : PALETTE.floorB;
        ctx.fillRect(x, y, tile, tile);
      }
    }
    // Shadow zones: dark floor where detection fills 3x slower.
    for (const z of level.shadows) {
      ctx.fillStyle = PALETTE.shadow;
      ctx.fillRect(z.x, z.y, z.w, z.h);
    }
    // Light pools under the ceiling lamps.
    for (const z of level.lightPools) {
      ctx.fillStyle = PALETTE.lightPool;
      ctx.beginPath();
      ctx.ellipse(z.x + z.w / 2, z.y + z.h / 2, z.w / 2, z.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // The red carpet runner down the central hall: lit and exposed.
    const c = level.carpet;
    ctx.fillStyle = PALETTE.carpet;
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.strokeStyle = PALETTE.carpetEdge;
    ctx.lineWidth = 3;
    ctx.strokeRect(c.x + 2, c.y, c.w - 4, c.h);
  }

  function drawWallsAndCover(state) {
    const { level } = state;
    for (const w of level.walls) {
      ctx.fillStyle = PALETTE.wall;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = PALETTE.wallTop;
      if (w.h <= 24 && w.w > 24) ctx.fillRect(w.x, w.y, w.w, 4);
      if (w.w <= 24 && w.h > 24) ctx.fillRect(w.x, w.y, 4, w.h);
    }
    for (const c of level.cover) {
      if (c.kind === 'case') {
        ctx.fillStyle = PALETTE.caseFrame;
        ctx.fillRect(c.x - 3, c.y - 3, c.w + 6, c.h + 6);
        ctx.fillStyle = PALETTE.caseGlass;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.globalAlpha = 1;
        // A tiny artwork inside the glass: a painted miniature.
        ctx.fillStyle = '#c96f4a';
        ctx.beginPath();
        ctx.arc(c.x + c.w / 2, c.y + c.h / 2, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3f6d8e';
        ctx.fillRect(c.x + c.w / 2 - 12, c.y + c.h / 2 + 8, 24, 4);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(c.x + 6, c.y + 6);
        ctx.lineTo(c.x + c.w - 6, c.y + c.h - 6);
        ctx.stroke();
      } else if (c.kind === 'planter') {
        ctx.fillStyle = PALETTE.planter;
        ctx.beginPath();
        ctx.arc(c.x + c.w / 2, c.y + c.h / 2, c.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#3f7d4e';
        ctx.beginPath();
        ctx.arc(c.x + c.w / 2, c.y + c.h / 2 - 4, 12, 0, Math.PI * 2);
        ctx.fill();
      } else if (c.kind === 'bench') {
        ctx.fillStyle = PALETTE.bench;
        roundRect(ctx, c.x, c.y, c.w, c.h, 6);
        ctx.fill();
        ctx.fillStyle = '#6b4f2a';
        ctx.fillRect(c.x + 4, c.y + 4, c.w - 8, 4);
      } else if (c.kind === 'rope') {
        ctx.strokeStyle = PALETTE.rope;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(c.x, c.y + 4);
        ctx.quadraticCurveTo(c.x + c.w / 2, c.y + 14, c.x + c.w, c.y + 4);
        ctx.stroke();
        ctx.fillStyle = '#c9a227';
        ctx.beginPath();
        ctx.arc(c.x, c.y + 4, 4, 0, Math.PI * 2);
        ctx.arc(c.x + c.w, c.y + 4, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawLootAndExit(state) {
    const { level, player } = state;
    // The Moon Opal on its central plinth.
    const pulse = 0.75 + 0.25 * Math.sin(state.time * 3);
    ctx.fillStyle = '#3a3f52';
    ctx.beginPath();
    ctx.arc(level.plinth.x, level.plinth.y, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a5068';
    ctx.fillRect(level.plinth.x - 22, level.plinth.y - 6, 44, 12);
    if (!player.hasOpal) {
      ctx.save();
      ctx.globalAlpha = pulse;
      ctx.fillStyle = PALETTE.opal;
      ctx.shadowColor = PALETTE.opal;
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.moveTo(level.plinth.x, level.plinth.y - 20);
      ctx.lineTo(level.plinth.x + 12, level.plinth.y);
      ctx.lineTo(level.plinth.x, level.plinth.y + 20);
      ctx.lineTo(level.plinth.x - 12, level.plinth.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = PALETTE.opal;
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('MOON OPAL', level.plinth.x, level.plinth.y - 34);
    }
    // Side loot.
    for (const item of level.loot) {
      if (item.taken) continue;
      ctx.save();
      ctx.shadowColor = PALETTE.gold;
      ctx.shadowBlur = 10;
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(item.x, item.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#7a5b12';
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('◆', item.x, item.y + 4);
    }
    // Skylight exit, top-right: glowing green door.
    const ex = level.exit;
    ctx.save();
    ctx.shadowColor = PALETTE.exit;
    ctx.shadowBlur = 18 + 8 * pulse;
    ctx.fillStyle = PALETTE.exit;
    roundRect(ctx, ex.x - 30, ex.y - 22, 60, 44, 6);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#062b16';
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('EXIT', ex.x, ex.y + 5);
    ctx.strokeStyle = PALETTE.exit;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ex.x, ex.y - 34);
    ctx.lineTo(ex.x, ex.y - 46);
    ctx.moveTo(ex.x - 7, ex.y - 39);
    ctx.lineTo(ex.x, ex.y - 46);
    ctx.lineTo(ex.x + 7, ex.y - 39);
    ctx.stroke();
  }

  function drawCones(state) {
    for (const guard of state.guards) {
      const points = castVisionCone(guard, state.blockers);
      const fill =
        guard.state === STATE_ALERTED
          ? PALETTE.coneAlerted
          : guard.state === STATE_SUSPICIOUS
            ? PALETTE.coneSuspicious
            : PALETTE.conePatrol;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
      ctx.closePath();
      ctx.fill();
      // A brighter rim so the cone edge reads even shrunk to the contact sheet.
      ctx.strokeStyle = fill.replace(/0\.\d+\)$/, '0.55)');
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawGuards(state) {
    for (const guard of state.guards) {
      // Shadow blob.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(guard.x, guard.y + 10, 14, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      // Uniformed body + cap, facing the patrol direction.
      ctx.save();
      ctx.translate(guard.x, guard.y);
      ctx.rotate(guard.dir);
      ctx.fillStyle = PALETTE.guard;
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.guardCap;
      ctx.beginPath();
      ctx.arc(6, 0, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.arc(13, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      // "?" while suspicious, "!" while alerted, plus a thin meter.
      if (guard.detection > 5) {
        const w = 30;
        const ratio = guard.detection / 100;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(guard.x - w / 2, guard.y - 34, w, 5);
        ctx.fillStyle = guard.state === STATE_ALERTED ? PALETTE.danger : PALETTE.gold;
        ctx.fillRect(guard.x - w / 2, guard.y - 34, w * ratio, 5);
      }
      if (guard.state === STATE_SUSPICIOUS || guard.state === STATE_ALERTED) {
        ctx.fillStyle = guard.state === STATE_ALERTED ? PALETTE.danger : '#f28c3c';
        ctx.font = `bold 22px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(guard.state === STATE_ALERTED ? '!' : '?', guard.x, guard.y - 38);
      }
    }
  }

  function drawPlayer(state) {
    const { player } = state;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(player.x, player.y + 11, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.facing);
    // Hooded cloak, with a pale rim so Wren reads against the dark floor.
    ctx.strokeStyle = 'rgba(238,241,245,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b2b38';
    ctx.beginPath();
    ctx.moveTo(-6, -9);
    ctx.lineTo(10, 0);
    ctx.lineTo(-6, 9);
    ctx.closePath();
    ctx.fill();
    // Pale mask dot.
    ctx.fillStyle = PALETTE.playerMask;
    ctx.beginPath();
    ctx.arc(6, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (player.sneaking) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('sneaking', player.x, player.y + 28);
    }
    // Closed-eye mark while no guard can see Wren — not at the exit, where
    // it would overlap the EXIT sign.
    let seen = false;
    for (const guard of state.guards) {
      if (playerVisible(guard, player.x, player.y, state.blockers)) {
        seen = true;
        break;
      }
    }
    if (!seen && Math.hypot(player.x - state.level.exit.x, player.y - state.level.exit.y) > 70) {
      ctx.fillStyle = 'rgba(238,241,245,0.85)';
      ctx.font = `13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('◠ hidden', player.x, player.y - 24);
    }
    // Pebble rings.
    for (const ring of state.pebbleRings) {
      ctx.strokeStyle = `rgba(242,201,76,${1 - ring.age / 0.9})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, 8 + ring.age * 60, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawHud(state) {
    const { player } = state;
    let worst = 0;
    for (const guard of state.guards) worst = Math.max(worst, guard.detection);
    ctx.fillStyle = 'rgba(10,12,18,0.82)';
    ctx.fillRect(0, 0, FIELD.width, 46);
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(0, 46, FIELD.width, 1);
    // Detection eye: the worst guard's meter, big and readable.
    ctx.fillStyle = worst >= 100 ? PALETTE.danger : worst >= 45 ? '#f28c3c' : PALETTE.text;
    ctx.font = `bold 17px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(worst >= 100 ? '◉ SPOTTED' : worst >= 45 ? '◉ SUSPICIOUS' : '◉ hidden', 16, 29);
    const barX = 150;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, barX, 14, 120, 16, 8);
    ctx.fill();
    ctx.fillStyle = worst >= 100 ? PALETTE.danger : worst >= 45 ? '#f28c3c' : PALETTE.gold;
    if (worst > 0) {
      roundRect(ctx, barX, 14, Math.max(16, 120 * (worst / 100)), 16, 8);
      ctx.fill();
    }
    // Lives as cloak icons.
    ctx.fillStyle = PALETTE.text;
    ctx.font = `17px ${FONT}`;
    ctx.fillText(`◆`.repeat(Math.max(0, player.lives)), 300, 29);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `15px ${FONT}`;
    ctx.fillText(`Loot ${player.loot + (player.hasOpal ? 1 : 0)}/4`, 400, 28);
    ctx.fillText(`Pebbles ${'●'.repeat(player.pebbles)}${'○'.repeat(Math.max(0, 3 - player.pebbles))}`, 500, 28);
    ctx.fillText(`⏱ ${formatTime(state.time)}`, 640, 28);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `14px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('Steal the Moon Opal, then reach the skylight', FIELD.width - 16, 28);
    ctx.textAlign = 'left';
  }

  function drawPanel(title, lines, hint, accent) {
    ctx.fillStyle = 'rgba(8,10,16,0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const w = 620;
    const h = 130 + lines.length * 30;
    const x = (FIELD.width - w) / 2;
    const y = (FIELD.height - h) / 2;
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = accent || PALETTE.panelEdge;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 14);
    ctx.stroke();
    ctx.fillStyle = accent || PALETTE.text;
    ctx.font = `bold 40px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(title, FIELD.width / 2, y + 62);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `18px ${FONT}`;
    lines.forEach((line, i) => {
      ctx.fillText(line, FIELD.width / 2, y + 104 + i * 30);
    });
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `15px ${FONT}`;
    ctx.fillText(hint, FIELD.width / 2, y + h - 18);
    ctx.textAlign = 'left';
  }

  function draw(screen, state, best) {
    frame();
    drawFloor(state);
    drawWallsAndCover(state);
    drawLootAndExit(state);
    drawCones(state);
    drawGuards(state);
    drawPlayer(state);
    drawHud(state);

    if (state.caughtFlash > 0) {
      ctx.fillStyle = `rgba(229,83,75,${Math.min(0.35, state.caughtFlash * 0.3)})`;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }

    if (screen === SCREEN_TITLE) {
      drawPanel('NIGHT GALLERY', [
        'You are Wren, a cat burglar in the Marlowe Gallery after closing.',
        'Steal the Moon Opal from the central plinth — then slip out',
        'through the skylight exit, unseen. Four guards patrol with',
        'flashlight cones. Hide behind cases, mind the light, stay quiet.',
        'WASD / arrows — move    Shift — sneak    Space / click — toss a pebble',
      ], 'Click or press Space to begin the heist', PALETTE.opal);
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The gallery holds its breath.'], 'Press P or click to keep going', null);
    } else if (screen === SCREEN_CAUGHT) {
      drawPanel('SPOTTED!', ['A guard caught you. Back to the service door —', 'quieter this time.'], '', PALETTE.danger);
    } else if (screen === SCREEN_WIN) {
      const loot = state.player.loot + (state.player.hasOpal ? 1 : 0);
      drawPanel('ESCAPED', [
        `Rating: ${state.rating || 'Ghost'} — the Moon Opal is yours.`,
        `Loot ${loot}/4    Time ${formatTime(state.time)}    Score ${state.score}`,
        best > 0 ? `Best escape: ${formatTime(best)}` : 'Your first clean escape.',
      ], 'Press Space to play again', PALETTE.exit);
    } else if (screen === SCREEN_OVER) {
      drawPanel('CAUGHT THREE TIMES', ['The night watch wins tonight.', `Score ${state.score} — the Opal stays on its plinth.`], 'Press Space to try again', PALETTE.danger);
    }
  }

  return { draw, resize };
}
