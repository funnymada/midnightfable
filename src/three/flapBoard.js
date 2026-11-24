import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { digitAt, settleAt } from '../components/SplitFlap.jsx';

// La data come oggetto 3D: pannello metallico con spessore, tessere in rilievo, alette vere che ruotano
// sulla cerniera e proiettano ombra, luce principale + una luce che scorre + controluce rossa.
// Il pannello DOM (.date-row) resta come riferimento: posizione, misura, opacità e zoom vengono da lì.

const FLIP = 0.26; // secondi di una girata

const digitCanvas = (d, w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#46141a');
  bg.addColorStop(0.49, '#2a0a0c');
  bg.addColorStop(0.51, '#160405');
  bg.addColorStop(1, '#2c0a0c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const fg = ctx.createLinearGradient(0, h * 0.15, 0, h * 0.85);
  fg.addColorStop(0, '#ffd2c6');
  fg.addColorStop(0.38, '#ff6a5c');
  fg.addColorStop(0.62, '#f1262e');
  fg.addColorStop(1, '#b8121b');
  ctx.font = `400 ${h * 0.78}px "mezzotint-cf", serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255, 50, 40, 0.75)';
  ctx.shadowBlur = h * 0.06;
  ctx.fillStyle = fg;
  ctx.fillText(String(d), w / 2, h * 0.53);
  return c;
};

const halfTexture = (canvas, top) => {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(1, 0.5);
  t.offset.set(0, top ? 0.5 : 0);
  t.anisotropy = 4;
  return t;
};

export class FlapBoard {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.board = new THREE.Group();
    this.group.add(this.board);
    scene.add(this.group);
    this.layoutKey = '';
    this.tiles = [];
    this.materials = [];
    this.fontKey = '';

    // luci del pannello
    this.ambient = new THREE.AmbientLight('#ffd9d0', 0.35);
    this.key = new THREE.DirectionalLight('#ffe6dc', 1.5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.6;
    this.key.shadow.radius = 4;
    this.sweep = new THREE.PointLight('#ff9a80', 0.9, 0, 0);
    this.rim = new THREE.PointLight('#ff2a20', 1.6, 0, 0);
    scene.add(this.ambient, this.key, this.key.target, this.sweep, this.rim);

    this.metal = new THREE.MeshStandardMaterial({ color: '#24060a', roughness: 0.34, metalness: 0.9, envMapIntensity: 0.35 });
    this.tileBody = new THREE.MeshStandardMaterial({ color: '#160304', roughness: 0.55, metalness: 0.3, envMapIntensity: 0.3 });
    this.hinge = new THREE.MeshStandardMaterial({ color: '#050101', roughness: 0.6, metalness: 0.2 });
    this.pin = new THREE.MeshStandardMaterial({ color: '#c9a29a', roughness: 0.2, metalness: 1 });
    this.slashMat = null;
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.55, transparent: true }));
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
  }

  // materiali delle cifre: per ogni cifra la metà alta e la metà bassa (stessa tela, offset diverso)
  buildDigits(w, h) {
    this.materials.forEach(m => {
      m.top.map.dispose();
      m.bot.map.dispose();
      m.top.dispose();
      m.bot.dispose();
    });
    this.materials = [];
    const cw = 256;
    const ch = Math.round((cw * h) / w);
    for (let d = 0; d < 10; d++) {
      const canvas = digitCanvas(d, cw, ch);
      const make = top => {
        const map = halfTexture(canvas, top);
        return new THREE.MeshStandardMaterial({
          map,
          emissiveMap: map,
          emissive: '#ffffff',
          emissiveIntensity: 0.9,
          color: '#2e2424',
          roughness: top ? 0.62 : 0.78,
          metalness: 0,
          envMapIntensity: 0.25,
          side: THREE.FrontSide
        });
      };
      this.materials.push({ top: make(true), bot: make(false) });
    }
    const sc = document.createElement('canvas');
    sc.width = 128;
    sc.height = 256;
    const sx = sc.getContext('2d');
    sx.font = `400 200px "mezzotint-cf", serif`;
    sx.textAlign = 'center';
    sx.textBaseline = 'middle';
    sx.shadowColor = 'rgba(255, 50, 40, 0.9)';
    sx.shadowBlur = 16;
    sx.fillStyle = '#ff4a44';
    sx.fillText('/', 64, 136);
    this.slashMat?.map.dispose();
    this.slashMat?.dispose();
    const slashMap = new THREE.CanvasTexture(sc);
    slashMap.colorSpace = THREE.SRGBColorSpace;
    this.slashMat = new THREE.MeshBasicMaterial({ map: slashMap, transparent: true, depthWrite: false });
  }

  // costruisce pannello e tessere dalle misure del DOM
  build(row) {
    this.board.clear();
    this.tiles = [];
    const fs = parseFloat(getComputedStyle(row).fontSize);
    const W = row.offsetWidth;
    const H = row.offsetHeight;
    this.fs = fs;
    this.W = W;
    this.H = H;
    const depth = fs * 0.24;
    const panel = new THREE.Mesh(new RoundedBoxGeometry(W, H, depth, 5, fs * 0.12), this.metal);
    panel.position.z = -depth / 2;
    panel.castShadow = true;
    panel.receiveShadow = true;
    this.board.add(panel);

    const children = [...row.children].filter(c => c.classList.contains('flap') || c.classList.contains('date-slash'));
    const first = children.find(c => c.classList.contains('flap'));
    this.buildDigits(first.offsetWidth, first.offsetHeight);
    let digit = 0;
    children.forEach(c => {
      const w = c.offsetWidth;
      const h = c.offsetHeight;
      const x = c.offsetLeft + w / 2 - W / 2;
      const y = H / 2 - (c.offsetTop + h / 2);
      if (c.classList.contains('date-slash')) {
        const slash = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.6, h * 1.1), this.slashMat);
        slash.position.set(x, y, fs * 0.03);
        slash.renderOrder = 2;
        this.board.add(slash);
        return;
      }
      const tile = new THREE.Group();
      tile.position.set(x, y, 0);
      const bodyDepth = fs * 0.09;
      const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, bodyDepth, 3, fs * 0.05), this.tileBody);
      body.position.z = bodyDepth / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      tile.add(body);
      const face = bodyDepth + 0.6;
      const gap = fs * 0.012;
      const halfGeo = new THREE.PlaneGeometry(w * 0.94, h / 2 - gap);
      const top = new THREE.Mesh(halfGeo, this.materials[0].top);
      top.position.set(0, h / 4 + gap / 2, face);
      const bot = new THREE.Mesh(halfGeo, this.materials[0].bot);
      bot.position.set(0, -h / 4 - gap / 2, face);
      top.receiveShadow = true;
      bot.receiveShadow = true;
      // aletta: davanti la metà alta della cifra vecchia, dietro la metà bassa della nuova
      const leaf = new THREE.Group();
      leaf.position.z = face + 1.2;
      const leafFront = new THREE.Mesh(halfGeo, this.materials[0].top);
      leafFront.position.y = h / 4 + gap / 2;
      const leafBack = new THREE.Mesh(halfGeo, this.materials[0].bot);
      leafBack.position.set(0, h / 4 + gap / 2, -0.4);
      leafBack.rotation.x = Math.PI;
      leafFront.castShadow = true;
      leaf.add(leafFront, leafBack);
      leaf.visible = false;
      // cerniera scura e due perni metallici
      const hinge = new THREE.Mesh(new THREE.BoxGeometry(w, fs * 0.03, fs * 0.02), this.hinge);
      hinge.position.z = face + 0.2;
      const pinGeo = new THREE.CylinderGeometry(fs * 0.022, fs * 0.022, fs * 0.05, 16);
      pinGeo.rotateX(Math.PI / 2);
      const pinL = new THREE.Mesh(pinGeo, this.pin);
      pinL.position.set(-w / 2 + fs * 0.03, 0, face + fs * 0.01);
      const pinR = pinL.clone();
      pinR.position.x = w / 2 - fs * 0.03;
      tile.add(top, bot, leaf, hinge, pinL, pinR);
      this.board.add(tile);
      this.tiles.push({ top, bot, leaf, leafFront, leafBack, cur: 0, prev: 0, t: 1, index: digit++, target: 0 });
    });
    this.targets = [...row.getAttribute('aria-label').replace(/\D/g, '')].map(Number);
    this.ground.scale.set(W * 3, H * 6, 1);
    this.ground.position.set(0, -H * 0.4, -depth - fs * 0.5);
  }

  setDigit(tile, value) {
    const m = this.materials;
    tile.prev = tile.cur;
    tile.cur = value;
    tile.t = 0;
    tile.top.material = m[value].top;
    tile.bot.material = m[tile.prev].bot;
    tile.leafFront.material = m[tile.prev].top;
    tile.leafBack.material = m[value].bot;
    tile.leaf.visible = true;
    tile.leaf.rotation.x = 0;
  }

  update({ row, zoom, pivot, width, height, flap, rx, ry, rz = 0, light, dt, still, opacity }) {
    if (!row || opacity < 0.002) {
      this.group.visible = false;
      this.setLights(0);
      return false;
    }
    const fontKey = `${row.offsetWidth}x${row.offsetHeight}|${document.fonts?.status}`;
    if (fontKey !== this.layoutKey) {
      this.layoutKey = fontKey;
      this.build(row);
    }
    this.group.visible = true;

    // posizione e scala dal riquadro del pannello DOM (segue zoom e ingresso)
    const r = row.getBoundingClientRect();
    // il pannello ruota attorno al centro: la metà che si allontana non deve passare dietro il piano della sfera.
    // Lo si porta avanti quanto basta e lo si rimpicciolisce in proporzione, così a schermo resta sul riquadro DOM.
    const distance = height / 2 / Math.tan(THREE.MathUtils.degToRad(15));
    const half = (r.width / 2) * Math.abs(Math.sin(ry)) + (r.height / 2) * Math.abs(Math.sin(rx));
    const lift = Math.min(half + this.fs * (r.width / this.W) * 0.4, distance * 0.5);
    const k = (distance - lift) / distance;
    const s = (r.width / this.W) * k;
    let cx = (r.left + r.width / 2 - width / 2) * k;
    let cy = (height / 2 - (r.top + r.height / 2)) * k;
    // rotazione piatta, come una penna che gira sul foglio: il perno è la barra dove entra lo zoom,
    // così il punto in cui si entra resta fermo mentre il pannello si raddrizza in verticale
    if (rz && pivot) {
      const p = pivot.getBoundingClientRect();
      const px = (p.left + p.width / 2 - width / 2) * k;
      const py = (height / 2 - (p.top + p.height / 2)) * k;
      const c = Math.cos(rz);
      const sn = Math.sin(rz);
      const dx = cx - px;
      const dy = cy - py;
      cx = px + dx * c - dy * sn;
      cy = py + dx * sn + dy * c;
    }
    this.group.position.set(cx, cy, lift);
    this.group.scale.set(s, s, Math.min(s, 2.5));
    this.group.rotation.z = rz;
    this.board.rotation.set(rx, ry, 0);

    // cifre: stessa logica dello split-flap DOM, girate con l'aletta vera
    this.tiles.forEach(tile => {
      const value = digitAt(this.targets[tile.index], flap, settleAt(tile.index));
      if (value !== tile.cur) {
        if (tile.t < 1) this.finish(tile);
        if (still) {
          tile.cur = value;
          tile.top.material = this.materials[value].top;
          tile.bot.material = this.materials[value].bot;
        } else this.setDigit(tile, value);
      }
      if (tile.t < 1) {
        tile.t = Math.min(1, tile.t + dt / FLIP);
        const e = tile.t < 0.5 ? 2 * tile.t * tile.t : 1 - Math.pow(-2 * tile.t + 2, 2) / 2;
        tile.leaf.rotation.x = Math.PI * e;
        if (tile.t >= 1) this.finish(tile);
      }
    });

    // luci: principale dall'alto a sinistra, una che scorre da sinistra a destra, controluce rossa sotto
    const span = this.W * s;
    this.key.position.set(cx - span * 0.35, cy + span * 0.6, span * 0.9);
    this.key.target.position.set(cx, cy, 0);
    const cam = this.key.shadow.camera;
    cam.left = -span;
    cam.right = span;
    cam.top = span;
    cam.bottom = -span;
    cam.near = 1;
    cam.far = span * 4;
    cam.updateProjectionMatrix();
    this.sweep.position.set(cx + (light - 0.5) * span * 1.3, cy + this.H * s * 0.9, this.fs * s * 1.6);
    this.rim.position.set(cx, cy - this.H * s * 1.2, -this.fs * s);
    this.setLights(opacity);

    // opachi quando il pannello è pieno (niente problemi di ordinamento), trasparenti solo mentre entra o sparisce
    const fading = opacity < 0.999;
    for (const m of [this.metal, this.tileBody, this.hinge, this.pin, ...this.materials.flatMap(d => [d.top, d.bot])]) {
      m.opacity = opacity;
      if (m.transparent !== fading) {
        m.transparent = fading;
        m.needsUpdate = true;
      }
    }
    this.slashMat.opacity = opacity;
    this.ground.material.opacity = 0.45 * opacity;
    return true;
  }

  finish(tile) {
    tile.t = 1;
    tile.leaf.visible = false;
    tile.bot.material = this.materials[tile.cur].bot;
  }

  setLights(on) {
    this.ambient.intensity = 0.35 * on;
    this.key.intensity = 1.5 * on;
    this.sweep.intensity = 0.9 * on;
    this.rim.intensity = 1.6 * on;
  }
}
