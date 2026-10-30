// Recorta SÓ o capacete da foto "Senna de capacete" e encaixa na moldura da
// foto do hero (2000 × 1600) por dois pontos correspondentes. O corpo fica de
// fora: só o capacete aparece na revelação, por cima do agasalho.
//
// Gera:
//  - public/fotos/senna-capacete.webp               capacete com transparência
//  - public/fotos/senna-capacete-profundidade.png   volume do capacete (giro 3D)
//  - (com --conferir) uma prévia do capacete por cima da foto do hero
//
// Uso: node tools/montar-capacete.mjs [--conferir pasta]
import sharp from 'sharp';

// (a primeira foto, de visor aberto e macacão, era arte/senna-capacete-original.jpg,
// encaixada pelos olhos; esta tem visor escuro e o mesmo agasalho da foto do hero)
const ENTRADA = 'arte/senna-capacete-agasalho-original.jpg';
const HERO = 'public/fotos/senna-hero.jpg';
const SAIDA = 'public/fotos/senna-capacete.webp';
const SAIDA_PROF = 'public/fotos/senna-capacete-profundidade.png';
const conferir = process.argv.includes('--conferir') ? process.argv[process.argv.indexOf('--conferir') + 1] : null;

// Encaixe: dois pontos da foto do capacete e onde eles caem na moldura do
// hero. Saem de tools/alinhar-pelo-agasalho.mjs (o agasalho é o mesmo nas
// duas fotos). Com visor aberto dá para usar as pupilas das duas fotos.
const PONTOS_CAP = [[1028, 1006], [1128, 1006]];
const PONTOS_HERO = [[1022.8, 1465.1], [1144.7, 1465.1]];
// Ajuste fino depois do encaixe (px da moldura): na foto da IA o capacete
// ficou um pouco à esquerda do corpo; isto o centraliza no rosto/agasalho.
const DESLOCAR = [18, 0];
// Borda de baixo do capacete (aro preto embaixo do patrocinador), na foto do
// capacete. Abaixo dela é pescoço e agasalho, que ficam de fora.
const BASE = [
  [660, 790], [700, 828], [725, 862], [750, 885], [775, 900], [810, 912], [860, 924],
  [920, 934], [980, 939], [1030, 940], [1083, 936], [1130, 929], [1167, 920], [1200, 909],
  [1230, 896], [1252, 880], [1270, 862], [1288, 838], [1300, 815], [1320, 790],
];
// perto da borda de baixo, qualquer vermelho é roupa (o capacete não tem
// vermelho embaixo): sai também
const FAIXA_VERMELHO = 60;
const FUNDO_TOL = 30;  // quão parecido com o fundo um pixel precisa ser para sair
const BORDA = 2.5;     // suavização da borda (px)
const FINAL = { w: 2000, h: 1600 };

// ---------- 1. máscara do capacete na foto original ----------
const { data, info } = await sharp(ENTRADA).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;

// fundo: tudo ligado às bordas de cima/lados com a cor parecida com a do fundo
const amostra = [[15, 15], [W - 15, 15], [15, 700], [W - 15, 700], [W / 2, 30]];
const bg = [0, 1, 2].map((c) => amostra.reduce((s, [x, y]) => s + data[(Math.floor(y) * W + Math.floor(x)) * 3 + c], 0) / amostra.length);
const dist = (p) => Math.hypot(data[p * 3] - bg[0], data[p * 3 + 1] - bg[1], data[p * 3 + 2] - bg[2]);
const fundo = new Uint8Array(W * H);
const fila = new Int32Array(W * H);
let ini = 0, fim = 0;
const semear = (x, y) => { const p = y * W + x; if (!fundo[p] && dist(p) < FUNDO_TOL) { fundo[p] = 1; fila[fim++] = p; } };
for (let x = 0; x < W; x++) semear(x, 0);
for (let y = 0; y < H * 0.7; y++) { semear(0, y); semear(W - 1, y); }
while (ini < fim) {
  const p = fila[ini++], x = p % W, y = (p / W) | 0;
  if (x > 0) semear(x - 1, y);
  if (x < W - 1) semear(x + 1, y);
  if (y > 0) semear(x, y - 1);
  if (y < H - 1) semear(x, y + 1);
}

// borda de baixo: curva suave (Catmull-Rom) passando pelos pontos BASE
const baseEm = (x) => {
  if (x <= BASE[0][0]) return BASE[0][1];
  if (x >= BASE.at(-1)[0]) return BASE.at(-1)[1];
  let i = 0;
  while (BASE[i + 1][0] < x) i++;
  const p0 = BASE[Math.max(0, i - 1)], p1 = BASE[i], p2 = BASE[i + 1], p3 = BASE[Math.min(BASE.length - 1, i + 2)];
  const t = (x - p1[0]) / (p2[0] - p1[0]), t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
};

// alfa: 1 no capacete, 0 no fundo e abaixo da curva (com borda macia)
const alfa = new Float32Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (fundo[p]) continue;
    const b = baseEm(x);
    const r = data[p * 3], g = data[p * 3 + 1];
    if (y > b - FAIXA_VERMELHO && r > 110 && g < 0.55 * r) continue; // macacão
    alfa[p] = Math.min(1, Math.max(0, (b - y) / BORDA + 0.5));
  }
}
// suaviza a borda do recorte do fundo (caixa 5×5) sem mexer no miolo
const alfaSuave = new Float32Array(W * H);
const R = 2;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    let s = 0, n = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      s += alfa[yy * W + xx]; n++;
    }
    alfaSuave[y * W + x] = s / n;
  }
}

// ---------- 2. encaixe na moldura do hero (escala + giro + posição) ----------
// semelhança que leva os pontos da foto do capacete para os do hero
const [[a1x, a1y], [a2x, a2y]] = PONTOS_CAP;
const [[b1x, b1y], [b2x, b2y]] = PONTOS_HERO;
const escala = Math.hypot(b2x - b1x, b2y - b1y) / Math.hypot(a2x - a1x, a2y - a1y);
const giro = Math.atan2(b2y - b1y, b2x - b1x) - Math.atan2(a2y - a1y, a2x - a1x);
const ca = Math.cos(giro), sa = Math.sin(giro);
const cxA = (a1x + a2x) / 2, cyA = (a1y + a2y) / 2;
const cxB = (b1x + b2x) / 2 + DESLOCAR[0], cyB = (b1y + b2y) / 2 + DESLOCAR[1];
console.log(`escala ${escala.toFixed(4)}, giro ${(giro * 180 / Math.PI).toFixed(2)}°`);

const amostrar = (x, y) => { // bilinear na foto original (rgb + alfa)
  if (x < 0 || y < 0 || x >= W - 1 || y >= H - 1) return [0, 0, 0, 0];
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const out = [0, 0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const p = (y0 + dy) * W + x0 + dx;
    out[0] += data[p * 3] * w; out[1] += data[p * 3 + 1] * w; out[2] += data[p * 3 + 2] * w;
    out[3] += alfaSuave[p] * w;
  }
  return out;
};

const saida = Buffer.alloc(FINAL.w * FINAL.h * 4);
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (let y = 0; y < FINAL.h; y++) {
  for (let x = 0; x < FINAL.w; x++) {
    // ponto do hero -> ponto da foto do capacete (inversa da semelhança)
    const dx = (x - cxB) / escala, dy = (y - cyB) / escala;
    const sx = cxA + dx * ca + dy * sa, sy = cyA - dx * sa + dy * ca;
    const [r, g, b, a] = amostrar(sx, sy);
    const o = (y * FINAL.w + x) * 4;
    saida[o] = r; saida[o + 1] = g; saida[o + 2] = b; saida[o + 3] = Math.round(a * 255);
    if (a > 0.5) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  }
}
await sharp(saida, { raw: { width: FINAL.w, height: FINAL.h, channels: 4 } })
  .webp({ quality: 90, alphaQuality: 95 }).toFile(SAIDA);
const caixa = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY, minX, maxX, minY, maxY };
console.log('capacete na foto do hero:', JSON.stringify(caixa));

// ---------- 3. profundidade do capacete (claro = perto) ----------
// Um elipsoide do tamanho do capacete. Fica na mesma escala da foto do rosto:
// 0,45 = não se mexe (meio da cabeça), 1 = frente do capacete.
const ESC = 0.25, PW = FINAL.w * ESC, PH = FINAL.h * ESC;
const cx = caixa.x, cy = caixa.minY + caixa.h * 0.47, rx = caixa.w * 0.53, ry = caixa.h * 0.56;
const prof = Buffer.alloc(PW * PH);
for (let y = 0; y < PH; y++) {
  for (let x = 0; x < PW; x++) {
    const u = ((x / ESC - cx) / rx) ** 2 + ((y / ESC - cy) / ry) ** 2;
    const d = 0.45 + 0.55 * Math.sqrt(Math.max(0, 1 - u));
    prof[y * PW + x] = Math.round(Math.min(1, d) * 255);
  }
}
await sharp(prof, { raw: { width: PW, height: PH, channels: 1 } }).blur(4).png().toFile(SAIDA_PROF);
// copiar para ELIPSE em src/capacete.js (curvatura do brilho)
// (z = profundidade da casca, proporcional à largura)
console.log('ELIPSE =', JSON.stringify({ x: Math.round(cx), y: Math.round(cy), rx: Math.round(rx), ry: Math.round(ry), z: Math.round(rx * 0.835) }));
console.log('ok', SAIDA, SAIDA_PROF);

// ---------- prévia: capacete por cima da foto do hero ----------
if (conferir) {
  const junto = await sharp(HERO).resize(FINAL.w, FINAL.h, { fit: 'fill' })
    .composite([{ input: SAIDA }]).png().toBuffer();
  await sharp(junto).resize(1000).toFile(`${conferir}/previa-capacete.jpg`);
  console.log('prévia em', `${conferir}/previa-capacete.jpg`);
}
