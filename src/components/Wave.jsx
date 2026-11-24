import CrystalWave from './CrystalWave.jsx';
import { fx, clock } from '../lib/fx.js';

const smooth = (a, b, v) => {
  const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// L'onda guidata dallo scroll: prima la cresta che scende (acqua sopra), poi la superficie (acqua sotto).
// Seed e ampiezza sono quelli del bordo dell'acqua nello sfondo, così la linea combacia con il dither.
const drive = () => {
  const crest = fx.crest > -0.15 && fx.crest < 1.2;
  const color = [fx.mid0 / 255, fx.mid1 / 255, fx.mid2 / 255];
  // la linea si spegne mentre arriva il passaggio
  const fade = (1 - smooth(0, 0.8, fx.transit)) * fx.particles;
  return crest
    ? { y: fx.crest, swell: 0.03, seed: 1.7, water: -1, span: 0.42, clock: clock.time, color, fade, charge: 0.25 }
    : { y: fx.surface, swell: 0.012, seed: 0, water: 1, span: 0.35, clock: clock.time, color, fade, ripples: fx.ripples };
};

export default function Wave() {
  return <CrystalWave className="ball-layer" drive={drive} />;
}
