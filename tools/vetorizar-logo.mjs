// Transforma a logo (imagem pequena, preto no branco) em SVG com uma <path>
// para cada forma (o "S" duplo e cada letra), para o preloader poder
// desenhar uma por uma.
// Uso: node tools/vetorizar-logo.mjs arte/logo-senna.png src/logo-senna.svg
import fs from 'node:fs';
import sharp from 'sharp';
import potrace from 'potrace';

const [entrada, saida] = process.argv.slice(2);
const ESCALA = 10;

// amplia com suavização e "endurece" o contraste: curvas lisas no traçado
const meta = await sharp(entrada).metadata();
const ampliada = await sharp(entrada)
  .flatten({ background: '#ffffff' })
  .grayscale()
  .resize(meta.width * ESCALA, meta.height * ESCALA, { kernel: 'lanczos3' })
  .blur(2.2)
  .threshold(140)
  .png()
  .toBuffer();

const svg = await new Promise((ok, erro) =>
  potrace.trace(ampliada, { turdSize: 60, optTolerance: 0.4, alphaMax: 1, threshold: 128 }, (e, s) => (e ? erro(e) : ok(s))));

// separa cada forma (subcaminho que começa com M) numa <path> própria
const d = svg.match(/ d="([^"]+)"/)[1];
const partes = d.split(/(?=M)/).map((p) => p.trim()).filter(Boolean);

// agrupa buracos com a forma de fora: um subcaminho dentro do anterior é buraco
// (as letras desta logo não têm buracos, então cada parte vira uma forma)
const W = meta.width * ESCALA, H = meta.height * ESCALA;
const caixa = (p) => {
  const nums = p.match(/-?\d+(\.\d+)?/g).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
};
const formas = partes.map((p) => ({ d: p, c: caixa(p) }));
// ordem de desenho: de cima para baixo, e da esquerda para a direita
formas.sort((a, b) => (Math.abs(a.c.y - b.c.y) > H * 0.12 ? a.c.y - b.c.y : a.c.x - b.c.x));

const corpo = formas.map((f, i) => `  <path class="logo-forma" data-i="${i}" d="${f.d}"/>`).join('\n');
const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill-rule="evenodd">\n${corpo}\n</svg>\n`;
fs.writeFileSync(saida, out);
console.log('ok', saida, formas.length, 'formas', formas.map((f) => `${Math.round(f.c.w)}x${Math.round(f.c.h)}`).join(' '));
