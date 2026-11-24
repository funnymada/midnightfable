import Noise from '../components/Noise.jsx';
import { useFx } from '../lib/fx.js';
import { TRANSIT_COORDS } from '../content.js';

// Passaggio verso la data: fondo scuro con la grana di Noise sopra, al centro le coordinate giganti.
// Noise viene montato solo durante il passaggio.
export default function Transit() {
  const on = useFx(f => f.transit);
  const live = on > 0.001;
  return (
    <section className="scene s-transit" style={{ opacity: on, visibility: live ? 'visible' : 'hidden' }}>
      {live && <Noise opacity={0.32} blendMode="overlay" contrast={0.8} dust={0.25} scratches={0.4} flicker={0.3} scanlines={0.2} />}
      <h2 className="transit-coords" aria-label={TRANSIT_COORDS.join(', ')}>
        {TRANSIT_COORDS.map((c, i) => (
          <span key={i} className="transit-mask" aria-hidden="true">
            <span className="transit-line" data-orb="transit">{c}</span>
          </span>
        ))}
      </h2>
    </section>
  );
}
