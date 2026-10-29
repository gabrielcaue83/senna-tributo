import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// Capacete 3D do hero: modelo com textura própria (cor, relevo fino e brilho),
// otimizado para a web em public/modelos/capacete-pbr.glb.
// O wireframe usa uma versão bem simplificada da mesma malha (capacete-fio.glb).
//
// Tudo é medido em pixels da foto original (2000 × 1600). A câmera
// ortográfica usa essas mesmas unidades, então o capacete fica sempre em
// cima da cabeça, qualquer que seja o tamanho da tela.
const FOTO = { w: 2000, h: 1600 };
// Centro do capacete na foto, escala (px da foto por unidade do modelo)
// "largura" aperta só na horizontal; giro vira a frente para a câmera.
const CAP = { x: 1012, y: 784, escala: 615, largura: 0.9, giroY: 0 };
const URL_MODELO = '/modelos/capacete-pbr.glb';
const URL_FIO = '/modelos/capacete-fio.glb';

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
  // Recorta um material pelo círculo: "dentro" mostra só no círculo, "fora" esconde nele.
  const lente = (mat, modo) => {
    const antes = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      antes?.(sh, r);
      sh.uniforms.uMouse = U.uMouse;
      sh.uniforms.uRaio = U.uRaio;
      const teste = modo === 'dentro' ? 'if (dL > uRaio) discard;' : 'if (dL < uRaio) discard;';
      sh.fragmentShader = 'uniform vec2 uMouse;\nuniform float uRaio;\n' +
        sh.fragmentShader.replace('void main() {', `void main() {\n  float dL = distance(gl_FragCoord.xy, uMouse);\n  ${teste}\n`);
    };
    mat.needsUpdate = true;
    return mat;
  };

  const capacete = new THREE.Group();
  capacete.position.set(CAP.x, -CAP.y, 0);
  capacete.scale.set(CAP.escala * CAP.largura, CAP.escala, CAP.escala);
  cena.add(capacete);
  // "giro" fica num grupo de dentro, para a rotação do mouse somar por fora
  const giro = new THREE.Group();
  giro.rotation.y = CAP.giroY;
  capacete.add(giro);

  const fioMat = lente(new THREE.LineBasicMaterial({ color: '#0f2a1d', transparent: true, opacity: 0, depthTest: false }), 'fora');

  let pronto = false;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  Promise.all([loader.loadAsync(URL_MODELO), loader.loadAsync(URL_FIO)]).then(([gModelo, gFio]) => {
    // centraliza pela caixa do modelo (os dois arquivos têm as mesmas coordenadas)
    const caixa = new THREE.Box3().setFromObject(gModelo.scene);
    const centro = caixa.getCenter(new THREE.Vector3());

    gModelo.scene.traverse((o) => {
      if (o.isMesh) {
        o.material.side = THREE.FrontSide;
        o.material.envMapIntensity = 0.8;
        lente(o.material, 'dentro');
      }
    });
    gModelo.scene.position.sub(centro);
    giro.add(gModelo.scene);

    gFio.scene.traverse((o) => {
      if (o.isMesh) {
        const linhas = new THREE.LineSegments(new THREE.WireframeGeometry(o.geometry), fioMat);
        linhas.renderOrder = 2;
        o.updateWorldMatrix(true, false);
        linhas.applyMatrix4(o.matrixWorld);
        linhas.position.sub(centro);
        giro.add(linhas);
      }
    });
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
    // para ajustar posição/escala/giro ao vivo pelo console (só para testes)
    _ajuste: { capacete, giro },
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
