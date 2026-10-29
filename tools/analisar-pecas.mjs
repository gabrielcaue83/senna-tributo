// Lista as peças soltas (componentes conectados) de uma malha .model do 3MF.
import fs from 'node:fs';
const xml = fs.readFileSync(process.argv[2], 'utf8');
const v = []; for (const m of xml.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)) v.push([+m[1], -+m[2], -+m[3]]);
const t = []; for (const m of xml.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"/g)) t.push([+m[1], +m[2], +m[3]]);
// solda vértices iguais antes (STL costuma repetir)
const chave = new Map(); const id = new Int32Array(v.length);
v.forEach((p, i) => { const k = p.map((x) => x.toFixed(4)).join(); if (!chave.has(k)) chave.set(k, i); id[i] = chave.get(k); });
const pai = new Int32Array(v.length).map((_, i) => i);
const f = (a) => { while (pai[a] !== a) { pai[a] = pai[pai[a]]; a = pai[a]; } return a; };
for (const [a, b, c] of t) { const A = f(id[a]); pai[f(id[b])] = A; pai[f(id[c])] = A; }
const comp = new Map();
for (const tri of t) { const r = f(id[tri[0]]); if (!comp.has(r)) comp.set(r, { n: 0, min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] }); const c = comp.get(r); c.n++; for (const i of tri) for (let k = 0; k < 3; k++) { c.min[k] = Math.min(c.min[k], v[i][k]); c.max[k] = Math.max(c.max[k], v[i][k]); } }
const lista = [...comp.values()].sort((a, b) => b.n - a.n);
console.log('peças:', lista.length);
lista.slice(0, 25).forEach((c, i) => console.log(i, c.n, 'min', c.min.map((x) => x.toFixed(1)).join(','), 'max', c.max.map((x) => x.toFixed(1)).join(',')));
