// Cose in comune ai pezzi in cromo iridescente (Compass, Hand, Pawn, Teddy):
// l'ambiente che "colora" il cromo, il materiale e la pulizia della memoria.
import * as THREE from 'three';

// Ambiente viola / magenta / arancio con strisce luminose (riflessi netti tipo "liquid chrome").
// Restituisce il render target: la sua .texture va in scene.environment; va liberato con .dispose().
export function chromeEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const sky = new THREE.SphereGeometry(20, 96, 48);
  const stops = [
    [-1.0, '#05020f'], [-0.62, '#3410b0'], [-0.3, '#7a2bff'], [-0.02, '#ff2fb9'],
    [0.25, '#ff6a2a'], [0.48, '#ffc46b'], [0.68, '#14052e'], [0.86, '#a23cff'], [1.0, '#ffd9f4'],
  ].map(([p, c]) => [p, new THREE.Color(c)]);
  const pos = sky.attributes.position, cols = [], tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / 20, y = pos.getY(i) / 20, z = pos.getZ(i) / 20;
    let t = y + 0.32 * Math.sin(x * 5.0 + z * 2.2) + 0.18 * Math.cos(z * 6.0 - x * 1.5);
    t = THREE.MathUtils.clamp(t, -1, 1);
    let k = 0;
    while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [p0, c0] = stops[k], [p1, c1] = stops[k + 1];
    tmp.lerpColors(c0, c1, (t - p0) / (p1 - p0));
    cols.push(tmp.r, tmp.g, tmp.b);
  }
  sky.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  envScene.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  [
    [[6, 6, 6], [-7, 6, 9], 10, 1.2],
    [[7, 2.6, 0.5], [9, -2, 7], 3, 12],
    [[1.6, 0.5, 7], [-8, -5, 4], 12, 2],
    [[6, 1.2, 4], [2, 9, -6], 8, 1.5],
  ].forEach(([rgb, p, w, h]) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...rgb), side: THREE.DoubleSide, toneMapped: false });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    s.position.set(...p); s.lookAt(0, 0, 0); envScene.add(s);
  });
  const envRT = pmrem.fromScene(envScene, 0.015);
  envScene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  pmrem.dispose();
  return envRT;
}

// cromo iridescente
export const chromeMaterial = () => new THREE.MeshPhysicalMaterial({
  color: 0xffffff, metalness: 1, roughness: 0.07, envMapIntensity: 1.3,
  iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [180, 720],
  clearcoat: 1, clearcoatRoughness: 0.04,
});

// renderer con le impostazioni del cromo
export function chromeRenderer({ alpha = true, maxDpr = 2 } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxDpr));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

// libera geometrie e materiali (anche condivisi) di un albero di oggetti
export function disposeTree(root) {
  const mats = new Set();
  root.traverse(o => { o.geometry?.dispose(); if (o.material) [].concat(o.material).forEach(m => mats.add(m)); });
  mats.forEach(m => { m.map?.dispose(); m.dispose(); });
}
