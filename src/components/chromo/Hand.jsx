// ChromeHand3D.jsx — mano 3D in cromo iridescente (three.js, nessuna dipendenza oltre a "three")
// Uso: <div style={{height: 700}}><ChromeHand3D /></div>
// Props: interactive (trascina per ruotarla a 360°, gira da sola) · background (default trasparente)
// buildHand({ cell }) costruisce solo la mano (senza renderer): la usa anche la stanza finale (ChromoRoom).
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { chromeEnvironment, chromeMaterial, chromeRenderer, disposeTree } from './chrome.js';

/* ---------- la mano: campo di distanza (SDF) fuso in un'unica superficie liscia ----------
 *  cell = lato della griglia (più piccolo = più dettaglio, più lento da calcolare) */
export function buildHand({ cell = 0.027 } = {}) {
  /* ---------- scheletro della mano (sinistra, palmo verso +z, pollice a -x) ---------- */
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const segs = [];                                         // [ax,ay,az, bx,by,bz, r0, r1, k]
  const seg = (a, b, r0, r1, k) => segs.push([a.x, a.y, a.z, b.x, b.y, b.z, r0, r1, k]);
  const knob = (p, r, k) => seg(p, p, r, r, k);           // sfera (nocca / articolazione)
  const nail = (tip, dir, back, r) => seg(
    tip.clone().addScaledVector(dir, -0.3).addScaledVector(back, r * 0.6),
    tip.clone().addScaledVector(dir, -0.07).addScaledVector(back, r * 0.55), r * 0.62, r * 0.58, 0.03);
  const finger = (K, spread, curls, lens, radii0) => {
    const radii = radii0.map(r => r * 1.15);
    const dir = V3(Math.sin(spread), Math.cos(spread), 0);
    const axis = V3(Math.cos(spread), -Math.sin(spread), 0);
    let p = K.clone();
    knob(K.clone().add(V3(0, 0, -0.07)), radii[0] * 0.95, 0.15);           // nocca sul dorso
    lens.forEach((len, i) => {
      dir.applyAxisAngle(axis, curls[i]);                  // flessione verso il palmo
      const q = p.clone().addScaledVector(dir, len);
      seg(p, q, radii[i], radii[i + 1], i === 0 ? 0.18 : 0.07);
      if (i < lens.length - 1) knob(q, radii[i + 1] * 1.03, 0.09);          // articolazione appena più spessa
      else nail(q, dir, axis.clone().cross(dir).negate(), radii[i + 1]);
      p = q;
    });
  };
  // indice quasi dritto, medio piegato a metà, anulare e mignolo chiusi verso il palmo
  finger(V3(-0.52, 0.98, 0), -0.06, [0.04, 0.08, 0.05], [0.92, 0.56, 0.42], [0.2, 0.18, 0.16, 0.14]);
  finger(V3(-0.17, 1.05, 0), 0.03, [0.38, 0.6, 0.28], [1.0, 0.62, 0.45], [0.205, 0.185, 0.165, 0.145]);
  finger(V3(0.19, 1.0, 0), 0.1, [0.66, 1.3, 0.55], [0.94, 0.58, 0.43], [0.195, 0.175, 0.16, 0.14]);
  finger(V3(0.52, 0.88, 0), 0.22, [0.76, 1.35, 0.55], [0.72, 0.45, 0.37], [0.175, 0.16, 0.145, 0.125]);
  // pollice aperto di lato, a "C" con l'indice
  {
    const p0 = V3(-0.42, -0.62, 0.06);
    const d1 = V3(-0.74, 0.5, 0.45).normalize(), d2 = V3(-0.58, 0.72, 0.38).normalize(), d3 = V3(-0.42, 0.86, 0.3).normalize();
    const p1 = p0.clone().addScaledVector(d1, 0.8), p2 = p1.clone().addScaledVector(d2, 0.56), p3 = p2.clone().addScaledVector(d3, 0.45);
    seg(p0, p1, 0.36, 0.27, 0.26); knob(p1, 0.27, 0.09); seg(p1, p2, 0.265, 0.23, 0.07); knob(p2, 0.235, 0.08); seg(p2, p3, 0.23, 0.19, 0.07);
    const axis = V3(d3.y, -d3.x, 0).normalize();
    nail(p3, d3, axis.clone().cross(d3), 0.19);
  }
  // cuscinetti del palmo
  seg(V3(-0.55, 0.93, 0.02), V3(0.55, 0.9, 0.02), 0.19, 0.18, 0.16);       // fila delle nocche
  seg(V3(0.46, -0.62, 0.07), V3(0.5, 0.42, 0.07), 0.23, 0.2, 0.2);        // ipotenar (lato mignolo)
  seg(V3(-0.28, -0.72, 0.11), V3(-0.5, -0.12, 0.08), 0.3, 0.26, 0.24);    // tenar (base del pollice)
  const S = Float32Array.from(segs.flat()), NS = segs.length;
  const B = new Float32Array(NS * 4);                       // sfere di ingombro per saltare i segmenti lontani
  segs.forEach((g, i) => {
    B[i * 4] = (g[0] + g[3]) / 2; B[i * 4 + 1] = (g[1] + g[4]) / 2; B[i * 4 + 2] = (g[2] + g[5]) / 2;
    B[i * 4 + 3] = Math.hypot(g[3] - g[0], g[4] - g[1], g[5] - g[2]) / 2 + Math.max(g[6], g[7]) + g[8];
  });

  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  const sdf = (x, y, z) => {
    // palmo: parallelepipedo arrotondato, più largo verso le nocche
    const w = 0.36 + 0.1 * Math.min(1, Math.max(0, (y + 0.9) / 1.9));
    const qx = Math.abs(x) - w, qy = Math.abs(y - 0.05) - 0.68, qz = Math.abs(z);
    let d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - 0.33;
    // polso e avambraccio (sezione ovale), tagliato netto in basso
    {
      const zz = z * 1.55, h = Math.min(1, Math.max(0, (-0.85 - y) / 1.55));
      const dw = (Math.hypot(x, zz, y - (-0.85 - h * 1.55)) - (0.6 - 0.06 * h)) * 0.64;
      d = smin(d, dw, 0.42);
    }
    for (let i = 0; i < NS; i++) {
      const o = i * 9, c = i * 4;
      const ex = x - B[c], ey = y - B[c + 1], ez = z - B[c + 2];
      if (ex * ex + ey * ey + ez * ez > (d + B[c + 3]) ** 2 && d + B[c + 3] > 0) continue;   // troppo lontano: non cambia nulla
      const ax = S[o], ay = S[o + 1], az = S[o + 2], bx = S[o + 3] - ax, by = S[o + 4] - ay, bz = S[o + 5] - az;
      const px = x - ax, py = y - ay, pz = z - az;
      const hh = Math.min(1, Math.max(0, (px * bx + py * by + pz * bz) / Math.max(bx * bx + by * by + bz * bz, 1e-9)));   // anche per le sfere
      const dc = Math.hypot(px - bx * hh, py - by * hh, pz - bz * hh) - (S[o + 6] + (S[o + 7] - S[o + 6]) * hh);
      d = smin(d, dc, S[o + 8]);
    }
    return Math.max(d, -(y + 1.95));                    // polso tagliato netto
  };

  /* ---------- surface nets: dalla funzione a una mesh liscia ---------- */
  const buildMesh = cell => {
    const lo = V3(-1.0, -2.0, -0.55), hi = V3(1.0, 1.2, 0.55);
    for (const sg of segs) for (const o of [0, 3]) {
      lo.min(V3(sg[o] - 0.4, sg[o + 1] - 0.4, sg[o + 2] - 0.4)); hi.max(V3(sg[o] + 0.4, sg[o + 1] + 0.4, sg[o + 2] + 0.4));
    }
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
  const geo = buildMesh(cell);
  geo.computeBoundingBox();
  const mid = geo.boundingBox.getCenter(new THREE.Vector3()), size = geo.boundingBox.getSize(new THREE.Vector3());
  geo.translate(-mid.x, -mid.y, -mid.z);
  const object = new THREE.Group();
  const hand = new THREE.Mesh(geo, chromeMaterial());
  hand.rotation.set(0, 0.35, -0.08);                    // posa a tre quarti
  object.add(hand);
  return { object, size, update() {}, dispose: () => disposeTree(object) };
}

function createHand(container, opts = {}) {
  const { interactive = true, background = null } = opts;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const W = () => container.clientWidth || 600;
  const H = () => container.clientHeight || 700;

  /* ---------- renderer / scena / camera ---------- */
  const renderer = chromeRenderer();
  renderer.setSize(W(), H());
  const cv = renderer.domElement;
  Object.assign(cv.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none' });
  container.appendChild(cv);

  const scene = new THREE.Scene();
  if (background) scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(30, W() / H(), 0.1, 100);

  const envRT = chromeEnvironment(renderer);
  scene.environment = envRT.texture;

  const small = Math.min(W(), H()) < 520;
  const built = buildHand({ cell: small ? 0.036 : 0.027 });
  const size = built.size;

  const root = new THREE.Group(); scene.add(root);
  root.add(built.object);

  const R = Math.max(size.y, size.x) / 2;
  const fit = () => {
    const a = W() / H(), t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.aspect = a;
    camera.position.set(0, 0, Math.max(R / t, (size.x / 2 + 0.5) / (t * a)) * 1.1);
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H());
  };
  fit();

  /* ---------- interazione: rotazione libera a 360° ---------- */
  const TAU = Math.PI * 2, AUTO = reduce ? 0 : 0.5;
  const rot = { x: 0, y: 0, vx: 0, vy: AUTO };
  let drag = null, idle = 10;
  const onDown = e => {
    cv.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    rot.vx = rot.vy = 0; cv.style.cursor = 'grabbing';
  };
  const onMove = e => {
    if (!drag) return;
    const now = performance.now(), dt = Math.max((now - drag.t) / 1000, 1e-3);
    const dx = (e.clientX - drag.x) * 0.012, dy = (e.clientY - drag.y) * 0.012;
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
      const settle = idle > 1.5;
      rot.vy += (AUTO - rot.vy) * Math.min(1, dt * (settle ? 1.2 : 0.6));
      rot.vx *= Math.pow(0.08, dt);
      if (settle) rot.x += (Math.round(rot.x / TAU) * TAU - rot.x) * Math.min(1, dt * 1.5);
    }
    root.rotation.set(rot.x, rot.y, 0, 'YXZ');
    root.position.y = reduce ? 0 : Math.sin(t * 0.8) * 0.07;
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
    disposeTree(root); envRT.dispose(); renderer.dispose();
    cv.remove();
  };
}

export default function ChromeHand3D({ className = '', style, interactive = true, background = null }) {
  const ref = useRef(null);
  useEffect(() => createHand(ref.current, { interactive, background }), [interactive, background]);
  return <div ref={ref} className={className} style={{ width: '100%', height: '100%', minHeight: 400, ...style }} />;
}