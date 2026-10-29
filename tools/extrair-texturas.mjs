// Salva as texturas de um GLB como arquivos. Uso: node tools/extrair-texturas.mjs <arquivo.glb> <pasta>
import { NodeIO } from '@gltf-transform/core';
import fs from 'node:fs';
const io = new NodeIO();
const doc = await io.read(process.argv[2]);
for (const t of doc.getRoot().listTextures()) {
  fs.writeFileSync(process.argv[3] + '/' + t.getName() + '.png', t.getImage());
  console.log(t.getName(), t.getMimeType(), t.getImage().length);
}
