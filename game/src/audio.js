// Tiny WebAudio synth: positional guard footsteps, suspicion and alarm
// stings, pickup and win chimes. Everything is generated — no audio files,
// no network. In Node (no window) every call is a silent no-op.

let ctx = null;
let master = null;

function ensure() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.25;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq, duration, type, volume, when = 0, slideTo = null) {
  const ac = ensure();
  if (!ac) return;
  const t0 = ac.currentTime + when;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** A soft footstep tick, panned by the guard's direction and quieter with
 *  distance — the sound tells you where a guard is. */
export function playFootstep(distance, directionX) {
  const ac = ensure();
  if (!ac) return;
  const volume = Math.max(0.02, 0.22 * (1 - distance / 700));
  const t0 = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
  osc.type = 'sine';
  osc.frequency.setValueAtTime(90, t0);
  osc.frequency.exponentialRampToValueAtTime(55, t0 + 0.07);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
  osc.connect(gain);
  if (pan) {
    pan.pan.value = Math.max(-0.8, Math.min(0.8, directionX));
    gain.connect(pan);
    pan.connect(master);
  } else {
    gain.connect(master);
  }
  osc.start(t0);
  osc.stop(t0 + 0.12);
}

export function playSuspicion() {
  tone(620, 0.16, 'triangle', 0.16);
  tone(830, 0.2, 'triangle', 0.14, 0.09);
}

export function playAlarm() {
  tone(220, 0.22, 'sawtooth', 0.14, 0, 440);
  tone(440, 0.22, 'sawtooth', 0.12, 0.18, 220);
}

export function playPickup() {
  tone(880, 0.12, 'sine', 0.18);
  tone(1318, 0.18, 'sine', 0.16, 0.08);
}

export function playOpal() {
  tone(1046, 0.2, 'sine', 0.18);
  tone(1568, 0.3, 'sine', 0.16, 0.1);
  tone(2093, 0.4, 'sine', 0.12, 0.2);
}

export function playPebble() {
  tone(1400, 0.08, 'sine', 0.12, 0, 900);
}

export function playWin() {
  [523, 659, 784, 1046].forEach((freq, i) => tone(freq, 0.35, 'triangle', 0.16, i * 0.12));
}

export function playCaught() {
  tone(180, 0.35, 'sawtooth', 0.16, 0, 90);
}
