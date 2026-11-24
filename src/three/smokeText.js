import * as THREE from 'three';

// Frase finale fatta di fumo (three.js).
// Le lettere del DOM restano il riferimento: ogni carattere viene disegnato nella sua posizione
// su una maschera. R = lettera già formata, G = nube che si sta raccogliendo attorno alla lettera,
// entrambi scalati per lettera seguendo la macchina da scrivere. Uno shader a schermo intero
// fa addensare il fumo nella lettera appena battuta e lo lascia salire in volute da quelle già scritte.

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uMask;
  uniform float uTime;
  uniform float uOpacity;
  uniform float uFog;
  uniform float uPuff;
  uniform float uPuffAlpha;
  uniform vec2 uPuffAt[3];
  uniform float uAspect;
  uniform float uStill;
  uniform vec3 uLo;
  uniform vec3 uMid;
  uniform vec3 uHi;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 uv = vUv;
    float t = uTime;
    vec2 q = vec2(uv.x * uAspect, uv.y) * 3.2;

    // campo di vento: il fumo sale e si torce
    vec2 drift = vec2(0.0, -t * 0.14);
    vec2 w = vec2(fbm(q + drift), fbm(q + vec2(5.2, 1.3) + drift * 1.3)) - 0.5;
    vec2 w2 = vec2(fbm(q * 2.1 - drift * 1.6 + w * 2.0), fbm(q * 2.1 + vec2(3.1, 7.7) - drift * 1.6 + w * 2.0)) - 0.5;

    // nube che si raccoglie attorno alla lettera che sta per comparire
    vec4 far = textureLod(uMask, uv + w * 0.06, 5.0);
    float cloud = far.g * 3.2 * smoothstep(0.2, 0.75, fbm(q * 1.4 + w2 * 2.0 - drift));

    // corpo delle lettere: prima sfilacciato e spostato dal vento, poi si compatta
    float loose = clamp(textureLod(uMask, uv, 3.0).g * 2.5, 0.0, 1.0);
    vec2 coreUv = uv + (w * 0.07 + w2 * 0.03) * loose + w2 * 0.006 * (1.0 - uStill);
    float coreRaw = texture2D(uMask, coreUv).r;
    float grain = fbm(q * 3.0 + w2 * 3.0 - drift * 2.0);
    float erode = 0.5 + (grain - 0.5) * (0.55 + 0.9 * loose);
    float core = smoothstep(erode - 0.28, erode + 0.28, coreRaw) * (0.66 + 0.34 * grain);

    // alone morbido e volute che salgono dalle lettere già scritte
    float halo = textureLod(uMask, uv + w * 0.025, 5.5).r;
    float wisps = 0.0;
    for (int k = 1; k <= 7; k++) {
      float fk = float(k);
      vec2 o = vec2(w.x * 0.05 * fk / 7.0 + w2.x * 0.02, -fk * 0.016);
      float s = textureLod(uMask, uv + o, 2.0 + fk * 0.45).r;
      float shape = smoothstep(0.35, 0.8, fbm(q * vec2(1.6, 0.9) + w2 * 1.5 + vec2(fk * 0.7, -t * 0.22)));
      wisps += s * shape * (1.0 - fk / 8.0);
    }
    wisps *= 0.95 * (1.0 - uStill * 0.6);

    float smoke = clamp(cloud + halo * 0.7 + wisps, 0.0, 1.0);
    float tint = fbm(q * 0.8 + w * 2.0);
    vec3 smokeCol = mix(uMid, uHi, smoothstep(0.3, 0.9, tint)) * (0.55 + 0.45 * tint);
    float sweep = 0.5 + 0.5 * sin(uv.x * 7.0 - t * 0.35 + w.y * 4.0);
    vec3 coreCol = mix(uMid, uHi, sweep * 0.8 + 0.2) * (0.85 + 0.3 * grain);

    // nebbia su tutta la pagina: sale dal basso e riempie lo schermo prima della frase, poi si dirada
    float n = fbm(q * 0.55 + w * 1.6 + vec2(0.0, -t * 0.05));
    float n2 = fbm(q * 1.7 + w2 * 2.2 - drift * 0.6);
    float rise = n + (1.0 - uv.y) * 0.3 * (1.0 - uFog);
    float fogShape = smoothstep(1.0 - uFog * 0.95, 1.35 - uFog * 0.95, rise) * min(1.0, uFog * 1.6);

    // entrata: tre sbuffi che partono da punti precisi, uno dopo l'altro, e si gonfiano fino a coprire lo schermo
    float puffs = 0.0;
    float puffGlow = 0.0;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float p = clamp((uPuff - fk * 0.17) / 0.66, 0.0, 1.0);
      if (p <= 0.0) continue;
      // scoppio breve e compatto, poi la nube si gonfia sempre più in fretta fino a riempire lo schermo
      float burst = 1.0 - pow(1.0 - p, 3.0);
      float swell = pow(p, 2.4);
      vec2 d = vec2((uv.x - uPuffAt[k].x) * uAspect, uv.y - uPuffAt[k].y);
      // il fumo spinto fuori sale un po' mentre si allarga
      d.y -= p * 0.1;
      float radius = 0.02 + 0.26 * burst + 2.0 * swell;
      float r = length(d) / radius;
      // bordo a cavolfiore: rumore che scala con lo sbuffo, così le volute crescono con lui
      vec2 sp = d / (0.25 + radius * 0.5);
      float edge = fbm(sp * 2.2 + w2 * 1.6 + vec2(fk * 7.3, fk * 3.1) - drift * 0.7);
      float rr = r + (edge - 0.5) * 0.75;
      float body = smoothstep(1.0, 0.35, rr);
      float bill = 0.55 + 0.45 * fbm(sp * 4.0 + w * 2.5 + vec2(fk * 3.1, 0.0) - drift);
      puffs = max(puffs, body * bill * smoothstep(0.0, 0.08, p));
      // nucleo denso e chiaro appena esce, si spegne mentre si diluisce
      puffGlow = max(puffGlow, smoothstep(0.55, 0.0, rr) * (1.0 - p) * bill);
    }
    puffs *= uPuffAlpha;
    puffGlow *= uPuffAlpha;

    float fog = max(fogShape, puffs) * (0.55 + 0.45 * n2);
    vec3 fogCol = mix(uLo, uMid, smoothstep(0.3, 0.9, n2)) * (0.5 + 0.45 * n);
    fogCol = mix(fogCol, uHi, puffGlow * 0.6);

    core *= uOpacity;
    float aText = smoke * 0.62 * uOpacity;
    float aFog = clamp(fog * 0.82 + puffGlow * 0.3, 0.0, 1.0);
    float aSmoke = clamp(aText + aFog * (1.0 - aText), 0.0, 1.0);
    vec3 smokeMix = (smokeCol * aText + fogCol * aFog * (1.0 - aText));
    float alpha = clamp(core + aSmoke * (1.0 - core), 0.0, 1.0);
    vec3 col = coreCol * core + smokeMix * (1.0 - core);
    gl_FragColor = vec4(col, alpha);
  }
`;

export class SmokeText {
  constructor(line, stage) {
    this.line = line;
    this.stage = stage;
    this.chars = line ? [...line.querySelectorAll('[data-smoke-i]')] : [];
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.texture = null;
    this.key = '';
    this.typed = null;
    this.material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: {
        uMask: { value: null },
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uFog: { value: 0 },
        uPuff: { value: 0 },
        uPuffAlpha: { value: 1 },
        // punti di partenza degli sbuffi (uv, y dal basso): basso a sinistra, destra, alto al centro
        uPuffAt: { value: [new THREE.Vector2(0.14, 0.12), new THREE.Vector2(0.86, 0.3), new THREE.Vector2(0.42, 0.86)] },
        uAspect: { value: 1 },
        uStill: { value: 0 },
        uLo: { value: new THREE.Color() },
        uMid: { value: new THREE.Color() },
        uHi: { value: new THREE.Color() }
      }
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  // quanto è formata ogni lettera: r = lettera, g = nube che la precede
  states(typed) {
    return this.chars.map(el => {
      const i = Number(el.dataset.smokeI);
      const rev = Math.min(1, Math.max(0, (typed + 1.2 - i) / 2.2));
      const gather = Math.min(1, Math.max(0, (typed + 3 - i) / 3)) * (1 - rev);
      return [Math.round(rev * 255), Math.round(gather * 255)];
    });
  }

  // ridisegna la maschera quando cambiano il layout o lo stato delle lettere
  draw(width, height, dpr, typed) {
    const { chars, line } = this;
    if (!chars.length) return;
    const first = chars[0].getBoundingClientRect();
    const last = chars[chars.length - 1].getBoundingClientRect();
    const cs = getComputedStyle(line);
    const states = this.states(typed);
    const key = [width, height, dpr, first.left, first.top, last.right, last.bottom, cs.fontSize, cs.fontFamily, states.join(';')]
      .map(v => (typeof v === 'number' ? v.toFixed(1) : v))
      .join('|');
    if (key === this.key) return;
    this.key = key;

    const scale = Math.min(dpr, 1.25);
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const { canvas, ctx } = this;
    const resized = canvas.width !== w || canvas.height !== h;
    canvas.width = w;
    canvas.height = h;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    ctx.font = font;
    ctx.textBaseline = 'alphabetic';
    const ascent = ctx.measureText('Hg').fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.8;
    chars.forEach((el, n) => {
      const [rev, gather] = states[n];
      if (!rev && !gather) return;
      const r = el.getBoundingClientRect();
      ctx.fillStyle = `rgb(${rev}, ${gather}, 0)`;
      ctx.fillText(el.textContent, r.left, r.top + ascent);
    });

    if (!this.texture || resized) {
      this.texture?.dispose();
      this.texture = new THREE.CanvasTexture(canvas);
      this.texture.minFilter = THREE.LinearMipmapLinearFilter;
      this.texture.magFilter = THREE.LinearFilter;
      this.texture.generateMipmaps = true;
      this.texture.colorSpace = THREE.NoColorSpace;
      this.material.uniforms.uMask.value = this.texture;
    }
    this.texture.needsUpdate = true;
  }

  update({ width, height, dpr, typed, opacity, fog, puff = 0, puffAlpha = 1, time, dt, still }) {
    const puffing = puff > 0.002 && puffAlpha > 0.002;
    if (!this.line || (opacity < 0.002 && fog < 0.002 && !puffing)) {
      this.typed = null;
      return false;
    }
    // le lettere battute arrivano a scatti: il fumo le segue con morbidezza
    this.typed = this.typed === null ? typed : this.typed + (typed - this.typed) * (1 - Math.exp(-dt / 0.4));
    if (Math.abs(this.typed - typed) < 0.005) this.typed = typed;
    this.draw(width, height, dpr, still ? 999 : this.typed);

    const u = this.material.uniforms;
    const vars = getComputedStyle(this.stage);
    for (const [name, prop] of [['uLo', '--lo'], ['uMid', '--mid'], ['uHi', '--hi']]) {
      const value = vars.getPropertyValue(prop).trim();
      if (value && value !== u[name].css) {
        try {
          u[name].value.setStyle(value, THREE.NoColorSpace);
          u[name].css = value;
        } catch {
          /* colore non leggibile: resta il precedente */
        }
      }
    }
    u.uTime.value = still ? 0 : time;
    u.uOpacity.value = opacity;
    u.uFog.value = fog;
    u.uPuff.value = puff;
    u.uPuffAlpha.value = puffAlpha;
    u.uAspect.value = width / Math.max(1, height);
    u.uStill.value = still ? 1 : 0;
    return true;
  }

  dispose() {
    this.texture?.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
  }
}
