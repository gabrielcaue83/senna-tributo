// Gera uma malha bem simples (só posição) para desenhar o wireframe do hero.
// Uso: node tools/malha-do-fio.mjs <entrada.glb> <saida.glb> [proporcao]
import { NodeIO } from '@gltf-transform/core';
import { weld, simplify, prune, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const [entrada, saida, prop = '0.015'] = process.argv.slice(2);
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
io.registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(entrada);
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    for (const nome of prim.listSemantics()) if (nome !== 'POSITION') prim.setAttribute(nome, null);
    prim.setMaterial(null);
  }
}
for (const m of doc.getRoot().listMaterials()) m.dispose();
await doc.transform(
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: +prop, error: 0.02 }),
  prune(),
  meshopt({ encoder: MeshoptEncoder }),
);
await io.write(saida, doc);
const tri = doc.getRoot().listMeshes()[0].listPrimitives()[0].getIndices().getCount() / 3;
console.log('ok', saida, Math.round(tri), 'triângulos');
