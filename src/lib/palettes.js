// Ogni palette ridefinisce l'accento (lo → mid → hi), il fondo (ink + bagliore) e il colore della sfera di cristallo (ball)
export const PALETTES = {
  gold: { lo: '#7a5b1f', mid: '#d8b35e', hi: '#f0cf7a', ink: '#050403', glow: '#1a130a', ball: '#ffd36e' },
  amethyst: { lo: '#3e2a66', mid: '#9b7bd8', hi: '#dccdf7', ink: '#06040b', glow: '#1a1030', ball: '#9478ff' },
  emerald: { lo: '#1d4d3d', mid: '#4fbf9a', hi: '#bdf0dc', ink: '#030705', glow: '#0b2219', ball: '#5cffc8' },
  ice: { lo: '#2a4a6b', mid: '#7fb4e6', hi: '#dbeafa', ink: '#03060b', glow: '#0e1b2c', ball: '#bfe6ff' },
  deep: { lo: '#1a3a75', mid: '#2f6fd0', hi: '#9cc3f2', ink: '#02040b', glow: '#0a1733', ball: '#3f7bff' },
  tide: { lo: '#2f6fd0', mid: '#7fb4e6', hi: '#cfe3f7', ink: '#02050c', glow: '#0b1f3d', ball: '#5ca8ff' },
  red: { lo: '#6b0b10', mid: '#e0262e', hi: '#ff9a84', ink: '#1a0303', glow: '#4a0a0c', ball: '#ff2a2a' },
  night: { lo: '#3a2a55', mid: '#6b5a9e', hi: '#a99ad6', ink: '#05070f', glow: '#0d1226', ball: '#9478ff' },
  starlit: { lo: '#7a5b1f', mid: '#d8b35e', hi: '#f0cf7a', ink: '#05070f', glow: '#15183a', ball: '#ffd36e' }
};

const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

// variabili CSS per il testo
export const cssVars = ({ lo, mid, hi, ink, glow }) => ({
  '--lo': lo,
  '--mid': mid,
  '--hi': hi,
  '--ink': ink,
  '--glow': glow
});

// gli stessi colori come numeri piatti (0–255), animabili da GSAP e letti dallo sfondo WebGL
export const toneKeys = palette =>
  Object.fromEntries(
    ['ink', 'glow', 'mid', 'hi', 'ball'].flatMap(name => channels(palette[name]).map((v, i) => [`${name}${i}`, v]))
  );
