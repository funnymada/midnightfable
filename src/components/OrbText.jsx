import { useEffect, useRef } from 'react';
import { fx } from '../lib/fx.js';
import { lettersAt } from '../scenes/Fable.jsx';

// Le scritte si compongono con gli orb dello sfondo: punti quadrati e luminosi, come la polvere della sfera,
// partono sparsi sullo schermo, volano nella forma delle lettere e prendono il colore della frase;
// e restano lì: la scritta è fatta solo di orb, il testo vero resta invisibile (serve per layout e accessibilità).
// All'uscita si sciolgono di nuovo nello sfondo.
// Ogni elemento con data-orb="<gruppo>" è una parte da comporre; data-orb-follow ne disegna il riflesso.
// L'avanzamento di ogni gruppo arriva dalla timeline (fx), la frase finale segue la macchina da scrivere.

const GROUPS = {
  ready: { key: 'orbReady', kind: 'tone', stagger: 0.6 },
  coming: { key: 'orbComing', kind: 'tone', stagger: 0.45, along: true },
  transit: { key: 'orbTransit', kind: 'ivory', stagger: 0.35 }
};
const ORB = [222, 230, 238];
const IVORY = [246, 239, 228];
const JITTER = 0.3;

const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const parseColor = (() => {
  const ctx = document.createElement('canvas').getContext('2d');
  const cache = new Map();
  return value => {
    const key = value.trim();
    if (cache.has(key)) return cache.get(key);
    ctx.fillStyle = '#000';
    ctx.fillStyle = key || '#fff';
    const v = ctx.fillStyle;
    const rgb = v.startsWith('#')
      ? [1, 3, 5].map(i => parseInt(v.slice(i, i + 2), 16))
      : v.match(/[\d.]+/g).slice(0, 3).map(Number);
    if (cache.size > 400) cache.clear();
    cache.set(key, rgb);
    return rgb;
  };
})();

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// punti dentro i glifi, in coordinate 0–1 del riquadro del testo (larghezza del testo × altezza del font)
const sampleText = (el, sampler) => {
  const cs = getComputedStyle(el);
  const text = el.textContent;
  const size = parseFloat(cs.fontSize);
  const k = Math.min(1, 140 / size);
  const ctx = sampler.getContext('2d', { willReadFrequently: true });
  const font = `${cs.fontStyle} ${cs.fontWeight} ${size * k}px ${cs.fontFamily}`;
  ctx.font = font;
  const spacing = parseFloat(cs.letterSpacing) || 0;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing * k}px`;
  const m = ctx.measureText(text);
  const ascent = m.fontBoundingBoxAscent ?? size * k * 0.8;
  const descent = m.fontBoundingBoxDescent ?? size * k * 0.25;
  const w = Math.max(1, Math.ceil(m.width));
  const h = Math.max(1, Math.ceil(ascent + descent));
  sampler.width = w;
  sampler.height = h;
  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing * k}px`;
  ctx.fillStyle = '#fff';
  ctx.fillText(text, 0, ascent);
  const data = ctx.getImageData(0, 0, w, h).data;
  // passo scelto in base alla superficie: più o meno lo stesso numero di orb per pixel su ogni schermo
  const layoutArea = (w / k) * (h / k);
  const target = Math.min(4500, Math.max(120, layoutArea / 13));
  let inside = 0;
  for (let i = 3; i < data.length; i += 16) if (data[i] > 128) inside++;
  const step = Math.max(1, Math.sqrt((inside * 4) / target));
  const points = [];
  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      const jx = x + (Math.random() - 0.5) * step;
      const jy = y + (Math.random() - 0.5) * step;
      const px = Math.min(w - 1, Math.max(0, jx | 0));
      const py = Math.min(h - 1, Math.max(0, jy | 0));
      if (data[(py * w + px) * 4 + 3] > 128) points.push(jx / w, jy / h);
    }
  }
  return { key: `${text}|${font}|${spacing}`, points, dot: step / k };
};

const buildParticles = points => {
  const n = points.length / 2;
  const p = new Float32Array(n * 8);
  for (let i = 0; i < n; i++) {
    p[i * 8] = points[i * 2];
    p[i * 8 + 1] = points[i * 2 + 1];
    p[i * 8 + 2] = Math.random(); // ritardo d'arrivo
    p[i * 8 + 3] = Math.random(); // posizione sparsa x (0–1 dello schermo)
    p[i * 8 + 4] = Math.random(); // posizione sparsa y
    p[i * 8 + 5] = Math.random() * Math.PI * 2; // fase
    p[i * 8 + 6] = 0.7 + Math.random() * 0.9; // misura
    p[i * 8 + 7] = Math.random() < 0.5 ? -1 : 1; // verso della curva
  }
  return p;
};

export default function OrbText() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas.closest('.stage');
    const ctx = canvas.getContext('2d');
    const sampler = document.createElement('canvas');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const leaves = [...stage.querySelectorAll('[data-orb]')].map(el => ({
      el,
      group: el.dataset.orb,
      start: Number(el.dataset.orbStart ?? 0),
      range: document.createRange(),
      key: '',
      particles: new Float32Array(0),
      dot: 2
    }));
    const followers = [...stage.querySelectorAll('[data-orb-follow]')].map(el => ({
      el,
      group: el.dataset.orbFollow,
      range: document.createRange()
    }));
    const byGroup = {};
    leaves.forEach(leaf => (byGroup[leaf.group] ||= []).push(leaf));
    const smoothed = {};

    // movimento ridotto: niente orb, resta il testo vero
    if (still) return undefined;
    stage.classList.add('orb-live');

    let width = 0;
    let height = 0;
    let dpr = 1;
    const resize = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    // opacità effettiva: tutti i contenitori fino allo stage (le scene sfumano anche solo un loro blocco interno)
    const sceneOpacity = el => {
      if (getComputedStyle(el).visibility === 'hidden') return 0;
      let o = 1;
      for (let n = el; n && n !== stage && o > 0.002; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
      return o;
    };

    let raf = 0;
    let last = performance.now();
    let time = 0;
    const frame = now => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      const vars = getComputedStyle(stage);
      const lo = parseColor(vars.getPropertyValue('--lo'));
      const mid = parseColor(vars.getPropertyValue('--mid'));
      const hi = parseColor(vars.getPropertyValue('--hi'));
      const tone = u => (u < 0.5 ? mix(lo, mid, smooth(0, 0.5, u)) : mix(mid, hi, smooth(0.5, 1, u)));
      const follow = 1 - Math.exp(-dt / 0.25);

      for (const [name, list] of Object.entries(byGroup)) {
        const cfg = GROUPS[name];
        const raw = cfg.typed ? lettersAt(fx.type) : fx[cfg.key];
        smoothed[name] = (smoothed[name] ?? raw) + (raw - (smoothed[name] ?? raw)) * follow;
        const G = smoothed[name];
        const mirrors = followers.filter(f => f.group === name);

        list.forEach((leaf, i) => {
          const el = leaf.el;
          // gruppo spento: niente orb, testo nascosto (la frase finale la gestisce la macchina da scrivere)
          if (!cfg.typed && G < 0.001) return;
          const visible = sceneOpacity(el);
          const text = el.textContent;
          if (!text.trim() || visible < 0.002) return;
          const cs = getComputedStyle(el);
          const key = `${text}|${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}|${cs.letterSpacing}`;
          if (key !== leaf.key) {
            leaf.key = key;
            const sample = sampleText(el, sampler);
            leaf.particles = buildParticles(sample.points);
            leaf.dot = Math.min(4, Math.max(1.6, sample.dot * 0.8));
          }
          leaf.range.selectNodeContents(el);
          const r = leaf.range.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) return;

          const n = list.length;
          const base = cfg.typed ? 0 : G * (1 + cfg.stagger) - cfg.stagger * (n > 1 ? i / (n - 1) : 0);
          // +4: anche l'ultima lettera arriva del tutto quando la frase è finita
          const lead = cfg.typed ? G + 4 : 0;
          const len = text.length;
          const progress = (u, j) => {
            if (cfg.typed) return clamp01((lead - (leaf.start + u * len)) / 4);
            const b = cfg.along ? G * (1 + cfg.stagger) - cfg.stagger * u : base;
            return clamp01((b - j * JITTER) / (1 - JITTER));
          };

          // riflesso nell'acqua: stessi orb capovolti, più deboli e sfumati verso il basso
          const flips = mirrors.map(f => {
            f.range.selectNodeContents(f.el);
            const box = f.el.parentElement.getBoundingClientRect();
            return { r: f.range.getBoundingClientRect(), box, o: parseFloat(getComputedStyle(f.el.parentElement).opacity) };
          });

          const kindColor = cfg.kind === 'ivory' ? () => IVORY : tone;
          const P = leaf.particles;
          const spread = Math.max(width, height);
          for (let k = 0; k < P.length; k += 8) {
            const u = P[k];
            const p = progress(u, P[k + 2]);
            if (p <= 0.001) continue;
            const e = ease(p);
            const phase = P[k + 5];
            const sx = P[k + 3] * width + Math.sin(time * 0.21 + phase) * 24;
            const sy = P[k + 4] * height + Math.cos(time * 0.17 + phase * 1.3) * 24;
            const tx = r.left + u * r.width;
            const ty = r.top + P[k + 1] * r.height;
            // traiettoria curva: a metà strada l'orb si scosta di lato
            const bend = Math.sin(Math.PI * e) * spread * 0.08 * P[k + 7];
            const dx = tx - sx;
            const dy = ty - sy;
            const dist = Math.hypot(dx, dy) || 1;
            const x = sx + dx * e - (dy / dist) * bend;
            const y = sy + dy * e + (dx / dist) * bend;
            // arrivati restano al loro posto e brillano piano: sono loro la scritta
            const twinkle = 0.8 + 0.2 * Math.sin(time * (1.4 + P[k + 6] * 2.2) + phase * 5);
            const alpha = smooth(0, 0.2, p) * visible * twinkle;
            if (alpha < 0.01) continue;
            const c = mix(ORB, kindColor(u), smooth(0.25, 0.9, p));
            const s = leaf.dot * P[k + 6] * (0.85 + 0.9 * (1 - e));
            const rgb = `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;
            ctx.fillStyle = `rgba(${rgb},${(alpha * 0.1).toFixed(3)})`;
            ctx.fillRect(x - s * 1.5, y - s * 1.5, s * 3, s * 3);
            ctx.fillStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
            ctx.fillRect(x - s / 2, y - s / 2, s, s);

            for (const f of flips) {
              const fx_ = f.r.left + u * f.r.width + (x - tx);
              const fy = f.r.top + (1 - P[k + 1]) * f.r.height - (y - ty);
              const depth = (fy - f.box.top) / Math.max(1, f.box.height);
              if (depth < 0 || depth > 0.75) continue;
              const a = alpha * f.o * (1 - depth / 0.75);
              if (a < 0.01) continue;
              ctx.fillStyle = `rgba(${rgb},${a.toFixed(3)})`;
              ctx.fillRect(fx_ - s / 2, fy - s / 2, s, s);
            }
          }
        });
      }
    };
    raf = requestAnimationFrame(frame);

    // i font arrivano dopo: ricampiona le lettere con Mezzotint
    document.fonts?.ready.then(() => leaves.forEach(leaf => (leaf.key = '')));

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      stage.classList.remove('orb-live');
    };
  }, []);

  return <canvas ref={canvasRef} className="orb-text" aria-hidden="true" />;
}
