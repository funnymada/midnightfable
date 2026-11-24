// Web Worker: scolpisce le lettere di pietra fuori dal thread principale (circa 3 s di calcolo)
import { buildStone } from './stoneGeometry.js';
import fontJson from '../assets/fonts/droid_serif_bold.typeface.json';

self.onmessage = ({ data }) => {
  const result = buildStone(fontJson, data.lines, data.part ?? 0, data.parts ?? 1);
  // gli array passano al thread principale senza copia
  const transfer = [];
  const collect = part => {
    if (!part) return;
    Object.values(part.geometry.attributes).forEach(a => transfer.push(a.array.buffer));
    if (part.geometry.index) transfer.push(part.geometry.index.buffer);
    Object.values(part.grains).forEach(a => transfer.push(a.buffer));
  };
  result.pieces.forEach(collect);
  collect(result.sphere);
  self.postMessage(result, [...new Set(transfer)]);
};
