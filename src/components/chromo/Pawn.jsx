// ChessPawn3D.jsx — pedone di scacchi 3D in cromo iridescente (three.js, nessuna dipendenza oltre a "three")
// Uso: <div style={{height: 700}}><ChessPawn3D /></div>
// Props: interactive (trascina per ruotarlo a 360°, gira da solo) · background (default trasparente)
// buildPawn() costruisce solo il pezzo (senza renderer), per usarlo in una scena three.js condivisa.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { chromeEnvironment, chromeMaterial, chromeRenderer, disposeTree } from './chrome.js';

/* ---------- il pezzo: profilo Staunton tornito, centrato nell'origine (alto circa 3.7) ---------- */
export function buildPawn() {
  const V = (x, y) => new THREE.Vector2(x, y);
  const lower = new THREE.SplineCurve([
    V(1.12, 0.0), V(1.2, 0.05), V(1.23, 0.15), V(1.19, 0.25), V(1.06, 0.31),      // anello di base
    V(1.04, 0.36), V(1.07, 0.43), V(1.03, 0.51), V(0.9, 0.56),                    // secondo anello
    V(0.74, 0.64), V(0.6, 0.78), V(0.5, 0.98), V(0.43, 1.22), V(0.39, 1.45),      // fusto che si stringe
    V(0.41, 1.57), V(0.6, 1.62), V(0.71, 1.68), V(0.72, 1.74), V(0.66, 1.8),      // colletto
    V(0.48, 1.85), V(0.37, 1.9),
  ]).getPoints(220);
  const R = 0.62, CY = 2.45, startA = Math.asin(0.37 / R);                      // testa sferica
  const head = [];
  for (let i = 0; i <= 80; i++) {
    const a = startA + (Math.PI - startA) * (i / 80);                            // dal collo alla cima
    head.push(V(R * Math.sin(a), CY - R * Math.cos(a)));
  }
  head[head.length - 1].x = 0;
  const profile = [V(0, 0), ...lower, ...head.slice(1)];
  const geo = new THREE.LatheGeometry(profile, 192);
  geo.translate(0, -1.53, 0);                                                     // centro del pezzo nell'origine
  const object = new THREE.Mesh(geo, chromeMaterial());
  return { object, update() {}, dispose: () => disposeTree(object) };
}

function createPawn(container, opts = {}) {
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
  const HALF_H = 1.85, HALF_W = 1.45;                  // ingombro del pezzo (anche ruotato)
  const fit = () => {
    const a = W() / H(), t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.aspect = a;
    camera.position.set(0, 0, Math.max(HALF_H / t, HALF_W / (t * a)) * 1.12);
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H());
  };
  fit();

  const envRT = chromeEnvironment(renderer);
  scene.environment = envRT.texture;

  const root = new THREE.Group(); scene.add(root);
  const pawn = buildPawn(); root.add(pawn.object);
  // ombra morbida a contatto sotto la base (segue il pezzo)
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  { const g = sc.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(0,0,0,.55)'); r.addColorStop(0.55, 'rgba(0,0,0,.25)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128); }
  const shadowTex = new THREE.CanvasTexture(sc);
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), shadowMat);
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.55; root.add(shadow);

  /* ---------- interazione: rotazione libera a 360° ---------- */
  const TAU = Math.PI * 2, AUTO = reduce ? 0 : 0.6;
  const rot = { x: 0.18, y: 0, vx: 0, vy: AUTO };
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
      if (settle) {                                   // torna dritto, appena inclinato verso chi guarda
        const home = Math.round((rot.x - 0.18) / TAU) * TAU + 0.18;
        rot.x += (home - rot.x) * Math.min(1, dt * 1.5);
      }
    }
    root.rotation.set(rot.x, rot.y, 0, 'YXZ');
    root.position.y = reduce ? 0 : Math.sin(t * 0.8) * 0.06;
    shadow.material.opacity = Math.max(0, Math.cos(rot.x - 0.18)) ** 2;         // sparisce se lo capovolgi
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
    disposeTree(root);
    envRT.dispose(); renderer.dispose();
    cv.remove();
  };
}

export default function ChessPawn3D({ className = '', style, interactive = true, background = null }) {
  const ref = useRef(null);
  useEffect(() => createPawn(ref.current, { interactive, background }), [interactive, background]);
  return <div ref={ref} className={className} style={{ width: '100%', height: '100%', minHeight: 400, ...style }} />;
}
