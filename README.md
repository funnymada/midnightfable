# MidnightFable

Sito-teaser a scroll: una sola sequenza fissa a schermo, guidata dallo scroll. React + Vite + Tailwind v4, GSAP (ScrollTrigger con scrub), sfondo WebGL2.

## Avvio

```bash
npm install
npm run dev
npm run build          # build normale in dist/
npm run build:single   # un unico index.html autosufficiente in dist-single/
```

## Font
Mezzotint CF da Adobe Fonts, caricato in `index.html` (`use.typekit.net/nnp8sps.css`). Il kit funziona solo sui domini configurati nel Web Project: aggiungi lì il dominio di pubblicazione.

## La sequenza
1. **ARE YOU READY?** in pietra 3D crepata su una riga (il punto del "?" è una sfera di roccia); prima dell'onda si sgretola da sinistra a destra. Il colore di base cambia più volte (oro → ametista → smeraldo → ghiaccio → oro → blu)
2. **Onda dall'alto**: un fronte di plasma scende e porta l'acqua, poi la camera risale alla superficie
3. **it's coming** affiora dalla superficie elettrica, con riflesso e increspature
4. **Passaggio**: fondo scuro con la grana di Noise, al centro le coordinate giganti (`TRANSIT_COORDS`, per ora a zero)
5. **La data** in 3D (three.js) davanti alla sfera di cristallo rossa: parte da `00/00/0000` e si ferma su `30/01/2027`
6. **Zoom** dentro la sfera, anelli e scie di stelle, fino al cielo stellato (la sfera sparisce)
7. **THIS TIME IT WILL BE A FABLE** gigante in Impact, scritta a macchina: ogni lettera si forma dal fumo (three.js)

## Struttura
- `src/components/DitherBg.jsx` — lo sfondo, che è anche l'effetto: materia fbm in dither Bayer (da Dither) + filamenti di plasma, flare e polvere (dalla CrystalBall). Legge i valori da `fx`
- `src/timeline.js` — la regia: tutta la sequenza in un'unica timeline, con i tempi in unità (≈ secondi)
- `src/lib/fx.js` — stato condiviso animato dallo scroll (posizione dell'onda, raggio della macchia, warp…)
- `src/lib/palettes.js` — palette delle scene, per il testo (variabili CSS) e per lo shader
- `src/content.js` — testi, coordinate (per ora segnaposto) e data
- `src/scenes/` — Ready, Coming, DateScene, Fable (solo testo: gli effetti sono nello sfondo)
- `src/components/CrystalBall.jsx` — la sfera di cristallo (ogl), con in più il prop `drive` letto a ogni frame: colore, misura, posizione, dissolvenza e carica
- `src/components/Ball.jsx` — collega la sfera a `fx`: compare con la data e si attraversa nello zoom
- `src/three/` — livello three.js: `flapBoard.js` è il pannello 3D della data (luci, ombre, alette vere), `smokeText.js` il fumo della frase finale
- `src/components/OrbText.jsx` — le scritte sono fatte solo di orb dello sfondo (elementi `data-orb`): volano in posizione, prendono il colore della frase e restano lì; il testo DOM resta invisibile (layout e lettori di schermo). La data è esclusa
- `src/components/StoneText3D.jsx` — la scritta iniziale in pietra (three.js); la geometria si scolpisce in un Web Worker (`src/three/stoneWorker.js` + `stoneGeometry.js`) per non bloccare la pagina; lo sgretolamento lo comanda la timeline (`fx.stone`)
- `src/scenes/Transit.jsx` — il passaggio: `Noise.jsx` (React Bits) e le coordinate giganti
- `src/components/Strands.jsx` + `Lake.jsx` — il lago di Strands, per ora non usato nella sequenza
- `src/components/CrystalWave.jsx` — la stessa sfera ma a forma d'onda: filamenti, flare, archi e polvere lungo una linea orizzontale; `Wave.jsx` la usa per la cresta che scende e per la superficie
- `src/components/` — SplitFlap, Decrypt

Lunghezza dello scroll: `SCROLL_PER_UNIT` in `src/App.jsx` (vh di scroll per unità di timeline).

## Accessibilità e prestazioni
`prefers-reduced-motion` rallenta lo sfondo e ferma le animazioni continue; lo scroll resta il comando della sequenza. Lo sfondo limita i pixel renderizzati (≈4,5 MP, come la CrystalBall).
