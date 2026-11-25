import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { HOLD_SPANS, LENGTH } from '../timeline.js';

// Cinematica: scroll automatico su tutto il sito fino in fondo, rallentando quasi fino a fermarsi
// nelle pause in cui il testo è formato, così si legge; in fondo aspetta un secondo e torna all'inizio
// 8 volte più veloce. Mentre è in corso l'utente non può interagire (vedi lockInput).

const SPEED = 1; // unità di timeline al secondo fuori dalle pause
const DWELL = 0.8; // secondi di lettura per ogni unità di pausa
const END_PAUSE = 1; // secondi fermo in fondo
const RETURN_FACTOR = 8; // il ritorno è 8 volte più veloce dell'andata

// tratti dell'andata: [da, a, secondi]
function forwardSegments() {
  const out = [];
  let at = 0;
  for (const { start, end, read } of HOLD_SPANS) {
    if (start > at) out.push([at, start, (start - at) / SPEED]);
    out.push([start, end, (end - start) * (read ?? DWELL)]);
    at = end;
  }
  if (at < LENGTH) out.push([at, LENGTH, (LENGTH - at) / SPEED]);
  return out;
}

// Blocca rotella, tocco, tastiera e clic; restituisce la funzione che li sblocca
const SCROLL_KEYS = new Set([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', 'Tab']);
export function lockInput() {
  const block = e => e.preventDefault();
  const keys = e => SCROLL_KEYS.has(e.key) && e.preventDefault();
  const opts = { passive: false, capture: true };
  const pointer = ['wheel', 'touchmove', 'touchstart', 'mousedown', 'click', 'contextmenu'];
  pointer.forEach(e => window.addEventListener(e, block, opts));
  window.addEventListener('keydown', keys, opts);
  return () => {
    pointer.forEach(e => window.removeEventListener(e, block, opts));
    window.removeEventListener('keydown', keys, opts);
  };
}

export function startAutoplay({ delay = 0, onDone } = {}) {
  const segments = forwardSegments();
  const forward = segments.reduce((s, [, , d]) => s + d, 0);
  const back = LENGTH / (SPEED * RETURN_FACTOR);
  const total = forward + END_PAUSE + back;
  const smooth = t => t * t * (3 - 2 * t);

  // posizione (in unità di timeline) al secondo t
  const unitAt = t => {
    if (t >= forward + END_PAUSE) return LENGTH * (1 - smooth(Math.min(1, (t - forward - END_PAUSE) / back)));
    if (t >= forward) return LENGTH;
    for (const [a, b, d] of segments) {
      if (t <= d) return a + (b - a) * (t / d);
      t -= d;
    }
    return LENGTH;
  };

  let raf = 0;
  let t0 = 0;
  const tick = now => {
    if (!t0) t0 = now;
    const t = (now - t0) / 1000;
    window.scrollTo(0, (unitAt(t) / LENGTH) * ScrollTrigger.maxScroll(window));
    if (t < total) raf = requestAnimationFrame(tick);
    else onDone?.();
  };
  const timer = setTimeout(() => (raf = requestAnimationFrame(tick)), delay);
  return () => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
  };
}
