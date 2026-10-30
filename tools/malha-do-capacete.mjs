// Monta o wireframe 3D do capacete a partir da FOTO do capacete:
//  1. o contorno da foto dá a largura do capacete em cada altura; cada altura
//     vira uma "fatia" oval (meia elipse para a frente), formando o casco;
//  2. os pontos são espalhados por igual SOBRE O CASCO em 3D (não na tela):
//     perto das bordas e do topo eles ficam espremidos na tela, como num
//     objeto redondo de verdade;
//  3. o contorno, o recorte do visor e a borda de baixo ganham pontos extras;
//  4. a triangulação é a "casca convexa" desses pontos (fica só a frente);
//  5. por fim o visor afunda um pouco (com triângulos maiores) e a queixeira
//     avança, como num capacete.
//
// Sai em public/modelos/capacete-foto-fio.glb, nas unidades que o PULSO de
// src/capacete.js usa (base = 0, topo = 1,45). Imprime o CAP para colar lá.
//
// Uso: node tools/malha-do-capacete.mjs [--conferir pasta]
import sharp from 'sharp';
import * as THREE from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { Document, NodeIO } from '@gltf-transform/core';

const ENTRADA = 'public/fotos/senna-capacete.webp';
const SAIDA = 'public/modelos/capacete-foto-fio.glb';
// espaco = distância entre pontos no casco (px da foto); borda = espaço entre
// os pontos do contorno/visor; profundidade = fundura do casco / meia largura;
// moldura = largura da moldura do visor (px); recesso = quanto a borda de
// dentro da moldura afunda; queixo = quanto a queixeira avança (as duas em
// fração da meia largura). Dentro da moldura fica a janela do visor, vazia.
const MALHA = { espaco: 34, borda: 18, profundidade: 1.08, moldura: 16, recesso: 0.08, queixo: 0.12, semente: 11 };
const VISOR = { y0: 690, y1: 1140, escuro: 45 }; // faixa da moldura onde fica o visor
const ALTURA = 1.45;

const { data, info } = await sharp(ENTRADA).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height;
const alfa = (x, y) => data[((y | 0) * W + (x | 0)) * 4 + 3];
const dentro = (x, y) => x >= 0 && y >= 0 && x < W && y < H && alfa(x, y) > 128;
const luz = (x, y) => { const i = ((y | 0) * W + (x | 0)) * 4; return 0.3 * data[i] + 0.59 * data[i + 1] + 0.11 * data[i + 2]; };

// ---------- contorno: largura do capacete em cada altura ----------
let minY = H, maxY = -1;
const esq = new Float32Array(H).fill(NaN), dir = new Float32Array(H).fill(NaN);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) if (alfa(x, y) > 128) { esq[y] = x; break; }
  for (let x = W - 1; x >= 0; x--) if (alfa(x, y) > 128) { dir[y] = x; break; }
  if (!Number.isNaN(esq[y])) { minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
}
const media = (arr, r) => Array.from(arr, (_, i) => {
  let s = 0, n = 0;
  for (let k = -r; k <= r; k++) { const v = arr[i + k]; if (v !== undefined && !Number.isNaN(v)) { s += v; n++; } }
  return n ? s / n : NaN;
});
// o casco usa o contorno "envelopado" (casca convexa 2D da silhueta): sem as
// pequenas reentrâncias (dobradiças do visor), que quebrariam a triangulação
{
  const borda = [];
  for (let y = minY; y <= maxY; y++) { borda.push([esq[y], y], [dir[y], y]); }
  borda.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cruz = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const baixo = [], cima = [];
  for (const p of borda) { while (baixo.length >= 2 && cruz(baixo.at(-2), baixo.at(-1), p) <= 0) baixo.pop(); baixo.push(p); }
  for (const p of [...borda].reverse()) { while (cima.length >= 2 && cruz(cima.at(-2), cima.at(-1), p) <= 0) cima.pop(); cima.push(p); }
  const poli = [...baixo.slice(0, -1), ...cima.slice(0, -1)];
  for (let y = minY; y <= maxY; y++) {
    let a = Infinity, b = -Infinity;
    for (let i = 0; i < poli.length; i++) {
      const [x1, y1] = poli[i], [x2, y2] = poli[(i + 1) % poli.length];
      if ((y1 <= y && y2 >= y) || (y2 <= y && y1 >= y)) {
        const x = y1 === y2 ? Math.min(x1, x2) : x1 + ((y - y1) / (y2 - y1)) * (x2 - x1);
        const x2b = y1 === y2 ? Math.max(x1, x2) : x;
        a = Math.min(a, x); b = Math.max(b, x2b);
      }
    }
    if (a < b) { esq[y] = a; dir[y] = b; }
  }
}
const esqS = media(esq, 4), dirS = media(dir, 4);
const linha = (y) => { const yy = Math.min(maxY, Math.max(minY, Math.round(y))); return [(esqS[yy] + dirS[yy]) / 2, Math.max(1, (dirS[yy] - esqS[yy]) / 2)]; };
let minX = W, maxX = 0;
for (let y = minY; y <= maxY; y++) { minX = Math.min(minX, esq[y]); maxX = Math.max(maxX, dir[y]); }

// ponto da tela (x, y) -> ponto no casco (x, y, z); z = para a frente
const noCasco = (x, y) => {
  const [c, w] = linha(y);
  const s = Math.max(-1, Math.min(1, (x - c) / w));
  return [x, y, w * MALHA.profundidade * Math.sqrt(1 - s * s)];
};

// ---------- visor: maior trecho escuro de cada linha ----------
const escuro = (x, y) => alfa(x, y) > 200 && luz(x, y) < VISOR.escuro;
// (tolera falhas de até "pulo" px: o reflexo vertical no meio do visor)
const maiorTrecho = (n, ok, pulo = 40) => {
  let melhor = [-1, -1], ini = -1, falha = 0;
  for (let i = 0; i <= n; i++) {
    if (i < n && ok(i)) { if (ini < 0) ini = i; falha = 0; continue; }
    if (ini >= 0 && i < n && ++falha <= pulo) continue;
    if (ini >= 0) { const fim = i - falha; if (fim - ini > melhor[1] - melhor[0]) melhor = [ini, fim]; }
    ini = -1; falha = 0;
  }
  return melhor;
};
const visorBruto = new Map();
for (let y = VISOR.y0; y <= VISOR.y1; y++) {
  const [a, b] = maiorTrecho(W, (x) => escuro(x, y));
  if (b - a > 200) visorBruto.set(y, [a, b]);
}
// visor simétrico e liso: fica só com as linhas centradas no capacete (as que
// pegam só um canto escuro saem), espelha a meia largura dos dois lados e
// suaviza bastante (as dobradiças escuras faziam as laterais pularem)
const centroVisor = (() => {
  const cs = [...visorBruto.values()].map(([a, b]) => (a + b) / 2).sort((p, q) => p - q);
  return cs[Math.floor(cs.length / 2)];
})();
const meia = new Map();
for (const [y, [a, b]] of visorBruto) {
  if (Math.abs((a + b) / 2 - centroVisor) < 25) meia.set(y, Math.min(centroVisor - a, b - centroVisor));
}
const visorLinha = new Map();
for (const y of meia.keys()) {
  const viz = [];
  for (let k = -18; k <= 18; k++) if (meia.has(y + k)) viz.push(meia.get(y + k));
  if (viz.length < 19) continue; // pontas soltas
  viz.sort((p, q) => p - q);
  const m = viz[Math.floor(viz.length / 2)]; // mediana: ignora os pulos
  visorLinha.set(y, [centroVisor - m, centroVisor + m]);
}
// segunda passada: média curta para alisar os degraus da mediana
{
  const antes = new Map(visorLinha);
  for (const y of antes.keys()) {
    let s = 0, n = 0;
    for (let k = -6; k <= 6; k++) { const v = antes.get(y + k); if (v) { s += v[1] - centroVisor; n++; } }
    visorLinha.set(y, [centroVisor - s / n, centroVisor + s / n]);
  }
}
const noVisor = (x, y, folga = 0) => { const v = visorLinha.get(Math.round(y)); return !!v && x > v[0] + folga && x < v[1] - folga; };
// janela do visor: área do visor encolhida pela moldura (MALHA.moldura px)
const naJanela = (x, y, extra = 0) => {
  const m = MALHA.moldura + extra;
  return noVisor(x, y, m) && noVisor(x, y - m) && noVisor(x, y + m);
};

// ---------- pontos ----------
const pts = [];   // [x, y, z] em px da foto
// 0 = casco, 1 = contorno, 2 = anel de dentro do visor (afunda), 3 = anel de fora do visor
const tipo = [];
const R = MALHA.espaco;
const grade = new Map();
const chave = (x, y, z) => `${Math.floor(x / R)},${Math.floor(y / R)},${Math.floor(z / R)}`;
const longeDe = (p, d) => {
  const [cx, cy, cz] = [Math.floor(p[0] / R), Math.floor(p[1] / R), Math.floor(p[2] / R)];
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
    for (const q of grade.get(`${cx + i},${cy + j},${cz + k}`) || []) {
      if ((q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2 < d * d) return false;
    }
  }
  return true;
};
const juntar = (p, d, t) => {
  if (!longeDe(p, d)) return false;
  pts.push(p); tipo.push(t);
  const k = chave(...p); if (!grade.has(k)) grade.set(k, []); grade.get(k).push(p);
  return true;
};

// contorno da foto (borda do casco: z = 0) e borda de baixo
for (let y = minY; y <= maxY; y += MALHA.borda * 0.8) { juntar(noCasco(esqS[Math.round(y)], y), MALHA.borda * 0.7, 1); juntar(noCasco(dirS[Math.round(y)], y), MALHA.borda * 0.7, 1); }
for (let x = minX; x <= maxX; x += MALHA.borda * 0.8) {
  let t = -1, b = -1;
  for (let y = minY; y <= maxY; y++) if (alfa(x, y) > 128) { if (t < 0) t = y; b = y; }
  if (b > 0) juntar(noCasco(x, b), MALHA.borda * 0.7, 1);
}
// recorte do visor
for (const [y, [a, b]] of visorLinha) {
  if ((y - VISOR.y0) % Math.round(MALHA.borda * 0.6)) continue;
  juntar(noCasco(a, y), MALHA.borda * 0.7, 3); juntar(noCasco(b, y), MALHA.borda * 0.7, 3);
}
for (let x = minX; x <= maxX; x += MALHA.borda * 0.6) {
  let a = -1, b = -1;
  for (let y = VISOR.y0; y <= VISOR.y1; y++) if (noVisor(x, y)) { if (a < 0) a = y; b = y; }
  if (b - a > 60) { juntar(noCasco(x, a), MALHA.borda * 0.7, 3); juntar(noCasco(x, b), MALHA.borda * 0.7, 3); }
}
// anel de dentro da moldura (contorno da janela; afunda no fim)
for (let y = VISOR.y0; y <= VISOR.y1; y += MALHA.borda * 0.6) {
  let a = -1, b = -1;
  for (let x = minX; x <= maxX; x++) if (naJanela(x, y)) { if (a < 0) a = x; b = x; }
  if (b - a > 100) { juntar(noCasco(a, y), MALHA.borda * 0.7, 2); juntar(noCasco(b, y), MALHA.borda * 0.7, 2); }
}
for (let x = minX; x <= maxX; x += MALHA.borda * 0.6) {
  let a = -1, b = -1;
  for (let y = VISOR.y0; y <= VISOR.y1; y++) if (naJanela(x, y)) { if (a < 0) a = y; b = y; }
  if (b - a > 60) { juntar(noCasco(x, a), MALHA.borda * 0.7, 2); juntar(noCasco(x, b), MALHA.borda * 0.7, 2); }
}
const nBordas = pts.length;

// casco: sorteia pontos sobre a superfície 3D (com semente fixa)
let semente = MALHA.semente;
const aleatorio = () => { semente |= 0; semente = (semente + 0x6d2b79f5) | 0; let t = Math.imul(semente ^ (semente >>> 15), 1 | semente); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
for (let tent = 0; tent < 400000; tent++) {
  const y = minY + aleatorio() * (maxY - minY);
  const [c, w] = linha(y);
  const x = c + w * Math.sin((aleatorio() - 0.5) * Math.PI);
  if (!dentro(x, y)) continue;
  if (noVisor(x, y, -6) || noVisor(x, y - 6) || noVisor(x, y + 6)) continue; // visor: só os anéis
  juntar(noCasco(x, y), R, 0);
}
console.log(`pontos: ${pts.length} (${nBordas} no contorno e no visor)`);

// ---------- triangulação: casca convexa, só a frente ----------
const S = (maxY - minY) / ALTURA;
const cxH = (minX + maxX) / 2;
const modelo = (p) => new THREE.Vector3((p[0] - cxH) / S, (maxY - p[1]) / S, p[2] / S);
const vetores = pts.map(modelo);
const indice = new Map(vetores.map((v, i) => [v, i]));
const casca = new ConvexHull().setFromPoints(vetores);
const tris = [];
for (const face of casca.faces) {
  const vs = [];
  let e = face.edge;
  do { vs.push(indice.get(e.head().point)); e = e.next; } while (e !== face.edge);
  if (vs.length !== 3 || vs.some((v) => v === undefined)) continue;
  const n = face.normal;
  if (n.z < 0.02) continue;            // costas (plano do contorno) e tampa de baixo
  if (n.y < -0.75 && n.z < 0.35) continue; // tampa da abertura de baixo
  // centro do triângulo precisa cair dentro do capacete da foto
  const m = new THREE.Vector3().add(vetores[vs[0]]).add(vetores[vs[1]]).add(vetores[vs[2]]).divideScalar(3);
  const mx = m.x * S + cxH, my = maxY - m.y * S;
  if (!dentro(mx, my)) continue;
  if (naJanela(mx, my, 3)) continue; // janela do visor fica vazia
  tris.push(vs);
}
const usados = new Set(tris.flat());
console.log(`triângulos: ${tris.length} (pontos usados ${usados.size} de ${pts.length})`);

// ---------- forma de capacete: visor afunda, queixeira avança ----------
const visorBase = Math.max(...visorLinha.keys());
const pos = new Float32Array(vetores.length * 3);
vetores.forEach((v, i) => {
  const [x, y] = pts[i];
  const [c, w] = linha(y);
  const s = Math.max(-1, Math.min(1, (x - c) / w));
  let z = pts[i][2];
  if (tipo[i] === 2) z -= w * MALHA.recesso * Math.sqrt(1 - s * s); // borda de dentro da moldura afunda
  if (y > visorBase - 20) { // queixeira: abaixo do visor, mais no meio
    const t = Math.min(1, (y - (visorBase - 20)) / 60) * Math.min(1, (maxY - y) / 80);
    z += w * MALHA.queixo * t * (1 - s * s);
  }
  pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = z / S;
});
const ind = new Uint32Array(tris.flat());

const doc = new Document();
const buf = doc.createBuffer();
const prim = doc.createPrimitive()
  .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buf))
  // _DESTAQUE = 1 na moldura do visor: o site deixa essas linhas sempre fortes
  .setAttribute('_DESTAQUE', doc.createAccessor().setType('SCALAR').setArray(new Float32Array(tipo.map((t) => (t >= 2 ? 1 : 0)))).setBuffer(buf))
  .setIndices(doc.createAccessor().setType('SCALAR').setArray(ind).setBuffer(buf));
doc.createScene().addChild(doc.createNode('capacete-fio').setMesh(doc.createMesh('capacete-fio').addPrimitive(prim)));
await new NodeIO().write(SAIDA, doc);
console.log('ok', SAIDA);
console.log('CAP =', JSON.stringify({ x: Math.round(cxH), y: Math.round((minY + maxY) / 2), escala: +S.toFixed(1), largura: 1 }));

// prévia: triângulos por cima do capacete, linhas mais fortes de lado (como no site)
const iConf = process.argv.indexOf('--conferir');
if (iConf > 0) {
  const pasta = process.argv[iConf + 1];
  const normais = new Float32Array(pos.length);
  for (const [a, b, c] of tris) {
    const A = new THREE.Vector3(...pos.slice(a * 3, a * 3 + 3)), B = new THREE.Vector3(...pos.slice(b * 3, b * 3 + 3)), C = new THREE.Vector3(...pos.slice(c * 3, c * 3 + 3));
    const n = new THREE.Vector3().crossVectors(B.clone().sub(A), C.clone().sub(A));
    for (const k of [a, b, c]) { normais[k * 3] += n.x; normais[k * 3 + 1] += n.y; normais[k * 3 + 2] += n.z; }
  }
  const frente = (k) => { const n = new THREE.Vector3(normais[k * 3], normais[k * 3 + 1], normais[k * 3 + 2]).normalize(); return n.z; };
  const arestas = new Set();
  let linhas = '';
  for (const [a, b, c] of tris) for (const [p, q] of [[a, b], [b, c], [c, a]]) {
    const k = p < q ? `${p},${q}` : `${q},${p}`;
    if (arestas.has(k)) continue; arestas.add(k);
    const f = (frente(p) + frente(q)) / 2;
    const op = (0.3 + 0.7 * Math.pow(1 - Math.max(0, f), 1.2)).toFixed(2);
    const P = [pts[p][0], pts[p][1]], Q = [pts[q][0], pts[q][1]];
    linhas += `<line x1="${P[0].toFixed(1)}" y1="${P[1].toFixed(1)}" x2="${Q[0].toFixed(1)}" y2="${Q[1].toFixed(1)}" stroke-opacity="${op}"/>`;
  }
  const svg = `<svg width="${W}" height="${H}"><g stroke="#0f2a1d" stroke-width="1.8">${linhas}</g></svg>`;
  const junto = await sharp({ create: { width: W, height: H, channels: 3, background: '#f2efe3' } })
    .composite([{ input: Buffer.from(svg) }]).png().toBuffer();
  await sharp(junto).extract({ left: minX - 20, top: minY - 20, width: maxX - minX + 40, height: maxY - minY + 40 }).resize(700).toFile(`${pasta}/previa-malha.jpg`);
  console.log('prévia em', `${pasta}/previa-malha.jpg`);
}
