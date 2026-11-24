// StoneText3D.jsx — testo 3D in pietra crepata; il punto del "?" è una sfera di roccia (three.js)
// Nel sito: "ARE YOU READY?" su una riga, al posto della frase iniziale.
// Lo sgretolamento (da sinistra a destra) non segue lo scroll della pagina: lo comanda la timeline
// tramite `getProgress` (0 = intatta, 1 = polvere), letto a ogni frame.
// Nessuna interazione col mouse/touch.
// Props: lines (default ['ARE YOU READY?']) · background · getProgress () => 0..1 · isVisible () => bool
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
// la geometria (font Droid Serif Bold, scolpita col rumore) si costruisce in un Web Worker: vedi three/stoneGeometry.js

/* ---------- shader della pietra: crepe, scheggiature, sporco nelle cavità ---------- */
const STONE_GLSL = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*snoise(p);p*=2.07;a*=.5;}return s;}
// crepe: linee sottili dove il rumore (deformato) attraversa lo zero
float cracks(vec3 p){
  vec3 q=p+.35*vec3(snoise(p*1.3),snoise(p*1.3+11.),snoise(p*1.3+23.));
  float gate=smoothstep(-.05,.35,snoise(q*.55+7.));                 // crepe solo in alcune zone
  float w=.016+.026*smoothstep(-.3,.6,snoise(q*2.3+1.));             // spessore variabile
  float a=abs(snoise(q*1.2));
  float b=abs(snoise(q*3.4+5.));
  float main=(1.-smoothstep(0.,w,a))*gate;
  float twig=(1.-smoothstep(0.,w*.6,b))*gate*smoothstep(.2,.6,snoise(q*1.7+9.));
  return max(main,.7*twig);
}
float pits(vec3 p){ return smoothstep(.7,.84,snoise(p*38.+4.)) + .6*smoothstep(.78,.9,snoise(p*90.+1.)); }
float stoneH(vec3 p){                       // micro-rilievo della superficie
  return .45*fbm(p*5.)+.07*snoise(p*26.)-1.4*cracks(p)-.4*smoothstep(.45,.7,fbm(p*2.2+9.))-.55*pits(p);
}
`;

function createStoneText(container, data, opts = {}) {
  const { background = null, getProgress = () => 0, isVisible = () => true } = opts;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const W = () => container.clientWidth || 800;
  const H = () => container.clientHeight || 600;

  /* ---------- renderer ---------- */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W(), H());
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const cv = renderer.domElement;
  Object.assign(cv.style, { display: 'block', width: '100%', height: '100%', pointerEvents: 'none' });  // il canvas non cattura mouse/touch: lo scroll passa
  cv.setAttribute('aria-hidden', 'true');
  container.appendChild(cv);
  const scene = new THREE.Scene();
  if (background) scene.background = new THREE.Color(background);
  const camera = new THREE.PerspectiveCamera(26, W() / H(), 0.1, 100);

  // ambiente neutro e scuro (riflessi morbidi sulla pietra)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ color: '#16130f', side: THREE.BackSide }));
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.2, 2.0, 1.8) }));
  panel.position.set(-7, 8, 6); panel.lookAt(0, 0, 0);
  envScene.add(sky, panel);
  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  envScene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });

  /* ---------- luci ---------- */
  const key = new THREE.DirectionalLight('#ffeedd', 3.6);
  key.position.set(-4, 6, 5); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  Object.assign(key.shadow.camera, { left: -6, right: 6, top: 4, bottom: -4, near: 1, far: 25 });
  const rim = new THREE.DirectionalLight('#b9c6ff', 1.4); rim.position.set(5, 2, -4);
  const bounce = new THREE.DirectionalLight('#ffcf9e', 0.35); bounce.position.set(0, -4, 3);
  scene.add(key, key.target, rim, bounce, new THREE.HemisphereLight('#fff4e8', '#0d0b09', 0.25));

  /* ---------- materiale pietra ---------- */
  const U = { uE: { value: 0 } };                       // avanzamento della polverizzazione
  const DISSOLVE = `float cut = uE - vT - .045*snoise(vOP*26.);
        if (cut > 0.) discard;`;
  const VERT_HEAD = 'attribute float aT; varying float vT; varying vec3 vOP;';
  const CURV_HEAD = 'attribute float aC; varying float vC;';
  const stone = new THREE.MeshStandardMaterial({ color: '#d8d2c8', roughness: 0.82, metalness: 0, envMapIntensity: 0.5 });
  stone.onBeforeCompile = sh => {
    sh.uniforms.uE = U.uE;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_HEAD + CURV_HEAD + ' varying vec3 vON;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vON = normal; vT = aT; vC = aC;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying vec3 vON; varying float vT; varying float vC; uniform float uE; uniform mat3 normalMatrix;\n' + STONE_GLSL)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + DISSOLVE + '\nfloat edgeDust = smoothstep(-.07, 0., cut);')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float ck = cracks(vOP);
        float grime = smoothstep(-.2,.5,fbm(vOP*3.1+2.));
        float chip = smoothstep(.45,.7,fbm(vOP*2.2+9.));
        vec3 base = mix(vec3(.86,.83,.78), vec3(.63,.6,.56), grime);
        base = mix(base, vec3(.93,.91,.87), chip*.8);                  // pietra viva dove si è scheggiata
        base *= .9 + .16*snoise(vOP*14.) + .08*snoise(vOP*40.);
        float cav = smoothstep(.05,.75,-vC), edge = smoothstep(.12,.8,vC);
        float vein = 1. - smoothstep(0., .07, abs(sin(vOP.x*1.7 + vOP.y*1.1 + fbm(vOP*1.2)*4.5)));
        float pt = pits(vOP);
        base = mix(base, base*vec3(.8,.78,.76), vein*.35);              // venature
        base *= 1. - .5*cav;                                             // sporco nelle cavità
        base = mix(base, vec3(.96,.94,.9), edge*.55);                    // spigoli consumati, più chiari
        base *= 1. - .45*pt;                                             // pori
        base = mix(base, vec3(.12,.1,.09), ck*.92);                     // crepe scure
        base = mix(base, vec3(1.,.97,.92), edgeDust*.75);               // bordo che si sgretola
        diffuseColor.rgb *= base;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + .15*ck - .1*chip + .12*cav - .08*edge, 0., 1.);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float e = .004, h0 = stoneH(vOP);
          vec3 gr = vec3(stoneH(vOP+vec3(e,0,0))-h0, stoneH(vOP+vec3(0,e,0))-h0, stoneH(vOP+vec3(0,0,e))-h0)/e;
          vec3 on = normalize(vON);
          gr -= dot(gr,on)*on;
          vec3 nObj = normalize(on - .011*gr);
          normal = normalize(normalMatrix * nObj) * (gl_FrontFacing ? 1. : -1.);
        }`);
  };
  // le ombre devono sparire insieme alla pietra
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depthMat.onBeforeCompile = sh => {
    sh.uniforms.uE = U.uE;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position; vT = aT;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vOP; varying float vT; uniform float uE;\n' + STONE_GLSL)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\n' + DISSOLVE);
  };

  /* ---------- particelle di polvere di pietra (una nuvola per pezzo) ---------- */
  const grains = new THREE.ShaderMaterial({
    uniforms: { uE: U.uE, uScale: { value: 600 } },
    transparent: true, depthWrite: false,
    vertexShader: `uniform float uE, uScale; attribute float aT, aS; attribute vec3 aR; varying float vA, vC;
      void main(){
        float t = clamp((uE - aT) / .5, 0., 1.), k = t*t*(3.-2.*t);
        vec3 p = position + vec3(1.8 + 1.2*aR.x, .5 + 1.4*aR.y, (aR.z - .5)*2.2) * k * 1.3
               + .22*vec3(sin(t*7. + aR.x*30.), cos(t*6. + aR.y*25.), sin(t*5. + aR.z*20.)) * t;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        vA = step(.0001, t) * (1. - t) * (1. - t);
        vC = aR.x;
        gl_PointSize = aS * uScale / -mv.z * (1. - .5*t);
      }`,
    fragmentShader: `varying float vA, vC;
      void main(){
        float d = length(gl_PointCoord - .5);
        if (d > .5 || vA < .003) discard;
        gl_FragColor = vec4(mix(vec3(.5,.47,.43), vec3(.93,.9,.85), vC), smoothstep(.5, .1, d) * vA);
        #include <colorspace_fragment>
      }`,
  });
  /* ---------- lettere: la geometria arriva già scolpita dal worker (stoneGeometry.js) ---------- */
  const toGeometry = ({ attributes, index }) => {
    const g = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(attributes)) g.setAttribute(name, new THREE.BufferAttribute(a.array, a.size));
    if (index) g.setIndex(new THREE.BufferAttribute(index, 1));
    return g;
  };
  const makeGrains = ({ position, aT, aR, aS }) => {
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(position, 3));
    pg.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    pg.setAttribute('aR', new THREE.BufferAttribute(aR, 3));
    pg.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
    const pts = new THREE.Points(pg, grains); pts.frustumCulled = false;
    return pts;
  };
  const DEPTH = 0.62;
  const mid = new THREE.Vector3().fromArray(data.mid), size = new THREE.Vector3().fromArray(data.size);
  const block = new THREE.Group(); scene.add(block);
  const pieces = data.pieces.map(p => {
    const m = new THREE.Mesh(toGeometry(p.geometry), stone);
    m.castShadow = m.receiveShadow = true; m.customDepthMaterial = depthMat;
    const holder = new THREE.Group();
    holder.add(m, makeGrains(p.grains)); block.add(holder);
    holder.position.sub(mid);                                     // centra il blocco
    return { holder, mesh: m, phase: Math.random() * 6.28, base: holder.position.clone() };
  });
  let sphere = null, dotInfo = null;
  if (data.sphere) {                                             // la sfera al posto del punto
    sphere = new THREE.Mesh(toGeometry(data.sphere.geometry), stone);
    sphere.castShadow = sphere.receiveShadow = true; sphere.customDepthMaterial = depthMat;
    sphere.position.fromArray(data.sphere.position).sub(mid);
    sphere.add(makeGrains(data.sphere.grains));
    block.add(sphere);
    dotInfo = { base: sphere.position.clone() };
  }
  Object.assign(key.shadow.camera, { left: -size.x / 2 - 1, right: size.x / 2 + 1, top: size.y / 2 + 1, bottom: -size.y / 2 - 1 });
  key.shadow.camera.updateProjectionMatrix();

  const fit = () => {
    const a = W() / H(), t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.aspect = a;
    // margine largo: anche quando il blocco ruota le estremità restano dentro il riquadro
    // × 1.25: la scritta occupa il 20% in meno del riquadro
    // su più righe (mobile) il blocco è stretto: basta un margine più piccolo per riempire lo schermo
    const multi = size.y > 1.6;
    camera.position.set(0, 0, (Math.max((size.y / 2 + 0.6) / t, (size.x / 2 + (multi ? 0.9 : 2.2)) / (t * a)) + DEPTH * 2) * (multi ? 1.08 : 1.25));
    camera.updateProjectionMatrix();
    renderer.setSize(W(), H());
    grains.uniforms.uScale.value = renderer.domElement.height / (2 * t);
  };
  fit();

  /* ---------- avanzamento dalla timeline (con un po' di inerzia) ---------- */
  let progShown = THREE.MathUtils.clamp(getProgress(), 0, 1);

  /* ---------- polvere ---------- */
  const N = 220, dust = new Float32Array(N * 3), seeds = new Float32Array(N);
  for (let i = 0; i < N; i++) { dust[i * 3] = (Math.random() - .5) * 12; dust[i * 3 + 1] = (Math.random() - .5) * 7; dust[i * 3 + 2] = Math.random() * 3 - 1; seeds[i] = Math.random() * 100; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(dust, 3));
  const dc = document.createElement('canvas'); dc.width = dc.height = 32;
  { const g = dc.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(255,240,220,1)'); r.addColorStop(1, 'rgba(255,240,220,0)'); g.fillStyle = r; g.fillRect(0, 0, 32, 32); }
  const dustTex = new THREE.CanvasTexture(dc);
  const dustMat = new THREE.PointsMaterial({ size: 0.04, map: dustTex, transparent: true, opacity: .5, depthWrite: false, blending: THREE.AdditiveBlending });
  if (!reduce) scene.add(new THREE.Points(dustGeo, dustMat));

  /* ---------- movimento automatico (lento ondeggiare + luce che si sposta) ---------- */
  const cur = { x: 0, y: 0 }, light = { x: -0.6, y: 0.6 };

  const clock = new THREE.Clock(), lp = new THREE.Vector3();
  let blank = false;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 1 / 30), t = clock.elapsedTime;
    // scena nascosta o scritta già tutta in polvere: niente da disegnare
    const prog = THREE.MathUtils.clamp(getProgress(), 0, 1);
    if (!isVisible() || (prog >= 1 && progShown > 0.999)) {
      if (!blank) { renderer.clear(); blank = true; }
      progShown = prog;
      return;
    }
    blank = false;
    let ax = 0, ay = 0;
    if (!reduce) {
      ay = Math.sin(t * 0.3) * 0.018; ax = Math.sin(t * 0.23 + 1) * 0.02;
      light.x = -0.6 + Math.sin(t * 0.35) * 0.6; light.y = 0.55 + Math.cos(t * 0.27) * 0.25;
    }
    const k = 1 - Math.pow(0.03, dt);
    cur.x += (ax - cur.x) * k; cur.y += (ay - cur.y) * k;
    block.rotation.set(cur.x, cur.y, 0);
    progShown += (prog - progShown) * (1 - Math.pow(reduce ? 0 : 0.08, dt));
    U.uE.value = progShown * 1.5;
    const open = U.uE.value > 0.02 ? THREE.DoubleSide : THREE.FrontSide;   // l'interno serve solo quando si apre
    if (stone.side !== open) { stone.side = open; stone.needsUpdate = true; }
    lp.set(light.x * 6, light.y * 5 + 1.5, 5); key.position.lerp(lp, k);
    if (!reduce) {
      pieces.forEach(p => {                                       // le lettere levitano appena
        p.holder.position.y = p.base.y + Math.sin(t * 1.1 + p.phase) * 0.015;
      });
      if (sphere) {
        sphere.position.y = dotInfo.base.y + Math.sin(t * 1.4) * 0.05;
        sphere.rotation.y += dt * 0.5; sphere.rotation.x += dt * 0.17;
      }
      const p = dustGeo.attributes.position;
      for (let i = 0; i < N; i++) { let y = p.getY(i) + dt * 0.07; if (y > 3.5) y = -3.5; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(t * .4 + seeds[i]) * dt * .03); }
      p.needsUpdate = true;
    }
    renderer.render(scene, camera);
  });

  const ro = new ResizeObserver(fit); ro.observe(container);
  return () => {
    renderer.setAnimationLoop(null); ro.disconnect();
    scene.traverse(o => o.geometry?.dispose());
    stone.dispose(); depthMat.dispose(); grains.dispose(); dustMat.dispose(); dustTex.dispose(); envRT.dispose(); pmrem.dispose(); renderer.dispose(); cv.remove();
  };
}

// una scultura per testo, condivisa: può partire prima che il componente sia montato
const sculpted = new Map();
export function prepareStone(lines) {
  const key = lines.join('|');
  if (!sculpted.has(key)) {
    // le lettere si dividono tra più worker in parallelo, poi i pezzi si riuniscono
    const parts = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    const one = part => new Promise((resolve, reject) => {
      const worker = new Worker(new URL('../three/stoneWorker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => { worker.terminate(); resolve(data); };
      worker.onerror = e => { worker.terminate(); reject(e); };
      worker.postMessage({ lines, part, parts });
    });
    const all = Promise.all(Array.from({ length: parts }, (_, i) => one(i))).then(res => ({
      mid: res[0].mid,
      size: res[0].size,
      pieces: res.flatMap(r => r.pieces),
      sphere: res.find(r => r.sphere)?.sphere ?? null
    }));
    all.catch(() => sculpted.delete(key));
    sculpted.set(key, all);
  }
  return sculpted.get(key);
}

export default function StoneText3D({ className = '', style, lines = ['ARE YOU READY?'], background = null, getProgress, isVisible }) {
  const ref = useRef(null);
  const fns = useRef({ getProgress, isVisible });
  fns.current = { getProgress, isVisible };
  const key = lines.join('|');
  useEffect(() => {
    let dispose = null;
    let alive = true;
    prepareStone(key.split('|')).then(data => {
      if (!alive || !ref.current) return;
      dispose = createStoneText(ref.current, data, {
        background,
        getProgress: () => fns.current.getProgress?.() ?? 0,
        isVisible: () => fns.current.isVisible?.() ?? true
      });
      ref.current?.dispatchEvent(new Event('stoneready'));
    }, () => {});
    return () => {
      alive = false;
      dispose?.();
    };
  }, [key, background]);
  return <div ref={ref} className={className} style={{ width: '100%', height: '100%', pointerEvents: 'none', ...style }} />;
}
