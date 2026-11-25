import { gsap } from 'gsap';
import { fx, emit, resetFx } from './lib/fx.js';
import { PALETTES, cssVars, toneKeys } from './lib/palettes.js';

// Pause: nei punti in cui una scritta è appena formata la sequenza si ferma per `hold` unità di scroll.
// I tempi qui sotto restano quelli della sequenza compatta: tutto ciò che viene dopo una pausa slitta in avanti.
const HOLDS = [
  // read = secondi di cinematica per unità di pausa (predefinito in lib/autoplay.js): sulla prima frase si legge un po' più svelti
  { at: 4.5, hold: 3.2, read: 0.55 }, // are you ready?
  { at: 4.55, hold: 4.4, read: 0.55 }, // la pietra si sgretola con calma prima che arrivi l'onda
  { at: 10.95, hold: 4.4 }, // it's coming: entrano il mulino e il sole di cartone
  { at: 13.55, hold: 3.6 }, // coordinate giganti
  { at: 21.5, hold: 2.4 }, // la data ferma su 30/01/2027
  { at: 28.9, hold: 2.2 }, // il fumo copre tutta la pagina
  { at: 36, hold: 3.5 } // this time it will be a fable, fino in fondo alla pagina
];
// 75 gradi in radianti: rotazione del pannello della data mentre sparisce
const TILT_75 = (75 * Math.PI) / 180;
const remap = t => HOLDS.reduce((acc, h) => (t >= h.at - 1e-6 ? acc + h.hold : acc), t);

// Durata della sequenza in unità di timeline: lo scroll la percorre tutta
export const LENGTH = remap(38); // 36 = fine della frase, poi la TV che si spegne
// Le pause nella timeline finale (unità già spostate): servono allo scroll automatico per fermarsi sul testo
export const HOLD_SPANS = HOLDS.map(h => ({ start: remap(h.at) - h.hold, end: remap(h.at), read: h.read }));

// Lo sfondo (DitherBg) legge `fx`: qui si animano i suoi valori insieme agli elementi di testo
export function buildTimeline(stage) {
  const q = gsap.utils.selector(stage);
  const raw = gsap.timeline({ defaults: { ease: 'none' }, onUpdate: emit });
  const pos = at => (typeof at === 'number' ? remap(at) : at);
  const tl = {
    to: (target, vars, at) => raw.to(target, vars, pos(at)),
    fromTo: (target, from, vars, at) => raw.fromTo(target, from, vars, pos(at)),
    set: (target, vars, at) => raw.set(target, vars, pos(at))
  };

  resetFx();
  gsap.set(stage, cssVars(PALETTES.gold));

  // cambia tutta la palette insieme: testo, materia, plasma e polvere
  const paint = (name, at, duration = 0.4) => {
    const p = PALETTES[name];
    tl.to(stage, { ...cssVars(p), duration }, at);
    tl.to(fx, { ...toneKeys(p), duration }, at);
  };

  // la seconda barra della data è il punto in cui la camera entra
  const pivotOrigin = () => {
    const pivot = q('.date-pivot')[0];
    const row = pivot.offsetParent;
    const x = row.offsetLeft + pivot.offsetLeft + pivot.offsetWidth / 2;
    const y = row.offsetTop + pivot.offsetTop + pivot.offsetHeight / 2;
    return `${x}px ${y}px`;
  };

  // 1 · are you ready? — il colore di base cambia più volte, la materia scorre piano
  tl.to(q('.scroll-cue'), { autoAlpha: 0, duration: 0.4 }, 0.1);
  tl.to(q('.ready-inner'), { scale: 0.94, duration: 4.6 }, 0);
  tl.to(fx, { flow: 0.35, duration: 4.6 }, 0);
  ['amethyst', 'emerald', 'ice', 'gold', 'deep'].forEach((name, i) => paint(name, 0.5 + i * 0.85, 0.35));
  tl.to(fx, { embers: 0.45, duration: 0.6 }, 4.2);

  // onda dall'alto: il fronte di plasma scende e copre tutto, poi la camera risale alla superficie
  tl.to(fx, { crest: 1.25, flow: -0.6, duration: 1.6, ease: 'power2.in' }, 4.8);
  // la pietra si sgretola da sinistra a destra prima che l'onda la porti via
  tl.fromTo(fx, { stone: 0 }, { stone: 1, duration: 5, ease: 'power1.inOut', immediateRender: false }, 4.5);
  tl.to(q('.ready-inner'), { y: () => window.innerHeight * 0.3, scaleY: 1.12, autoAlpha: 0, duration: 1.1, ease: 'power2.in' }, 5.3);
  tl.fromTo(q('.ready-inner'), { filter: 'blur(0px)' }, { filter: 'blur(14px)', duration: 1.1, ease: 'power2.in' }, 5.3);
  tl.to(fx, { embers: 0, duration: 0.8 }, 5.6);
  tl.to(fx, { bubbles: 1, duration: 1 }, 6);
  paint('tide', 6.4, 0.6);
  tl.to(fx, { surface: 0.56, flow: -0.2, duration: 1.6, ease: 'power2.inOut' }, 6.6);
  tl.to(fx, { bubbles: 0.35, duration: 0.8 }, 7.6);

  // 2 · it's coming — affiora dall'acqua
  tl.fromTo(q('.coming-title:not(.reflection-title)'), { yPercent: 105 }, { yPercent: 0, duration: 2.4, ease: 'power2.out' }, 8.4);
  tl.fromTo(q('.reflection-title'), { yPercent: -105, scaleY: -1 }, { yPercent: 0, scaleY: -1, duration: 2.4, ease: 'power2.out' }, 8.4);
  tl.fromTo(q('#refract-map'), { attr: { scale: 48 } }, { attr: { scale: 0 }, duration: 2.8, ease: 'power2.out' }, 8.4);
  tl.fromTo(q('#refract-blur'), { attr: { stdDeviation: 9 } }, { attr: { stdDeviation: 0 }, duration: 2.4, ease: 'power2.out' }, 8.4);
  tl.to(q('.drop'), { keyframes: { y: [-30, -6, 12], opacity: [0, 1, 0] }, duration: 0.9, stagger: 0.2 }, 9.4);
  // gli orb risalgono dall'acqua e compongono la scritta mentre affiora, poi si sciolgono prima del passaggio
  tl.to(fx, { orbComing: 1, duration: 2, ease: 'power1.inOut' }, 8.6);
  // a scritta e onda formate entrano dai lati il mulino e il sole di cartone (dentro la pausa), poi escono prima che la scena svanisca
  tl.fromTo(fx, { props: 0 }, { props: 1, duration: 2.4, immediateRender: false }, 10.9);
  tl.to(fx, { props: 2, duration: 0.8, ease: 'power1.in' }, 11.1);
  tl.to(fx, { orbComing: 0, duration: 0.7, ease: 'power1.in' }, 11.2);
  tl.to(fx, { ripples: 1, duration: 0.8 }, 10.4);
  tl.to(q('#refract-map'), { attr: { scale: 12 }, duration: 0.6 }, 12);

  // passaggio al rosso: un anello di plasma che si allarga dal centro, dentro solo inchiostro
  // passaggio: fondo scuro con la grana di Noise, salgono le coordinate giganti; sotto, lo sfondo diventa rosso
  tl.to(fx, { transit: 1, duration: 0.8 }, 11.6);
  tl.fromTo(q('.transit-line'), { yPercent: 110 }, { yPercent: 0, duration: 1.1, stagger: 0.25, ease: 'power3.out' }, 12.2);
  tl.to(q('.transit-coords'), { scale: 1.06, duration: 2.2 }, 12.2);
  // le coordinate si compongono con gli orb e poi si sciolgono
  tl.to(fx, { orbTransit: 1, duration: 1.4, ease: 'power1.inOut' }, 12.1);
  tl.to(fx, { orbTransit: 0, duration: 0.7, ease: 'power1.in' }, 13.6);
  tl.to(fx, { transit: 0, duration: 0.8 }, 14.4);
  // il rosso arriva tutto insieme, quando il lago copre lo schermo
  tl.set(fx, { bleed: 1.4 }, 13.7);
  tl.to(q('.s-coming'), { autoAlpha: 0, duration: 0.8 }, 11.9);
  tl.to(fx, { bubbles: 0, duration: 0.6 }, 12.4);
  // dietro la data compare la sfera rossa
  tl.set(fx, { ballSize: 0.95 }, 13.85);
  tl.to(fx, { ballFade: 0.7, duration: 1.2 }, 14.7);
  paint('red', 13.7, 0.05);
  tl.set(fx, { surface: -0.2, crest: -0.2, ripples: 0, flow: 0 }, 13.7);
  tl.to(fx, { bleedOn: 0, duration: 1 }, 13.8);
  tl.to(fx, { embers: 0.8, haze: 1, duration: 1 }, 13.8);

  // 3 · la data: entra, gira, si ferma su 30/01/2027
  // il pannello arriva inclinato in prospettiva, ruota piano mentre conta e una luce lo attraversa; prima dello zoom si raddrizza
  tl.fromTo(
    q('.date-row'),
    { yPercent: 60, autoAlpha: 0 },
    { yPercent: 0, autoAlpha: 1, duration: 1.4, ease: 'power3.out' },
    14.8
  );
  tl.fromTo(fx, { dateRX: -1, dateRY: -0.14 }, { dateRX: -0.32, dateRY: -0.1, duration: 1.4, ease: 'power3.out' }, 14.8);
  tl.to(fx, { dateRX: -0.16, dateRY: 0.1, duration: 5, ease: 'sine.inOut' }, 16.2);
  tl.fromTo(fx, { dateLight: -0.1 }, { dateLight: 1.1, duration: 5.6, ease: 'sine.inOut' }, 15);
  tl.to(fx, { dateRX: 0, dateRY: 0, dateLight: 0.5, duration: 1, ease: 'power2.inOut' }, 20.9);
  tl.to(fx, { flap: 1, duration: 5.2 }, 15.4);
  tl.to(q('.date-sweep'), { keyframes: { xPercent: [-100, 100], opacity: [0, 1, 0] }, duration: 0.9 }, 20.5);
  tl.fromTo(q('.date-line'), { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: 'power2.out' }, 20.6);

  // 4 · zoom nel centro: la materia si apre, anelli di plasma corrono incontro, fino alle stelle
  tl.set(q('.date-zoom'), { transformOrigin: pivotOrigin }, 21.9);
  tl.to(q('.date-zoom'), { scale: 40, duration: 4, ease: 'power3.in' }, 22);
  // la data sparisce prima che la barra riempia lo schermo: si attraversa, non ci si sbatte contro
  tl.fromTo(q('.date-zoom'), { filter: 'blur(0px)' }, { filter: 'blur(8px)', duration: 0.8, ease: 'power2.in' }, 23.4);
  tl.to(q('.date-zoom'), { autoAlpha: 0, duration: 0.6 }, 23.6);
  // mentre sparisce il pannello della data gira piatto sullo schermo, come una penna su un foglio, fino a circa 75 gradi
  tl.to(fx, { dateRZ: TILT_75, duration: 2.2, ease: 'power2.in' }, 22);
  tl.to(fx, { zoom: 3.2, duration: 5, ease: 'power3.in' }, 22);
  // si entra nella sfera insieme alla data: il bordo passa oltre la camera, dentro restano foschia e polvere
  tl.to(fx, { ballSize: 14, duration: 4, ease: 'power3.in' }, 22);
  tl.to(fx, { ballFade: 1, ballCharge: 1, duration: 1 }, 22);
  tl.to(fx, { ballFade: 0, duration: 1.2 }, 24.6);
  tl.to(fx, { embers: 0, haze: 0.25, duration: 1.4 }, 22.4);
  tl.to(fx, { keyframes: { tunnel: [0, 1, 1, 0] }, duration: 5.2 }, 22.4);
  tl.to(fx, { warp: 1, duration: 4.2, ease: 'power2.in' }, 22.6);
  tl.to(fx, { warp: 0, duration: 1.8, ease: 'power3.out' }, 26.8);
  tl.to(fx, { stars: 1, duration: 2.6 }, 23);
  tl.to(fx, { matter: 0, duration: 2.5 }, 23);
  paint('night', 23.2, 3.4);
  // a materia spenta lo zoom si azzera, così nel cielo stellato torna la sua trama
  tl.set(fx, { zoom: 0 }, 27.2);
  paint('starlit', 27.8, 1.2);
  tl.to(fx, { matter: 1.1, haze: 0.45, duration: 2 }, 27.4);

  // entrata del fumo: tre sbuffi partono da punti precisi e si allargano fino a fondersi nella nebbia
  tl.fromTo(fx, { puff: 0 }, { puff: 1, duration: 2.6, immediateRender: false }, 26.3);
  tl.fromTo(fx, { fog: 0 }, { fog: 1, duration: 1.1, ease: 'power1.inOut' }, 27.8);
  // a nebbia piena gli sbuffi si sciolgono dentro di lei (la dissolvenza finisce dentro la pausa)
  tl.fromTo(fx, { puffAlpha: 1 }, { puffAlpha: 0, duration: 1.6, immediateRender: false }, 28.6);
  // stelle e particelle si spengono da qui in poi
  tl.to(fx, { stars: 0, embers: 0, particles: 0, duration: 1.4 }, 27.4);
  // poi si dirada mentre la frase si forma, e resta come fondo
  tl.to(fx, { fog: 0.42, duration: 2.6, ease: 'sine.inOut' }, 29);

  // this time it will be a fable
  tl.to(q('.s-fable'), { autoAlpha: 1, duration: 0.3 }, 29);
  tl.to(fx, { type: 1, duration: 4.8 }, 29.2);
  tl.to(q('.caret'), { autoAlpha: 0, duration: 0.4 }, 35.2);

  // ultima cosa: la TV si spegne. Tutto si schiaccia in una riga luminosa (dall'alto e dal basso verso il centro),
  // la riga si stringe dai lati fino a un punto, il punto si spegne e resta il nero
  tl.fromTo(stage, { scaleY: 1, scaleX: 1 }, { scaleY: 0.005, duration: 0.7, ease: 'power3.in', immediateRender: false }, 36);
  tl.fromTo(q('.tv-flash'), { opacity: 0 }, { opacity: 0.85, duration: 0.7, ease: 'power2.in', immediateRender: false }, 36);
  tl.to(stage, { scaleX: 0, duration: 0.5, ease: 'power3.in' }, 36.7);
  tl.fromTo('.tv-dot', { autoAlpha: 0, scale: 1 }, { autoAlpha: 1, duration: 0.12, immediateRender: false }, 37.08);
  tl.to('.tv-dot', { autoAlpha: 0, scale: 0.15, duration: 0.5, ease: 'power2.in' }, 37.2);
  tl.fromTo(fx, { tv: 0 }, { tv: 1, duration: 1.8, immediateRender: false }, 36);

  raw.set({}, {}, LENGTH);
  return raw;
}
