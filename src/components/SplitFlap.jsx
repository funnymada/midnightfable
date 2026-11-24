import { useState } from 'react';
import { useFx } from '../lib/fx.js';

const START = 0.02;

// avanzamento a cui si ferma la tessera i-esima (da sinistra)
export const settleAt = i => 0.32 + i * 0.085;

// Cifra mostrata da una tessera all'avanzamento `p`: gira sempre più lenta fino a fermarsi su `target`
export const digitAt = (target, p, settle) => {
  if (p <= START) return 0;
  if (p >= settle) return target;
  const steps = Math.ceil(70 * (settle - p) ** 1.5);
  return (((target - steps) % 10) + 10) % 10;
};

function Tile({ value }) {
  const [state, setState] = useState({ cur: value, prev: value, n: 0 });
  if (value !== state.cur) setState({ cur: value, prev: state.cur, n: state.n + 1 });
  const { cur, prev, n } = state;

  // metà alta = nuova cifra, metà bassa = vecchia; le due alette coprono il passaggio
  return (
    <span className="flap">
      <span className="flap-half flap-top">
        <span className="lit">{cur}</span>
      </span>
      <span className="flap-half flap-bottom">
        <span className="lit">{prev}</span>
      </span>
      {prev !== cur && (
        <>
          <span key={`t${n}`} className="flap-half flap-top flap-leaf">
            <span className="lit">{prev}</span>
          </span>
          <span
            key={`b${n}`}
            className="flap-half flap-bottom flap-leaf"
            onAnimationEnd={() => setState(s => ({ ...s, prev: s.cur }))}
          >
            <span className="lit">{cur}</span>
          </span>
        </>
      )}
    </span>
  );
}

function ScrollTile({ target, settle }) {
  const value = useFx(f => digitAt(target, f.flap, settle));
  return <Tile value={value} />;
}

// Data a tessere: parte da 00/00/0000 e si ferma una tessera alla volta, da sinistra a destra
export default function SplitFlap({ text }) {
  let digit = 0;
  let slash = 0;
  return (
    <div className="date-row board3d" role="img" aria-label={text}>
      {[...text].map((c, i) =>
        c === '/' ? (
          <span key={i} className={`date-slash lit${++slash === 2 ? ' date-pivot' : ''}`} aria-hidden="true">
            /
          </span>
        ) : (
          <ScrollTile key={i} target={Number(c)} settle={settleAt(digit++)} />
        )
      )}
      <span className="date-sweep" aria-hidden="true" />
    </div>
  );
}
