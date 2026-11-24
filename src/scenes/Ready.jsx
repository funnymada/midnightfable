import { useRef, useSyncExternalStore } from 'react';
import { gsap } from 'gsap';
import { useGSAP } from '@gsap/react';
import StoneText3D, { prepareStone } from '../components/StoneText3D.jsx';
import { fx } from '../lib/fx.js';
import { LINES } from '../content.js';

// su desktop una riga, da mobile due ("ARE YOU" / "READY?")
const NARROW = '(max-width: 640px)';
const ONE_LINE = [LINES.ready.toUpperCase()];
const TWO_LINES = (() => {
  const words = ONE_LINE[0].split(' ');
  const cut = Math.ceil(words.length / 2);
  return [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
})();
const narrowQuery = typeof window !== 'undefined' ? window.matchMedia(NARROW) : null;
const subscribeNarrow = cb => {
  narrowQuery?.addEventListener('change', cb);
  return () => narrowQuery?.removeEventListener('change', cb);
};
const isNarrow = () => !!narrowQuery?.matches;
// la pietra si scolpisce appena si carica la pagina, così compare quasi subito
prepareStone(isNarrow() ? TWO_LINES : ONE_LINE);
const stoneProgress = () => fx.stone;

// Scena 1 — entrata a tempo all'apertura; da qui in poi comanda lo scroll
export default function Ready() {
  const root = useRef(null);
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
  // il canvas 3D si ferma quando la scritta è sparita
  const visible = () => {
    const inner = root.current?.querySelector('.ready-inner');
    return !!inner && getComputedStyle(inner).visibility !== 'hidden';
  };

  useGSAP(
    () => {
      const intro = gsap
        .timeline({ paused: true })
        // la pietra emerge dal buio
        .from('.ready-stone', { autoAlpha: 0, scale: 0.96, duration: 1.2, ease: 'power2.out' })
        .from('.ready-line', { scaleX: 0, duration: 1, ease: 'power3.inOut' }, '-=0.5')
        .from('.scroll-cue-inner', { opacity: 0, duration: 1 }, '+=0.4');
      // parte quando la pietra è scolpita (Web Worker, qualche secondo); se tarda troppo parte comunque
      const stone = root.current.querySelector('.ready-stone');
      const play = () => intro.play();
      const fallback = setTimeout(play, 5000);
      stone.addEventListener('stoneready', play, { once: true });
      return () => {
        clearTimeout(fallback);
        stone.removeEventListener('stoneready', play);
      };
    },
    { scope: root }
  );

  return (
    <section ref={root} className="scene s-ready">
      <div className="ready-inner">
        {/* la scritta è un blocco di pietra 3D (three.js) su una riga; il testo resta per i lettori di schermo */}
        <h1 className="ready-title">
          <span className="sr-only">{LINES.ready}</span>
          <StoneText3D className="ready-stone" lines={narrow ? TWO_LINES : ONE_LINE} getProgress={stoneProgress} isVisible={visible} />
        </h1>
        <div className="hairline ready-line" />
      </div>
      <div className="scroll-cue" aria-hidden="true">
        <div className="scroll-cue-inner" />
      </div>
    </section>
  );
}
