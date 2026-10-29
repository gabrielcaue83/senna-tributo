import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { pintarModelo, texturaDe, materialModelo, prepararMalha } from './pintura-modelo.js';

// Capacete 3D do hero: modelo de Chiavatta (MakerWorld, CC BY-NC),
// convertido para GLB, deixado oco e pintado por código.
//
// Tudo é medido em pixels da foto original (2000 × 1600). A câmera
// ortográfica usa essas mesmas unidades, então o capacete fica sempre em
// cima da cabeça, qualquer que seja o tamanho da tela.
const FOTO = { w: 2000, h: 1600 };
// Posição do centro do modelo e escala (px da foto por mm do modelo)
const CAP = { x: 1012, y: 772, escala: 47 };
const URL_MODELO = '/modelos/capacete.glb';

// Só a casca de fora (sem a parede interna), para tirar as linhas do wireframe.
function soLadoDeFora(geo) {
  const idx = geo.index.array;
  const it = geo.attributes._interior.array;
  const fora = [];
  for (let t = 0; t < idx.length; t += 3) {
    if (it[idx[t]] < 0.5 && it[idx[t + 1]] < 0.5 && it[idx[t + 2]] < 0.5) fora.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.attributes.position);
  g.setIndex(fora);
  return g;
}

export function criarCapacete({ canvas, area }) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.NeutralToneMapping;

  const cena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const cam = new THREE.OrthographicCamera(0, FOTO.w, 0, -FOTO.h, -4000, 4000);
  cam.position.z = 2000;

  const luz = new THREE.DirectionalLight('#fff7e0', 1.2);
  luz.position.set(-0.6, 1, 1.2);
  cena.add(luz);

  // Uniforms compartilhados: posição da lente e raio, em pixels do canvas.
  const U = {
    uMouse: { value: new THREE.Vector2(-9999, -9999) },
    uRaio: { value: 0 },
  };

  const capacete = new THREE.Group();
  capacete.position.set(CAP.x, -CAP.y, 0);
  capacete.scale.setScalar(CAP.escala);
  cena.add(capacete);

  // Pintura (desenho 2D projetado no modelo)
  const cPint = document.createElement('canvas');
  cPint.width = 2048; cPint.height = 1024;
  pintarModelo(cPint, cPint.getContext('2d'));
  const texPint = texturaDe(cPint);

  // Wireframe: material com recorte inverso da lente (some dentro do círculo)
  const fioMat = new THREE.LineBasicMaterial({ color: '#0f2a1d', transparent: true, opacity: 0, depthTest: false });
  fioMat.onBeforeCompile = (sh) => {
    sh.uniforms.uMouse = U.uMouse;
    sh.uniforms.uRaio = U.uRaio;
    sh.fragmentShader = 'uniform vec2 uMouse;\nuniform float uRaio;\n' +
      sh.fragmentShader.replace('void main() {', 'void main() {\n  if (distance(gl_FragCoord.xy, uMouse) < uRaio) discard;\n');
  };

  let pronto = false;
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(URL_MODELO, (gltf) => {
    let malha;
    gltf.scene.traverse((o) => { if (o.isMesh && !malha) malha = o; });
    prepararMalha(malha);
    malha.material = materialModelo(texPint, { U, modo: 'dentro' });
    capacete.add(malha);

    const fio = new THREE.LineSegments(new THREE.EdgesGeometry(soLadoDeFora(malha.geometry), 28), fioMat);
    fio.renderOrder = 2;
    capacete.add(fio);
    pronto = true;
  });

  // ---------- estado ----------
  const estado = {
    alvoX: -9999, alvoY: -9999,
    raioAlvo: 0, raio: 0,
    rotX: 0, rotY: 0, alvoRotX: 0, alvoRotY: 0,
    fio: 0, // opacidade do wireframe (animada de fora)
    ativo: true,
  };

  const medir = () => {
    const r = area.getBoundingClientRect();
    renderer.setSize(r.width, r.height, false);
    estado.escala = r.height / FOTO.h; // px da tela por px da foto
  };
  medir();
  window.addEventListener('resize', medir);

  // Posição do mouse em coordenadas do canvas (origem embaixo, como gl_FragCoord)
  const mover = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    estado.alvoX = (clientX - r.left) * dpr;
    estado.alvoY = (r.bottom - clientY) * dpr;
    // leve rotação seguindo o mouse
    estado.alvoRotY = ((clientX - r.left) / r.width - 0.5) * 0.32;
    estado.alvoRotX = ((clientY - r.top) / r.height - 0.5) * 0.14;
  };

  // raio da lente em px da foto, convertido para pixels do canvas
  const raioPadrao = () => 340 * estado.escala * dpr;

  const tick = () => {
    if (!estado.ativo || !pronto) return;
    const k = 0.14;
    if (estado.raio < 1 && estado.raioAlvo > 0) {
      // primeira entrada: lente nasce já no lugar do mouse
      U.uMouse.value.set(estado.alvoX, estado.alvoY);
    }
    U.uMouse.value.x += (estado.alvoX - U.uMouse.value.x) * k;
    U.uMouse.value.y += (estado.alvoY - U.uMouse.value.y) * k;
    estado.raio += (estado.raioAlvo - estado.raio) * 0.12;
    U.uRaio.value = estado.raio;

    estado.rotX += (estado.alvoRotX - estado.rotX) * 0.06;
    estado.rotY += (estado.alvoRotY - estado.rotY) * 0.06;
    capacete.rotation.set(estado.rotX + 0.04, estado.rotY, 0);
    fioMat.opacity = estado.fio;

    renderer.render(cena, cam);
  };

  return {
    tick,
    mover,
    abrir() { estado.raioAlvo = raioPadrao(); },
    fechar() { estado.raioAlvo = 0; },
    // mostra o capacete inteiro (útil para conferir a pintura)
    vestirTudo() { estado.alvoX = estado.alvoY = 0; U.uMouse.value.set(0, 0); estado.raioAlvo = estado.raio = 1e5; },
    get pronto() { return pronto; },
    set fio(v) { estado.fio = v; },
    get fio() { return estado.fio; },
    set ativo(v) { estado.ativo = v; },
    // raio e centro atuais da lente em px CSS da tela (para o anel em HTML)
    lenteNaTela() {
      const r = canvas.getBoundingClientRect();
      return {
        x: r.left + U.uMouse.value.x / dpr,
        y: r.bottom - U.uMouse.value.y / dpr,
        r: Math.min(estado.raio, raioPadrao() * 1.01) / dpr,
        max: raioPadrao() / dpr,
      };
    },
  };
}
