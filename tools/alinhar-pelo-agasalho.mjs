// Acha onde a foto "de capacete" encaixa na foto "sem capacete" usando o
// AGASALHO, que é o mesmo nas duas (serve quando o visor é escuro e não dá
// para alinhar pelos olhos). Testa escalas e posições e fica com a que deixa
// as cores do agasalho mais parecidas. Imprime PONTOS_CAP / PONTOS_HERO para
// colar em tools/montar-capacete.mjs.
//
// Uso: node tools/alinhar-pelo-agasalho.mjs
import sharp from 'sharp';

const CAPACETE = 'arte/senna-capacete-agasalho-original.jpg';
const SEM = 'arte/senna-agasalho-original.jpg';
// Ponto de partida: topo do zíper nas duas fotos
const ZIPER_CAP = [1028, 1006], ZIPER_SEM = [1042, 1610];
// Faixa do agasalho na foto do capacete (abaixo do capacete)
const AREA = { x0: 450, x1: 1600, y0: 975, y1: 1110 };
// Mesma conta de tools/montar-foto.mjs (foto sem capacete -> moldura do hero)
const OLHOS_MEIO_SEM = [1028, 873], ESCALA_HERO = 0.772, MEIO_HERO = [1005, 883];

const A = await sharp(SEM).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const C = await sharp(CAPACETE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const WA = A.info.width, HA = A.info.height, WC = C.info.width;
const px = (buf, W, x, y) => { const i = ((y | 0) * W + (x | 0)) * 3; return [buf[i], buf[i + 1], buf[i + 2]]; };

const amostras = [];
for (let y = AREA.y0; y < AREA.y1; y += 5) for (let x = AREA.x0; x < AREA.x1; x += 7) {
  const [r, g, b] = px(C.data, WC, x, y);
  if (r + g + b > 690) continue; // fundo branco
  amostras.push([x, y, r, g, b]);
}
// diferença média de cor com a escala "e" e o deslocamento (dx, dy)
const diferenca = (e, dx, dy) => {
  let s = 0;
  for (const [x, y, r, g, b] of amostras) {
    const ax = ZIPER_SEM[0] + dx + (x - ZIPER_CAP[0]) * e, ay = ZIPER_SEM[1] + dy + (y - ZIPER_CAP[1]) * e;
    if (ax < 0 || ay < 0 || ax >= WA || ay >= HA) { s += 120; continue; }
    const [r2, g2, b2] = px(A.data, WA, ax, ay);
    s += Math.abs(r - r2) + Math.abs(g - g2) + Math.abs(b - b2);
  }
  return s / amostras.length;
};
let melhor = [Infinity];
for (let e = 1.2; e <= 2.0; e += 0.02) for (let dx = -80; dx <= 80; dx += 4) for (let dy = -80; dy <= 80; dy += 4) {
  const v = diferenca(e, dx, dy); if (v < melhor[0]) melhor = [v, e, dx, dy];
}
const [, e0, x0, y0] = melhor;
for (let e = e0 - 0.02; e <= e0 + 0.02; e += 0.004) for (let dx = x0 - 4; dx <= x0 + 4; dx++) for (let dy = y0 - 4; dy <= y0 + 4; dy++) {
  const v = diferenca(e, dx, dy); if (v < melhor[0]) melhor = [v, e, dx, dy];
}
const [dif, e, dx, dy] = melhor;
console.log(`diferença ${dif.toFixed(1)} (encaixe ruim fica perto de ${diferenca(e, dx + 60, dy + 60).toFixed(0)}), escala ${e.toFixed(3)}, desloc. ${dx}, ${dy}`);

// dois pontos da foto do capacete -> moldura do hero
const paraHero = ([x, y]) => {
  const ax = ZIPER_SEM[0] + dx + (x - ZIPER_CAP[0]) * e, ay = ZIPER_SEM[1] + dy + (y - ZIPER_CAP[1]) * e;
  return [+(MEIO_HERO[0] + (ax - OLHOS_MEIO_SEM[0]) * ESCALA_HERO).toFixed(1), +(MEIO_HERO[1] + (ay - OLHOS_MEIO_SEM[1]) * ESCALA_HERO).toFixed(1)];
};
const P = [ZIPER_CAP, [ZIPER_CAP[0] + 100, ZIPER_CAP[1]]];
console.log(`const PONTOS_CAP = ${JSON.stringify(P)};`);
console.log(`const PONTOS_HERO = ${JSON.stringify(P.map(paraHero))};`);
