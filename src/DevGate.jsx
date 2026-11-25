import { useState } from 'react';

// Feature flag devmode (VITE_DEVMODE nel .env, vedi lib/flags.js): pagina nera con una casella;
// finché non si scrive "favola" il sito non parte. Vale sia in sviluppo sia nella build.
// Attenzione: la password sta nel JavaScript pubblicato, tiene lontani i curiosi ma non è una vera protezione.
// Per toglierla: cancellare questo file e le righe segnate "DevGate" in main.jsx.
const PASSWORD = 'favola';

// finché c'è la pagina della password i motori di ricerca non indicizzano il sito
if (typeof document !== 'undefined') {
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex, nofollow';
  document.head.appendChild(meta);
}

export default function DevGate({ children }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  if (open) return children;
  return (
    <form
      style={{ position: 'fixed', inset: 0, background: '#000', display: 'grid', placeItems: 'center' }}
      onSubmit={e => {
        e.preventDefault();
        if (value.trim().toLowerCase() === PASSWORD) setOpen(true);
        else setValue('');
      }}
    >
      <input autoFocus value={value} onChange={e => setValue(e.target.value)} placeholder="password" />
    </form>
  );
}
