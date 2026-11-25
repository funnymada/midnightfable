// Compass3D.jsx — bussola 3D in cromo iridescente (three.js, nessuna dipendenza oltre a "three")
// Uso: <div style={{height: 600}}><Compass3D /></div>
// Props: interactive (trascina per ruotarla a 360°, gira da sola) · background (es. "#000", default trasparente)
// buildCompass() costruisce solo la bussola (senza renderer): la usa anche la stanza finale (ChromoRoom).
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
// three non include più i font di esempio: serif bold del progetto ridotto ai soli caratteri della bussola (N E S W e cifre)
import fontJson from './compass-font.typeface.json';
import { chromeEnvironment, chromeMaterial, chromeRenderer, disposeTree } from './chrome.js';

/* ---------- la bussola (diametro circa 5.5, quadrante verso +z): solo il modello, senza renderer ----------
 *  update(dt, kick, reduce): l'ago cerca il nord con inerzia; kick = quanto la scuote il movimento */
export function buildCompass(font = new FontLoader().parse(fontJson)) {
  /* ---------- materiali ---------- */
  const chrome = chromeMaterial();
  const warm = chrome.clone(); warm.color.set('#ffb27e');
  const violet = chrome.clone(); violet.color.set('#b49cff');
  const face = new THREE.MeshPhysicalMaterial({
    color: '#08030f', metalness: 0.35, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.55,
  });
  const rose = new THREE.MeshPhysicalMaterial({
    color: '#6a36ff', metalness: 1, roughness: 0.16, iridescence: 0.7, iridescenceIOR: 1.5, envMapIntensity: 0.95,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 1, thickness: 0.18, ior: 1.5,
    iridescence: 0.2, iridescenceIOR: 1.3, envMapIntensity: 0.55, specularIntensity: 0.6,
  });

  /* ---------- geometrie ---------- */
  const body = new THREE.Group();   // tutta la bussola (l'ago gira dentro)
  const add = (geo, mat, setup) => { const m = new THREE.Mesh(geo, mat); setup?.(m); body.add(m); return m; };
  const V = (x, y) => new THREE.Vector2(x, y);

  // ghiera: profilo (raggio, altezza) ruotato attorno all'asse
  const prof = new THREE.SplineCurve([
    V(2.04, -0.02), V(2.05, 0.2), V(2.12, 0.33), V(2.26, 0.42), V(2.43, 0.43), V(2.57, 0.34),
    V(2.65, 0.19), V(2.62, 0.08), V(2.71, 0.0), V(2.74, -0.18), V(2.63, -0.33), V(2.4, -0.39),
  ]).getPoints(180).reverse();
  add(new THREE.LatheGeometry(prof, 192), chrome, m => (m.rotation.x = Math.PI / 2));
  add(new THREE.CylinderGeometry(2.45, 2.3, 0.26, 128), violet, m => { m.rotation.x = Math.PI / 2; m.position.z = -0.42; });

  // retro: anelli concentrici e stella incisa
  [[2.1, 0.03], [1.5, 0.02], [0.9, 0.02]].forEach(([r, tb]) =>
    add(new THREE.TorusGeometry(r, tb, 12, 160), chrome, m => (m.position.z = -0.56)));
  add(new THREE.CircleGeometry(2.3, 128), face, m => { m.position.z = -0.555; m.rotation.y = Math.PI; });

  // borchie sulla ghiera
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4, big = i % 2 === 0;
    add(new THREE.SphereGeometry(big ? 0.085 : 0.05, 24, 16), big ? warm : chrome, m =>
      m.position.set(2.35 * Math.sin(a), 2.35 * Math.cos(a), 0.46));
  }

  // quadrante
  add(new THREE.CircleGeometry(2.06, 128), face);
  [[1.98, 0.012], [1.6, 0.008], [1.2, 0.006]].forEach(([r, t]) =>
    add(new THREE.TorusGeometry(r, t, 8, 160), chrome, m => (m.position.z = 0.01)));

  // tacche
  const tick = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 72; i++) {
    const a = THREE.MathUtils.degToRad(i * 5), card = i % 18 === 0, major = i % 6 === 0;
    const L = card ? 0.3 : major ? 0.22 : 0.11, w = card ? 0.05 : major ? 0.034 : 0.018;
    const r = 1.95 - L / 2;
    add(tick, card ? warm : chrome, m => {
      m.scale.set(w, L, 0.03); m.position.set(r * Math.sin(a), r * Math.cos(a), 0.02); m.rotation.z = -a;
    });
  }

  // lettere e gradi
  const text = (str, size, r, deg, mat) => {
    const g = new TextGeometry(str, {
      font, size, depth: 0.025, curveSegments: 8,
      bevelEnabled: true, bevelThickness: 0.01, bevelSize: size * 0.025, bevelSegments: 2,
    });
    g.center();
    const a = THREE.MathUtils.degToRad(deg);
    add(g, mat, m => { m.position.set(r * Math.sin(a), r * Math.cos(a), 0.04); m.rotation.z = -a; });
  };
  [['N', 0], ['E', 90], ['S', 180], ['W', 270]].forEach(([l, d]) => text(l, 0.27, 1.38, d, d === 0 ? warm : chrome));
  [30, 60, 120, 150, 210, 240, 300, 330].forEach(d => text(String(d), 0.1, 1.53, d, chrome));

  // rosa dei venti
  const star = new THREE.Shape();
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8, r = k % 4 === 0 ? 1.08 : k % 2 === 0 ? 0.6 : 0.16;
    k ? star.lineTo(r * Math.sin(a), r * Math.cos(a)) : star.moveTo(0, r);
  }
  add(new THREE.ExtrudeGeometry(star, { depth: 0.015, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 4 }),
    rose, m => (m.position.z = 0.015));

  // ago (in un pivot separato: cerca il nord con inerzia)
  const needle = new THREE.Group();
  needle.position.z = 0.3; body.add(needle);
  const half = dir => {
    const s = new THREE.Shape();
    s.moveTo(0, 1.52 * dir); s.lineTo(0.17, 0); s.lineTo(-0.17, 0); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.045, bevelSegments: 6 });
    g.translate(0, 0, -0.015); return g;
  };
  needle.add(new THREE.Mesh(half(1), warm), new THREE.Mesh(half(-1), violet));
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.17, 48, 24), chrome);
  cap.scale.z = 0.55; cap.position.z = 0.1; needle.add(cap);
  add(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 24), chrome, m => { m.rotation.x = Math.PI / 2; m.position.z = 0.15; });

  // cupola di vetro
  const a0 = 2.08, h0 = 0.42, R = (a0 * a0 + h0 * h0) / (2 * h0);
  add(new THREE.SphereGeometry(R, 128, 32, 0, Math.PI * 2, 0, Math.asin(a0 / R)), glass, m => {
    m.rotation.x = Math.PI / 2; m.position.z = 0.2 + h0 - R;
  });

  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  let heading = 0, phi = 0.9, phiV = 0, t = 0;            // ago: angolo "mondo"
  const update = (dt, kick = 0, reduce = false) => {
    t += dt;
    if (!reduce) heading += 0.18 * Math.sin(t * 0.31) * dt;
    const acc = -20 * wrap(phi) - 1.3 * phiV + 2.2 * (kick - phiV);
    phiV += acc * dt; phi += phiV * dt;
    if (!Number.isFinite(phi + phiV)) { phi = 0; phiV = 0; }
    body.rotation.z = heading;
    needle.rotation.z = phi - heading;
  };
  return { object: body, update, dispose: () => disposeTree(body) };
}

/* ------------------------------------------------------------------ *
 *  Bussola 3D — cromo iridescente (viola / magenta / arancio)
 *  createCompass(container, font, opts) -> dispose()
 * ------------------------------------------------------------------ */
function createCompass(container, font, opts = {}) {
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
    camera.position.set(0, 0, (2.8 / (t * Math.min(1, a))) * 1.12);
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H());
  };
  fit();

  const envRT = chromeEnvironment(renderer);
  scene.environment = envRT.texture;

  const root = new THREE.Group();   // rotazione (drag)
  scene.add(root);
  const built = buildCompass(font);
  root.add(built.object);

  /* ---------- interazione: rotazione libera a 360° ---------- */
  const TAU = Math.PI * 2, AUTO = reduce ? 0 : 0.55;  // giri automatici (rad/s)
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
    if (performance.now() - drag.t > 80) rot.vx = rot.vy = 0;   // rilasciato da fermo
    rot.vx = THREE.MathUtils.clamp(rot.vx, -14, 14);
    rot.vy = THREE.MathUtils.clamp(rot.vy, -14, 14);
    drag = null; cv.style.cursor = 'grab';
    cv.releasePointerCapture?.(e.pointerId);
  };
  const onLeave = () => {};
  if (interactive) {
    cv.style.cursor = 'grab';
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('pointerleave', onLeave);
  }

  /* ---------- loop ---------- */
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = THREE.MathUtils.clamp(clock.getDelta(), 1e-3, 1 / 30), t = clock.elapsedTime;
    idle += dt;

    if (!drag) {
      rot.y += rot.vy * dt; rot.x += rot.vx * dt;
      const settle = idle > 1.5 ? 1 : 0;
      // il giro orizzontale torna dolcemente alla velocità automatica
      rot.vy += (AUTO - rot.vy) * Math.min(1, dt * (settle ? 1.2 : 0.6));
      rot.vx *= Math.pow(0.08, dt);
      // dopo un po' si raddrizza in verticale (verso il multiplo di 360° più vicino)
      if (settle) rot.x += (Math.round(rot.x / TAU) * TAU - rot.x) * Math.min(1, dt * 1.5);
    }
    root.rotation.set(rot.x, rot.y, 0, 'YXZ');
    root.position.y = reduce ? 0 : Math.sin(t * 0.8) * 0.06;

    // ago: molla verso nord, scosso dalla rotazione
    built.update(dt, rot.vy * 0.9 + rot.vx * 0.5, reduce);

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
    cv.removeEventListener('pointerleave', onLeave);
    disposeTree(root); envRT.dispose(); renderer.dispose();
    cv.remove();
  };
}

export default function Compass3D({ className = '', style, interactive = true, background = null }) {
  const ref = useRef(null);
  useEffect(() => {
    const font = new FontLoader().parse(fontJson);
    return createCompass(ref.current, font, { interactive, background });
  }, [interactive, background]);
  return <div ref={ref} className={className} style={{ width: '100%', height: '100%', minHeight: 360, ...style }} />;
}