// Remove o fundo claro da foto do hero e gera um WebP com transparência.
// Preenche a partir das bordas (flood fill) tudo que for parecido com a cor do fundo,
// e suaviza a borda para não ficar serrilhada.
import sharp from 'sharp';

const [entrada, saida] = process.argv.slice(2);
const { data, info } = await sharp(entrada).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;

// cor média do fundo: amostras dos cantos de cima
const amostra = [[20, 20], [W - 20, 20], [20, 400], [W - 20, 400], [W / 2, 20]];
const bg = [0, 1, 2].map((c) => amostra.reduce((s, [x, y]) => s + data[(Math.floor(y) * W + Math.floor(x)) * 4 + c], 0) / amostra.length);
console.log('fundo', bg.map(Math.round));

const dist = (i) => Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
const TOL = 34;
const fundo = new Uint8Array(W * H);
const fila = new Int32Array(W * H);
let ini = 0, fim = 0;
const semear = (x, y) => { const p = y * W + x; if (!fundo[p] && dist(p * 4) < TOL) { fundo[p] = 1; fila[fim++] = p; } };
for (let x = 0; x < W; x++) { semear(x, 0); }
for (let y = 0; y < H * 0.75; y++) { semear(0, y); semear(W - 1, y); }
while (ini < fim) {
  const p = fila[ini++], x = p % W, y = (p / W) | 0;
  if (x > 0) semear(x - 1, y);
  if (x < W - 1) semear(x + 1, y);
  if (y > 0) semear(x, y - 1);
  if (y < H - 1) semear(x, y + 1);
}

// máscara suave: desfoca a máscara binária com uma caixa 5x5
const R = 2;
const out = Buffer.from(data);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      s += fundo[yy * W + xx]; n++;
    }
    out[(y * W + x) * 4 + 3] = Math.round(255 * (1 - s / n));
  }
}
await sharp(out, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 88, alphaQuality: 90 }).toFile(saida);
console.log('ok', saida);
