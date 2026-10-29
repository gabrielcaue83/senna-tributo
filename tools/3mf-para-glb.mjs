// Converte a malha de um .3mf já extraído (arquivo .model, XML) em .glb.
// Uso: node tools/3mf-para-glb.mjs <object_1.model> <saida.glb> [--alisar] [--oco=0.6]
//
// - lê vértices e triângulos do XML e solda vértices repetidos
// - gira para o topo ficar em +Y e a frente em +Z (padrão da web)
// - centraliza na origem, mantendo milímetros como unidade
// - com --oco: tira a tampa de baixo, cria uma parede interna com a
//   espessura pedida (mm) e fecha a borda do pescoço. Cada vértice ganha
//   o atributo _INTERIOR (0 = lado de fora, 1 = lado de dentro).
import fs from 'node:fs';

const args = process.argv.slice(2);
const [entrada, saida] = args.filter((a) => !a.startsWith('--'));
const ocoArg = args.find((a) => a.startsWith('--oco'));
const esp = ocoArg ? parseFloat(ocoArg.split('=')[1] || '0.6') : 0;

const xml = fs.readFileSync(entrada, 'utf8');

// ---- leitura + solda ----
const posL = [];
const mapa = new Map();
const remap = [];
const reV = /<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g;
for (let m; (m = reV.exec(xml)); ) {
  // Neste modelo o topo está em -Y e a frente em -Z: gira 180° no eixo X
  const p = [+m[1], -+m[2], -+m[3]];
  const k = p.map((x) => x.toFixed(4)).join(',');
  if (!mapa.has(k)) { mapa.set(k, posL.length / 3); posL.push(...p); }
  remap.push(mapa.get(k));
}
let tris = [];
const reT = /<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g;
for (let m; (m = reT.exec(xml)); ) {
  const a = remap[+m[1]], b = remap[+m[2]], c = remap[+m[3]];
  if (a !== b && b !== c && a !== c) tris.push(a, b, c);
}
let n = posL.length / 3;
console.log('vértices', n, 'triângulos', tris.length / 3);

// ---- centraliza ----
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], posL[i * 3 + k]); max[k] = Math.max(max[k], posL[i * 3 + k]); }
const centro = min.map((v, k) => (v + max[k]) / 2);
for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) posL[i * 3 + k] -= centro[k];
const minY = min[1] - centro[1];
console.log('tamanho (mm)', max.map((v, k) => (v - min[k]).toFixed(1)).join(' × '));

const P = (i) => [posL[i * 3], posL[i * 3 + 1], posL[i * 3 + 2]];
const normalTri = (a, b, c) => {
  const A = P(a), B = P(b), C = P(c);
  const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
};

// ---- alisa logos em relevo e frisos do vidro (--alisar) ----
// Cada área é [grau mínimo, grau máximo, altura mínima, altura máxima],
// no mesmo sistema da pintura: grau a partir da frente (+Z), altura de
// 0 (topo) a 1 (base). "espelho" repete a área do outro lado.
const AREAS = [
  { nome: 'Marlboro', g: [-42, 42], h: [0.03, 0.312] },
  { nome: 'viseira (faixa com HONDA + vidro de cima)', g: [-84, 84], h: [0.326, 0.56] },
  { nome: 'vidro (baixo)', g: [-62, 62], h: [0.56, 0.705] },
  { nome: 'NACIONAL do queixo', g: [-48, 48], h: [0.825, 0.946] },
  { nome: 'NACIONAL das laterais', g: [62, 132], h: [0.05, 0.31], espelho: true },
  { nome: 'BOSS / RHEOS', g: [40, 116], h: [0.785, 0.946], espelho: true },
];
if (args.includes('--alisar')) {
  const C = [0, 0, -0.6]; // mesmo eixo usado na pintura
  const topo = max[1] - centro[1], base = minY;
  const dentroDe = (i) => {
    const x = posL[i * 3] - C[0], y = posL[i * 3 + 1], z = posL[i * 3 + 2] - C[2];
    let g = (Math.atan2(z, -x) * 180) / Math.PI - 90; // 0° = frente
    if (g <= -180) g += 360;
    const h = (topo - y) / (topo - base);
    return AREAS.some((a) => {
      const gg = a.espelho ? Math.abs(g) : g;
      return gg >= a.g[0] && gg <= a.g[1] && h >= a.h[0] && h <= a.h[1];
    });
  };
  const livre = new Uint8Array(n);
  let qtd = 0;
  for (let i = 0; i < n; i++) if (dentroDe(i)) { livre[i] = 1; qtd++; }

  // vizinhos de cada vértice
  const viz = Array.from({ length: n }, () => []);
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    viz[a].push(b, c); viz[b].push(a, c); viz[c].push(a, b);
  }
  // distância de cada vértice ao centro (o "relevo" é o que foge dessa distância)
  const dir = new Float32Array(n * 3), r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = [posL[i * 3] - C[0], posL[i * 3 + 1] - C[1], posL[i * 3 + 2] - C[2]];
    r[i] = Math.hypot(...d) || 1;
    for (let k = 0; k < 3; k++) dir[i * 3 + k] = d[k] / r[i];
  }
  // Dentro das áreas, a distância vira a média dos vizinhos, muitas vezes,
  // com a borda presa: o relevo se dissolve na curva lisa da casca em volta.
  const ids = [];
  for (let i = 0; i < n; i++) if (livre[i]) ids.push(i);
  const novo = new Float32Array(r);
  for (let it = 0; it < 2500; it++) {
    for (const i of ids) {
      const vs = viz[i];
      let s = 0;
      for (let k = 0; k < vs.length; k++) s += r[vs[k]];
      novo[i] = s / vs.length;
    }
    for (const i of ids) r[i] = novo[i];
  }
  for (const i of ids) for (let k = 0; k < 3; k++) posL[i * 3 + k] = C[k] + dir[i * 3 + k] * r[i];

  // 2º passo: espalha os pontos pela superfície (média das posições dos
  // vizinhos), mantendo a distância ao centro igual à média dos vizinhos.
  // Isso desdobra os triângulos que sobraram das paredes das letras,
  // que senão continuam desenhando o contorno com a luz.
  const pos = Float64Array.from(posL);
  const tmp = new Float64Array(ids.length * 3);
  for (let it = 0; it < 1500; it++) {
    ids.forEach((i, j) => {
      const vs = viz[i];
      let sx = 0, sy = 0, sz = 0, sr = 0;
      for (let k = 0; k < vs.length; k++) {
        const v = vs[k];
        const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
        sx += x; sy += y; sz += z;
        sr += Math.hypot(x - C[0], y - C[1], z - C[2]);
      }
      const m = vs.length;
      const dx = sx / m - C[0], dy = sy / m - C[1], dz = sz / m - C[2];
      const l = Math.hypot(dx, dy, dz) || 1, rr = sr / m;
      tmp[j * 3] = C[0] + (dx / l) * rr;
      tmp[j * 3 + 1] = C[1] + (dy / l) * rr;
      tmp[j * 3 + 2] = C[2] + (dz / l) * rr;
    });
    ids.forEach((i, j) => { pos[i * 3] = tmp[j * 3]; pos[i * 3 + 1] = tmp[j * 3 + 1]; pos[i * 3 + 2] = tmp[j * 3 + 2]; });
  }
  for (const i of ids) for (let k = 0; k < 3; k++) posL[i * 3 + k] = pos[i * 3 + k];
  console.log('alisado:', qtd, 'vértices em', AREAS.length, 'áreas');
}

let interior = new Float32Array(n);

if (esp > 0) {
  // 1) tira a tampa: triângulos no plano de baixo virados para baixo
  const antes = tris.length / 3;
  const novos = [];
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t], b = tris[t + 1], c = tris[t + 2];
    const yMax = Math.max(posL[a * 3 + 1], posL[b * 3 + 1], posL[c * 3 + 1]);
    const nn = normalTri(a, b, c);
    const ny = nn[1] / (Math.hypot(...nn) || 1);
    if (yMax < minY + 0.05 && ny < -0.9) continue;
    novos.push(a, b, c);
  }
  tris = novos;
  console.log('tampa removida:', antes - tris.length / 3, 'triângulos');

  // 2) normais por vértice (ponderadas pela área)
  const nor = new Float32Array(n * 3);
  for (let t = 0; t < tris.length; t += 3) {
    const nn = normalTri(tris[t], tris[t + 1], tris[t + 2]);
    for (const i of [tris[t], tris[t + 1], tris[t + 2]]) for (let k = 0; k < 3; k++) nor[i * 3 + k] += nn[k];
  }
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]) || 1;
    for (let k = 0; k < 3; k++) nor[i * 3 + k] /= l;
  }

  // 3) parede interna: cópia puxada em direção ao centro do capacete
  //    (seguir a normal faria a parede furar a casca nos relevos dos logos)
  const C = [0, -2, -0.6];
  for (let i = 0; i < n; i++) {
    const d = [posL[i * 3] - C[0], posL[i * 3 + 1] - C[1], posL[i * 3 + 2] - C[2]];
    const l = Math.hypot(...d) || 1;
    const f = Math.max(0, 1 - esp / l);
    posL.push(C[0] + d[0] * f, C[1] + d[1] * f, C[2] + d[2] * f);
  }
  const ext = tris.length;
  for (let t = 0; t < ext; t += 3) tris.push(tris[t] + n, tris[t + 2] + n, tris[t + 1] + n);

  // 4) borda do pescoço: arestas que sobraram sozinhas ligam fora e dentro
  const cont = new Map();
  for (let t = 0; t < ext; t += 3) {
    for (const [a, b] of [[tris[t], tris[t + 1]], [tris[t + 1], tris[t + 2]], [tris[t + 2], tris[t]]]) {
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      const e = cont.get(k);
      if (e) e.n++; else cont.set(k, { n: 1, a, b });
    }
  }
  let borda = 0;
  for (const { n: c, a, b } of cont.values()) {
    if (c !== 1) continue;
    tris.push(b, a, a + n, b, a + n, b + n);
    borda++;
  }
  console.log('borda do pescoço:', borda, 'arestas');

  interior = new Float32Array(n * 2);
  interior.fill(1, n);
  n *= 2;
}

// ---- GLB ----
const pos = new Float32Array(posL);
const pMin = [Infinity, Infinity, Infinity], pMax = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { pMin[k] = Math.min(pMin[k], pos[i * 3 + k]); pMax[k] = Math.max(pMax[k], pos[i * 3 + k]); }
const idx = new Uint32Array(tris);

const pad4 = (b, c = 0) => (b.length % 4 ? Buffer.concat([b, Buffer.alloc(4 - (b.length % 4), c)]) : b);
const partes = [Buffer.from(pos.buffer), Buffer.from(idx.buffer)];
if (esp > 0) partes.push(Buffer.from(interior.buffer));
let off = 0;
const views = partes.map((p, i) => { const v = { buffer: 0, byteOffset: off, byteLength: p.length, target: i === 1 ? 34963 : 34962 }; off += p.length; return v; });
const bin = pad4(Buffer.concat(partes));

const attributes = { POSITION: 0 };
const accessors = [
  { bufferView: 0, componentType: 5126, count: n, type: 'VEC3', min: pMin, max: pMax },
  { bufferView: 1, componentType: 5125, count: idx.length, type: 'SCALAR' },
];
if (esp > 0) { attributes._INTERIOR = 2; accessors.push({ bufferView: 2, componentType: 5126, count: n, type: 'SCALAR' }); }

const gltf = {
  asset: { version: '2.0', generator: 'senna-tributo 3mf-para-glb', copyright: 'Capacete por Chiavatta (MakerWorld), CC BY-NC' },
  scene: 0, scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: 'capacete' }],
  meshes: [{ primitives: [{ attributes, indices: 1 }] }],
  buffers: [{ byteLength: bin.length }],
  bufferViews: views,
  accessors,
};
const json = pad4(Buffer.from(JSON.stringify(gltf)), 0x20);
const head = Buffer.alloc(12), jh = Buffer.alloc(8), bh = Buffer.alloc(8);
head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(saida, Buffer.concat([head, jh, json, bh, bin]));
console.log('ok', saida, (fs.statSync(saida).size / 1e6).toFixed(1) + ' MB');
