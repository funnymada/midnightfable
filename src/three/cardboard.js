import * as THREE from 'three';

// Mulino (a sinistra, sopra la scritta), sole (a destra) e pesce (sott'acqua) di cartone, come le quinte di un teatrino delle favole.
// Ogni pezzo è una sagoma ritagliata a mano (bordi un po' storti), spessa qualche pixel, dipinta sopra la grana
// del cartone; i pezzi stanno su piani diversi e si fanno ombra. Entrano dai lati spinti da un bastoncino:
// una molla li fa arrivare con un piccolo rimbalzo, inclinati e a saltelli, come mossi a mano.
// `progress` (fx.props): 0 fuori scena · 1 in scena · 2 di nuovo fuori.

const KRAFT = '#a57b4b'; // il taglio del cartone: sempre marrone, sotto la pittura

// rumore deterministico per i bordi storti
const rand = seed => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

// grana del cartone: fibre chiare e scure su un grigio caldo (la pittura la moltiplica)
function kraftTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d8d2c8';
  g.fillRect(0, 0, 256, 256);
  const r = rand(7);
  for (let i = 0; i < 2600; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const len = 2 + r() * 9;
    const a = r() * Math.PI;
    g.strokeStyle = r() < 0.5 ? `rgba(255,250,240,${0.12 + r() * 0.2})` : `rgba(90,70,50,${0.08 + r() * 0.16})`;
    g.lineWidth = 0.6 + r() * 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  // pennellate larghe: la tempera non è mai uniforme
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '60,45,30'},${0.03 + r() * 0.04})`;
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 20 + r() * 50, 6 + r() * 14, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// contorno con il tremolio del taglio a forbice
function cut(points, amp, seed) {
  const r = rand(seed);
  const out = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 0.04));
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const l = Math.hypot(nx, ny) || 1;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const j = (r() - 0.5) * 2 * amp;
      out.push(new THREE.Vector2(a.x + (b.x - a.x) * t + (nx / l) * j, a.y + (b.y - a.y) * t + (ny / l) * j));
    }
  }
  return new THREE.Shape(out);
}

const V = (x, y) => new THREE.Vector2(x, y);
const circle = (cx, cy, r, n = 40) => Array.from({ length: n }, (_, i) => V(cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r));
const star = (n, outer, inner, turn = 0) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = (i / (n * 2)) * Math.PI * 2 + turn;
    const r = i % 2 ? inner : outer;
    return V(Math.cos(a) * r, Math.sin(a) * r);
  });
// arco sottile a falce: sorriso e occhi chiusi
const smile = (cx, cy, r, thick, open = 0.55) => {
  const pts = [];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + open + (i / n) * (Math.PI - open * 2);
    pts.push(V(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  for (let i = n; i >= 0; i--) {
    const a = Math.PI + open + (i / n) * (Math.PI - open * 2);
    pts.push(V(cx + Math.cos(a) * (r - thick * Math.sin((i / n) * Math.PI)), cy + Math.sin(a) * (r - thick * Math.sin((i / n) * Math.PI)) + thick * 0.15));
  }
  return pts;
};
const rect = (x0, y0, x1, y1) => [V(x0, y0), V(x1, y0), V(x1, y1), V(x0, y1)];

export class Cardboard {
  constructor() {
    this.scene = new THREE.Scene();
    this.kraft = kraftTexture();
    this.kraft.repeat.set(1.6, 1.6);
    this.materials = new Map();
    this.geometries = [];
    this.seed = 11;

    const hemi = new THREE.HemisphereLight('#fff3dc', '#3a2c1c', 1.1);
    this.light = new THREE.DirectionalLight('#ffe7bf', 2.4);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.6;
    this.scene.add(hemi, this.light, this.light.target);

    this.mill = this.buildMill();
    this.sun = this.buildSun();
    this.fish = this.buildFish();
    this.scene.add(this.mill.root, this.sun.root, this.fish.root);
    this.props = [this.mill, this.sun, this.fish];
    this.props.forEach(p => Object.assign(p, { x: null, v: 0, travel: 0 }));
    this.size = '';
  }

  material(color, metal = false) {
    const key = color + metal;
    if (!this.materials.has(key)) {
      const face = metal
        ? new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.35 })
        : new THREE.MeshStandardMaterial({ color, map: this.kraft, roughness: 0.92, metalness: 0 });
      const side = new THREE.MeshStandardMaterial({ color: metal ? color : KRAFT, map: metal ? null : this.kraft, roughness: 0.95, metalness: metal ? 0.85 : 0 });
      this.materials.set(key, [face, side]);
    }
    return this.materials.get(key);
  }

  // una sagoma di cartone: ritagliata, estrusa (spessore 0.018), su un suo piano z
  piece(parent, points, color, z, { wobble = 0.006, depth = 0.018, metal = false } = {}) {
    const shape = cut(points, wobble, this.seed++);
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
    this.geometries.push(geo);
    const mesh = new THREE.Mesh(geo, this.material(color, metal));
    mesh.position.z = z;
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // fermacampione d'ottone: tiene insieme i pezzi che girano
  pin(parent, x, y, z, r) {
    const geo = new THREE.SphereGeometry(r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    geo.rotateX(Math.PI / 2);
    this.geometries.push(geo);
    const mesh = new THREE.Mesh(geo, this.material('#c9a24a', true)[0]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
  }

  // bastoncino di legno che regge la sagoma da fuori scena
  stick(parent, x, y0, y1, z) {
    const geo = new THREE.BoxGeometry(0.035, Math.abs(y1 - y0), 0.03);
    this.geometries.push(geo);
    const mesh = new THREE.Mesh(geo, this.material('#9a7148'));
    mesh.position.set(x, (y0 + y1) / 2, z);
    mesh.castShadow = true;
    parent.add(mesh);
  }

  // mulino: unità = altezza circa 1.3, base della collina a y = -0.62
  buildMill() {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    this.stick(body, 0.05, -0.6, -2.6, -0.05);
    // collina dietro e davanti
    const hill = (w, h, y, n) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push(V(-w + t * 2 * w, y + Math.sin(t * Math.PI) * h + Math.sin(t * Math.PI * 3) * h * 0.12));
      }
      pts.push(V(w, y - 0.12), V(-w, y - 0.12));
      return pts;
    };
    // solo marroni e beige/bianco: collina color terra, torre beige, vele bianche, legno scuro
    this.piece(body, hill(0.62, 0.2, -0.56, 24), '#8a6a45', -0.03);
    // torre: tronco di cono di assi chiare
    this.piece(body, [V(-0.19, -0.5), V(0.19, -0.5), V(0.115, 0.2), V(-0.115, 0.2)], '#ead9b0', 0);
    // porta ad arco e finestrella
    const door = [V(-0.055, -0.5), V(0.055, -0.5), V(0.055, -0.4)];
    for (let i = 0; i <= 10; i++) door.push(V(Math.cos((i / 10) * Math.PI) * 0.055, -0.4 + Math.sin((i / 10) * Math.PI) * 0.055));
    door.push(V(-0.055, -0.4));
    this.piece(body, door, '#7a5230', 0.02, { depth: 0.008 });
    this.piece(body, circle(0, 0.02, 0.035, 20), '#7a5230', 0.02, { depth: 0.008 });
    // tetto a cappuccio
    this.piece(body, [V(-0.16, 0.17), V(0.16, 0.17), V(0.1, 0.28), V(0, 0.36), V(-0.1, 0.28)], '#5e3f26', 0.025);
    this.piece(body, hill(0.66, 0.12, -0.62, 24), '#a8825a', 0.06);
    // pale: braccio di legno + vela di tela con i listelli
    const blades = new THREE.Group();
    blades.position.set(0, 0.22, 0.07);
    body.add(blades);
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group();
      arm.rotation.z = (k * Math.PI) / 2 + 0.3;
      blades.add(arm);
      this.piece(arm, rect(0.03, -0.016, 0.52, 0.016), '#7a5230', 0);
      this.piece(arm, rect(0.13, 0.016, 0.5, 0.125), '#f4eee2', 0.012);
      for (const x of [0.22, 0.31, 0.4]) this.piece(arm, rect(x, 0.016, x + 0.012, 0.125), '#7a5230', 0.026, { depth: 0.006, wobble: 0.002 });
      this.piece(arm, rect(0.13, 0.065, 0.5, 0.075), '#7a5230', 0.026, { depth: 0.006, wobble: 0.002 });
    }
    this.piece(blades, circle(0, 0, 0.045, 24), '#7a5230', 0.03);
    this.pin(blades, 0, 0, 0.05, 0.02);
    return { root, body, spin: blades, home: { x: 0, y: 0 } };
  }

  // pesce: guarda a sinistra, lungo circa 1.6 unità, retto da un bastoncino dal basso; la coda è un pezzo a parte che scodinzola
  buildFish() {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    this.stick(body, 0.05, -0.25, -2.6, -0.05);
    const tail = new THREE.Group();
    tail.position.set(0.42, 0, -0.02);
    body.add(tail);
    this.piece(tail, [V(-0.06, 0), V(0.34, 0.3), V(0.26, 0.02), V(0.36, -0.28)], '#2b5d9f', 0);
    this.pin(tail, -0.02, 0, 0.03, 0.022);
    // corpo a mandorla, pancia chiara
    const lens = (top, bottom, n = 28) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push(V(-0.7 + t * 1.2, Math.sin(t * Math.PI) ** 0.8 * top * (1 - t * 0.25)));
      }
      for (let i = n - 1; i > 0; i--) {
        const t = i / n;
        pts.push(V(-0.7 + t * 1.2, -(Math.sin(t * Math.PI) ** 0.8) * bottom * (1 - t * 0.25)));
      }
      return pts;
    };
    // pinne
    this.piece(body, [V(-0.18, 0.24), V(0.08, 0.46), V(0.28, 0.22)], '#2b5d9f', -0.015);
    this.piece(body, [V(-0.05, -0.2), V(0.12, -0.38), V(0.2, -0.18)], '#2b5d9f', -0.015);
    this.piece(body, lens(0.32, 0.3), '#3f7fcf', 0);
    this.piece(body, lens(0.01, 0.3).map(p => V(p.x, Math.min(p.y, -0.04))), '#9cc8ee', 0.02, { depth: 0.008 });
    // strisce, occhio, bocca
    for (const x of [-0.12, 0.1]) {
      const h = 0.27 * (1 - Math.abs(x) * 0.6);
      this.piece(body, [V(x - h * 0.12, -h), V(x + 0.06 - h * 0.12, -h), V(x + 0.06 + h * 0.12, h), V(x + h * 0.12, h)], '#2b5d9f', 0.03, { depth: 0.008 });
    }
    this.piece(body, circle(-0.44, 0.07, 0.085, 24), '#f2efe6', 0.035, { depth: 0.008, wobble: 0.003 });
    this.piece(body, circle(-0.46, 0.07, 0.04, 16), '#1d2a3a', 0.045, { depth: 0.006, wobble: 0.002 });
    this.piece(body, smile(-0.58, -0.02, 0.06, 0.02, 0.6), '#1d2a3a', 0.035, { depth: 0.006, wobble: 0.001 });
    return { root, body, spin: tail, home: { x: 0, y: 0 } };
  }

  // sole: unità = raggio dei raggi 1, appeso a due fili dall'alto
  buildSun() {
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    // fili
    for (const x of [-0.45, 0.45]) {
      const geo = new THREE.CylinderGeometry(0.006, 0.006, 4, 6);
      geo.translate(0, 2 + 0.55, 0);
      this.geometries.push(geo);
      const m = new THREE.Mesh(geo, this.material('#e8e0d0')[0]);
      m.position.set(x, 0, -0.06);
      body.add(m);
    }
    const rays = new THREE.Group();
    body.add(rays);
    this.piece(rays, star(12, 1, 0.66), '#e9862a', -0.04);
    this.piece(rays, star(12, 0.84, 0.6, Math.PI / 12), '#f3ab3a', -0.015);
    this.piece(body, circle(0, 0, 0.6, 60), '#f7cb48', 0.01);
    // faccia: occhi chiusi, guance, sorriso
    for (const s of [-1, 1]) {
      this.piece(body, smile(s * 0.21, 0.13, 0.1, 0.035, 0.45), '#7a3d1a', 0.035, { depth: 0.008, wobble: 0.002 });
      this.piece(body, circle(s * 0.33, -0.08, 0.085, 24), '#ee8a63', 0.035, { depth: 0.008, wobble: 0.003 });
    }
    this.piece(body, smile(0, 0.02, 0.24, 0.06, 0.5), '#7a3d1a', 0.035, { depth: 0.008, wobble: 0.002 });
    this.pin(body, 0, 0, 0.05, 0.035);
    return { root, body, spin: rays, home: { x: 0, y: 0 } };
  }

  layout(width, height) {
    const key = `${width}x${height}`;
    if (key === this.size) return;
    this.size = key;
    const small = Math.min(width, height);
    // il mulino sta sopra l'onda: nella metà alta dello schermo, con la collina appoggiata sull'acqua
    const mill = Math.min(height * 0.36, width * 0.36);
    this.millMax = mill;
    this.mill.scale = 0; // la misura vera la decide update(), in base allo spazio sopra la scritta
    const sun = Math.min(small * 0.17, width * 0.16);
    this.mill.scale = mill;
    this.mill.home = { x: -width / 2 + mill * 0.62, y: 0 };
    this.mill.off = mill * 0.75 + width * 0.06;
    this.mill.side = -1;
    this.sun.scale = sun;
    this.sun.home = { x: width / 2 - sun * 1.35, y: height / 2 - sun * 1.45 };
    this.sun.off = sun * 1.1 + width * 0.06;
    this.sun.side = 1;
    // pesce in basso, al centro leggermente a destra, sott'acqua
    const fish = Math.min(small * 0.15, width * 0.2);
    this.fish.scale = fish;
    this.fish.home = { x: width * 0.1, y: -height / 2 + Math.max(fish * 0.75, height * 0.15) };
    this.fish.off = fish * 1.2 + width * 0.06;
    this.fish.side = 1;
    this.props.forEach(p => {
      p.root.scale.setScalar(p.scale);
      // di tre quarti verso il centro: si vede lo spessore del cartone
      p.root.rotation.y = -p.side * 0.32;
    });
    // l'ombra copre tutto lo schermo
    const d = height / 2 / Math.tan(THREE.MathUtils.degToRad(15));
    this.light.position.set(-width * 0.35, height * 0.6, d * 0.8);
    Object.assign(this.light.shadow.camera, { left: -width * 0.7, right: width * 0.7, top: height * 0.7, bottom: -height * 0.7, near: 1, far: d * 3 });
    this.light.shadow.camera.updateProjectionMatrix();
  }

  update({ width, height, progress, surface = 0.56, titleTop = null, time, dt, still }) {
    if (progress <= 0.001 || progress >= 1.999) {
      this.props.forEach(p => {
        p.x = null;
        p.v = 0;
      });
      return false;
    }
    this.layout(width, height);
    // il mulino sta sopra la scritta: la collina finisce poco sopra il bordo alto di "it's coming"
    // (titleTop, px dall'alto; senza scritta, sopra la linea dell'acqua). Se lo spazio è poco, rimpicciolisce.
    const floor = (titleTop ?? height * surface) - Math.max(10, height * 0.02);
    const mill = Math.max(40, Math.min(this.millMax, (floor - height * 0.03) / 1.5));
    if (Math.abs(mill - this.mill.scale) > 0.5) {
      this.mill.scale = mill;
      this.mill.root.scale.setScalar(mill);
      this.mill.home.x = -width / 2 + mill * 0.62;
      this.mill.off = mill * 0.75 + width * 0.06;
    }
    this.mill.home.y = height / 2 - floor + this.mill.scale * 0.74;
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    const enter = Math.min(1, progress);
    const leave = Math.max(0, progress - 1);
    let visible = false;
    this.props.forEach((p, i) => {
      // arrivano uno dopo l'altro (mulino, sole, pesce) ed escono in ordine inverso
      const n = this.props.length - 1;
      const e = easeOut(Math.min(1, Math.max(0, (enter - i * 0.15) / (1 - n * 0.15))));
      const l = Math.min(1, Math.max(0, (leave - (n - i) * 0.1) / (1 - n * 0.1)));
      const away = (1 - e) + l * l;
      const target = p.home.x + p.side * (Math.abs(p.home.x) + p.off) * away;
      if (p.x === null || still) {
        p.x = target;
        p.v = 0;
      } else {
        // molla poco smorzata: arriva, supera di poco, torna
        const k = 38;
        const c = 7.5;
        p.v += ((target - p.x) * k - p.v * c) * dt;
        p.x += p.v * dt;
      }
      p.travel += Math.abs(p.v * dt);
      const speed = Math.min(1, Math.abs(p.v) / (p.scale * 1.5));
      p.root.position.x = p.x;
      p.root.position.y = p.home.y;
      // saltella e si inclina mentre viene spinto, come mosso a mano
      p.body.position.y = Math.abs(Math.sin(p.travel / (p.scale * 0.22))) * 0.05 * speed;
      p.body.rotation.z = THREE.MathUtils.clamp(-p.v / (p.scale * 9), -0.18, 0.18) + (still ? 0 : Math.sin(time * 0.9 + i * 2) * 0.012);
      if (!still) {
        if (p === this.mill) p.spin.rotation.z = -time * 0.7;
        else if (p === this.sun) p.spin.rotation.z = time * 0.12;
        else p.spin.rotation.z = Math.sin(time * 4.5) * 0.28; // la coda scodinzola
      }
      if (p === this.sun && !still) p.body.position.y += Math.sin(time * 1.1) * 0.02;
      if (p === this.fish && !still) p.body.position.y += Math.sin(time * 1.6) * 0.04;
      p.root.visible = Math.abs(p.x) - p.scale * 1.2 < width / 2;
      visible ||= p.root.visible;
    });
    return visible;
  }

  dispose() {
    this.geometries.forEach(g => g.dispose());
    this.materials.forEach(([a, b]) => {
      a.dispose();
      b.dispose();
    });
    this.kraft.dispose();
  }
}
