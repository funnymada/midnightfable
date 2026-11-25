import { Fragment } from 'react';
import { useFx } from '../lib/fx.js';
import { LINES } from '../content.js';

const TEXT = LINES.fable;

// Pesi leggermente irregolari per lettera: il ritmo sembra quello di una mano che scrive
const CUMULATIVE = [...TEXT].reduce((acc, c, i) => {
  const weight = c === ' ' ? 1.8 : 1 + ((i * 37) % 7) / 12;
  acc.push((acc[i - 1] ?? 0) + weight);
  return acc;
}, []);
const TOTAL = CUMULATIVE[CUMULATIVE.length - 1];

export const lettersAt = p => {
  const target = p * TOTAL;
  let n = 0;
  while (n < CUMULATIVE.length && CUMULATIVE[n] <= target + 1e-6) n++;
  return n;
};

// parole con l'indice della prima lettera nella frase: il fumo (three.js) le compone lettera per lettera
const WORDS = TEXT.split(' ').reduce((acc, word) => {
  const start = acc.length ? acc[acc.length - 1].start + acc[acc.length - 1].word.length + 1 : 0;
  acc.push({ word, start });
  return acc;
}, []);

// Scena 4 — campo stellare e frase scritta a mano, una lettera per volta e senza cursore: la disegna il fumo di Scene3D,
// che traccia ogni lettera da sinistra a destra come una penna (smokeText.js).
// Le lettere non ancora scritte restano invisibili ma occupano spazio: il testo non si sposta mentre si scrive.
export default function Fable() {
  const count = useFx(f => lettersAt(f.type));

  return (
    <section className="scene s-fable">
      <p className="title glow fable-line" aria-label={TEXT}>
        {WORDS.map(({ word, start }, w) => (
          <Fragment key={w}>
            {w > 0 && ' '}
            <span className="fable-word" aria-hidden="true">
              {[...word].map((c, i) => (
                <Fragment key={i}>
                  <span className={start + i < count ? undefined : 'fable-rest'} data-smoke-i={start + i}>
                    {c}
                  </span>
                </Fragment>
              ))}
            </span>
          </Fragment>
        ))}
      </p>
    </section>
  );
}
