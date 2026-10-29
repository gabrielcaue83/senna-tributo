// Mostra se a malha tem parede interna e quantos triângulos formam a tampa de baixo.
import fs from 'node:fs';
const xml = fs.readFileSync(process.argv[2], 'utf8');
const v = []; for (const m of xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)) v.push([+m[1], -+m[2], -+m[3]]);
const t = []; for (const m of xml.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)) t.push([+m[1], +m[2], +m[3]]);
const minY = v.reduce((m, p) => Math.min(m, p[1]), Infinity);
// fatias horizontais: distância mínima e máxima ao eixo central
for (const yy of [-9, -6, -3, 0, 3, 6, 9]) {
  const rs = v.filter((p) => Math.abs(p[1] - yy) < 0.15).map((p) => Math.hypot(p[0], p[2]));
  rs.sort((a, b) => a - b);
  const q = (f) => rs[Math.floor(f * (rs.length - 1))]?.toFixed(2);
  console.log('y', yy, 'n', rs.length, 'r min', q(0), 'p5', q(0.05), 'p50', q(0.5), 'max', q(1));
}
let tampa = 0, baixo = 0;
for (const [a, b, c] of t) {
  const A = v[a], B = v[b], C = v[c];
  const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], w = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
  const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  const l = Math.hypot(...n) || 1;
  const ny = n[1] / l;
  const ymax = Math.max(A[1], B[1], C[1]);
  if (ymax < minY + 0.05) { baixo++; if (ny < -0.95) tampa++; }
}
console.log('minY', minY, 'triângulos no plano de baixo', baixo, 'virados pra baixo', tampa);
