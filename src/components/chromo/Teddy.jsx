// TeddyBear3D.jsx — orsacchiotto 3D in cromo iridescente (three.js, nessuna dipendenza oltre a "three")
// Uso: <div style={{height: 700}}><TeddyBear3D /></div>
// Props: interactive (trascina per ruotarlo a 360°, clic = rimbalzo) · background (default trasparente)
// buildBear() costruisce solo l'orsacchiotto (senza renderer): lo usa anche la stanza finale (ChromoRoom).
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { chromeEnvironment, chromeMaterial, chromeRenderer, disposeTree } from './chrome.js';

/* ---------- l'orsacchiotto (seduto, alto circa 5): solo il modello, senza renderer ----------
 *  update(t) fa dondolare la testa, fremere le orecchie e sbattere le ciglia */
export function buildBear() {
  /* ---------- materiali ---------- */
  const chrome = chromeMaterial();
  const warm = chrome.clone(); warm.color.set('#ffb27e');
  const violet = chrome.clone(); violet.color.set('#b49cff');
  const pink = chrome.clone(); pink.color.set('#ff7ad9');
  const ink = new THREE.MeshPhysicalMaterial({
    color: '#060209', metalness: 0.3, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.2,
  });

  /* ---------- geometrie ---------- */
  const bear = new THREE.Group();   // rimbalzo / respiro
  bear.position.y = 0.05;
  const V = (x, y) => new THREE.Vector2(x, y);
  const ball = (r, mat, p, s = [1, 1, 1], parent = bear) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 48), mat);
    m.position.set(...p); m.scale.set(...s); parent.add(m); return m;
  };

  // corpo + pancia + coda
  const body = ball(1.25, chrome, [0, -0.9, 0], [1, 1.15, 0.95]);
  ball(0.85, violet, [0, -1.0, 0.95], [1, 1.1, 0.5]);
  ball(0.26, pink, [0, -1.85, -1.12]);

  // testa (gruppo, per inclinarla)
  const head = new THREE.Group();
  head.position.set(0, 1.05, 0); bear.add(head);
  ball(1.15, chrome, [0, 0, 0], [1.08, 0.98, 0.98], head);
  const ears = [-1, 1].map(sx => {
    const ear = new THREE.Group();
    ear.position.set(0.88 * sx, 0.9, -0.05); head.add(ear);
    ball(0.42, chrome, [0, 0, 0], [1, 1, 0.6], ear);
    ball(0.26, warm, [0, -0.02, 0.17], [1, 1, 0.4], ear);
    return ear;
  });
  ball(0.5, warm, [0, -0.33, 1.0], [1.15, 0.85, 0.8], head);        // muso
  ball(0.17, ink, [0, -0.17, 1.38], [1.4, 0.9, 0.8], head);          // naso
  const eyes = [-1, 1].map(sx => ball(0.13, ink, [0.4 * sx, 0.23, 1.02], [1, 1, 0.7], head));
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.028, 12, 48, Math.PI), ink);
  smile.position.set(0, -0.42, 1.33); smile.rotation.set(-0.35, 0, Math.PI); head.add(smile);

  // fiocco
  const bow = new THREE.Group();
  bow.position.set(0, 0.1, 0.98); bow.rotation.x = -0.25; bear.add(bow);
  [-1, 1].forEach(sx => {
    const w = ball(0.3, pink, [0.3 * sx, 0, 0], [1.3, 0.85, 0.5], bow);
    w.rotation.z = 0.25 * sx;
  });
  ball(0.13, warm, [0, 0, 0.08], [1, 1, 0.8], bow);

  // braccia (forma da peluche classico): lunghe e morbide lungo i fianchi,
  // si assottigliano al polso e si allargano in una zampa piatta e ovale girata verso il corpo
  const armCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.1, 0), new THREE.Vector3(0.04, -0.4, 0.04), new THREE.Vector3(0.06, -0.9, 0.12),
    new THREE.Vector3(0, -1.35, 0.26), new THREE.Vector3(-0.14, -1.7, 0.36),
  ]);
  const armGeo = (() => {
    const S = 110, R = 56, pos = [], idx = [];
    const F0 = new THREE.Vector3(-0.6, 0, 0.8).normalize();   // dove guarda il palmo (dentro + avanti)
    const P = new THREE.Vector3(), T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
    const ss = (e0, e1, x) => { x = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1); return x * x * (3 - 2 * x); };
    const frame = u => {
      armCurve.getPointAt(u, P); armCurve.getTangentAt(u, T);
      N.copy(F0).addScaledVector(T, -F0.dot(T)).normalize(); B.crossVectors(T, N);
      let r = THREE.MathUtils.lerp(0.37, 0.3, ss(0, 0.6, u)) + 0.13 * ss(0.6, 0.84, u);
      const u0 = 0.86;
      if (u > u0) { const k = (u - u0) / (1 - u0); r *= Math.sqrt(Math.max(0, 1 - k * k)); }
      const p = ss(0.55, 0.85, u);
      return { r, a: 1 - 0.28 * p, b: 1 + 0.32 * p };           // a = spessore, b = larghezza
    };
    for (let i = 0; i <= S; i++) {
      const { r, a, b } = frame(i / S);
      for (let j = 0; j <= R; j++) {
        const th = (j / R) * Math.PI * 2, c = Math.cos(th) * r * a, s = Math.sin(th) * r * b;
        pos.push(P.x + N.x * c + B.x * s, P.y + N.y * c + B.y * s, P.z + N.z * c + B.z * s);
      }
    }
    for (let i = 0; i < S; i++) for (let j = 0; j < R; j++) {
      const p0 = i * (R + 1) + j, p1 = p0 + R + 1;
      idx.push(p0, p0 + 1, p1, p1, p0 + 1, p1 + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const n = g.attributes.normal, v = new THREE.Vector3(), w = new THREE.Vector3();
    for (let i = 0; i <= S; i++) {                                  // salda la cucitura
      const p0 = i * (R + 1), p1 = p0 + R;
      v.fromBufferAttribute(n, p0).add(w.fromBufferAttribute(n, p1)).normalize();
      n.setXYZ(p0, v.x, v.y, v.z); n.setXYZ(p1, v.x, v.y, v.z);
    }
    // posa del cuscinetto: sul palmo, vicino alla punta
    const { r, a } = frame(0.82);
    const padPos = P.clone().addScaledVector(N, r * a * 0.9);
    const padRot = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(B, T, N));
    return { g, padPos, padRot };
  })();
  [-1, 1].forEach(sx => {
    const pivot = new THREE.Group();                       // braccio destro, specchiato per il sinistro
    pivot.position.set(0.98 * sx, -0.05, 0.2);
    pivot.rotation.set(-0.35, 0, 0.38 * sx);
    pivot.scale.x = sx;
    pivot.add(new THREE.Mesh(armGeo.g, chrome));
    ball(0.36, chrome, [0, 0.1, 0], [1, 1, 1], pivot);      // spalla
    const pad = ball(0.3, warm, [0, 0, 0], [1, 1.15, 0.3], pivot);
    pad.position.copy(armGeo.padPos); pad.quaternion.copy(armGeo.padRot);
    bear.add(pivot);
  });

  // gambe (seduto) con cuscinetti e ditini
  const legGeo = new THREE.CapsuleGeometry(0.46, 0.45, 16, 48);
  [-1, 1].forEach(sx => {
    const x = 0.62 * sx;
    const leg = new THREE.Mesh(legGeo, chrome);
    leg.rotation.x = Math.PI / 2; leg.position.set(x, -2.0, 0.45); bear.add(leg);
    ball(0.3, warm, [x, -2.06, 1.11], [1, 1, 0.35]);
    [[-0.18, -1.8], [0, -1.74], [0.18, -1.8]].forEach(([dx, y]) => ball(0.085, warm, [x + dx, y, 1.08], [1, 1, 0.5]));
  });

  const update = t => {
    head.rotation.z = Math.sin(t * 0.9) * 0.08;
    head.rotation.x = Math.sin(t * 0.7) * 0.05;
    const twitch = Math.max(0, Math.sin(t * 1.3) ** 40);
    ears.forEach((e, i) => (e.rotation.z = (i ? -1 : 1) * twitch * 0.25));
    const blink = (t % 4.2) < 0.12 ? 0.12 : 1;
    eyes.forEach(e => (e.scale.y = blink));
  };
  return { object: bear, body, update, dispose: () => disposeTree(bear) };
}

/* ------------------------------------------------------------------ *
 *  Orsacchiotto 3D — cromo iridescente (viola / magenta / arancio)
 *  createBear(container, opts) -> dispose()
 * ------------------------------------------------------------------ */
function createBear(container, opts = {}) {
  const { interactive = true, background = null } = opts;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const W = () => container.clientWidth || 600;
  const H = () => container.clientHeight || 600;

  /* ---------- renderer / scena / camera ---------- */
  const renderer = chromeRenderer();
  renderer.setSize(W(), H());
  const cv = renderer.domElement;
  Object.assign(cv.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none' });
  container.appendChild(cv);

  const scene = new THREE.Scene();
  if (background) scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(30, W() / H(), 0.1, 100);

  const fit = () => {
    const a = W() / H();
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.aspect = a;
    camera.position.set(0, 0, Math.max(2.55 / t, 2.2 / (t * a)) * 1.1);
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H());
  };
  fit();

  const envRT = chromeEnvironment(renderer);
  scene.environment = envRT.texture;

  const root = new THREE.Group();   // rotazione (drag)
  scene.add(root);
  const built = buildBear();
  const { object: bear, body } = built;
  root.add(bear);

  /* ---------- interazione: rotazione libera a 360° + clic = rimbalzo ---------- */
  const TAU = Math.PI * 2, AUTO = reduce ? 0 : 0.55;
  const rot = { x: 0, y: 0, vx: 0, vy: AUTO };
  let drag = null, idle = 10, moved = 0;
  let sq = 0, sqV = 0, hop = 0, hopV = 0;           // molla "squish" e saltello

  const onDown = e => {
    cv.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = 0;
    rot.vx = rot.vy = 0; cv.style.cursor = 'grabbing';
  };
  const onMove = e => {
    if (!drag) return;
    const now = performance.now(), dt = Math.max((now - drag.t) / 1000, 1e-3);
    const dx = (e.clientX - drag.x) * 0.012, dy = (e.clientY - drag.y) * 0.012;
    moved += Math.abs(dx) + Math.abs(dy);
    rot.y += dx; rot.x += dy;
    rot.vy = THREE.MathUtils.lerp(rot.vy, dx / dt, 0.5);
    rot.vx = THREE.MathUtils.lerp(rot.vx, dy / dt, 0.5);
    Object.assign(drag, { x: e.clientX, y: e.clientY, t: now }); idle = 0;
  };
  const onUp = e => {
    if (!drag) return;
    if (moved < 0.06) { sqV = -7; hopV = 4.5; rot.vy = AUTO; }  // clic: si schiaccia e saltella
    else if (performance.now() - drag.t > 80) rot.vx = rot.vy = 0;
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
  const smooth = x => x * x * (3 - 2 * x);
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

    // squish + saltello (molle)
    sqV += (-90 * sq - 7 * sqV) * dt; sq += sqV * dt;
    hopV += -22 * dt; hop += hopV * dt; if (hop < 0) { hop = 0; hopV = 0; }
    const breathe = reduce ? 0 : Math.sin(t * 2.1) * 0.012;
    bear.scale.set(1 - sq * 0.5 - breathe * 0.5, 1 + sq + breathe, 1 - sq * 0.5);
    bear.position.y = 0.05 + hop * 0.35 + (reduce ? 0 : Math.sin(t * 0.8) * 0.05);
    body.scale.x = 1 + breathe * 1.5;

    // testa che dondola, orecchie che fremono, battito di ciglia
    if (!reduce) built.update(t);

    scene.environmentRotation.y = reduce ? 0 : t * 0.1;
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

export default function TeddyBear3D({ className = '', style, interactive = true, background = null }) {
  const ref = useRef(null);
  useEffect(() => createBear(ref.current, { interactive, background }), [interactive, background]);
  return <div ref={ref} className={className} style={{ width: '100%', height: '100%', minHeight: 400, ...style }} />;
}