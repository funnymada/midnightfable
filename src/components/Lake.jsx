import Strands from './Strands.jsx';
import { useFx } from '../lib/fx.js';

// Il lago: il vetro di Strands schiacciato in prospettiva e appoggiato sull'acqua.
// Si apre sulla superficie e si allarga fino a coprire lo schermo: è il passaggio verso la data.
export default function Lake() {
  const on = useFx(f => f.lake);
  const size = useFx(f => f.lakeSize);
  const squash = useFx(f => f.lakeSquash);
  const y = useFx(f => f.lakeY);
  const energy = useFx(f => f.lakeEnergy);
  if (on <= 0.001) return null;
  return (
    <div className="fx-layer lake-layer" style={{ transform: `translateY(${(y - 0.5) * 100}vh) scaleY(${squash})` }}>
      <Strands glassSize={size} opacity={on} energy={energy} intensity={1.3} interactive={false} clickPulse={false} />
    </div>
  );
}
