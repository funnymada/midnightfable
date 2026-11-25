import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import DevGate from './DevGate.jsx'; // DevGate: si può cancellare insieme a src/DevGate.jsx
import { DEVMODE } from './lib/flags.js';
import './index.css';

// Con la feature flag devmode (VITE_DEVMODE=true nel .env) il sito parte dopo aver scritto la password (DevGate),
// anche nella build; con devmode=false parte subito.
// Per togliere DevGate: cancellare src/DevGate.jsx, l'import qui sopra e sostituire `site` con <App />.
const site = DEVMODE ? (
  <DevGate>
    <App />
  </DevGate>
) : (
  <App />
);

createRoot(document.getElementById('root')).render(<StrictMode>{site}</StrictMode>);
