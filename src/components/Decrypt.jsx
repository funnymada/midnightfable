import { useEffect, useState } from 'react';

// Caratteri casuali che si fissano da sinistra a destra, partendo dopo `delay` secondi
export default function Decrypt({ text, delay = 0, duration = 1.2, charset = '0123456789' }) {
  const [out, setOut] = useState(null);

  useEffect(() => {
    const start = performance.now() + delay * 1000;
    const id = setInterval(() => {
      const p = (performance.now() - start) / (duration * 1000);
      if (p < 0) return;
      const settled = Math.floor(Math.min(p, 1) * text.length);
      setOut(
        // solo le cifre si mescolano: gradi, primi, secondi e lettere restano al loro posto
        [...text].map((c, i) => (i < settled || !/\d/.test(c) ? c : charset[(Math.random() * charset.length) | 0])).join('')
      );
      if (p >= 1) clearInterval(id);
    }, 45);
    return () => clearInterval(id);
  }, [text, delay, duration, charset]);

  // finché non parte, il testo occupa già il suo spazio ma resta invisibile
  return (
    <span aria-label={text} style={out === null ? { visibility: 'hidden' } : undefined}>
      {out ?? text}
    </span>
  );
}
