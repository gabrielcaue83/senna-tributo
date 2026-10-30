// Encaixa a foto do Senna (SEM capacete) na moldura do hero (2000 × 1600):
// escala e posiciona pelos olhos, remove o fundo claro e gera
//  - public/fotos/senna-hero.jpg   (moldura com o fundo, base para as prévias)
//  - public/fotos/senna-hero.webp  (com transparência, a usada no site)
//
// Depois de trocar a foto, rode também (com os olhos novos):
//   node tools/mapa-profundidade.mjs public/fotos/senna-hero.webp public/fotos/senna-profundidade.png
//   node tools/montar-capacete.mjs
// e atualize CAP/ELIPSE em src/capacete.js.
//
// Uso: node tools/montar-foto.mjs [--conferir pasta]
import sharp from 'sharp';

// (antes: arte/senna-agasalho-original.jpg, olhos [[865, 872], [1191, 874]],
// escala 0,772, suavização 5 — esta é a versão mais nítida da mesma foto)
const ENTRADA = 'arte/senna-agasalho-nitida-original.jpg';
const SAIDA_JPG = 'public/fotos/senna-hero.jpg';
const SAIDA_WEBP = 'public/fotos/senna-hero.webp';
const conferir = process.argv.includes('--conferir') ? process.argv[process.argv.indexOf('--conferir') + 1] : null;

// Pupilas na foto original e onde o meio delas fica na moldura.
// A escala deixa a cabeça um pouco maior que a da foto antiga e ainda faz a
// foto chegar até a base da moldura (o capacete continua cabendo em cima).
// (escala e meio escolhidos para os olhos caírem em [[879, 882], [1131, 884]]
// na moldura, como na foto anterior: capacete e wireframe continuam no lugar)
const OLHOS = [[876, 871], [1194, 871]];
const ESCALA = 0.7925;
const MEIO = [1005, 883];
const FINAL = { w: 2000, h: 1600 };
const LADOS = 120;  // px da original: os ombros somem aos poucos onde a foto acaba
const FUNDO_TOL = 34;
// Suaviza as "rachaduras" de IA só na pele (cabelo, sobrancelha e olhos ficam).
// 0 desliga. PELE_MEDIANA = tamanho do filtro (3 = leve, mantém a nitidez; 5 = forte).
const PELE = 1;
const PELE_MEDIANA = 3;

// ---------- 1. foto original (com a pele suavizada) ----------
const orig = await sharp(ENTRADA).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = orig.info.width, H = orig.info.height;
const src = Buffer.from(orig.data);
if (PELE > 0) {
  const med = await sharp(ENTRADA).removeAlpha().median(PELE_MEDIANA).raw().toBuffer();
  for (let p = 0; p < W * H; p++) {
    const r = src[p * 3], g = src[p * 3 + 1], b = src[p * 3 + 2];
    const l = 0.3 * r + 0.59 * g + 0.11 * b;
    // tons de pele: quente, nem escuro (cabelo) nem quase branco (fundo)
    const pele = r > 95 && g > 40 && b > 20 && r > g && r > b && r - g > 12 && l > 85 && l < 230;
    if (!pele) continue;
    const k = PELE * Math.min(1, (l - 85) / 25) * Math.min(1, (230 - l) / 25);
    for (let c = 0; c < 3; c++) src[p * 3 + c] = Math.round(src[p * 3 + c] * (1 - k) + med[p * 3 + c] * k);
  }
}

// ---------- 2. moldura do hero ----------
const cxO = (OLHOS[0][0] + OLHOS[1][0]) / 2, cyO = (OLHOS[0][1] + OLHOS[1][1]) / 2;
const bg = [0, 1, 2].map((c) => [[20, 20], [W - 20, 20], [W / 2, 20], [20, 500], [W - 20, 500]]
  .reduce((s, [x, y]) => s + src[(y * W + x) * 3 + c], 0) / 5);
const suave = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const rgb = Buffer.alloc(FINAL.w * FINAL.h * 3);
const lados = new Float32Array(FINAL.w * FINAL.h); // 1 = dentro da foto, some nas bordas laterais
for (let y = 0; y < FINAL.h; y++) {
  for (let x = 0; x < FINAL.w; x++) {
    const sx = cxO + (x - MEIO[0]) / ESCALA, sy = cyO + (y - MEIO[1]) / ESCALA;
    const o = y * FINAL.w + x;
    if (sx < 0 || sy < 0 || sx > W - 1.001 || sy > H - 1.001) {
      rgb[o * 3] = bg[0]; rgb[o * 3 + 1] = bg[1]; rgb[o * 3 + 2] = bg[2];
      continue;
    }
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
    for (let c = 0; c < 3; c++) {
      const v = (src[(y0 * W + x0) * 3 + c] * (1 - fx) + src[(y0 * W + x0 + 1) * 3 + c] * fx) * (1 - fy)
        + (src[((y0 + 1) * W + x0) * 3 + c] * (1 - fx) + src[((y0 + 1) * W + x0 + 1) * 3 + c] * fx) * fy;
      rgb[o * 3 + c] = Math.round(v);
    }
    lados[o] = suave(sx / LADOS) * suave((W - 1 - sx) / LADOS);
  }
}
await sharp(rgb, { raw: { width: FINAL.w, height: FINAL.h, channels: 3 } }).jpeg({ quality: 92 }).toFile(SAIDA_JPG);

// ---------- 3. tira o fundo (preenche a partir das bordas) ----------
const dist = (p) => Math.hypot(rgb[p * 3] - bg[0], rgb[p * 3 + 1] - bg[1], rgb[p * 3 + 2] - bg[2]);
const fundo = new Uint8Array(FINAL.w * FINAL.h);
const fila = new Int32Array(FINAL.w * FINAL.h);
let ini = 0, fim = 0;
const semear = (x, y) => { const p = y * FINAL.w + x; if (!fundo[p] && dist(p) < FUNDO_TOL) { fundo[p] = 1; fila[fim++] = p; } };
for (let x = 0; x < FINAL.w; x++) semear(x, 0);
for (let y = 0; y < FINAL.h; y++) { semear(0, y); semear(FINAL.w - 1, y); }
while (ini < fim) {
  const p = fila[ini++], x = p % FINAL.w, y = (p / FINAL.w) | 0;
  if (x > 0) semear(x - 1, y);
  if (x < FINAL.w - 1) semear(x + 1, y);
  if (y > 0) semear(x, y - 1);
  if (y < FINAL.h - 1) semear(x, y + 1);
}
const R = 2;
const rgba = Buffer.alloc(FINAL.w * FINAL.h * 4);
for (let y = 0; y < FINAL.h; y++) {
  for (let x = 0; x < FINAL.w; x++) {
    let s = 0, n = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= FINAL.w || yy >= FINAL.h) continue;
      s += fundo[yy * FINAL.w + xx]; n++;
    }
    const o = y * FINAL.w + x;
    rgba[o * 4] = rgb[o * 3]; rgba[o * 4 + 1] = rgb[o * 3 + 1]; rgba[o * 4 + 2] = rgb[o * 3 + 2];
    rgba[o * 4 + 3] = Math.round(255 * (1 - s / n) * lados[o]);
  }
}
await sharp(rgba, { raw: { width: FINAL.w, height: FINAL.h, channels: 4 } })
  .webp({ quality: 88, alphaQuality: 90 }).toFile(SAIDA_WEBP);

const olho = ([x, y]) => [Math.round(MEIO[0] + (x - cxO) * ESCALA), Math.round(MEIO[1] + (y - cyO) * ESCALA)];
console.log('olhos na moldura (OLHOS_HERO do montar-capacete):', JSON.stringify(OLHOS.map(olho)));
console.log('base da foto original na moldura: y =', Math.round(MEIO[1] + (H - 1 - cyO) * ESCALA));
console.log('ok', SAIDA_JPG, SAIDA_WEBP);

if (conferir) {
  const fundoTela = await sharp({ create: { width: FINAL.w, height: FINAL.h, channels: 3, background: '#f2efe3' } }).png().toBuffer();
  const junto = await sharp(fundoTela).composite([{ input: SAIDA_WEBP }]).png().toBuffer();
  await sharp(junto).resize(1000).toFile(`${conferir}/previa-foto.jpg`);
  console.log('prévia em', `${conferir}/previa-foto.jpg`);
}
