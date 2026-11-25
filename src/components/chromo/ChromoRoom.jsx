// Stanza finale (dopo che l'utente ha scritto il nome): i pezzi in cromo sparsi intorno a chi guarda, a distanze e
// altezze diverse, come oggetti in una stanza. Scorrendo, la stanza gira piano intorno (un giro intero dall'inizio
// alla fine dello scroll). Niente trascinamento: si scorre e basta.
//
// Contro il lag:
// - un solo renderer, un solo ambiente e una sola scena per tutti i pezzi (non cinque canvas);
// - materiali più leggeri solo qui: niente secondo strato lucido (clearcoat), il vetro della bussola senza rifrazione;
// - i pezzi si costruiscono uno per volta tra un fotogramma e l'altro, entrano con una dissolvenza;
// - risoluzione adattiva: se i fotogrammi rallentano scende, se tornano fluidi risale;
// - si disegna solo quando la stanza si muove davvero o un pezzo è vicino allo sguardo.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { chromeEnvironment, chromeRenderer, disposeTree } from './chrome.js';
import { buildBear } from './Teddy.jsx';
import { buildHand } from './Hand.jsx';
import { buildCompass } from './Compass.jsx';
import { buildPawn } from './Pawn.jsx';
import { buildFrame } from './PrivetDrive.jsx';

// posizione di ogni pezzo: angolo intorno a chi guarda (gradi, 0 = davanti), distanza, altezza, raggio d'ingombro,
// inclinazione propria. Sparsi apposta: angoli, distanze e altezze irregolari.
const LAYOUT = [
  { build: () => buildFrame({ cell: 0.045, textCell: 0.03, textRes: 0.016 }), deg: 2, dist: 7.4, y: 1.5, size: 2.2, tilt: -0.06 },
  { build: () => buildBear(), deg: -38, dist: 4.6, y: -0.9, size: 1.35, tilt: 0.08, kind: 'bear' },
  { build: () => buildHand({ cell: 0.045 }), deg: -105, dist: 5.4, y: 0.6, size: 1.45, tilt: -0.25 },
  { build: () => buildCompass(), deg: -170, dist: 6.2, y: -0.2, size: 1.6, tilt: 0.35, kind: 'compass' },
  { build: () => buildPawn(), deg: 128, dist: 4.4, y: -1.1, size: 1.1, tilt: 0.12 }
];

const MAX_DPR = () => Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.25 : 1.5);
const MIN_DPR = 0.6;

function createRoom(view, scroller, { onBuilt }) {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const W = () => view.clientWidth || window.innerWidth;
  const H = () => view.clientHeight || window.innerHeight;

  let dpr = MAX_DPR();
  const renderer = chromeRenderer({ alpha: false, maxDpr: dpr });
  renderer.setClearColor(0x000000, 1);
  const cv = renderer.domElement;
  Object.assign(cv.style, { display: 'block', width: '100%', height: '100%' });
  view.appendChild(cv);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 60);
  const fit = () => {
    const a = W() / H();
    camera.aspect = a;
    camera.fov = a < 1 ? 74 : 62; // in verticale più largo, così si vede più stanza
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H());
    dirty = true;
  };

  const envRT = chromeEnvironment(renderer);
  scene.environment = envRT.texture;

  // la stanza: pavimento con una pozza di luce viola al centro e una parete cilindrica appena visibile
  const tex = (w, h, paint) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    paint(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const floorTex = tex(256, 256, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(70,30,140,0.55)');
    r.addColorStop(0.45, 'rgba(40,12,80,0.28)');
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, w);
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64), new THREE.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.4;
  const wallTex = tex(1024, 128, (g, w, h) => {
    const v = g.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0, 'rgba(0,0,0,1)');
    v.addColorStop(0.75, 'rgba(26,10,48,1)');
    v.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = v;
    g.fillRect(0, 0, w, h);
    // strisce di luce verticali, irregolari
    for (let i = 0; i < 9; i++) {
      const x = ((i * 137) % 1000) + 12;
      const s = g.createLinearGradient(x - 14, 0, x + 14, 0);
      s.addColorStop(0, 'rgba(255,120,220,0)');
      s.addColorStop(0.5, `rgba(255,${120 + ((i * 41) % 90)},220,${0.05 + (i % 3) * 0.03})`);
      s.addColorStop(1, 'rgba(255,120,220,0)');
      g.fillStyle = s;
      g.fillRect(x - 14, 0, 28, h);
    }
  });
  wallTex.wrapS = THREE.RepeatWrapping;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 9, 64, 1, true), new THREE.MeshBasicMaterial({ map: wallTex, side: THREE.BackSide, depthWrite: false }));
  wall.position.y = 1.5;
  scene.add(floor, wall);

  // materiali più leggeri per la stanza
  const lighten = obj =>
    obj.traverse(o => {
      for (const m of [].concat(o.material || [])) {
        if (!m.isMeshPhysicalMaterial) continue;
        m.clearcoat = 0;
        if (m.transmission > 0) {
          m.transmission = 0;
          m.transparent = true;
          m.opacity = 0.12;
          m.depthWrite = false;
        }
      }
    });

  // pezzi: costruiti uno per volta, senza bloccare il resto
  const pieces = [];
  const box = new THREE.Box3();
  const sphere = new THREE.Sphere();
  let next = 0;
  let buildTimer = 0;
  const buildNext = () => {
    if (next >= LAYOUT.length) return onBuilt?.();
    const spec = LAYOUT[next++];
    const built = spec.build();
    lighten(built.object);
    box.setFromObject(built.object).getBoundingSphere(sphere);
    built.object.position.sub(sphere.center);
    const spin = new THREE.Group(); // oscillazione propria
    spin.add(built.object);
    const k = spec.size / sphere.radius;
    const holder = new THREE.Group(); // posto nella stanza, rivolto verso chi guarda
    holder.add(spin);
    const a = THREE.MathUtils.degToRad(spec.deg);
    holder.position.set(Math.sin(a) * spec.dist, spec.y, -Math.cos(a) * spec.dist);
    holder.lookAt(0, spec.y * 0.4, 0);
    holder.rotateZ(spec.tilt);
    holder.scale.setScalar(0.001);
    scene.add(holder);
    pieces.push({ ...spec, built, spin, holder, k, born: clock.elapsedTime, phase: pieces.length * 1.9 });
    dirty = true;
    buildTimer = setTimeout(buildNext, 60); // lascia respirare qualche fotogramma tra un pezzo e l'altro
  };

  // scroll → giro della stanza (morbido)
  let target = 0;
  let yaw = 0;
  let dirty = true;
  const onScroll = () => {
    const max = scroller.scrollHeight - scroller.clientHeight;
    target = max > 0 ? (scroller.scrollTop / max) * Math.PI * 2 : 0;
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });

  // risoluzione adattiva
  let acc = 0;
  let frames = 0;
  const adapt = dt => {
    acc += dt;
    if (++frames < 40) return;
    const avg = acc / frames;
    acc = frames = 0;
    let want = dpr;
    if (avg > 1 / 40) want = Math.max(MIN_DPR, dpr - 0.2);
    else if (avg < 1 / 58) want = Math.min(MAX_DPR(), dpr + 0.1);
    if (Math.abs(want - dpr) > 0.01) {
      dpr = want;
      renderer.setPixelRatio(dpr);
      renderer.setSize(W(), H());
    }
  };

  const clock = new THREE.Clock();
  const view3 = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;
    const turning = Math.abs(target - yaw) > 0.0005;
    yaw += (target - yaw) * (1 - Math.exp(-dt / (reduce ? 0.05 : 0.35)));
    camera.rotation.set(reduce ? 0 : Math.sin(t * 0.3) * 0.02, yaw, 0, 'YXZ');
    camera.updateMatrixWorld();
    camera.getWorldDirection(view3);

    let animating = false;
    for (const p of pieces) {
      const grow = Math.min(1, (t - p.born) / 0.9);
      p.holder.scale.setScalar(p.k * (1 - (1 - grow) ** 3));
      if (grow < 1) animating = true;
      // i pezzi lontani dallo sguardo non si animano (tanto non si vedono): meno lavoro
      const toPiece = p.holder.position.clone().normalize();
      if (toPiece.dot(view3) < 0.2) continue;
      animating = true;
      if (reduce) continue;
      p.spin.rotation.y = Math.sin(t * 0.4 + p.phase) * 0.35;
      p.spin.position.y = Math.sin(t * 0.7 + p.phase) * 0.06;
      if (p.kind === 'bear') p.built.update(t);
      if (p.kind === 'compass') p.built.update(dt, 0, reduce);
    }
    if (!reduce) scene.environmentRotation.y = t * 0.05;

    if (turning || animating || dirty) {
      renderer.render(scene, camera);
      dirty = false;
      adapt(dt);
    }
  });

  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(view);
  buildTimer = setTimeout(buildNext, 30);

  return () => {
    clearTimeout(buildTimer);
    renderer.setAnimationLoop(null);
    ro.disconnect();
    scroller.removeEventListener('scroll', onScroll);
    disposeTree(scene);
    envRT.dispose();
    renderer.dispose();
    cv.remove();
  };
}

export default function ChromoRoom() {
  const scroller = useRef(null);
  const view = useRef(null);
  const [ready, setReady] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => createRoom(view.current, scroller.current, { onBuilt: () => setReady(true) }), []);
  return (
    <div ref={scroller} className="chromo-room" onScroll={() => !scrolled && setScrolled(true)}>
      <div ref={view} className="chromo-room-view" aria-hidden="true" />
      {/* altezza da scorrere: un giro intero della stanza */}
      <div className="chromo-room-track" />
      <p className={`chromo-room-hint${ready && !scrolled ? ' is-on' : ''}`} aria-hidden="true">
        scroll to look around
      </p>
    </div>
  );
}
