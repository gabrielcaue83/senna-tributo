// Limpa a textura de cor de um GLB gerado por IA: cada pixel vira a cor
// sólida mais próxima de uma paleta (amarelo, verde, azul...), as manchas
// soltas somem e o relevo falso (normal map) e o mapa de metal saem.
// Resultado: pintura chapada, para o brilho ser calculado ao vivo.
//
// Uso: node tools/limpar-textura.mjs <entrada.glb> <saida.glb> [previa.png]
import { NodeIO } from '@gltf-transform/core';
import sharp from 'sharp';

const [entrada, saida, previa] = process.argv.slice(2);

// Paleta do capacete (sRGB). "peso" ajuda cores que a IA borrou mais.
const PALETA = [
  { nome: 'amarelo', hex: '#ffcc00' },
  { nome: 'verde', hex: '#00983f' },
  { nome: 'azul', hex: '#1d4fb2' },
  { nome: 'vermelho', hex: '#e2231a' },
  { nome: 'branco', hex: '#f3f3ee' },
  { nome: 'preto', hex: '#121314' },
];

// sRGB (0-255) -> Lab, para comparar cores do jeito que o olho vê
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
function lab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
PALETA.forEach((p) => { p.rgb = hexRgb(p.hex); p.lab = lab(...p.rgb); });

// Regiões no modelo (unidades do arquivo: altura 0 a 1,45; frente = +z),
// medidas olhando o capacete de frente e de lado no hero.
const REG = {
  vidro: { z: 0.3, x: 0.62, y: [0.49, 0.8] },
  // faixa azul: da lateral até a nuca, com filete branco em cima e embaixo
  azul: { z: 0.05, y: [0.43, 0.61], filete: 0.012 },
};

const io = new NodeIO();
const doc = await io.read(entrada);
const mat = doc.getRoot().listMaterials()[0];
const tex = mat.getBaseColorTexture();

// 1) leve desfoque de mediana para tirar o "granulado" antes de classificar
const { data, info } = await sharp(tex.getImage()).removeAlpha().median(3).raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;

// 2) cada pixel -> índice da cor mais próxima. A claridade (L) pesa menos,
//    porque a IA "pintou" sombra e luz na textura: amarelo escuro continua amarelo.
const rotulo = new Uint8Array(W * H);
const cache = new Map();
for (let i = 0; i < W * H; i++) {
  const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
  const k = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
  let melhor = cache.get(k);
  if (melhor === undefined) {
    const [L, A, B] = lab(r, g, b);
    const croma = Math.hypot(A, B);
    let dMin = Infinity;
    PALETA.forEach((p, j) => {
      const pesoL = croma > 25 ? 0.35 : 1; // em cores vivas, ignora mais a sombra
      const d = (pesoL * (L - p.lab[0])) ** 2 + (A - p.lab[1]) ** 2 + (B - p.lab[2]) ** 2;
      if (d < dMin) { dMin = d; melhor = j; }
    });
    cache.set(k, melhor);
  }
  rotulo[i] = melhor;
}

// 3) filtro de maioria 3×3, duas vezes: some com pontinhos soltos,
//    mas preserva filetes de 2-3 px
const moda = (src) => {
  const out = new Uint8Array(src);
  const cont = new Uint8Array(PALETA.length);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      cont.fill(0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cont[src[(y + dy) * W + x + dx]]++;
      let m = src[y * W + x], c = cont[m];
      for (let j = 0; j < cont.length; j++) if (cont[j] > c) { c = cont[j]; m = j; }
      out[y * W + x] = m;
    }
  }
  return out;
};
let limpo = moda(moda(rotulo));

// 4) regras por região do capacete 3D. Para isso, cada pixel da textura
//    descobre onde fica no modelo: os triângulos são "desenhados" no espaço
//    da textura (UV) guardando posição e normal de cada pixel.
//    Coordenadas do modelo: x = largura, y = altura (0 embaixo), z = frente.
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), T = prim.getAttribute('TEXCOORD_0');
const idx = prim.getIndices().getArray();
const pos3 = new Float32Array(W * H * 3).fill(NaN), nor3 = new Float32Array(W * H * 3);
const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
const pa = [0, 0, 0], pb = [0, 0, 0], pc = [0, 0, 0], na = [0, 0, 0], nb = [0, 0, 0], nc = [0, 0, 0];
const ua = [0, 0], ub = [0, 0], uc = [0, 0];
for (let t = 0; t < idx.length; t += 3) {
  T.getElement(idx[t], ua); T.getElement(idx[t + 1], ub); T.getElement(idx[t + 2], uc);
  P.getElement(idx[t], pa); P.getElement(idx[t + 1], pb); P.getElement(idx[t + 2], pc);
  N.getElement(idx[t], na); N.getElement(idx[t + 1], nb); N.getElement(idx[t + 2], nc);
  const x0 = ua[0] * W, y0 = ua[1] * H, x1 = ub[0] * W, y1 = ub[1] * H, x2 = uc[0] * W, y2 = uc[1] * H;
  const den = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (Math.abs(den) < 1e-9) continue;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px_ = x + 0.5, py_ = y + 0.5;
      const w0 = ((y1 - y2) * (px_ - x2) + (x2 - x1) * (py_ - y2)) / den;
      const w1 = ((y2 - y0) * (px_ - x2) + (x0 - x2) * (py_ - y2)) / den;
      const w2 = 1 - w0 - w1;
      if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
      const i = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) {
        pos3[i + k] = pa[k] * w0 + pb[k] * w1 + pc[k] * w2;
        nor3[i + k] = na[k] * w0 + nb[k] * w1 + nc[k] * w2;
      }
    }
  }
}
const iCor = (nome) => PALETA.findIndex((p) => p.nome === nome);
const PRETO = iCor('preto'), AZUL = iCor('azul'), BRANCO = iCor('branco');
let nVidro = 0, nAzul = 0;
for (let i = 0; i < W * H; i++) {
  const x = pos3[i * 3], y = pos3[i * 3 + 1], z = pos3[i * 3 + 2];
  if (Number.isNaN(x)) continue;
  // só a casca de fora: a normal aponta para longe do eixo do capacete
  const rl = Math.hypot(x, z) || 1;
  const fora = (nor3[i * 3] * x + nor3[i * 3 + 2] * z) / rl > 0.25;
  if (!fora) continue;
  // vidro da viseira: tudo preto (a IA pintou reflexos brancos nele)
  if (z > REG.vidro.z && Math.abs(x) < REG.vidro.x && y > REG.vidro.y[0] && y < REG.vidro.y[1]) {
    if (limpo[i] !== PRETO) { limpo[i] = PRETO; nVidro++; }
    continue;
  }
  // faixa azul contínua nas laterais e na nuca (a IA deixou só uma mancha
  // escura no lugar): o miolo vira azul e as bordas viram filete branco
  const az = REG.azul;
  if (z < az.z && y > az.y[0] - az.filete && y < az.y[1] + az.filete) {
    const borda = y < az.y[0] || y > az.y[1];
    limpo[i] = borda ? BRANCO : AZUL;
    nAzul++;
  }
}
console.log('regras: vidro', nVidro, 'px · azul', nAzul, 'px');
limpo = moda(limpo);

const px = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) {
  const c = PALETA[limpo[i]].rgb;
  px[i * 3] = c[0]; px[i * 3 + 1] = c[1]; px[i * 3 + 2] = c[2];
}
const png = await sharp(px, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
if (previa) await sharp(png).resize(1024).toFile(previa);

const contagem = PALETA.map((p, j) => `${p.nome} ${(limpo.filter((v) => v === j).length / (W * H) * 100).toFixed(1)}%`);
console.log('cores:', contagem.join(' · '));

// 4) troca a textura e simplifica o material
tex.setImage(png).setMimeType('image/png');
const normal = mat.getNormalTexture();
const mr = mat.getMetallicRoughnessTexture();
mat.setNormalTexture(null).setMetallicRoughnessTexture(null).setMetallicFactor(0).setRoughnessFactor(0.35);
normal?.dispose(); mr?.dispose();
await io.write(saida, doc);
console.log('ok', saida);
