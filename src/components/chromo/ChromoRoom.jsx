// Stanza finale (dopo che l'utente ha scritto il nome): nel buio compare un punto di luce, poi i quattro pezzi
// in cromo (orsacchiotto, mano, bussola, pedone) cadono intorno a chi guarda. Si può solo girare lo sguardo
// (trascinando o con le frecce), non toccare i pezzi.
// Un solo renderer e un solo ambiente per tutti e quattro; il modulo si carica solo qui (lazy), non pesa sul sito.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { chromeEnvironment, chromeRenderer, disposeTree } from './chrome.js';
import { buildBear } from './Teddy.jsx';
import { buildHand } from './Hand.jsx';
import { buildCompass } from './Compass.jsx';
import { buildPawn } from './Pawn.jsx';

const DIST = 5.2; // distanza dei pezzi da chi guarda
const SIZE = 1.6; // raggio d'ingombro di ogni pezzo
const LIGHT_AT = 0.4; // secondi: compare il punto di luce
const FALL_AT = 1.9; // secondi: cade il primo pezzo
const FALL_GAP = 0.6; // secondi tra un pezzo e l'altro
const PITCH = 0.55; // quanto si può guardare in su / in giù (radianti)

function createRoom(container, { onLanded, onLook }) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const W = () => container.clientWidth || window.innerWidth;
  const H = () => container.clientHeight || window.innerHeight;

  const renderer = chromeRenderer({ alpha: false, maxDpr: 1.75 });
  renderer.setClearColor(0x000000, 1);
  const cv = renderer.domElement;
  Object.assign(cv.style, { display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: 'grab' });
  container.appendChild(cv);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  const fit = () => {
    const a = W() / H();
    camera.aspect = a;
    camera.fov = a < 1 ? 72 : 60; // in verticale un po' più largo, così i pezzi ci stanno
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H());
  };
  fit();

  // l'ambiente colora il cromo: parte spento e si accende insieme al punto di luce
  const envRT = chromeEnvironment(renderer);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0;

  // punto di luce, davanti e un po' in alto
  const glowCanvas = document.createElement('canvas');
  glowCanvas.width = glowCanvas.height = 128;
  {
    const g = glowCanvas.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.12, 'rgba(255,240,220,0.9)');
    r.addColorStop(0.35, 'rgba(255,170,230,0.25)');
    r.addColorStop(1, 'rgba(120,60,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  }
  const glowTex = new THREE.CanvasTexture(glowCanvas);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.position.set(0, 1.9, -8);
  glow.scale.setScalar(0);
  const light = new THREE.PointLight(0xfff0e0, 0, 40, 1.4);
  light.position.copy(glow.position);
  scene.add(glow, light);

  // i pezzi, uno per lato: davanti l'orsacchiotto, poi mano (destra), bussola (dietro), pedone (sinistra)
  const specs = [
    // tick: animazione propria del pezzo (orsacchiotto che dondola, ago della bussola che si assesta)
    { build: () => buildBear(), angle: 0, tick: (b, t) => !reduce && b.update(t) },
    { build: () => buildHand({ cell: 0.04 }), angle: Math.PI / 2 },
    { build: () => buildCompass(), angle: Math.PI, tick: (b, t, dt, p) => b.update(dt, p.landed ? 0 : 2.5, reduce) },
    { build: () => buildPawn(), angle: -Math.PI / 2 }
  ];
  const box = new THREE.Box3();
  const sphere = new THREE.Sphere();
  const pieces = specs.map((s, i) => {
    const built = s.build();
    const obj = built.object;
    box.setFromObject(obj).getBoundingSphere(sphere);
    obj.position.sub(sphere.center); // centrato
    const spin = new THREE.Group(); // capriole mentre cade
    spin.add(obj);
    spin.scale.setScalar(SIZE / sphere.radius);
    const holder = new THREE.Group(); // posizione intorno a chi guarda, rivolto verso di lui
    holder.add(spin);
    const rest = -0.25 + (i % 2) * 0.18;
    holder.position.set(Math.sin(s.angle) * DIST, rest, -Math.cos(s.angle) * DIST);
    holder.lookAt(0, rest, 0);
    holder.visible = false;
    scene.add(holder);
    const tumble = { x: (Math.random() - 0.5) * 1.2, z: (Math.random() - 0.5) * 1.2, vx: 1.2 + Math.random(), vz: (Math.random() - 0.5) * 1.4 };
    return { built, tick: s.tick, holder, spin, rest, y: 9 + Math.random() * 2, vy: 0, at: FALL_AT + i * FALL_GAP, landed: false, tumble, phase: i * 1.7 };
  });

  // sguardo: solo rotazione (trascinando, o con le frecce); continua un po' per inerzia
  const look = { yaw: 0, pitch: 0, vy: 0, vp: 0 };
  let drag = null;
  const onDown = e => {
    cv.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, t: performance.now() };
    look.vy = look.vp = 0;
    cv.style.cursor = 'grabbing';
    onLook?.();
  };
  const onMove = e => {
    if (!drag) return;
    const now = performance.now();
    const dt = Math.max((now - drag.t) / 1000, 1e-3);
    const k = 2.4 / Math.max(W(), H()); // stessa sensibilità su schermi diversi
    const dx = (e.clientX - drag.x) * k;
    const dy = (e.clientY - drag.y) * k;
    look.yaw += dx;
    look.pitch = THREE.MathUtils.clamp(look.pitch + dy, -PITCH, PITCH);
    look.vy = THREE.MathUtils.lerp(look.vy, dx / dt, 0.5);
    look.vp = THREE.MathUtils.lerp(look.vp, dy / dt, 0.5);
    Object.assign(drag, { x: e.clientX, y: e.clientY, t: now });
  };
  const onUp = e => {
    if (!drag) return;
    if (performance.now() - drag.t > 80) look.vy = look.vp = 0;
    drag = null;
    cv.style.cursor = 'grab';
    cv.releasePointerCapture?.(e.pointerId);
  };
  const keys = new Set();
  const onKey = e => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    e.type === 'keydown' ? keys.add(e.key) : keys.delete(e.key);
    onLook?.();
  };
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  cv.addEventListener('pointerup', onUp);
  cv.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKey);

  const clock = new THREE.Clock();
  const smooth = x => x * x * (3 - 2 * x);
  let allLanded = false;
  renderer.setAnimationLoop(() => {
    const dt = THREE.MathUtils.clamp(clock.getDelta(), 1e-3, 1 / 30);
    const t = clock.elapsedTime;

    // punto di luce: si accende con un lampo e si assesta; l'ambiente si accende con lui
    const l = THREE.MathUtils.clamp((t - LIGHT_AT) / 1.2, 0, 1);
    const flash = Math.sin(Math.min(1, l) * Math.PI) * 0.6;
    glow.scale.setScalar((smooth(l) * 1.4 + flash) * (1 + (reduce ? 0 : Math.sin(t * 2.3) * 0.04)));
    light.intensity = smooth(l) * 45;
    scene.environmentIntensity = smooth(THREE.MathUtils.clamp((t - LIGHT_AT - 0.5) / 1.6, 0, 1));
    scene.environmentRotation.y = reduce ? 0 : t * 0.08;

    // caduta con un paio di rimbalzi, poi galleggiano piano
    for (const p of pieces) {
      if (t < p.at) continue;
      p.holder.visible = true;
      if (!p.landed) {
        p.vy -= 22 * dt;
        p.y += p.vy * dt;
        // capriole mentre cade
        p.tumble.x += p.tumble.vx * dt;
        p.tumble.z += p.tumble.vz * dt;
        if (p.y <= p.rest) {
          p.y = p.rest;
          p.vy = -p.vy * 0.34;
          if (p.vy < 0.7) {
            p.landed = true;
            // da qui si raddrizza per la via più corta
            p.tumble.x = Math.atan2(Math.sin(p.tumble.x), Math.cos(p.tumble.x));
            p.tumble.z = Math.atan2(Math.sin(p.tumble.z), Math.cos(p.tumble.z));
          }
        }
      } else {
        p.y = THREE.MathUtils.lerp(p.y, p.rest + (reduce ? 0 : Math.sin(t * 0.9 + p.phase) * 0.08), Math.min(1, dt * 3));
      }
      p.holder.position.y = p.y;
      // le capriole si smorzano dopo l'atterraggio; poi oscillano appena, così il cromo luccica
      if (p.landed) {
        const damp = Math.pow(0.08, dt);
        p.tumble.x *= damp;
        p.tumble.z *= damp;
      }
      const sway = reduce ? 0 : Math.sin(t * 0.45 + p.phase) * 0.3;
      p.spin.rotation.set(p.tumble.x, sway, p.tumble.z);
      p.tick?.(p.built, t, dt, p);
    }
    if (!allLanded && pieces.every(p => p.landed)) {
      allLanded = true;
      onLanded?.();
    }

    // sguardo
    if (keys.has('ArrowLeft')) look.yaw += 1.4 * dt;
    if (keys.has('ArrowRight')) look.yaw -= 1.4 * dt;
    if (keys.has('ArrowUp')) look.pitch = Math.min(PITCH, look.pitch + 0.9 * dt);
    if (keys.has('ArrowDown')) look.pitch = Math.max(-PITCH, look.pitch - 0.9 * dt);
    if (!drag) {
      look.yaw += look.vy * dt;
      look.pitch = THREE.MathUtils.clamp(look.pitch + look.vp * dt, -PITCH, PITCH);
      look.vy *= Math.pow(0.06, dt);
      look.vp *= Math.pow(0.06, dt);
    }
    camera.rotation.set(look.pitch, look.yaw, 0, 'YXZ');
    renderer.render(scene, camera);
  });

  const ro = new ResizeObserver(fit);
  ro.observe(container);

  return () => {
    renderer.setAnimationLoop(null);
    ro.disconnect();
    cv.removeEventListener('pointerdown', onDown);
    cv.removeEventListener('pointermove', onMove);
    cv.removeEventListener('pointerup', onUp);
    cv.removeEventListener('pointercancel', onUp);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onKey);
    disposeTree(scene);
    envRT.dispose();
    renderer.dispose();
    cv.remove();
  };
}

export default function ChromoRoom() {
  const ref = useRef(null);
  const [landed, setLanded] = useState(false);
  const [looked, setLooked] = useState(false);
  useEffect(() => createRoom(ref.current, { onLanded: () => setLanded(true), onLook: () => setLooked(true) }), []);
  return (
    <div className="chromo-room">
      <div ref={ref} className="chromo-room-view" />
      {/* suggerimento: compare quando tutti i pezzi sono a terra (tre su quattro sono fuori vista) */}
      <p className={`chromo-room-hint${landed && !looked ? ' is-on' : ''}`} aria-hidden="true">
        ← drag to look around →
      </p>
    </div>
  );
}
