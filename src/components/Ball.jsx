import CrystalBall from './CrystalBall.jsx';
import { fx } from '../lib/fx.js';

// La sfera di cristallo guidata dallo scroll: legge `fx` a ogni frame, senza re-render
const drive = () => {
  return {
    color: [fx.ball0 / 255, fx.ball1 / 255, fx.ball2 / 255],
    size: fx.ballSize,
    x: fx.ballX,
    y: fx.ballY,
    fade: fx.ballFade,
    charge: fx.ballCharge
  };
};

export default function Ball() {
  return <CrystalBall preset="solar" className="ball-layer" particleCount={15000} drive={drive} />;
}
