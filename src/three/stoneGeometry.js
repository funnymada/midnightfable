// Geometria di "ARE YOU READY?" in pietra (StoneText3D), senza DOM né WebGL:
// gira in un Web Worker (stoneWorker.js) perché scolpire le lettere richiede qualche secondo
// e bloccherebbe la pagina all'apertura. Restituisce solo array, che il componente trasforma in mesh.
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TessellateModifier } from 'three/examples/jsm/modifiers/TessellateModifier.js';
import { mergeVertices, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/* ---------- rumore 3D (simplex) per scolpire la geometria ---------- */
const STONE_NOISE = (() => {
  const g = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
  const p = new Uint8Array(512);
  let s = 1337;
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const F3 = 1 / 3, G3 = 1 / 6;
  const n3 = (x, y, z) => {
    const t = (x + y + z) * F3, i = Math.floor(x + t), j = Math.floor(y + t), k = Math.floor(z + t);
    const t0 = (i + j + k) * G3, x0 = x - i + t0, y0 = y - j + t0, z0 = z - k + t0;
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) { if (y0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0]; else if (x0 >= z0) [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1]; else [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1]; }
    else { if (y0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1]; else if (x0 < z0) [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1]; else [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0]; }
    const c = [[x0, y0, z0, 0, 0, 0], [x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3, i1, j1, k1],
      [x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3, i2, j2, k2], [x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3, 1, 1, 1]];
    let n = 0;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    for (const [a, b, d, di, dj, dk] of c) {
      let tt = 0.6 - a * a - b * b - d * d;
      if (tt > 0) { const gr = g[p[ii + di + p[jj + dj + p[kk + dk]]] % 12]; tt *= tt; n += tt * tt * (gr[0] * a + gr[1] * b + gr[2] * d); }
    }
    return 32 * n;
  };
  const fbm = (x, y, z, o = 4) => { let a = 0.5, f = 1, s2 = 0; for (let i = 0; i < o; i++) { s2 += a * n3(x * f, y * f, z * f); f *= 2.03; a *= 0.5; } return s2; };
  return { n3, fbm };
})();

// punti di polvere presi a caso sulla superficie: posizione, istante in cui si staccano, direzione, misura
const makeGrains = (g, n) => {
  const P = g.attributes.position, T = g.attributes.aT, cnt = Math.min(n, P.count);
  const pos = new Float32Array(cnt * 3), at = new Float32Array(cnt), ar = new Float32Array(cnt * 3), as = new Float32Array(cnt);
  for (let i = 0; i < cnt; i++) {
    const j = Math.floor(Math.random() * P.count);
    pos[i * 3] = P.getX(j); pos[i * 3 + 1] = P.getY(j); pos[i * 3 + 2] = P.getZ(j);
    at[i] = T.getX(j); ar[i * 3] = Math.random(); ar[i * 3 + 1] = Math.random(); ar[i * 3 + 2] = Math.random();
    as[i] = 0.012 + Math.random() ** 2 * 0.03;
  }
  return { position: pos, aT: at, aR: ar, aS: as };
};

const pack = g => {
  const out = {};
  for (const [name, attr] of Object.entries(g.attributes)) out[name] = { array: attr.array, size: attr.itemSize };
  return { attributes: out, index: g.index ? g.index.array : null };
};

// `part`/`parts`: le lettere sono indipendenti, così più worker possono scolpirne ciascuno una parte.
// Ogni parte restituisce le stesse misure del blocco (prese dalle lettere prima della scultura).
export function buildStone(fontJson, lines, part = 0, parts = 1) {
  const font = new FontLoader().parse(fontJson);
  const { fbm } = STONE_NOISE;

  /* ---------- curvatura per vertice: + spigoli, - cavità (normalizzata -1..1) ---------- */
  const curvature = g => {
    const P = g.attributes.position.array, N = g.attributes.normal.array, I = g.index.array, n = P.length / 3;
    const sum = new Float32Array(n * 3), cnt = new Float32Array(n);
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
      const u = I[t + e], v = I[t + (e + 1) % 3], w = I[t + (e + 2) % 3];
      for (let c = 0; c < 3; c++) sum[u * 3 + c] += P[v * 3 + c] + P[w * 3 + c];
      cnt[u] += 2;
    }
    let k = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let d = 0;
      for (let c = 0; c < 3; c++) d += (sum[i * 3 + c] / cnt[i] - P[i * 3 + c]) * N[i * 3 + c];
      k[i] = -d;
    }
    for (let it = 0; it < 2; it++) {                         // ammorbidisce il rumore
      const s2 = new Float32Array(n), c2 = new Float32Array(n);
      for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
        const u = I[t + e]; s2[u] += k[I[t + (e + 1) % 3]] + k[I[t + (e + 2) % 3]]; c2[u] += 2;
      }
      k = k.map((x, i) => 0.5 * x + 0.5 * s2[i] / c2[i]);
    }
    const ab = Array.from(k, Math.abs).sort((x, y) => x - y), ref = ab[Math.floor(ab.length * 0.97)] || 1;
    return k.map(x => THREE.MathUtils.clamp(x / ref, -1, 1));
  };

  /* ---------- scolpisce una geometria: densa, rovinata dal rumore, spigoli scheggiati ---------- */
  const sculpt = (geo, amp, chipAmp) => {
    let g = new TessellateModifier(0.06, 5).modify(geo);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-4);
    g.computeVertexNormals();
    const k0 = curvature(g);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const chip = THREE.MathUtils.smoothstep(k0[i], 0.2, 0.85) * Math.max(0, fbm(x * 5.5 + 3, y * 5.5, z * 5.5) + 0.18);
      const d = amp * (0.5 * fbm(x * 3.2, y * 3.2, z * 3.2) + 0.2 * fbm(x * 9, y * 9, z * 9, 2)
        - 1.4 * Math.max(0, fbm(x * 1.6 + 9, y * 1.6, z * 1.6 + 4) - 0.25))          // morsi mancanti
        - chipAmp * chip * 1.6;                                                       // spigoli rotti
      p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
    }
    g.computeVertexNormals();
    g.setAttribute('aC', new THREE.BufferAttribute(curvature(g), 1));
    return g;
  };

  /* ---------- lettere ---------- */
  const SIZE = 1, DEPTH = 0.62, LINE = 1.4;
  const scale = SIZE / font.data.resolution;
  const pieces = [];
  let sphere = null, dotInfo = null, job = 0;
  const mine = () => job++ % parts === part;
  const raw = new THREE.Box3();                                 // ingombro di tutte le lettere, prima della scultura
  const extrude = shapes => new THREE.ExtrudeGeometry(shapes, {
    depth: DEPTH, curveSegments: 12, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.045, bevelSegments: 1,   // smusso netto, da scalpello
  });
  lines.forEach((line, li) => {
    const adv = [...line].map(ch => (font.data.glyphs[ch]?.ha ?? 600) * scale);
    const tracking = 0.06, width = adv.reduce((a, b) => a + b, 0) + tracking * (line.length - 1);
    let x = -width / 2;
    [...line].forEach((ch, ci) => {
      if (ch !== ' ') {
        let shapes = font.generateShapes(ch, SIZE);
        if (ch === '?') {                                         // separa il punto: diventerà una sfera
          const area = s => Math.abs(THREE.ShapeUtils.area(s.getPoints()));
          const dot = shapes.reduce((a, b) => (area(a) < area(b) ? a : b));
          const bb = new THREE.Box2().setFromPoints(dot.getPoints());
          dotInfo = { c: bb.getCenter(new THREE.Vector2()), r: bb.getSize(new THREE.Vector2()).x / 2, x, y: -li * LINE };
          shapes = shapes.filter(s => s !== dot);
        }
        const geo = extrude(shapes);
        geo.translate(x, -li * LINE, -DEPTH / 2);               // coordinate vere: ogni lettera ha crepe sue
        geo.computeBoundingBox(); raw.union(geo.boundingBox);
        if (mine()) pieces.push({ geometry: sculpt(geo, 0.016, 0.045) });
      }
      x += adv[ci] + tracking;
    });
  });
  if (dotInfo) {                                                 // la sfera al posto del punto
    const R = dotInfo.r * 1.15;
    const position = new THREE.Vector3(dotInfo.x + dotInfo.c.x, dotInfo.y + dotInfo.c.y, 0);
    raw.union(new THREE.Box3(new THREE.Vector3(-R, -R, -R), new THREE.Vector3(R, R, R)).translate(position));
    if (part === parts - 1) sphere = { geometry: sculpt(new THREE.SphereGeometry(R, 96, 64), 0.022, 0), position };
  }
  // quando si sgretola ogni punto: da sinistra a destra, con bordi irregolari
  const xb = raw;
  const xn = x => (x - xb.min.x) / (xb.max.x - xb.min.x);
  const setT = (g, xFixed) => {
    const P = g.attributes.position, a = new Float32Array(P.count);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      a[i] = 0.07 + 0.62 * xn(xFixed ?? x) + 0.3 * THREE.MathUtils.clamp(fbm(x * 2.1 + 5, y * 2.1, z * 2.1) * 0.6 + 0.5, 0, 1);
    }
    g.setAttribute('aT', new THREE.BufferAttribute(a, 1));
  };
  pieces.forEach(p => {
    setT(p.geometry);
    const old = p.geometry;                                         // facce lisce, spigoli netti
    p.geometry = toCreasedNormals(old, THREE.MathUtils.degToRad(38)); old.dispose();
    p.grains = makeGrains(p.geometry, 4500);
  });
  if (sphere) { setT(sphere.geometry, sphere.position.x); sphere.grains = makeGrains(sphere.geometry, 900); }

  // centra il blocco
  const box = raw;
  const mid = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  return {
    mid: mid.toArray(),
    size: size.toArray(),
    pieces: pieces.map(p => ({ geometry: pack(p.geometry), grains: p.grains })),
    sphere: sphere && { geometry: pack(sphere.geometry), grains: sphere.grains, position: sphere.position.toArray() }
  };
}
