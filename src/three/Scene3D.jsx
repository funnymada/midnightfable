import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { fx } from '../lib/fx.js';
import { FlapBoard } from './flapBoard.js';
import { SmokeText } from './smokeText.js';
import { Cardboard } from './cardboard.js';
import { lettersAt } from '../scenes/Fable.jsx';

// Livello three.js sopra le scene: mulino e sole di cartone con "it's coming", la data diventa un pannello 3D,
// la frase finale si forma col fumo.
// Il DOM resta il riferimento (layout + timeline GSAP); qui si legge a ogni frame e si ridisegna in 3D.
const FOV = 30;

export default function Scene3D() {
  const mount = useRef(null);

  useEffect(() => {
    const host = mount.current;
    const stage = host.closest('.stage');
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.6;
    const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 10000);

    const board = new FlapBoard(scene);
    const row = stage.querySelector('.date-row');
    const zoom = stage.querySelector('.date-zoom');
    const pivot = stage.querySelector('.date-pivot');
    const smoke = new SmokeText(stage.querySelector('.fable-line'), stage);
    const cardboard = new Cardboard();
    const emerge = stage.querySelector('.s-coming .emerge');
    renderer.autoClear = false;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = e => {
      pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });

    let width = 0;
    let height = 0;
    let dpr = 1;
    const resize = () => {
      width = host.clientWidth;
      height = host.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height, false);
      // a z = 0 un'unità vale un pixel CSS: i testi 3D cadono esattamente sopra i segnaposto
      const distance = height / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
      camera.aspect = width / height;
      camera.position.set(0, 0, distance);
      camera.near = distance * 0.05;
      camera.far = distance * 4;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const chainOpacity = el => {
      if (!el || getComputedStyle(el).visibility === 'hidden') return 0;
      let o = 1;
      for (let n = el; n && n !== stage; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
      return o;
    };

    let raf = 0;
    let last = performance.now();
    let blank = false;
    let time = 0;
    const frame = now => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      time += dt;
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;

      const any = board.update({
          row,
          zoom,
          pivot,
          width,
          height,
          flap: fx.flap,
          rx: fx.dateRX + (still ? 0 : -pointer.y * 0.05),
          ry: fx.dateRY + (still ? 0 : pointer.x * 0.06),
          rz: fx.dateRZ,
          light: fx.dateLight,
          dt,
          still,
          opacity: chainOpacity(row) * (zoom ? parseFloat(getComputedStyle(zoom).opacity) : 1)
        });

      const props = cardboard.update({ width, height, progress: fx.props, surface: fx.surface, titleTop: fx.props > 0.001 && fx.props < 1.999 && emerge ? emerge.getBoundingClientRect().top : null, time, dt, still });

      const line = smoke.line;
      const smoking = smoke.update({
        width,
        height,
        dpr,
        typed: lettersAt(fx.type),
        opacity: line ? chainOpacity(line) : 0,
        fog: fx.fog,
        puff: fx.puff,
        puffAlpha: fx.puffAlpha,
        time,
        dt,
        still
      });

      if (!any && !smoking && !props) {
        if (!blank) renderer.clear();
        blank = true;
        return;
      }
      blank = false;
      renderer.clear();
      if (props) renderer.render(cardboard.scene, camera);
      if (any) renderer.render(scene, camera);
      if (smoking) renderer.render(smoke.scene, smoke.camera);
    };
    raf = requestAnimationFrame(frame);

    // i font arrivano dopo: ridisegna le cifre con Mezzotint
    document.fonts?.ready.then(() => {
      board.layoutKey = '';
      smoke.key = '';
    });

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('pointermove', onMove);
      pmrem.dispose();
      smoke.dispose();
      cardboard.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={mount} className="scene-3d" />;
}
