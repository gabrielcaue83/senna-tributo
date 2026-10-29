import { defineConfig } from 'vite';

// No GitHub Pages o site fica em gabrielcaue83.github.io/senna-tributo/,
// então o build (e o `npm run preview`) usa esse prefixo. No `npm run dev`
// continua na raiz.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/senna-tributo/' : '/',
}));
