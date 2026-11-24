import SplitFlap from '../components/SplitFlap.jsx';
import { DATE } from '../content.js';

// Scena 3 — la data su un pannello a tessere; poi la camera entra nella seconda barra
export default function DateScene() {
  return (
    <section className="scene s-date">
      <div className="date-zoom">
        <SplitFlap text={DATE} />
        <div className="hairline date-line" />
      </div>
    </section>
  );
}
