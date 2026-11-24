import { useEffect, useRef } from 'react';
import { fx, clock } from '../lib/fx.js';

// Sfondo unico della sequenza, in WebGL2. Due passate:
// 1. materia — rumore fbm con domain warp, calcolato per cella (pixel grossi);
// 2. composizione — la materia passa in dither Bayer 8×8 per regione (aria, acqua, inchiostro),
//    poi si somma la luce nello stile della CrystalBall: filamenti di plasma che crepitano,
//    flare, polvere quadrata che scintilla; infine tonemap morbido.
// Tutto ciò che si muove con lo scroll arriva da `fx`.

const STRANDS = 3;
const CELL = 2; // lato della cella di dither, in px CSS

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const NOISE = `
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

float cnoise(vec2 P) {
  vec4 Pi = mod289(floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0));
  vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
  vec4 i = permute(permute(Pi.xzxz) + Pi.yyww);
  vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  gx -= floor(gx + 0.5);
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));
  g00 *= norm.x;
  g01 *= norm.y;
  g10 *= norm.z;
  g11 *= norm.w;
  vec2 f = fade(Pf.xy);
  vec2 nx = mix(
    vec2(dot(g00, Pf.xy), dot(g01, Pf.xw)),
    vec2(dot(g10, Pf.zy), dot(g11, Pf.zw)),
    f.x
  );
  return 2.3 * mix(nx.x, nx.y, f.y);
}
`;

const MATTER_FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uCell;
uniform float uTime;
uniform float uZoom;
uniform float uFlow;
uniform vec3 uPointer;
out vec4 outColor;
${NOISE}
float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  for (int i = 0; i < 4; i++) {
    value += amp * abs(cnoise(p));
    p *= 3.0;
    amp *= 0.3;
  }
  return value;
}

float pattern(vec2 p) {
  return fbm(p + fbm(p - uTime * 0.05));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5) * uCell / uResolution - 0.5;
  uv.x *= uResolution.x / uResolution.y;

  // lo zoom del tunnel ingrandisce la materia verso il centro; il flusso la trascina in verticale
  vec2 q = uv * exp(-uZoom);
  q.y += uFlow;
  float f = pattern(q);
  f += 0.4 * uPointer.z * (1.0 - smoothstep(0.0, 0.3, length(uv - uPointer.xy)));
  f = clamp(f, 0.0, 1.0);

  // linee di caustica per l'acqua
  float c = abs(cnoise(vec2(uv.x * 6.0, uv.y * 2.5) + vec2(uTime * 0.15, -uTime * 0.1 + uFlow * 2.0)));
  c = 1.0 - smoothstep(0.0, 0.22, c);

  outColor = vec4(floor(f * 255.0) / 255.0, fract(f * 255.0), c, 1.0);
}`;

const COMPOSE_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uField;
uniform ivec2 uFieldSize;
uniform float uCellDevice;
uniform vec2 uResolution;
uniform float uDpr;
uniform float uTime;
uniform float uFrame;
uniform float uTravel;
uniform vec3 uInk;
uniform vec3 uGlow;
uniform vec3 uMid;
uniform vec3 uHi;
uniform float uMatter;
uniform float uHaze;
uniform float uEmbers;
uniform float uBubbles;
uniform float uStars;
uniform float uWarp;
uniform float uTunnel;
uniform float uSurface;
uniform float uCrest;
uniform float uRipples;
uniform float uBleed;
uniform float uBleedRing;
uniform float uBleedOn;
uniform vec3 uPointer;
uniform vec4 uHarmonics[${STRANDS}];
uniform vec4 uRates[${STRANDS}];
uniform vec4 uPhases[${STRANDS}];
uniform vec4 uFlareHarmonics[${STRANDS}];
uniform vec4 uFlareRates[${STRANDS}];
uniform vec4 uFlarePhases[${STRANDS}];
out vec4 outColor;

const float PI = 3.14159265;
const float TAU = 6.28318531;
const vec4 AMPS = vec4(0.35, 0.3, 0.22, 0.13);

vec3 lin(vec3 c) { return pow(c / 255.0, vec3(2.2)); }

const float bayer8[64] = float[64](
  0.0, 48.0, 12.0, 60.0, 3.0, 51.0, 15.0, 63.0,
  32.0, 16.0, 44.0, 28.0, 35.0, 19.0, 47.0, 31.0,
  8.0, 56.0, 4.0, 52.0, 11.0, 59.0, 7.0, 55.0,
  40.0, 24.0, 36.0, 20.0, 43.0, 27.0, 39.0, 23.0,
  2.0, 50.0, 14.0, 62.0, 1.0, 49.0, 13.0, 61.0,
  34.0, 18.0, 46.0, 30.0, 33.0, 17.0, 45.0, 29.0,
  10.0, 58.0, 6.0, 54.0, 9.0, 57.0, 5.0, 53.0,
  42.0, 26.0, 38.0, 22.0, 41.0, 25.0, 37.0, 21.0
);

float bayer(vec2 cell) {
  ivec2 c = ivec2(mod(cell, 8.0));
  return bayer8[c.y * 8 + c.x] / 64.0;
}

uint scramble(uint v) {
  v = v * 747796405u + 2891336453u;
  uint w = ((v >> ((v >> 28u) + 4u)) ^ v) * 277803737u;
  return (w >> 22u) ^ w;
}
float random(uint v) { return float(scramble(v)) * (1.0 / 4294967295.0); }
float random2(vec2 c, float salt) {
  return random(uint(int(c.x)) * 73856093u ^ uint(int(c.y)) * 19349663u ^ uint(salt) * 83492791u);
}

float bell(float d, float w) {
  float x = d / w;
  return exp(-x * x);
}

// materia in dither: n livelli lungo una rampa di tre colori
float quantize(float v, float t, float n) { return clamp(floor(v * (n - 1.0) + t) / (n - 1.0), 0.0, 1.0); }
vec3 ramp(vec3 a, vec3 b, vec3 c, float x) { return x < 0.5 ? mix(a, b, x * 2.0) : mix(b, c, x * 2.0 - 1.0); }

// Filamenti di plasma della CrystalBall, lungo una curva qualsiasi:
// along = posizione sulla curva (in raggi), d = distanza dalla curva in px (positiva verso i flare),
// R = scala in px (il "raggio" della sfera). Il jitter cambia a 24 Hz: è quello che crepita.
vec3 plasma(float along, float d, float R, float amount, vec3 rim, vec3 hot, vec3 deep, float salt) {
  float amp = R * 0.026;
  float flareAmp = R * 0.095;
  if (amount < 0.002 || abs(d) > amp * 2.0 + flareAmp + R * 0.2) return vec3(0.0);
  float jitter = R * 0.006;
  float line = max(0.6, R * 0.0035);
  float binPos = along * R / 2.6;
  float b0 = floor(binPos);
  float bf = binPos - b0;
  float a0 = b0 * 2.6 / R;
  float a1 = (b0 + 1.0) * 2.6 / R;
  uint frame = uint(uFrame);

  vec3 col = deep * 0.18 * bell(d, R * 0.06) + rim * 0.12 * bell(d, R * 0.03);
  for (int k = 0; k < ${STRANDS}; k++) {
    vec4 lead = uRates[k] * uTime + uPhases[k];
    uint seed = uint(k) * 1013u + frame * 7919u + uint(salt) * 104729u;
    float a = amp * uFlareHarmonics[k].w;
    float o0 = a * dot(AMPS, sin(uHarmonics[k] * a0 + lead)) + jitter * (random(uint(int(b0)) * 2654435761u + seed) - 0.5);
    float o1 = a * dot(AMPS, sin(uHarmonics[k] * a1 + lead)) + jitter * (random(uint(int(b0) + 1) * 2654435761u + seed) - 0.5);
    float off = mix(o0, o1, bf);
    float dd = abs(d - off);
    float swell = 0.8 + 0.4 * (0.5 + 0.5 * sin(3.0 * along + uTime * 0.7 + uFlarePhases[k].x * 1.7));
    float width = line * uFlareRates[k].w * swell;
    float core = exp(-dd * dd / (width * width));
    float sheath = exp(-dd * dd / (width * width * 3.0));
    float bright = uFlarePhases[k].w;
    col += (hot * core * 0.8 + rim * sheath * 0.32) * bright;

    vec3 fa = uFlareHarmonics[k].xyz * along + uFlareRates[k].xyz * uTime + uFlarePhases[k].xyz;
    float flare = max(0.0, (sin(fa.x) + sin(fa.y) + sin(fa.z)) / 3.0);
    flare = flare * flare * flareAmp;
    float dw = abs(d - off - flare);
    float dm = abs(d - off - flare * 0.6);
    float dn = abs(d - off - flare * 0.25);
    vec3 glow = deep * (0.07 * bell(dw, R * 0.09) + 0.16 * bell(dw, R * 0.05));
    glow += rim * 0.28 * bell(dm, R * 0.027) + rim * 0.38 * bell(dn, R * 0.013);
    col += glow * 0.8;
  }
  return col * amount;
}

// polvere quadrata su griglia (una particella per cella): sale di "rise" px/s e scintilla
float dust(vec2 p, float size, float cellPx, float rise, float density, float salt, float ring) {
  vec2 q = p / cellPx;
  q.y += uTime * rise / cellPx;
  vec2 id = floor(q);
  float h = random2(id, salt);
  if (h > density) return 0.0;
  vec2 c = vec2(random2(id, salt + 1.0), random2(id, salt + 2.0)) * 0.7 + 0.15;
  c.x += 0.06 * sin(uTime * 0.8 + h * 40.0);
  vec2 dp = (fract(q) - c) * cellPx;
  float half_ = size * (0.6 + 0.8 * random2(id, salt + 3.0)) * 0.5;
  float twinkle = 0.55 + 0.45 * sin(uTime * (1.5 + 4.0 * h) + h * 60.0);
  float shape;
  if (ring > 0.5) {
    shape = exp(-pow(length(dp) - half_ * 1.6, 2.0) / 0.5);
  } else {
    vec2 cover = clamp(half_ - abs(dp) + 0.5, 0.0, 1.0);
    shape = cover.x * cover.y + 0.15 * exp(-dot(dp, dp) / (half_ * half_ * 10.0));
  }
  return shape * twinkle;
}

// scie radiali del warp: ogni spicchio d'angolo ha una stella che corre verso l'esterno
float streaks(float r, float angle) {
  float s = 0.0;
  for (int layer = 0; layer < 3; layer++) {
    float n = 160.0 + float(layer) * 70.0;
    float pos = (angle + PI) / TAU * n;
    float bin = floor(pos);
    float h = random2(vec2(bin, float(layer)), 9.0);
    if (h > 0.55) continue;
    float z = fract(h * 7.13 - uTravel * (1.0 + 0.35 * float(layer)));
    float start = 0.04 / max(z, 0.02);
    float len = start * uWarp * 0.6 + 0.002;
    float along = (r - start) / len;
    if (along < 0.0 || along > 1.0) continue;
    float side = (pos - bin - 0.5) * TAU / n * r * uResolution.y;
    s += exp(-side * side / 1.4) * (1.0 - z) * sin(PI * along);
  }
  return s * uWarp;
}

float edgeWave(float x, float seed) {
  return 0.6 * sin(x * 0.006 + uTime * 0.9 + seed) + 0.4 * sin(x * 0.013 - uTime * 1.3 + seed * 2.0);
}

vec3 soften(vec3 x) {
  vec3 over = max(x - 0.6, 0.0);
  return min(x, 0.6) + 0.4 * (1.0 - exp(-over / 0.4));
}

void main() {
  float H = uResolution.y;
  vec2 px = vec2(gl_FragCoord.x, H * uDpr - gl_FragCoord.y) / uDpr;
  vec2 uv = (px - 0.5 * uResolution) / H;
  float r = length(uv);
  float angle = atan(uv.y, uv.x);

  vec2 cell = floor(gl_FragCoord.xy / uCellDevice);
  vec4 sampleValue = texelFetch(uField, clamp(ivec2(cell), ivec2(0), uFieldSize - 1), 0);
  float f = sampleValue.r + sampleValue.g / 255.0;
  float caustic = sampleValue.b;
  float t = bayer(cell);

  vec3 rim = uMid;
  vec3 hot = mix(uMid, vec3(1.0), 0.72);
  vec3 deep = uMid * 0.55;
  float R = H * 0.35;

  // ── materia: aria ──
  float haze = uHaze * exp(-r * r * 2.5);
  float air = clamp(f * 0.42 * uMatter + haze * 0.3, 0.0, 1.0);
  vec3 base = ramp(uInk, uGlow, mix(uGlow, uMid, 0.45), quantize(air, t, 7.0));
  vec3 light = vec3(0.0);

  // ── acqua: tra la superficie (sopra) e il fronte dell'onda (sotto) ──
  float surfaceY = uSurface * H + edgeWave(px.x, 0.0) * H * 0.012;
  float crestY = uCrest * H + edgeWave(px.x, 1.7) * H * 0.03;
  bool wet = px.y > surfaceY && px.y < crestY;
  if (wet) {
    float depth = clamp((px.y - surfaceY) / H, 0.0, 1.0);
    float rays = pow(0.5 + 0.5 * sin(px.x * 0.011 + sin(px.y * 0.003 + uTime * 0.25) * 1.4 + uTime * 0.12), 8.0) * exp(-depth * 2.2);
    float v = 0.6 * (1.0 - depth) + (f - 0.5) * 0.35 + caustic * 0.2 * (1.0 - depth) + rays * 0.35;
    v += 0.3 * exp(-(crestY - px.y) / (H * 0.06));
    base = ramp(lin(vec3(4.0, 11.0, 24.0)), lin(vec3(15.0, 45.0, 92.0)), lin(vec3(47.0, 111.0, 208.0)), quantize(clamp(v, 0.0, 1.0), t, 7.0));
    light += vec3(0.81, 0.89, 0.97) * dust(px, 3.0, 64.0, 46.0, 0.4, 5.0, 1.0) * uBubbles * 0.5;
  }

  // ── inchiostro rosso che si allarga dal centro ──
  float bleedR = uBleed * (1.0 + 0.06 * sin(5.0 * angle + uTime * 0.7) + 0.04 * sin(9.0 * angle - uTime * 1.1)) + (f - 0.5) * 0.06 * uBleed;
  if (uBleedOn > 0.001 && r < bleedR) {
    float v = 0.55 - r * 0.35 + (f - 0.5) * 0.4;
    vec3 red = ramp(lin(vec3(26.0, 3.0, 3.0)), lin(vec3(92.0, 10.0, 14.0)), lin(vec3(179.0, 18.0, 27.0)), quantize(clamp(v, 0.0, 1.0), t, 7.0));
    base = mix(base, red, uBleedOn);
  }

  // ── luce: filamenti di plasma (cresta e superficie le disegna CrystalWave) ──
  if (uBleedRing > 0.002 && uBleed > 0.0) {
    vec3 red = vec3(0.88, 0.15, 0.18);
    light += plasma(angle, (r - bleedR) * H, max(uBleed * H, 40.0), uBleedRing, red, mix(red, vec3(1.0), 0.72), red * 0.55, 3.0);
  }
  if (uTunnel > 0.002) {
    for (int i = 0; i < 6; i++) {
      float z = fract(float(i) / 6.0 - uTravel);
      float ringR = 0.075 / max(z, 0.01);
      float amount = uTunnel * (1.0 - z) * smoothstep(0.03, 0.12, z);
      light += plasma(angle, (r - ringR) * H, ringR * H, amount, rim, hot, deep, 4.0 + float(i));
    }
  }

  // ── luce: polvere e stelle ──
  vec3 ember = mix(uMid, uHi, 0.5);
  if (!wet) light += ember * dust(px, 2.0, 46.0, 22.0, 0.35, 11.0, 0.0) * uEmbers;
  vec3 starlight = vec3(1.0, 0.95, 0.86);
  float still = uStars * (1.0 - uWarp);
  light += starlight * (dust(px, 1.4, 13.0, 0.0, 0.16, 20.0, 0.0) + 1.4 * dust(px, 2.2, 41.0, 0.0, 0.35, 30.0, 0.0)) * still;
  light += starlight * streaks(r, angle) * uStars;
  light += uMid * 0.08 * uPointer.z * exp(-dot(uv - vec2(uPointer.x, -uPointer.y), uv - vec2(uPointer.x, -uPointer.y)) / 0.02);

  vec3 col = soften(base + light);
  col *= 1.0 - 0.55 * smoothstep(0.45, 1.05, length(uv * vec2(0.85, 1.1)));
  col = pow(col, vec3(1.0 / 2.2));
  col += (random(uint(gl_FragCoord.x) * 1973u + uint(gl_FragCoord.y) * 9277u + uint(uFrame) * 26699u) - 0.5) * 0.035;
  col = floor(col * 48.0 + t) / 48.0;
  outColor = vec4(col, 1.0);
}`;

const compile = (gl, type, source) => {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
  console.error(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
};

const link = (gl, fragmentSource) => {
  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertex || !fragment || !program) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, 'aPosition');
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info) uniforms[info.name.replace('[0]', '')] = gl.getUniformLocation(program, info.name);
  }
  return { program, uniforms };
};

const seeded = start => {
  let state = start >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// armoniche dei filamenti, come nella CrystalBall: quattro bande, dalla curva lunga al crepitio fine.
// .w dei flare: harmonics = ampiezza, rates = spessore, phases = luminosità (il primo filamento guida)
const buildStrands = () => {
  const random = seeded(99);
  const bands = [
    [6, 12, 0.6, 1.6],
    [18, 34, 1.5, 3.5],
    [40, 70, 3, 7],
    [80, 130, 6, 12]
  ];
  const sign = () => (random() < 0.5 ? -1 : 1);
  const data = { harmonics: [], rates: [], phases: [], flareHarmonics: [], flareRates: [], flarePhases: [] };
  for (let s = 0; s < STRANDS; s++) {
    bands.forEach(([low, high, slow, fast]) => {
      data.harmonics.push(Math.round(low + random() * (high - low)));
      data.rates.push((slow + random() * (fast - slow)) * sign());
      data.phases.push(random() * Math.PI * 2);
    });
    for (let j = 0; j < 3; j++) {
      data.flareHarmonics.push(4 + Math.floor(random() * 6));
      data.flareRates.push((0.4 + random() * 0.8) * sign());
      data.flarePhases.push(random() * Math.PI * 2);
    }
    const lead = s === 0;
    data.flareHarmonics.push(lead ? 0.75 : 0.95 + random() * 0.3);
    data.flareRates.push(lead ? 1.15 : 0.8 + random() * 0.2);
    data.flarePhases.push(lead ? 1 : 0.7 + random() * 0.25);
  }
  return data;
};

const linear = v => Math.pow(v / 255, 2.2);
const tone = name => [0, 1, 2].map(i => linear(fx[`${name}${i}`]));

export default function DitherBg({ className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
    if (!canvas || !gl) return undefined;

    const matter = link(gl, MATTER_FRAGMENT);
    const compose = link(gl, COMPOSE_FRAGMENT);
    if (!matter || !compose) return undefined;

    const buffer = gl.createBuffer();
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const field = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, field);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const framebuffer = gl.createFramebuffer();

    // le armoniche non cambiano mai: si caricano una volta
    const strands = buildStrands();
    gl.useProgram(compose.program);
    const c = compose.uniforms;
    gl.uniform4fv(c.uHarmonics, strands.harmonics);
    gl.uniform4fv(c.uRates, strands.rates);
    gl.uniform4fv(c.uPhases, strands.phases);
    gl.uniform4fv(c.uFlareHarmonics, strands.flareHarmonics);
    gl.uniform4fv(c.uFlareRates, strands.flareRates);
    gl.uniform4fv(c.uFlarePhases, strands.flarePhases);

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const view = { width: 1, height: 1, ratio: 1, cell: 1, cols: 1, rows: 1 };
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, inside: false, presence: 0 };
    let time = 0;
    let travel = 0;
    let last = 0;
    let raf = 0;

    const resize = () => {
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      // stesso tetto di pixel della CrystalBall: il passaggio di composizione è per-pixel
      const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4.5e6 / (width * height)));
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      view.width = width;
      view.height = height;
      view.ratio = canvas.width / width;
      view.cell = Math.max(1, Math.round(CELL * view.ratio));
      view.cols = Math.ceil(canvas.width / view.cell);
      view.rows = Math.ceil(canvas.height / view.cell);
      gl.bindTexture(gl.TEXTURE_2D, field);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, view.cols, view.rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, field, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    const render = () => {
      const width = canvas.width / view.ratio;
      const height = canvas.height / view.ratio;
      const pointerUv = [pointer.x, pointer.y, pointer.presence];

      gl.bindVertexArray(vao);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, view.cols, view.rows);
      gl.useProgram(matter.program);
      const m = matter.uniforms;
      gl.uniform2f(m.uResolution, width, height);
      gl.uniform1f(m.uCell, view.cell / view.ratio);
      gl.uniform1f(m.uTime, time);
      gl.uniform1f(m.uZoom, fx.zoom);
      gl.uniform1f(m.uFlow, fx.flow);
      gl.uniform3fv(m.uPointer, pointerUv);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(compose.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, field);
      gl.uniform1i(c.uField, 0);
      gl.uniform2i(c.uFieldSize, view.cols, view.rows);
      gl.uniform1f(c.uCellDevice, view.cell);
      gl.uniform2f(c.uResolution, width, height);
      gl.uniform1f(c.uDpr, view.ratio);
      gl.uniform1f(c.uTime, time);
      gl.uniform1f(c.uFrame, Math.floor(time * 24) % 100000);
      gl.uniform1f(c.uTravel, travel);
      gl.uniform3fv(c.uInk, tone('ink'));
      gl.uniform3fv(c.uGlow, tone('glow'));
      gl.uniform3fv(c.uMid, tone('mid'));
      gl.uniform3fv(c.uHi, tone('hi'));
      gl.uniform1f(c.uMatter, fx.matter);
      gl.uniform1f(c.uHaze, fx.haze);
      gl.uniform1f(c.uEmbers, fx.embers);
      gl.uniform1f(c.uBubbles, fx.bubbles);
      gl.uniform1f(c.uStars, fx.stars);
      gl.uniform1f(c.uWarp, fx.warp);
      gl.uniform1f(c.uTunnel, fx.tunnel);
      gl.uniform1f(c.uSurface, fx.surface);
      gl.uniform1f(c.uCrest, fx.crest);
      gl.uniform1f(c.uRipples, fx.ripples);
      gl.uniform1f(c.uBleed, fx.bleed);
      gl.uniform1f(c.uBleedRing, fx.bleedRing);
      gl.uniform1f(c.uBleedOn, fx.bleedOn);
      gl.uniform3fv(c.uPointer, pointerUv);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const frame = now => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      last = now;
      const pace = still ? 0.15 : 1;
      time += dt * pace;
      clock.time = time;
      travel += dt * pace * (0.025 + fx.warp * 0.55);

      const follow = 1 - Math.exp(-dt / 0.08);
      pointer.x += (pointer.tx - pointer.x) * follow;
      pointer.y += (pointer.ty - pointer.y) * follow;
      pointer.presence += ((pointer.inside ? 1 : 0) - pointer.presence) * (1 - Math.exp(-dt / 0.3));

      render();
      raf = requestAnimationFrame(frame);
    };

    const onPointerMove = event => {
      const aspect = view.width / view.height;
      pointer.tx = (event.clientX / view.width - 0.5) * aspect;
      pointer.ty = -(event.clientY / view.height - 0.5);
      if (!pointer.inside) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
      }
      pointer.inside = event.pointerType === 'mouse';
    };
    const onPointerLeave = () => {
      pointer.inside = false;
    };
    const onVisibility = () => {
      last = 0;
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibility);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibility);
      gl.deleteProgram(matter.program);
      gl.deleteProgram(compose.program);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteTexture(field);
      gl.deleteFramebuffer(framebuffer);
    };
  }, []);

  return <canvas ref={canvasRef} className={`dither-bg${className ? ` ${className}` : ''}`} aria-hidden="true" />;
}
