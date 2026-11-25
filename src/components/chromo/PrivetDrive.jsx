// PuffyFrame3D.jsx — quadro gonfio in cromo iridescente con scritta al centro (three.js)
// Uso: <div style={{height: 600}}><PuffyFrame3D /></div>
// Props: text (default 'PRIVET DRIVE', si adatta alla larghezza) · interactive (trascina per girarlo, poi torna di fronte) · background
// buildFrame() costruisce solo il quadro (senza renderer), per usarlo in una scena three.js condivisa.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { chromeEnvironment, chromeMaterial, chromeRenderer, disposeTree } from './chrome.js';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
// Helvetiker bold (dal repository di three.js, che non lo include più nel pacchetto), ridotto a maiuscole e cifre
import fontJson from './helvetiker-bold.typeface.json';

/* ---------- il quadro (largo circa 11.5, alto 4.6, di fronte verso +z): solo il modello, senza renderer ----------
 *  cell / textCell = griglia della cornice e della scritta, textRes = risoluzione del campo delle lettere
 *  (valori più grandi = meno dettaglio, più veloce da calcolare) */
export function buildFrame({ font = new FontLoader().parse(fontJson), text = 'PRIVET DRIVE', cell = 0.026, textCell = 0.016, textRes = 0.008 } = {}) {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const FW = 5.2, FH = 1.75;                                         // mezza larghezza/altezza della cornice (asse del tubo)
  /* ---------- materiali: tutto cromo ---------- */
  const chrome = chromeMaterial();
  const violet = chrome.clone(); violet.color.set('#c9b6ff');          // tela: cromo appena più freddo

  /* ---------- cornice + tela imbottita come un'unica forma gonfia (SDF) ---------- */
  const roundRect = (x, y, hx, hy, r) => {
    const qx = Math.abs(x) - (hx - r), qy = Math.abs(y) - (hy - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  const frameSdf = (x, y, z) => {
    const d2 = Math.abs(roundRect(x, y, FW, FH, 0.6));               // distanza dal profilo della cornice
    return (Math.hypot(d2 / 0.44, z / 0.36) - 1) * 0.36;             // tubo gonfio a sezione ovale
  };
  const CW = FW - 0.2, CH = FH - 0.2;
  const canvasSdf = (x, y, z) => {
    const s2 = roundRect(x, y, CW, CH, 0.45);
    const u = Math.min(1, Math.abs(x) / CW), v = Math.min(1, Math.abs(y) / CH);
    const t = 0.05 + 0.14 * Math.sqrt(Math.max(0, 1 - u ** 4)) * Math.sqrt(Math.max(0, 1 - v ** 4));   // cuscino morbido
    return Math.max(s2, Math.abs(z + 0.06) - t);
  };

  /* ---------- surface nets ---------- */
  /* ---------- surface nets: dalla funzione a una mesh liscia ---------- */
  const buildMesh = (sdf, lo, hi, cell) => {
    const x0 = lo.x, y0 = lo.y, z0 = lo.z;
    const nx = Math.ceil((hi.x - lo.x) / cell), ny = Math.ceil((hi.y - lo.y) / cell), nz = Math.ceil((hi.z - lo.z) / cell);
    const F = new Float32Array(nx * ny * nz), id = (i, j, k) => i + nx * (j + ny * k);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
      F[id(i, j, k)] = sdf(x0 + i * cell, y0 + j * cell, z0 + k * cell);
    const vidx = new Int32Array(nx * ny * nz).fill(-1), pos = [];
    const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const v = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      let inside = 0;
      for (let c = 0; c < 8; c++) { v[c] = F[id(i + corners[c][0], j + corners[c][1], k + corners[c][2])]; if (v[c] < 0) inside++; }
      if (inside === 0 || inside === 8) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (const [a, b] of edges) {
        if ((v[a] < 0) === (v[b] < 0)) continue;
        const t = v[a] / (v[a] - v[b]), A = corners[a], B = corners[b];
        sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t; n++;
      }
      vidx[id(i, j, k)] = pos.length / 3;
      pos.push(x0 + (i + sx / n) * cell, y0 + (j + sy / n) * cell, z0 + (k + sz / n) * cell);
    }
    const idx = [];
    const quad = (a, b, c, d, flip) => {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      flip ? idx.push(a, d, c, a, c, b) : idx.push(a, b, c, a, c, d);
    };
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const f0 = F[id(i, j, k)] < 0;
      if (f0 !== (F[id(i + 1, j, k)] < 0))
        quad(vidx[id(i, j - 1, k - 1)], vidx[id(i, j, k - 1)], vidx[id(i, j, k)], vidx[id(i, j - 1, k)], f0);
      if (f0 !== (F[id(i, j + 1, k)] < 0))
        quad(vidx[id(i - 1, j, k - 1)], vidx[id(i - 1, j, k)], vidx[id(i, j, k)], vidx[id(i, j, k - 1)], f0);
      if (f0 !== (F[id(i, j, k + 1)] < 0))
        quad(vidx[id(i - 1, j - 1, k)], vidx[id(i, j - 1, k)], vidx[id(i, j, k)], vidx[id(i - 1, j, k)], f0);
    }
    // normali dal gradiente del campo: superficie perfettamente liscia per i riflessi
    const nrm = new Float32Array(pos.length), e = cell * 0.5;
    for (let p = 0; p < pos.length; p += 3) {
      const x = pos[p], y = pos[p + 1], z = pos[p + 2];
      let gx = sdf(x + e, y, z) - sdf(x - e, y, z), gy = sdf(x, y + e, z) - sdf(x, y - e, z), gz = sdf(x, y, z + e) - sdf(x, y, z - e);
      const l = Math.hypot(gx, gy, gz) || 1; nrm[p] = gx / l; nrm[p + 1] = gy / l; nrm[p + 2] = gz / l;
    }
    // orienta ogni triangolo verso l'esterno (normale del campo)
    const P = (i, c) => pos[idx[i] * 3 + c];
    for (let t = 0; t < idx.length; t += 3) {
      const ux = P(t + 1, 0) - P(t, 0), uy = P(t + 1, 1) - P(t, 1), uz = P(t + 1, 2) - P(t, 2);
      const wx = P(t + 2, 0) - P(t, 0), wy = P(t + 2, 1) - P(t, 1), wz = P(t + 2, 2) - P(t, 2);
      const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx;
      let dot = 0;
      for (let q = 0; q < 3; q++) { const o = idx[t + q] * 3; dot += cx * nrm[o] + cy * nrm[o + 1] + cz * nrm[o + 2]; }
      if (dot < 0) { const sw = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = sw; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setIndex(idx);
    return g;
  };
  const frameGeo = buildMesh(frameSdf, V3(-FW - 0.55, -FH - 0.55, -0.45), V3(FW + 0.55, FH + 0.55, 0.45), cell);
  const canvasGeo = buildMesh(canvasSdf, V3(-FW, -FH, -0.3), V3(FW, FH, 0.2), cell);

  const root = new THREE.Group();
  root.add(new THREE.Mesh(frameGeo, chrome), new THREE.Mesh(canvasGeo, violet));

  /* ---------- scritta a palloncino: campo di distanza 2D delle lettere, poi gonfiata ---------- */
  const textSdfFrom = (shapes, res) => {
    const pts = shapes.flatMap(sh => [...sh.getPoints(32), ...sh.holes.flatMap(h => h.getPoints(32))]);
    const bb = new THREE.Box2().setFromPoints(pts), pad = 0.45;
    const minX = bb.min.x - pad, maxY = bb.max.y + pad;
    const w = Math.ceil((bb.max.x - bb.min.x + 2 * pad) / res), h = Math.ceil((bb.max.y - bb.min.y + 2 * pad) / res);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.beginPath();
    const path = p => p.forEach((q, i) => (i ? g.lineTo : g.moveTo).call(g, (q.x - minX) / res, (maxY - q.y) / res));
    shapes.forEach(sh => { path(sh.getPoints(32)); g.closePath(); sh.holes.forEach(hl => { path(hl.getPoints(32)); g.closePath(); }); });
    g.fill('evenodd');
    const img = g.getImageData(0, 0, w, h).data, inside = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) inside[i] = img[i * 4] > 127 ? 1 : 0;
    // trasformata di distanza euclidea esatta (Felzenszwalb), in pixel
    const INF = 1e20;
    const edt1 = (f, n) => {
      const d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1); let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < n; q++) {
        let s2 = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s2 <= z[k]) { k--; s2 = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
        k++; v[k] = q; z[k] = s2; z[k + 1] = INF;
      }
      k = 0; for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
      return d;
    };
    const edt = feature => {
      const f = new Float64Array(w * h);
      for (let i = 0; i < w * h; i++) f[i] = feature(i) ? 0 : INF;
      const col = new Float64Array(h);
      for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) col[y] = f[y * w + x]; const d = edt1(col, h); for (let y = 0; y < h; y++) f[y * w + x] = d[y]; }
      const row = new Float64Array(w);
      for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) row[x] = f[y * w + x]; const d = edt1(row, w); for (let x = 0; x < w; x++) f[y * w + x] = Math.sqrt(d[x]); }
      return f;
    };
    const toOut = edt(i => !inside[i]), toIn = edt(i => inside[i]);
    const D = new Float32Array(w * h);                                 // >0 dentro le lettere
    for (let i = 0; i < w * h; i++) D[i] = (inside[i] ? toOut[i] - 0.5 : -(toIn[i] - 0.5)) * res + GROW;
    // sfoca il campo: niente spigolo lungo il centro dei tratti, curve morbide
    const tmp = new Float32Array(w * h), Rb = Math.max(2, Math.round(0.031 * size / res));
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < h; y++) { let acc = 0, n = 0; for (let x = -Rb; x < w + Rb; x++) {
        if (x + Rb < w) { acc += D[y * w + x + Rb]; n++; } if (x - Rb - 1 >= 0) { acc -= D[y * w + x - Rb - 1]; n--; } if (x >= 0 && x < w) tmp[y * w + x] = acc / n; } }
      for (let x = 0; x < w; x++) { let acc = 0, n = 0; for (let y = -Rb; y < h + Rb; y++) {
        if (y + Rb < h) { acc += tmp[(y + Rb) * w + x]; n++; } if (y - Rb - 1 >= 0) { acc -= tmp[(y - Rb - 1) * w + x]; n--; } if (y >= 0 && y < h) D[y * w + x] = acc / n; } }
    }
    const sample = (x, y) => {
      const fx = THREE.MathUtils.clamp((x - minX) / res, 0, w - 1.001), fy = THREE.MathUtils.clamp((maxY - y) / res, 0, h - 1.001);
      const ix = fx | 0, iy = fy | 0, tx = fx - ix, ty = fy - iy, o = iy * w + ix;
      return (D[o] * (1 - tx) + D[o + 1] * tx) * (1 - ty) + (D[o + w] * (1 - tx) + D[o + w + 1] * tx) * ty;
    };
    return { sample, lo: V3(bb.min.x - 0.2, bb.min.y - 0.2, 0), hi: V3(bb.max.x + 0.2, bb.max.y + 0.2, 0) };
  };
  // la scritta si adatta alla larghezza della tela
  const unitBox = new THREE.Box2().setFromPoints(font.generateShapes(text, 1).flatMap(sh => sh.getPoints(8)));
  const size = Math.min(1.45, (2 * CW - 1.0) / (unitBox.max.x - unitBox.min.x));
  const GROW = 0.048 * size;                                           // ingrassa le lettere (in proporzione)
  const shapes = font.generateShapes(text, size);
  const TF = textSdfFrom(shapes, textRes);
  const tcx = (TF.lo.x + TF.hi.x) / 2, tcy = (TF.lo.y + TF.hi.y) / 2;
  const RB = 0.22 * size, ZC = 0.14;                                            // raggio del "palloncino" e quota della scritta
  const textSdf = (x, y, z) => {
    const d = TF.sample(x + tcx, y + tcy), dz = z - ZC;
    if (d <= 0) return Math.hypot(d, dz);
    const u = Math.min(d / RB, 1);
    return Math.abs(dz) - RB * Math.sqrt(1 - (1 - u) * (1 - u));        // bordo tondo, rigonfio al centro del tratto
  };
  const textGeo = buildMesh(textSdf, V3(TF.lo.x - tcx, TF.lo.y - tcy, ZC - RB - 0.05), V3(TF.hi.x - tcx, TF.hi.y - tcy, ZC + RB + 0.05), textCell);
  const label = new THREE.Mesh(textGeo, chrome);
  root.add(label);
  return { object: root, update() {}, dispose: () => disposeTree(root) };
}

/* ------------------------------------------------------------------ *
 *  Quadro gonfio 3D "PRIVET DRIVE" — cromo iridescente (viola / magenta / arancio)
 *  Cornice, tela imbottita e scritta: tutto arrotondato, come gonfiato.
 *  createPuffyFrame(container, font, { text, interactive, background }) -> dispose()
 * ------------------------------------------------------------------ */
function createPuffyFrame(container, font, opts = {}) {
  const { text = 'PRIVET DRIVE', interactive = true, background = null } = opts;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const W = () => container.clientWidth || 800;
  const H = () => container.clientHeight || 600;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ---------- renderer / scena / camera ---------- */
  const renderer = chromeRenderer();
  renderer.setSize(W(), H());
  const cv = renderer.domElement;
  Object.assign(cv.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none' });
  container.appendChild(cv);

  const scene = new THREE.Scene();
  if (background) scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(30, W() / H(), 0.1, 100);
  const FW = 5.2, FH = 1.75;                                         // mezza larghezza/altezza della cornice (asse del tubo)
  const HALF_W = FW + 0.6, HALF_H = FH + 0.6;
  const fit = () => {
    const a = W() / H(), t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.aspect = a;
    camera.position.set(0, 0, Math.max(HALF_H / t, HALF_W / (t * a)) * 1.15);
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H());
  };
  fit();

  const envRT = chromeEnvironment(renderer);
  scene.environment = envRT.texture;

  const small = Math.min(W(), H()) < 520;
  const built = buildFrame({ font, text, cell: small ? 0.034 : 0.026, textCell: small ? 0.022 : 0.016 });
  const root = built.object;
  scene.add(root);

  /* ---------- interazione: rotazione libera, poi torna di fronte ---------- */
  const TAU = Math.PI * 2;
  const rot = { x: 0, y: 0, vx: 0, vy: 0 };
  let drag = null, idle = 10;
  const onDown = e => {
    cv.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    rot.vx = rot.vy = 0; cv.style.cursor = 'grabbing';
  };
  const onMove = e => {
    if (!drag) return;
    const now = performance.now(), dt = Math.max((now - drag.t) / 1000, 1e-3);
    const dx = (e.clientX - drag.x) * 0.011, dy = (e.clientY - drag.y) * 0.011;
    rot.y += dx; rot.x += dy;
    rot.vy = THREE.MathUtils.lerp(rot.vy, dx / dt, 0.5);
    rot.vx = THREE.MathUtils.lerp(rot.vx, dy / dt, 0.5);
    Object.assign(drag, { x: e.clientX, y: e.clientY, t: now }); idle = 0;
  };
  const onUp = e => {
    if (!drag) return;
    if (performance.now() - drag.t > 80) rot.vx = rot.vy = 0;
    rot.vx = THREE.MathUtils.clamp(rot.vx, -14, 14);
    rot.vy = THREE.MathUtils.clamp(rot.vy, -14, 14);
    drag = null; cv.style.cursor = 'grab';
    cv.releasePointerCapture?.(e.pointerId);
  };
  if (interactive) {
    cv.style.cursor = 'grab';
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
  }

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = THREE.MathUtils.clamp(clock.getDelta(), 1e-3, 1 / 30), t = clock.elapsedTime;
    idle += dt;
    if (!drag) {
      rot.y += rot.vy * dt; rot.x += rot.vx * dt;
      rot.vy *= Math.pow(0.15, dt); rot.vx *= Math.pow(0.15, dt);
      if (idle > 1.5) {                                // torna di fronte (al giro intero più vicino), poi ondeggia piano
        const swayY = reduce ? 0 : Math.sin(t * 0.45) * 0.38, swayX = reduce ? 0 : Math.sin(t * 0.33 + 1) * 0.12;
        const k = Math.min(1, dt * 1.6);
        rot.y += (Math.round(rot.y / TAU) * TAU + swayY - rot.y) * k;
        rot.x += (Math.round(rot.x / TAU) * TAU + swayX - rot.x) * k;
      }
    }
    root.rotation.set(rot.x, rot.y, 0, 'YXZ');
    root.position.y = reduce ? 0 : Math.sin(t * 0.8) * 0.05;
    scene.environmentRotation.y = reduce ? 0 : t * 0.12;
    renderer.render(scene, camera);
  });

  const ro = new ResizeObserver(fit);
  ro.observe(container);

  return function dispose() {
    renderer.setAnimationLoop(null);
    ro.disconnect();
    cv.removeEventListener('pointerdown', onDown);
    cv.removeEventListener('pointermove', onMove);
    cv.removeEventListener('pointerup', onUp);
    cv.removeEventListener('pointercancel', onUp);
    built.dispose(); envRT.dispose(); renderer.dispose();
    cv.remove();
  };
}

export default function PuffyFrame3D({ className = '', style, text = 'PRIVET DRIVE', interactive = true, background = null }) {
  const ref = useRef(null);
  useEffect(() => {
    const font = new FontLoader().parse(fontJson);
    return createPuffyFrame(ref.current, font, { text, interactive, background });
  }, [text, interactive, background]);
  return <div ref={ref} className={className} style={{ width: '100%', height: '100%', minHeight: 360, ...style }} />;
}