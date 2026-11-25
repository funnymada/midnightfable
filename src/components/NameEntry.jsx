import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useFx } from '../lib/fx.js';

// In fondo al sito, a TV spenta: un campo senza bordi (Impact) per scrivere il proprio nome, massimo 10 parole.
// Si può fare una volta sola: confermato il nome finisce nel localStorage e, finché c'è, al posto del campo
// c'è la stanza 3D con i pezzi in cromo (chromo/ChromoRoom.jsx).
// (Fuori dalla cinematica: va dentro <SiteOnly>.)
// la stanza 3D con i pezzi in cromo si scarica solo quando serve (dopo il nome), non pesa sul resto del sito
const ChromoRoom = lazy(() => import('./chromo/ChromoRoom.jsx'));

const KEY = 'midnightfable.name';
const MAX_WORDS = 10;

const readSaved = () => {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

// tiene al massimo 10 parole (lo spazio dopo la decima resta, la parola successiva no)
const limitWords = v => v.match(new RegExp(`^(?:\\s*\\S+){0,${MAX_WORDS}}\\s?`))[0];

export default function NameEntry() {
  const off = useFx(f => f.tv > 0.999);
  const [saved, setSaved] = useState(readSaved);
  const [value, setValue] = useState('');
  const input = useRef(null);
  const show = off && !saved;

  useEffect(() => {
    if (show) input.current?.focus({ preventScroll: true });
  }, [show]);

  if (!off) return null;
  // nome già scritto: punto di luce e pezzi in cromo che cadono intorno
  if (saved)
    return (
      <Suspense fallback={null}>
        <ChromoRoom />
      </Suspense>
    );

  const submit = e => {
    e.preventDefault();
    const name = value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    try {
      window.localStorage.setItem(KEY, name);
    } catch {
      // storage non disponibile (navigazione privata): il campo sparisce comunque per questa visita
    }
    setSaved(name);
  };

  return (
    <form className="name-entry" onSubmit={submit}>
      <label className="name-entry-label" htmlFor="name-entry-input">
        type your name here to participate
        <br />
        you can do it only once
      </label>
      {/* area che va a capo e cresce col testo; Invio conferma */}
      <textarea
        id="name-entry-input"
        ref={input}
        className="name-entry-input"
        value={value}
        onChange={e => setValue(limitWords(e.target.value.replace(/\n/g, ' ')))}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="done"
        maxLength={160}
        rows={1}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) submit(e);
        }}
      />
    </form>
  );
}
