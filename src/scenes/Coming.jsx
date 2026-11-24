import { LINES } from '../content.js';

const DROPS = [18, 31, 46, 58, 72, 84];

// Scena 2 — la scritta affiora dalla linea dell'acqua (disegnata dallo sfondo), con il riflesso capovolto sotto
export default function Coming() {
  return (
    <section className="scene s-coming">
      <div className="surface">
        <div className="emerge">
          <div className="glow">
            <h2 className="title tone-text coming-title" data-orb="coming">{LINES.coming}</h2>
          </div>
        </div>
        <div className="drops" aria-hidden="true">
          {DROPS.map(left => (
            <span key={left} className="drop" style={{ left: `${left}%` }} />
          ))}
        </div>
        <div className="reflection" aria-hidden="true">
          <span className="title tone-text coming-title reflection-title" data-orb-follow="coming">{LINES.coming}</span>
        </div>
      </div>
    </section>
  );
}
