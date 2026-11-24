import { useEffect, useRef } from 'react';
import { Renderer, Program, Mesh, Triangle, Geometry, RenderTarget } from 'ogl';
import { buildPalette, buildStrands, parseColor, seeded } from './CrystalBall.jsx';

import './CrystalizedBall.css';

// CrystalWave: lo stesso plasma della CrystalBall (filamenti, flare, archi, polvere, alone, tonemap)
// ma il bordo è una linea d'onda orizzontale invece di un cerchio.
// `drive()` viene letto a ogni frame:
//   y      posizione della linea in frazioni d'altezza dall'alto
//   swell  ampiezza dell'ondeggiamento in frazioni d'altezza, seed/clock lo sincronizzano con lo sfondo
//   water  +1 acqua sotto la linea, -1 acqua sopra (i flare escono sempre dal lato opposto)
//   color, fade, charge, ripples

const PRESET = {
  strands: 6,
  crackle: 0.85,
  flares: 0.65,
  glow: 0.9,
  sparks: 0.6,
  particleCount: 12000,
  twinkle: 0.5,
  haze: 0.7,
  dustSpeed: 1
};
const MAX_ARCS = 4;
const PIXEL_BUDGET = 4.5e6;
const INTRO_SECONDS = 2.2;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const wave = (x, clock, seed) => 0.6 * Math.sin(x * 0.006 + clock * 0.9 + seed) + 0.4 * Math.sin(x * 0.013 - clock * 1.3 + seed * 2);

// polvere: fascia luminosa subito sotto la linea (come l'anello della sfera) + acqua che si spegne in profondità
const buildDust = count => {
  const random = seeded(1337);
  const home = new Float32Array(count * 4);
  const seed = new Float32Array(count * 4);
  for (let k = 0; k < count; k++) {
    let depth;
    let tone;
    if (random() < 0.28) {
      depth = Math.sqrt(random()) * 0.09;
      const q = random();
      tone = q < 0.5 ? 3 : q < 0.8 ? 2 : 1;
    } else {
      depth = 0.04 - Math.log(1 - random() * 0.98) * 0.32;
      const weight = Math.exp(-depth * 2.2);
      if (random() > 0.1 + 0.9 * weight) tone = 4;
      else {
        const q = random();
        tone = q < 0.32 ? 0 : q < 0.52 ? 1 : q < 0.8 ? 2 : 3;
      }
    }
    home[k * 4] = random();
    home[k * 4 + 1] = depth;
    home[k * 4 + 2] = random();
    home[k * 4 + 3] = tone;
    seed[k * 4] = tone === 4 ? 1.8 : random() < 0.22 ? 2.1 : 1.3;
    seed[k * 4 + 1] = random();
    seed[k * 4 + 2] = 2.5 + random() * 3.5;
    seed[k * 4 + 3] = 0.03 + random() * 0.08;
  }
  return { home, seed };
};

const passVertex = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const hashChunk = `
uint scramble(uint v) {
  v = v * 747796405u + 2891336453u;
  uint w = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
  return (w >> 22u) ^ w;
}

float random(uint v) {
  return float(scramble(v)) * (1.0 / 4294967295.0);
}
`;

// la linea: stessa formula del bordo dell'acqua nello sfondo
const lineChunk = `
uniform vec2 uView;
uniform float uLineY;
uniform float uSwell;
uniform float uSeed;
uniform float uClock;
uniform float uWater;

float lineAt(float x) {
  return uLineY + (0.6 * sin(x * 0.006 + uClock * 0.9 + uSeed) + 0.4 * sin(x * 0.013 - uClock * 1.3 + uSeed * 2.0)) * uSwell;
}
`;

const fieldFragment = `#version 300 es
precision highp float;

uniform float uDpr;
uniform float uSpan;
uniform float uLine;
uniform float uTime;
uniform float uFrame;
uniform float uBinPx;
uniform float uStrands;
uniform float uCrackle;
uniform float uFlares;
uniform float uGlow;
uniform float uHaze;
uniform float uPresence;
uniform float uUnfold;
uniform float uBloom;
uniform float uRipples;
uniform float uEncode;
uniform vec3 uRim;
uniform vec3 uRimHot;
uniform vec3 uRimMid;
uniform vec3 uRimDeep;
uniform vec3 uSpark;
uniform vec3 uSparkGlow;
uniform vec3 uHazeColor;
uniform vec3 uEdgeColor;
uniform vec4 uHeat;
uniform vec4 uHarmonics[8];
uniform vec4 uRates[8];
uniform vec4 uPhases[8];
uniform vec4 uFlareHarmonics[8];
uniform vec4 uFlareRates[8];
uniform vec4 uFlarePhases[8];
uniform vec4 uArcs[4];

out vec4 fragColor;
${hashChunk}
${lineChunk}
const float PI = 3.14159265;
const vec4 AMPS = vec4(0.35, 0.3, 0.22, 0.13);

float bell(float d, float w) {
  float x = d / w;
  return exp(-x * x);
}

// punto a distanza out_ dalla linea, verso fuori (lato opposto all'acqua)
vec2 lift(float x, float out_) {
  return vec2(x, lineAt(x) - out_ * uWater);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;
  float x = p.x;
  float R = uSpan;
  float dr = (lineAt(x) - p.y) * uWater;
  vec3 col = vec3(0.0);
  float hot = 0.0;
  uint frame = uint(uFrame);

  // dentro: foschia che si spegne in profondità, bordo più chiaro sotto la linea
  if (dr < 0.0) {
    float depth = -dr / R;
    col += uHazeColor * uHaze * 0.55 * exp(-depth * 1.4) * uPresence;
    col += uEdgeColor * 0.5 * pow(exp(-depth * 5.0), 1.4) * (0.5 + 0.5 * uHaze) * uPresence;
  }

  float halo = 1.0 - smoothstep(R * 0.05, R * 0.105, abs(dr - R * 0.0213));
  col += uRimDeep * 0.18 * halo * uGlow * uBloom;
  col += uRim * 0.12 * bell(dr + R * 0.0383, R * 0.032) * uGlow * uBloom;
  col += uRim * 0.32 * bell(dr, max(R * 0.0117, uLine)) * uPresence * uUnfold;

  // calore: il puntatore vicino alla linea, e le increspature che partono dal centro
  float dx = (x - uHeat.x) / (R * 0.55);
  float heat = uHeat.z * uHeat.y * exp(-dx * dx);
  float ripple = 0.0;
  for (int i = 0; i < 3; i++) {
    float life = fract(uClock * 0.22 + float(i) / 3.0);
    ripple += bell(abs(x - uView.x * 0.5) - life * R * 2.4, R * 0.08) * (1.0 - life);
  }
  heat += ripple * uRipples * 0.9;

  float crackle = uCrackle + heat * 0.9;
  float amp = R * 0.016 * (0.3 + 1.4 * crackle) * uUnfold;
  float jitterAmp = R * 0.0048 * (0.3 + 1.4 * uCrackle) * uUnfold * (1.0 + heat * 0.3);
  float flareAmp = R * 0.064 * (0.4 + 1.2 * crackle) * uFlares * 1.6 * uUnfold;

  if (abs(dr) < amp * 2.0 + flareAmp + R * 0.3) {
    float th = x / R;
    float step = uBinPx / R;
    float binPos = th / step;
    float bin0 = floor(binPos);
    float binF = binPos - bin0;
    float th0 = bin0 * step;
    float th1 = th0 + step;
    uint b0 = uint(bin0 + 4096.0);
    uint b1 = b0 + 1u;
    float gain = min(1.0, 2.4 / max(uStrands, 1.0));
    for (int k = 0; k < 8; k++) {
      if (float(k) >= uStrands) break;
      vec4 m = uHarmonics[k];
      vec4 lead = uRates[k] * uTime + uPhases[k];
      float wave0 = dot(AMPS, sin(m * th0 + lead));
      float wave1 = dot(AMPS, sin(m * th1 + lead));
      uint salt = uint(k) * 1013u + frame * 7919u;
      vec4 shape = uFlareHarmonics[k];
      vec4 look = uFlareRates[k];
      vec4 tone = uFlarePhases[k];
      float a = amp * shape.w;
      float off0 = a * wave0 + jitterAmp * (random(b0 + salt) - 0.5);
      float off1 = a * wave1 + jitterAmp * (random(b1 + salt) - 0.5);
      float rc = mix(off0, off1, binF);
      float grade = (off1 - off0) / uBinPx;
      float d = abs(dr - rc) * inversesqrt(1.0 + grade * grade);
      float swell = 0.8 + 0.4 * (0.5 + 0.5 * sin(3.0 * th + uTime * 0.7 + tone.x * 1.7));
      float width = uLine * look.w * swell * (1.0 + heat * 0.25);
      float core = exp(-d * d / (width * width));
      float sheath = exp(-d * d / (width * width * 3.0));
      float bright = tone.w * (1.0 + heat * 0.45) * uPresence;
      col += (uRimHot * core * 0.8 + uRim * sheath * 0.32) * bright;
      hot += core * bright;
      vec3 fargs = shape.xyz * th + look.xyz * uTime + tone.xyz;
      float flare = max(0.0, (sin(fargs.x) + sin(fargs.y) + sin(fargs.z)) / 3.0);
      flare = (flare * flare + heat * 0.35) * flareAmp;
      float dw = abs(dr - rc - flare);
      float dm = abs(dr - rc - flare * 0.6);
      float dn = abs(dr - rc - flare * 0.25);
      vec3 glow = uRimDeep * (0.07 * bell(dw, R * 0.09) + 0.16 * bell(dw, R * 0.05));
      glow += uRimMid * 0.28 * bell(dm, R * 0.027) + uRim * 0.38 * bell(dn, R * 0.013);
      col += glow * gain * uGlow * uBloom * (1.0 + heat * 1.4);
    }
  }

  // archi di scintille appena sotto la linea
  for (int i = 0; i < 4; i++) {
    vec4 arc = uArcs[i];
    if (arc.w <= 0.002) continue;
    float mid = arc.x + arc.y * 0.5;
    vec2 a0 = lift(arc.x, -R * 0.045);
    vec2 a2 = lift(arc.x + arc.y, -R * 0.045);
    vec2 a1 = lift(mid, -R * (0.045 + arc.z));
    if (distance(p, a1) > abs(arc.y) + R * arc.z + 12.0) continue;
    float dmin = 1e5;
    float along = 0.0;
    vec2 prev = a0;
    for (int s = 1; s <= 10; s++) {
      float u = float(s) / 10.0;
      vec2 b = mix(mix(a0, a1, u), mix(a1, a2, u), u);
      vec2 pa = p - prev;
      vec2 ba = b - prev;
      float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-5), 0.0, 1.0);
      float dist = length(pa - ba * h);
      if (dist < dmin) {
        dmin = dist;
        along = (float(s) - 1.0 + h) / 10.0;
      }
      prev = b;
    }
    float taper = sqrt(max(sin(PI * along), 0.0));
    float arcWidth = uLine * (0.55 + 0.6 * taper);
    float arcCore = exp(-dmin * dmin / (arcWidth * arcWidth));
    float arcGlow = exp(-dmin * dmin / (arcWidth * arcWidth * 12.0));
    col += (uSpark * 0.95 * arcCore + uSparkGlow * 0.4 * arcGlow) * arc.w * taper;
    hot += arcCore * arc.w * taper * 0.6;
  }

  fragColor = vec4(col, hot) * uEncode;
}
`;

const dustVertex = `#version 300 es
precision highp float;

in vec4 aHome;
in vec4 aSeed;

uniform float uDpr;
uniform float uSpan;
uniform float uDustTime;
uniform float uTwinkle;
uniform float uPointScale;
uniform float uReveal;
uniform float uEncode;
uniform vec3 uTones[5];
uniform vec3 uRimTone;

out vec3 vColor;
out float vSize;
${hashChunk}
${lineChunk}
void main() {
  uint id = uint(gl_VertexID);
  float t = uDustTime;
  float u = fract(t / aSeed.z + aSeed.y);
  float life = sin(3.14159265 * u);
  // la polvere sale verso la linea, ondeggia piano e scorre di lato
  float x = aHome.x * (uView.x + 40.0) - 20.0;
  x += 14.0 * sin(t * 0.31 + aSeed.y * 17.0) + 6.0 * sin(t * (0.8 + 2.4 * random(id * 7u + 2u)) + aSeed.z * 30.0);
  float depth = aHome.y - aSeed.w * (u - 0.5);
  depth += 0.006 * sin(t * (0.8 + 2.4 * random(id * 7u + 4u)) + aSeed.w * 40.0);
  depth = max(depth, 0.012);
  float y = lineAt(x) + depth * uSpan * 1.4 * uWater;

  float blink = sin(t * (2.0 + 6.0 * random(id * 7u + 5u)) + random(id * 7u + 6u) * 6.2831853);
  float twinkle = mix(1.0, smoothstep(-0.9, -0.6, blink), uTwinkle);
  float fade = smoothstep(0.04, 0.12, life);
  float front = aHome.z;
  float depthLight = 0.35 + 0.8 * front;
  float order = random(id * 7u + 8u) * 0.6 + aHome.x * 0.3;
  float reveal = smoothstep(order, order + 0.2, uReveal);
  float alpha = random(id * 7u + 9u) < 0.5 || aHome.w > 3.5 ? 1.0 : 0.6;

  float size = aSeed.x * uPointScale * (0.35 + 0.95 * life) * (0.7 + 0.6 * front) * mix(0.5, 1.0, reveal);
  gl_Position = vec4(x / uView.x * 2.0 - 1.0, 1.0 - y / uView.y * 2.0, 0.0, 1.0);
  float px = size * uDpr;
  gl_PointSize = px + 2.0;
  vSize = px;

  int tone = int(aHome.w + 0.5);
  float rimLit = exp(-depth * 18.0);
  vec3 color = uTones[tone] + uRimTone * rimLit * 0.12;
  vColor = color * alpha * fade * twinkle * depthLight * reveal * uEncode;
}
`;

const dustFragment = `#version 300 es
precision highp float;

in vec3 vColor;
in float vSize;

out vec4 fragColor;

void main() {
  vec2 q = (gl_PointCoord - 0.5) * (vSize + 2.0);
  float half_ = max(vSize * 0.5, 0.5);
  vec2 c = clamp(half_ - abs(q) + 0.5, 0.0, 1.0);
  float cover = c.x * c.y;
  if (cover <= 0.0) discard;
  fragColor = vec4(vColor * cover, 0.0);
}
`;

const compositeFragment = `#version 300 es
precision highp float;

uniform sampler2D tScene;
uniform float uDecode;
uniform float uFade;

in vec2 vUv;
out vec4 fragColor;

vec3 soften(vec3 x) {
  vec3 over = max(x - 0.6, 0.0);
  return min(x, 0.6) + 0.4 * (1.0 - exp(-over / 0.4));
}

void main() {
  vec4 scene = texture(tScene, vUv) * uDecode * uFade;
  vec3 light = max(scene.rgb, 0.0);
  float peak = max(light.r, max(light.g, light.b));
  light += vec3(max(peak - 1.8, 0.0) * 0.25);
  vec3 shown = soften(light);
  fragColor = vec4(shown, max(shown.r, max(shown.g, shown.b)));
}
`;

export default function CrystalWave({ drive, color = '#5ca8ff', speed = 1, hoverStrength = 0.7, className = '', style }) {
  const containerRef = useRef(null);
  const settingsRef = useRef(null);

  useEffect(() => {
    settingsRef.current = { drive, color, speed, hoverStrength };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: false, depth: false });
    const gl = renderer.gl;
    if (!renderer.isWebgl2) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return undefined;
    }
    const canvas = gl.canvas;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    const halfFloat = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    const encode = halfFloat ? 1 : 0.25;
    const geometry = new Triangle(gl);
    const strandData = buildStrands();

    const sceneTarget = new RenderTarget(gl, {
      width: 1,
      height: 1,
      depth: false,
      type: halfFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
      format: gl.RGBA,
      internalFormat: halfFloat ? gl.RGBA16F : gl.RGBA,
      minFilter: gl.NEAREST,
      magFilter: gl.NEAREST
    });

    const arcData = new Array(MAX_ARCS * 4).fill(0);
    const line = {
      uView: { value: [1, 1] },
      uLineY: { value: -100 },
      uSwell: { value: 0 },
      uSeed: { value: 0 },
      uClock: { value: 0 },
      uWater: { value: 1 }
    };
    const shared = {
      ...line,
      uDpr: { value: 1 },
      uSpan: { value: 300 },
      uEncode: { value: encode }
    };
    const fieldUniforms = {
      ...shared,
      uLine: { value: 0.6 },
      uTime: { value: 0 },
      uFrame: { value: 0 },
      uBinPx: { value: 2.6 },
      uStrands: { value: PRESET.strands },
      uCrackle: { value: PRESET.crackle },
      uFlares: { value: PRESET.flares },
      uGlow: { value: PRESET.glow },
      uHaze: { value: PRESET.haze },
      uPresence: { value: 0 },
      uUnfold: { value: 0 },
      uBloom: { value: 0 },
      uRipples: { value: 0 },
      uRim: { value: [1, 1, 1] },
      uRimHot: { value: [1, 1, 1] },
      uRimMid: { value: [1, 1, 1] },
      uRimDeep: { value: [1, 1, 1] },
      uSpark: { value: [1, 1, 1] },
      uSparkGlow: { value: [1, 1, 1] },
      uHazeColor: { value: [0, 0, 0] },
      uEdgeColor: { value: [0, 0, 0] },
      uHeat: { value: [0, 0, 0, 0] },
      uHarmonics: { value: strandData.harmonics },
      uRates: { value: strandData.rates },
      uPhases: { value: strandData.phases },
      uFlareHarmonics: { value: strandData.flareHarmonics },
      uFlareRates: { value: strandData.flareRates },
      uFlarePhases: { value: strandData.flarePhases },
      uArcs: { value: arcData }
    };
    const dustUniforms = {
      ...shared,
      uDustTime: { value: 0 },
      uTwinkle: { value: PRESET.twinkle },
      uPointScale: { value: 1 },
      uReveal: { value: 0 },
      uTones: { value: new Array(15).fill(1) },
      uRimTone: { value: [1, 1, 1] }
    };
    const compositeUniforms = {
      tScene: { value: sceneTarget.texture },
      uDecode: { value: 1 / encode },
      uFade: { value: 1 }
    };

    const additive = program => {
      program.setBlendFunc(gl.ONE, gl.ONE);
      return program;
    };
    const pass = (fragment, uniforms, blend) => {
      const program = new Program(gl, { vertex: passVertex, fragment, uniforms, transparent: blend, depthTest: false, depthWrite: false });
      return new Mesh(gl, { geometry, program: blend ? additive(program) : program });
    };
    const fieldMesh = pass(fieldFragment, fieldUniforms, true);
    const compositeMesh = pass(compositeFragment, compositeUniforms, false);

    const dustData = buildDust(PRESET.particleCount);
    const dustMesh = new Mesh(gl, {
      mode: gl.POINTS,
      geometry: new Geometry(gl, {
        aHome: { size: 4, data: dustData.home },
        aSeed: { size: 4, data: dustData.seed }
      }),
      program: additive(
        new Program(gl, { vertex: dustVertex, fragment: dustFragment, uniforms: dustUniforms, transparent: true, depthTest: false, depthWrite: false })
      )
    });

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const random = seeded(913);

    let width = 1;
    let height = 1;
    let raf = 0;
    let last = performance.now();
    let rimTime = 0;
    let dustTime = 0;
    let introClock = 0;
    let visible = true;
    let alive = true;
    let surge = 0;
    let nextArc = 0.3;
    let paletteKey = '';
    let palette = null;
    const arcs = [];
    const pointer = { x: 0, y: 0, inside: false };
    const heat = { x: 0, power: 0, near: 0 };
    const state = { lineY: -100, clock: 0, swell: 0, seed: 0, water: 1, span: 300 };

    let resizePending = true;
    const applyResize = () => {
      width = Math.max(1, container.clientWidth);
      height = Math.max(1, container.clientHeight);
      renderer.dpr = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(PIXEL_BUDGET / (width * height)));
      renderer.setSize(width, height);
      sceneTarget.setSize(gl.canvas.width, gl.canvas.height);
    };

    const lineAt = x => state.lineY + wave(x, state.clock, state.seed) * state.swell;

    const spawnArc = (x, strength) => {
      if (arcs.length >= MAX_ARCS) return;
      arcs.push({
        start: x,
        span: (0.05 + random() * 0.07) * state.span * (random() < 0.5 ? -1 : 1),
        curl: 0.02 + random() * 0.04,
        life: 0,
        duration: 0.2 + random() * 0.2,
        drift: (random() - 0.5) * 0.3 * state.span,
        strength
      });
    };

    const frame = now => {
      raf = 0;
      if (resizePending) {
        resizePending = false;
        applyResize();
      }
      if (!alive) return;
      const s = settingsRef.current;
      const dt = Math.min(0.05, Math.max(1 / 240, (now - last) / 1000));
      last = now;
      if (visible) raf = requestAnimationFrame(frame);
      if (!s) return;

      const d = s.drive ? s.drive() : {};
      const fade = d.fade ?? 1;
      const key = d.color ? d.color.map(v => Math.round(v * 255)).join() : s.color;
      if (key !== paletteKey) {
        paletteKey = key;
        palette = buildPalette(d.color ?? parseColor(s.color, [0.36, 0.66, 1]), false);
      }

      state.span = (d.span ?? 0.35) * Math.min(width, height);
      state.lineY = (d.y ?? -1) * height;
      state.swell = (d.swell ?? 0.02) * height;
      state.seed = d.seed ?? 0;
      state.clock = d.clock ?? rimTime * 0.5;
      state.water = d.water ?? 1;

      const visibleLine = fade > 0.002 && state.lineY > -state.span && state.lineY < height + state.span;
      if (visibleLine) introClock = reducedMotion ? 1 : Math.min(1, introClock + dt / INTRO_SECONDS);
      else introClock = 0;
      const ease = t => 1 - Math.pow(1 - t, 3);
      const smooth = (a, b, v) => {
        const t = clamp((v - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
      };
      const presence = ease(smooth(0, 0.42, introClock));
      const unfold = ease(smooth(0, 0.32, introClock));
      const charge = Math.sin(Math.PI * smooth(0.22, 0.78, introClock)) * 0.35 + (d.charge ?? 0);

      // il puntatore scalda i filamenti dove si avvicina alla linea
      const strength = reducedMotion ? 0 : clamp(s.hoverStrength, 0, 1);
      const gap = pointer.y - lineAt(pointer.x);
      const nearTarget = pointer.inside ? Math.exp(-Math.pow(gap / (state.span * 0.45), 2)) : 0;
      heat.near += (nearTarget - heat.near) * (1 - Math.exp(-dt / 0.15));
      heat.x += (pointer.x - heat.x) * (1 - Math.exp(-dt / 0.12));
      const target = pointer.inside ? strength : 0;
      heat.power += (target - heat.power) * (1 - Math.exp(-dt / (target > heat.power ? 0.3 : 0.55)));
      surge *= Math.exp(-dt / 0.7);

      if (!reducedMotion) {
        const step = dt * Math.max(0, s.speed) * 2 * (1 + surge * 0.6 + heat.power * heat.near * 0.3);
        rimTime += step;
        dustTime += dt * PRESET.dustSpeed * (1 + surge * 0.4);
        if (visibleLine && introClock > 0.55) {
          nextArc -= step * PRESET.sparks * 2 * (0.6 + clamp(PRESET.crackle + surge * 0.5 + charge, 0, 1.5) * 0.6);
          if (nextArc <= 0) {
            const local = heat.power * heat.near;
            const x = random() < local * 0.7 ? heat.x + (random() - 0.5) * state.span * 0.5 : random() * width;
            spawnArc(x, 0.8 + local * 0.6 + surge * 0.4);
            nextArc = 0.1 + random() * 0.4;
          }
        }
        for (let i = arcs.length - 1; i >= 0; i--) {
          const arc = arcs[i];
          arc.life += step;
          arc.start += arc.drift * step;
          if (arc.life >= arc.duration) arcs.splice(i, 1);
        }
      }
      for (let i = 0; i < MAX_ARCS; i++) {
        const arc = arcs[i];
        arcData[i * 4] = arc ? arc.start : 0;
        arcData[i * 4 + 1] = arc ? arc.span : 0;
        arcData[i * 4 + 2] = arc ? arc.curl : 0;
        arcData[i * 4 + 3] = arc ? Math.sin((Math.PI * arc.life) / arc.duration) * arc.strength : 0;
      }

      line.uView.value = [width, height];
      line.uLineY.value = state.lineY;
      line.uSwell.value = state.swell;
      line.uSeed.value = state.seed;
      line.uClock.value = state.clock;
      line.uWater.value = state.water;
      shared.uDpr.value = renderer.dpr;
      shared.uSpan.value = state.span;

      fieldUniforms.uLine.value = clamp(state.span * 0.0035, 0.6, 3);
      fieldUniforms.uTime.value = rimTime;
      fieldUniforms.uFrame.value = Math.floor(rimTime * 24) % 100000;
      fieldUniforms.uCrackle.value = PRESET.crackle + surge * 0.5 + charge;
      fieldUniforms.uGlow.value = PRESET.glow * (1 + surge * 0.5 + charge);
      fieldUniforms.uPresence.value = presence;
      fieldUniforms.uUnfold.value = unfold;
      fieldUniforms.uBloom.value = presence * presence;
      fieldUniforms.uRipples.value = d.ripples ?? 0;
      fieldUniforms.uRim.value = palette.rim;
      fieldUniforms.uRimHot.value = palette.rimHot;
      fieldUniforms.uRimMid.value = palette.rimMid;
      fieldUniforms.uRimDeep.value = palette.rimDeep;
      fieldUniforms.uSpark.value = palette.spark;
      fieldUniforms.uSparkGlow.value = palette.sparkGlow;
      fieldUniforms.uHazeColor.value = palette.haze;
      fieldUniforms.uEdgeColor.value = palette.edge;
      fieldUniforms.uHeat.value = [heat.x, heat.near, heat.power * presence, 0];

      dustUniforms.uDustTime.value = dustTime;
      dustUniforms.uPointScale.value = clamp(state.span / 491, 1, 4);
      dustUniforms.uReveal.value = smooth(0.18, 1, introClock);
      dustUniforms.uTones.value = palette.tones.flat();
      dustUniforms.uRimTone.value = palette.rim;

      gl.clearColor(0, 0, 0, 0);
      compositeUniforms.uFade.value = visibleLine ? fade : 0;
      if (visibleLine) {
        renderer.render({ scene: fieldMesh, target: sceneTarget, clear: true });
        renderer.render({ scene: dustMesh, target: sceneTarget, clear: false });
      }
      renderer.render({ scene: compositeMesh, clear: false });
    };

    const start = () => {
      if (raf || !visible || !alive) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };

    const locate = e => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      return { x, y, inside: x >= 0 && y >= 0 && x <= rect.width && y <= rect.height };
    };
    const onPointerMove = e => Object.assign(pointer, locate(e));
    const onPointerDown = e => {
      const spot = locate(e);
      Object.assign(pointer, spot);
      if (reducedMotion || !spot.inside) return;
      if (Math.abs(spot.y - lineAt(spot.x)) > state.span * 0.6) return;
      surge = Math.max(surge, settingsRef.current?.hoverStrength ?? 0.7);
      spawnArc(spot.x - state.span * 0.05, 1.3);
      spawnArc(spot.x + state.span * 0.08, 1.1);
    };
    const onPointerLeave = () => {
      pointer.inside = false;
    };
    const onPointerOut = e => {
      if (!e.relatedTarget) onPointerLeave();
    };
    const onPointerUp = e => {
      if (e.pointerType === 'touch') onPointerLeave();
    };
    const onVisibility = () => {
      if (!document.hidden) start();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerout', onPointerOut, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('blur', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);

    const resizeObserver = new ResizeObserver(() => {
      resizePending = true;
      start();
    });
    resizeObserver.observe(container);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      start();
    });
    intersectionObserver.observe(container);
    start();

    return () => {
      alive = false;
      visible = false;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerout', onPointerOut);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('blur', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      dustMesh.geometry.remove();
      gl.deleteFramebuffer(sceneTarget.buffer);
      sceneTarget.textures.forEach(texture => gl.deleteTexture(texture.texture));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    };
  }, []);

  return <div ref={containerRef} className={`crystalized-ball ${className}`.trim()} style={style} />;
}
