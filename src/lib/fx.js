import { useSyncExternalStore } from 'react';
import { PALETTES, toneKeys } from './palettes.js';

// Stato condiviso guidato dallo scroll: la timeline lo anima, lo sfondo WebGL e i componenti lo leggono.
// Posizioni verticali (crest, surface) in frazioni d'altezza dello schermo, dall'alto.
const INITIAL = {
  matter: 1, // quanto si vede la materia in dither
  haze: 0.6, // bagliore al centro
  flow: 0, // spostamento verticale della materia
  zoom: 0, // ingresso nel tunnel (logaritmico)
  embers: 1,
  bubbles: 0,
  stars: 0,
  warp: 0,
  tunnel: 0, // anelli di plasma
  crest: -0.2, // fronte dell'onda che scende
  surface: -0.2, // superficie dell'acqua
  ripples: 0,
  bleed: 0, // raggio della macchia rossa
  bleedRing: 0, // l'anello ora è il bordo della sfera (ballBleed)
  bleedOn: 1,
  flap: 0, // split-flap 0–1
  // sfera di cristallo (CrystalBall): misura in frazioni del lato corto, posizione in frazioni dello schermo dal centro (y verso l'alto)
  ballSize: 0.62,
  ballX: 0,
  ballY: 0,
  ballFade: 0, // la sfera compare solo con la data
  ballCharge: 0,
  // lago di Strands (passaggio verso la data): opacità, misura del vetro, schiacciamento prospettico, posizione dall'alto
  lake: 0,
  lakeSize: 0.34,
  lakeSquash: 0.26,
  lakeY: 0.6,
  lakeEnergy: 0.4,
  props: 0, // mulino e sole di cartone: 0 fuori scena, 1 in scena, 2 usciti di nuovo
  transit: 0, // passaggio con le coordinate prima della data
  // scritte composte dagli orb (0 = orb sparsi, 1 = scritta formata)
  orbReady: 0,
  stone: 0, // "ARE YOU READY?" in pietra: 0 intatta, 1 polvere
  orbComing: 0,
  orbTransit: 0,
  // pannello 3D della data: inclinazione (radianti) e posizione della luce che scorre (0–1)
  dateRX: 0,
  dateRY: 0,
  dateRZ: 0, // rotazione nel piano dello schermo mentre la data sparisce
  dateLight: 0.5,
  particles: 1, // polvere dell'onda: si spegne dal fumo finale in poi
  puff: 0, // sbuffi che aprono il fumo finale: 0 nessuno, 1 allargati su tutto lo schermo
  puffAlpha: 1,
  fog: 0, // nebbia di fumo su tutta la pagina prima della frase finale (three.js)
  type: 0 // typewriter 0–1
};

// tempo dello sfondo: CrystalWave lo usa per seguire esattamente il bordo dell'acqua
export const clock = { time: 0 };

export const fx = { ...INITIAL, ...toneKeys(PALETTES.gold) };

export const resetFx = () => Object.assign(fx, INITIAL, toneKeys(PALETTES.gold));

const listeners = new Set();
const subscribe = listener => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const emit = () => listeners.forEach(listener => listener());

// `select` deve restituire un valore primitivo: il componente si aggiorna solo quando cambia
export const useFx = select => useSyncExternalStore(subscribe, () => select(fx));
