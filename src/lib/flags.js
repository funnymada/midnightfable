import { useSyncExternalStore } from 'react';

// Feature flag `cinematic`.
// All'apertura parte sempre la cinematica (scroll automatico, lib/autoplay.js): finché è in corso cinematic = true.
// Quando la cinematica è tornata in cima cinematic diventa false: è il sito vero e proprio, che si scorre a mano.
// I pezzi "fuori dalla cinematica" si avvolgono in <SiteOnly> (components/SiteOnly.jsx) o leggono useCinematic():
// durante la cinematica non compaiono, nel sito sì.
// Solo per sviluppo: ?cinematic=false nell'URL salta la cinematica e apre direttamente il sito.
const skip = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('cinematic') === 'false';

// Feature flag `devmode` (VITE_DEVMODE nel file .env): true = prima del sito c'è la pagina della password (DevGate),
// sia con `npm run dev` sia nella build. Se la variabile manca vale true solo in sviluppo.
const devEnv = import.meta.env.VITE_DEVMODE;
export const DEVMODE = devEnv === undefined ? import.meta.env.DEV : devEnv === 'true';

let cinematic = !skip;
const listeners = new Set();

export const getCinematic = () => cinematic;

export function setCinematic(value) {
  if (cinematic === value) return;
  cinematic = value;
  document.documentElement.classList.toggle('is-cinematic', value);
  listeners.forEach(l => l());
}

const subscribe = l => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const useCinematic = () => useSyncExternalStore(subscribe, getCinematic, getCinematic);

if (typeof document !== 'undefined') document.documentElement.classList.toggle('is-cinematic', cinematic);
