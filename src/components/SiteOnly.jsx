import { useCinematic } from '../lib/flags.js';

// Tutto ciò che sta qui dentro è fuori dalla feature flag `cinematic`: non compare durante la cinematica, solo nel sito dopo.
export default function SiteOnly({ children }) {
  return useCinematic() ? null : children;
}
