import { useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

import DitherBg from './components/DitherBg.jsx';
import Ball from './components/Ball.jsx';
import Wave from './components/Wave.jsx';
import Ready from './scenes/Ready.jsx';
import Coming from './scenes/Coming.jsx';
import Transit from './scenes/Transit.jsx';
import DateScene from './scenes/DateScene.jsx';
import Fable from './scenes/Fable.jsx';
import Scene3D from './three/Scene3D.jsx';
import OrbText from './components/OrbText.jsx';
import { buildTimeline, LENGTH } from './timeline.js';
import { getCinematic, setCinematic } from './lib/flags.js';
import { startAutoplay, lockInput } from './lib/autoplay.js';
import SiteOnly from './components/SiteOnly.jsx';
import ScrollHint from './components/ScrollHint.jsx';
import NameEntry from './components/NameEntry.jsx';

gsap.registerPlugin(ScrollTrigger, useGSAP);
// su mobile la barra degli indirizzi cambia l'altezza: evita ricalcoli e salti
ScrollTrigger.config({ ignoreMobileResize: true });
// la sequenza riparte sempre dall'inizio
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// unità di timeline → vh di scroll
const SCROLL_PER_UNIT = 52;

// Filtri SVG per il testo nell'acqua: rifrazione mentre affiora, riflesso che ondeggia
function Filters() {
  return (
    <svg className="filters" aria-hidden="true">
      <filter id="refract" x="-10%" y="-30%" width="120%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.012 0.06" numOctaves="2" seed="3">
          <animate attributeName="baseFrequency" dur="9s" values="0.012 0.06;0.016 0.08;0.012 0.06" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap id="refract-map" in="SourceGraphic" scale="48" xChannelSelector="R" yChannelSelector="G" />
        <feGaussianBlur id="refract-blur" stdDeviation="9" />
      </filter>
      <filter id="mirror" x="-10%" y="-30%" width="120%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.01 0.09" numOctaves="2" seed="5">
          <animate attributeName="baseFrequency" dur="6s" values="0.01 0.09;0.014 0.12;0.01 0.09" repeatCount="indefinite" />
        </feTurbulence>
        <feDisplacementMap in="SourceGraphic" scale="14" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}

export default function App() {
  const stage = useRef(null);
  const track = useRef(null);

  useGSAP(() => {
    ScrollTrigger.create({
      trigger: track.current,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 2,
      animation: buildTimeline(stage.current),
      invalidateOnRefresh: true
    });
    // i font cambiano le misure della data (punto d'ingresso dello zoom)
    document.fonts?.ready.then(() => ScrollTrigger.refresh());

    // cinematica: parte sempre all'apertura, dopo l'entrata della pietra; finché dura l'utente non può interagire.
    // Quando è tornata in cima cinematic = false e compare il sito (con i pezzi dentro <SiteOnly>).
    if (!getCinematic()) return;
    const unlock = lockInput();
    const stone = stage.current.querySelector('.ready-stone');
    let stop = () => {};
    const go = () => {
      clearTimeout(fallback);
      stone?.removeEventListener('stoneready', go);
      stop = startAutoplay({
        delay: 2600, // tempo dell'entrata della pietra
        onDone: () => {
          unlock();
          setCinematic(false);
        }
      });
    };
    const fallback = setTimeout(go, 5000);
    stone?.addEventListener('stoneready', go, { once: true });
    return () => {
      clearTimeout(fallback);
      stone?.removeEventListener('stoneready', go);
      stop();
      unlock();
    };
  });

  return (
    <>
      <main ref={stage} className="stage">
        <Filters />
        <DitherBg />
        <Ball />
        <Wave />
        <Ready />
        <Coming />
        <Transit />
        <DateScene />
        <Fable />
        <OrbText />
        <Scene3D />
        {/* bagliore della TV che si spegne: si schiaccia insieme alla scena */}
        <div className="tv-flash" aria-hidden="true" />
        {/* fuori dalla cinematica: solo nel sito dopo */}
        <SiteOnly>
          <ScrollHint />
        </SiteOnly>
      </main>
      {/* punto luminoso finale della TV spenta (fuori dalla scena, che è già schiacciata a zero) */}
      <div className="tv-dot" aria-hidden="true" />
      {/* fuori dalla cinematica: solo nel sito, a schermo nero */}
      <SiteOnly>
        <NameEntry />
      </SiteOnly>
      <div ref={track} className="track" style={{ height: `${100 + LENGTH * SCROLL_PER_UNIT}vh` }} />
    </>
  );
}
