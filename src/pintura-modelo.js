import * as THREE from 'three';

// Pintura do modelo 3D (que vem todo branco, feito para impressão).
// A cor é projetada assim: x do desenho = ângulo em volta do capacete
// (visto de cima), y do desenho = altura (0 = topo, 1 = base).
// Isso casa com os frisos das faixas do modelo, que são horizontais.
// Frente do modelo = +Z, que no desenho fica em x = W/4.

export const PROJ = {
  centro: new THREE.Vector3(0, 0, -0.6), // eixo vertical usado para o ângulo (mm)
  topo: 10.3, base: -10.3, // alturas do modelo (mm)
};

const COR = {
  amarelo: '#ffcf00', verde: '#008a3e', azul: '#1e4fb4',
  preto: '#111111', branco: '#f7f5ee', vidro: '#14191b',
};

const suave = (a, b, t) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

// Grade de referência: linhas de altura a cada 0,05 e de ângulo a cada 15°.
export function desenharGrade(c, g) {
  const W = c.width, H = c.height;
  g.fillStyle = '#eee'; g.fillRect(0, 0, W, H);
  g.font = 'bold 22px sans-serif';
  for (let th = 0; th <= 1 + 1e-6; th += 0.05) {
    const y = th * H;
    g.fillStyle = Math.round(th * 100) % 10 === 0 ? '#c00' : '#36c';
    g.fillRect(0, y - 1.5, W, 3);
    for (let x = 40; x < W; x += 256) g.fillText(th.toFixed(2), x, y - 6);
  }
  for (let d = 0; d < 360; d += 15) {
    const x = (d / 360) * W;
    g.fillStyle = d === 90 ? '#0a0' : '#888';
    g.fillRect(x - 1.5, 0, 3, H);
    g.fillStyle = '#0a0';
    for (let y = 60; y < H; y += 200) g.fillText(String(d - 90), x + 4, y);
  }
}

// Desenho final. Os números (altura de 0 a 1, ângulo em graus a partir
// da frente) foram medidos em cima da grade de referência (?grade).
// Os frisos do modelo ficam em 0,35 · 0,50 · 0,64 · 0,725 · 0,78.
export const MEDIDAS = {
  // contorno da viseira: pontos [graus, altura] de um lado (o outro é espelho)
  viseira: [[0, 0.32], [86, 0.32], [86, 0.405], [66, 0.718], [0, 0.718]],
  testeira: 0.43, // até aqui a viseira é a faixa preta; abaixo, o vidro
  verde: { frente: 0.425, nuca: 0.425, esp: 0.15 },
  azul: { frente: 0.57, nuca: 0.57, esp: 0.14 },
  filete: { frente: 0.722, nuca: 0.722 },
  borda: 0.955, // daqui para baixo: borracha preta do pescoço
};

export function pintarModelo(c, g, M = MEDIDAS) {
  const W = c.width, H = c.height;
  const yDe = (h) => h * H;
  const xDe = (graus) => ((graus + 90) / 360) * W; // 0° = frente

  g.fillStyle = COR.amarelo;
  g.fillRect(0, 0, W, H);

  const faixa = (frente, nuca, esp, cor) => {
    const borda = (lado) => {
      const pts = [];
      for (let x = 0; x <= W; x += 6) {
        const phi = (x / W) * Math.PI * 2;
        const t = (1 - Math.cos(phi - Math.PI / 2)) / 2; // 0 frente, 1 nuca
        const centro = frente + (nuca - frente) * suave(0.12, 0.95, t);
        pts.push([x, yDe(centro + lado * esp / 2)]);
      }
      return pts;
    };
    g.beginPath();
    [...borda(-1), ...borda(1).reverse()].forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fillStyle = cor;
    g.fill();
  };

  const { verde, azul, filete } = M;
  faixa(verde.frente - verde.esp / 2 - 0.012, verde.nuca - verde.esp / 2 - 0.012, 0.008, COR.preto);
  faixa(verde.frente - verde.esp / 2 - 0.004, verde.nuca - verde.esp / 2 - 0.004, 0.007, COR.branco);
  faixa(verde.frente, verde.nuca, verde.esp, COR.verde);
  faixa(azul.frente, azul.nuca, azul.esp, COR.azul);
  faixa(azul.frente + azul.esp / 2 + 0.004, azul.nuca + azul.esp / 2 + 0.004, 0.007, COR.branco);
  faixa(filete.frente, filete.nuca, 0.012, COR.verde);
  faixa(filete.frente + 0.012, filete.nuca + 0.012, 0.007, COR.branco);

  // viseira: vidro fumê com reflexos e faixa preta em cima
  const pts = [...M.viseira, ...M.viseira.slice().reverse().map(([d, h]) => [-d, h])];
  const xs = pts.map(([d]) => xDe(d)), ys = pts.map(([, h]) => yDe(h));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  g.save();
  g.beginPath();
  pts.forEach(([d, h], i) => (i ? g.lineTo(xDe(d), yDe(h)) : g.moveTo(xDe(d), yDe(h))));
  g.closePath();
  g.clip();
  const vidro = g.createLinearGradient(0, y0, 0, y1);
  vidro.addColorStop(0, '#2f393c'); vidro.addColorStop(0.4, COR.vidro); vidro.addColorStop(1, '#07090a');
  g.fillStyle = vidro;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  [[-38, 22, 0.14], [-33, 7, 0.1], [36, 26, 0.12], [41, 8, 0.08]].forEach(([graus, w, a]) => {
    const gr = g.createLinearGradient(0, y0, 0, y1);
    gr.addColorStop(0, `rgba(255,255,255,${a * 1.5})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(xDe(graus) - w / 2, y0, w, y1 - y0);
  });
  // o canal alfa guarda o "brilho": no vidro ele cai, e o shader deixa fosco
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.fillRect(x0, yDe(M.testeira), x1 - x0, y1 - yDe(M.testeira));
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = COR.preto;
  g.fillRect(x0, y0, x1 - x0, yDe(M.testeira) - y0);
  g.restore();

  // borracha preta embaixo
  g.fillStyle = COR.preto;
  g.fillRect(0, yDe(M.borda), W, H - yDe(M.borda));
}

// O GLB comprimido guarda as posições numa escala própria e desfaz isso
// pela transformação do nó. Aqui a gente "assa" tudo de volta em milímetros,
// em Float32, para a pintura poder ler as alturas reais.
export function prepararMalha(mesh) {
  mesh.updateWorldMatrix(true, false);
  const g = mesh.geometry;
  const p = g.attributes.position;
  const pos = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const it = g.attributes._interior;
  if (it) {
    const a = new Float32Array(it.count);
    for (let i = 0; i < it.count; i++) a[i] = it.getX(i);
    g.setAttribute('_interior', new THREE.BufferAttribute(a, 1));
  } else {
    g.setAttribute('_interior', new THREE.BufferAttribute(new Float32Array(p.count), 1));
  }
  g.deleteAttribute('normal');
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1);
  mesh.removeFromParent?.();
  return mesh;
}

export function texturaDe(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // sem mipmaps: evita uma linha na costura do ângulo (lado esquerdo)
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  return t;
}

// Material que pinta o modelo. "lente" (opcional) recorta pelo círculo do mouse.
export function materialModelo(textura, { U = null, modo = 'dentro' } = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    roughness: 0.32, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.12,
    envMapIntensity: 0.65,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPintura = { value: textura };
    sh.uniforms.uCentro = { value: PROJ.centro };
    sh.uniforms.uAltura = { value: new THREE.Vector2(PROJ.topo, PROJ.base) };
    if (U) { sh.uniforms.uMouse = U.uMouse; sh.uniforms.uRaio = U.uRaio; }

    sh.vertexShader = 'attribute float _interior;\nvarying float vInt;\nvarying vec3 vObj;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vObj = position;\n  vInt = _interior;');

    let teste = '';
    if (U) teste = modo === 'dentro' ? 'if (dL > uRaio) discard;' : 'if (dL < uRaio) discard;';
    sh.fragmentShader =
      'uniform sampler2D uPintura;\nuniform vec3 uCentro;\nuniform vec2 uAltura;\nvarying float vInt;\nvarying vec3 vObj;\n' +
      (U ? 'uniform vec2 uMouse;\nuniform float uRaio;\n' : '') +
      sh.fragmentShader
        .replace('void main() {', `void main() {\n${U ? `  float dL = distance(gl_FragCoord.xy, uMouse);\n  ${teste}\n` : ''}`)
        .replace('#include <map_fragment>', `
  vec3 dP = vObj - uCentro;
  float hP = clamp((uAltura.x - vObj.y) / (uAltura.x - uAltura.y), 0.0, 1.0);
  float phP = atan(dP.z, -dP.x);
  if (phP < 0.0) phP += 2.0 * PI;
  vec4 corP = texture2D(uPintura, vec2(phP / (2.0 * PI), 1.0 - hP));
  diffuseColor.rgb *= mix(corP.rgb, vec3(0.03), vInt);
  float brilhoP = mix(corP.a, 0.0, vInt);
`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(0.75, roughnessFactor, brilhoP);')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n  material.clearcoat *= brilhoP;');
  };
  return mat;
}
