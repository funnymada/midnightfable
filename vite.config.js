import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve } from 'node:path';

// Due pagine: il sito (index.html, su /) e il gioco dell'Impostore (impostor/index.html, su /impostor)
const pages = {
  main: resolve(import.meta.dirname, 'index.html'),
  impostor: resolve(import.meta.dirname, 'impostor/index.html')
};

// /impostor senza barra finale porta a /impostor/ (in sviluppo e in anteprima; sull'hosting lo fa la cartella dist/impostor)
const slash = (req, res, next) => {
  const [path, query] = req.url.split('?');
  if (path !== '/impostor') return next();
  res.statusCode = 301;
  res.setHeader('Location', '/impostor/' + (query ? '?' + query : ''));
  res.end();
};
const impostorSlash = {
  name: 'impostor-slash',
  configureServer: server => void server.middlewares.use(slash),
  configurePreviewServer: server => void server.middlewares.use(slash)
};

// `npm run build:single` produce un unico index.html autosufficiente (anteprime, hosting statico minimale)
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), impostorSlash, ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: {
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 1200,
    ...(mode === 'single' ? {} : { rollupOptions: { input: pages } })
  }
}));
