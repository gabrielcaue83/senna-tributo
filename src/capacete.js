import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { GLSL_TRILHA } from './rastro.js';
import { GLSL_CORTINA } from './cortina.js';

// Capacete do hero = uma FOTO do Senna de capacete (como no site do Lando):
// duas fotos na mesma moldura, a de baixo sem capacete e a de cima só com o
// capacete recortado (tools/montar-capacete.mjs). O rastro do mouse, a gota e
// a cortina revelam a de cima. As duas giram em 3D com o mouse (cada uma com
// seu mapa de profundidade) e o capacete ganha um brilho que segue o mouse.
// Por cima vai o wireframe, um capacete 3D simplificado (capacete-fio.glb).
//
// Tudo é medido em pixels da foto original (2000 × 1600). A câmera
// ortográfica usa essas mesmas unidades, então tudo fica sempre no lugar,
// qualquer que seja o tamanho da tela.
const FOTO = { w: 2000, h: 1600 };
// Wireframe: malha montada a partir da própria foto do capacete
// (tools/malha-do-capacete.mjs, que imprime estes números): centro na foto,
// escala (px da foto por unidade do modelo), "largura" aperta só na
// horizontal; giro vira a frente para a câmera.
const CAP = { x: 1009, y: 846, escala: 742.1, largura: 1, giroY: 0 };
// Volume dos polígonos (WebGL): as linhas de frente para a câmera ficam fracas
// ("centro") e as das curvas/bordas ficam fortes, como num raio X do casco.
// "sombra" = quanto o lado oposto ao mouse escurece (luz vinda do mouse).
const FIO_3D = { centro: 0.3, sombra: 0.5 };
// Brilho do verniz na foto do capacete: "forca" = intensidade com o mouse no
// hero, "dureza" = quão pequeno e concentrado é o reflexo, "altura" = quão
// acima da foto fica a luz (maior = reflexo mais perto do meio do capacete).
const BRILHO = { forca: 0.55, dureza: 70, altura: 0.55 };
// Forma do capacete da foto (elipsoide, em px da foto), a mesma usada no mapa
// de profundidade (tools/montar-capacete.mjs imprime esses números). Daqui sai
// a curvatura lisa do verniz para o brilho (o mapa em PNG faria degraus).
const ELIPSE = { x: 1008, y: 814, rx: 469, ry: 603, z: 391 };
// Pulso do wireframe: a cada "periodo" segundos uma linha discreta desce de
// "topo" até "base" (alturas do modelo: 0 = base, 1,45 = topo) e os polígonos
// vão aparecendo junto com ela, de leve. Com o capacete todo desenhado, ele
// some inteiro antes do próximo ciclo.
// "descida" = fração do ciclo que a linha leva descendo; "some" = fração final
// em que tudo se apaga. "forca" = quanto os polígonos aparecem; "linha" = brilho.
export const PULSO = { periodo: 1.6, topo: 1.6, base: -0.15, descida: 0.6, some: 0.25, forca: 0.55, linha: 0.6 };
const REDUZIR = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Giro 3D com o mouse: a cabeça (foto com mapa de profundidade) e o capacete
// giram juntos. "y"/"x" = giro máximo do capacete (radianos); "foto" = quanto
// a parte mais próxima da foto (o nariz) se desloca, em fração da largura.
const GIRO = { y: 0.045, x: 0.025, foto: 0.016 };
// BASE = "/" no computador e "/senna-tributo/" no GitHub Pages (ver vite.config.js)
const BASE = import.meta.env.BASE_URL;
// mude o v= ao trocar o arquivo (evita cache)
const URL_FOTO = `${BASE}fotos/senna-hero.webp?v=nitida`;
const URL_PROFUNDIDADE = `${BASE}fotos/senna-profundidade.png?v=nitida`;
const URL_CAPACETE = `${BASE}fotos/senna-capacete.webp?v=centralizado`;
const URL_PROF_CAPACETE = `${BASE}fotos/senna-capacete-profundidade.png?v=centralizado`;
const URL_FIO = `${BASE}modelos/capacete-foto-fio.glb?v=centralizado`;

// O GLB comprimido guarda posições numa escala própria (desfeita pelo nó).
// Aqui isso vira Float32 nas unidades do modelo, para dar para deformar.
function assar(mesh) {
  mesh.updateWorldMatrix(true, false);
  const g = mesh.geometry;
  const m = mesh.matrixWorld;
  const nm = new THREE.Matrix3().getNormalMatrix(m);
  const p = g.attributes.position;
  const pos = new Float32Array(p.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(m);
    pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const n = g.attributes.normal;
  if (n) {
    const nor = new Float32Array(n.count * 3);
    for (let i = 0; i < n.count; i++) {
      v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      nor[i * 3] = v.x; nor[i * 3 + 1] = v.y; nor[i * 3 + 2] = v.z;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  }
  mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1);
  mesh.updateMatrix();
}

export function criarCapacete({ canvas, area }) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  // até 1,5x: a foto agora pode ficar maior que a tela e o canvas ficaria pesado
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.NeutralToneMapping;

  const cena = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(0, FOTO.w, 0, -FOTO.h, -4000, 4000);
  cam.position.z = 2000;

  // Uniforms compartilhados, em pixels do canvas (origem embaixo, como
  // gl_FragCoord): o rastro do mouse (computador) e o círculo do toque (celular).
  const U = {
    uMouse: { value: new THREE.Vector2(-9999, -9999) },
    uRaio: { value: 0 },
    uTempo: { value: 0 },
    uTrilha: { value: null }, // tinta do rastro de água (rastro.js)
    uTrilhaT: { value: 0 },
    uCortina: { value: 0 },  // 0 = normal; 1 = cortina desceu e revelou o capacete inteiro
    uAltPx: { value: 1 },    // altura do canvas em pixels
    uTela: { value: new THREE.Vector4(0, 0, 1, 1) }, // canvas na tela: esquerda, topo (px CSS), dpr, altura da janela
    uLargTela: { value: 1 },   // largura da janela (px CSS)
    uBarriga: { value: 0.06 }, // barriga da cortina (ver cortina.js)
  };
  const GLSL_REVELA = /* glsl */ `
uniform vec2 uMouse;
uniform float uRaio, uTempo, uCortina, uAltPx, uLargTela;
uniform vec4 uTela;
${GLSL_TRILHA}
${GLSL_CORTINA}
// este pixel em px da tela (as formas da cortina e da água são medidas na tela,
// igual ao fundo em topo.js, para as bordas baterem)
vec2 telaCss() { return vec2(uTela.x + gl_FragCoord.x / uTela.z, uTela.y + (uAltPx - gl_FragCoord.y) / uTela.z); }
float revelado() {
  // cortina descendo do topo da tela (hover no card da corrida), numa barriga só
  if (uCortina > 0.0) {
    vec2 tl = telaCss();
    if (tl.y / uTela.w < bordaCortina(tl.x / uLargTela, uCortina)) return 1.0;
  }
  if (distance(gl_FragCoord.xy, uMouse) < uRaio) return 1.0; // toque no celular
  // rastro de água do mouse e das gotas fantasmas (rastro.js)
  return step(0.5, trilha(telaCss(), vec2(uLargTela, uTela.w)));
}`;

  // ---------- Foto do Senna em 3D ----------
  // A foto é desenhada aqui (e não mais só pelo <img>) para poder "girar":
  // cada pixel se desloca conforme a profundidade dele (nariz mais, ombros
  // menos), o que dá a impressão de a cabeça virar um pouquinho.
  // O mesmo vale para a foto do capacete, que fica por cima e só aparece onde
  // foi revelada.
  const uFoto = {
    uFoto: { value: null }, uProf: { value: null },
    uCap: { value: null }, uProfCap: { value: null },
    uGiro: { value: new THREE.Vector2() }, uForca: { value: GIRO.foto },
    uLuz: { value: new THREE.Vector2(-9999, -9999) }, // posição da luz do brilho (px do canvas)
    uBrilho: { value: 0 }, uDureza: { value: BRILHO.dureza }, uLuzAlt: { value: BRILHO.altura },
    uElipse: { value: new THREE.Vector4(ELIPSE.x, ELIPSE.y, ELIPSE.rx, ELIPSE.ry) }, uElipseZ: { value: ELIPSE.z },
    uVer: { value: 0 }, // 1 = mostra o capacete inteiro (para conferir o encaixe)
  };
  let fotoPronta = false, imgEscondida = false;
  // avisa quando as fotos e o wireframe estão prontos (o preloader espera isso)
  let avisarCarregado;
  const carregado = new Promise((ok) => { avisarCarregado = ok; });
  const conferirCarregado = () => { if (fotoPronta && pronto) avisarCarregado(); };
  const carregarTextura = (url) => new Promise((ok) => new THREE.TextureLoader().load(url, ok));
  Promise.all([URL_FOTO, URL_PROFUNDIDADE, URL_CAPACETE, URL_PROF_CAPACETE].map(carregarTextura)).then(([foto, prof, cap, profCap]) => {
    for (const t of [foto, cap]) {
      t.colorSpace = THREE.NoColorSpace; // passa a cor da foto como está
      t.anisotropy = 4;
    }
    uFoto.uFoto.value = foto;
    uFoto.uProf.value = prof;
    uFoto.uCap.value = cap;
    uFoto.uProfCap.value = profCap;
    fotoPronta = true;
    conferirCarregado();
  });
  const planoFoto = new THREE.Mesh(
    new THREE.PlaneGeometry(FOTO.w, FOTO.h),
    new THREE.ShaderMaterial({
      uniforms: { ...uFoto, ...U },
      transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: GLSL_REVELA + `
        uniform sampler2D uFoto, uProf, uCap, uProfCap;
        uniform vec2 uGiro, uLuz;
        uniform float uForca, uBrilho, uDureza, uLuzAlt, uVer, uElipseZ;
        uniform vec4 uElipse;
        varying vec2 vUv;
        vec2 deslocarRosto(vec2 uv) { return uGiro * (texture2D(uProf, uv).r - 0.45) * uForca; }
        vec2 deslocarCap(vec2 uv) { return uGiro * (texture2D(uProfCap, uv).r - 0.45) * uForca; }
        void main() {
          // duas passadas para achar de onde veio cada pixel depois de "girar"
          vec2 uv = vUv - deslocarRosto(vUv);
          uv = vUv - deslocarRosto(uv);
          vec4 c = texture2D(uFoto, uv);
          vec3 cor = c.rgb * c.a; // pré-multiplicado
          float a = c.a;

          float rev = max(revelado(), uVer);
          if (rev > 0.0) {
            vec2 uc = vUv - deslocarCap(vUv);
            uc = vUv - deslocarCap(uc);
            vec4 k = texture2D(uCap, uc);
            if (k.a > 0.0) {
              // brilho do verniz: a curvatura vem da forma do capacete
              // (elipsoide); a luz fica um pouco acima do ponto do mouse
              vec2 q = vec2(uc.x * 2000.0 - uElipse.x, uElipse.y - (1.0 - uc.y) * 1600.0); // y para cima
              vec2 e = q / uElipse.zw;
              float z = sqrt(max(0.0, 1.0 - dot(e, e))) * uElipseZ;
              vec3 n = normalize(vec3(q / (uElipse.zw * uElipse.zw), z / (uElipseZ * uElipseZ)));
              vec3 L = normalize(vec3((uLuz - gl_FragCoord.xy) / uAltPx, uLuzAlt));
              vec3 h = normalize(L + vec3(0.0, 0.0, 1.0));
              float nh = max(dot(n, h), 0.0);
              float brilho = (pow(nh, uDureza) + 0.12 * pow(nh, 6.0)) * uBrilho;
              vec3 kc = min(k.rgb + vec3(1.0, 0.98, 0.93) * brilho, 1.0);
              float ka = k.a * rev;
              cor = kc * ka + cor * (1.0 - ka);
              a = ka + a * (1.0 - ka);
            }
          }
          gl_FragColor = vec4(cor, a);
        }`,
    }),
  );
  planoFoto.position.set(FOTO.w / 2, -FOTO.h / 2, -1500);
  planoFoto.renderOrder = -1;
  // A foto fica numa cena própria, desenhada ANTES do capacete. Se ficasse na
  // mesma cena, por ser transparente ela seria desenhada depois dos objetos
  // sólidos e cobriria o capacete (a lente e as revelações sumiam no rosto).
  const cenaFoto = new THREE.Scene();
  cenaFoto.add(planoFoto);

  const capacete = new THREE.Group();
  capacete.position.set(CAP.x, -CAP.y, 0);
  capacete.scale.set(CAP.escala * CAP.largura, CAP.escala, CAP.escala);
  cena.add(capacete);
  // "giro" fica num grupo de dentro, para a rotação do mouse somar por fora
  const giro = new THREE.Group();
  giro.rotation.y = CAP.giroY;
  capacete.add(giro);

  // Wireframe pulsando: todos os polígonos aparecem juntos, de leve, e somem
  // a cada PULSO.periodo segundos. Uma linha fina e discreta desce junto.
  const uPulso = {
    uOnda: { value: 10 }, uGeral: { value: 0 },
    uForca: { value: PULSO.forca }, uLinha: { value: PULSO.linha },
  };
  // depthTest ligado: as linhas da parte de trás ficam escondidas pela
  // máscara de profundidade (ver "mascara" no carregamento)
  // Onde o capacete foi revelado (rastro, gotas, cortina) os polígonos NÃO
  // aparecem: eles ficam só sobre o rosto.
  const uNoCap = {
    uCentro: { value: FIO_3D.centro }, uSombra: { value: FIO_3D.sombra },
    uLuzDir: { value: new THREE.Vector3(-0.4, 0.5, 0.75).normalize() }, // de onde vem a luz (segue o mouse)
  };
  const fioMat = new THREE.LineBasicMaterial({ color: '#0f2a1d', transparent: true, opacity: 0, depthTest: true, depthWrite: false });
  fioMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uPulso, U, uNoCap);
    sh.vertexShader = 'attribute float destaque;\nvarying float vAltura, vDestaque;\nvarying vec3 vNormalV;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
  vAltura = position.y;
  vDestaque = destaque; // 1 na moldura do visor
  vNormalV = normalize(normalMatrix * normal); // para onde aquele ponto do casco olha`);
    sh.fragmentShader = GLSL_REVELA +
      '\nuniform float uOnda, uGeral, uForca, uLinha, uCentro, uSombra;\nuniform vec3 uLuzDir;\nvarying float vAltura, vDestaque;\nvarying vec3 vNormalV;\n' +
      sh.fragmentShader.replace('#include <opaque_fragment>', `
  if (revelado() > 0.5) discard; // capacete à mostra ali: sem polígonos
  float linhaP = exp(-pow((vAltura - uOnda) / 0.03, 2.0)); // linha fina do pulso
  float jaPassou = smoothstep(uOnda - 0.015, uOnda + 0.015, vAltura); // acima da linha: já apareceu
  diffuseColor.a = min(1.0, diffuseColor.a * (uForca * jaPassou * uGeral + uLinha * linhaP * uGeral));
  // volume: fraco onde o casco olha para a câmera, forte nas curvas e bordas
  vec3 nv = normalize(vNormalV);
  float curva = pow(1.0 - clamp(nv.z, 0.0, 1.0), 1.3);
  float luz = max(dot(nv, uLuzDir), 0.0);
  diffuseColor.a *= mix(uCentro, 1.0, max(curva, vDestaque)) * mix(1.0 + uSombra * 0.4, 1.0 - uSombra, luz);
  #include <opaque_fragment>`);
  };

  let pronto = false;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  loader.loadAsync(URL_FIO).then((gFio) => {
    const fios = [];
    gFio.scene.traverse((o) => { if (o.isMesh) fios.push(o); });
    fios.forEach(assar);

    // caixa e centro do modelo
    const caixa = new THREE.Box3();
    fios.forEach((m) => { m.geometry.computeBoundingBox(); caixa.union(m.geometry.boundingBox); });
    const centro = caixa.getCenter(new THREE.Vector3());

    // Máscara de profundidade: o próprio capacete simples, desenhado sem cor
    // antes das linhas. Ele só "avisa" a placa de vídeo do que está na frente,
    // então as linhas da nuca e da borda de trás somem atrás da casca.
    // O polygonOffset empurra a máscara um tiquinho para trás, para as linhas
    // da frente (que estão em cima da mesma superfície) continuarem aparecendo.
    const mascaraMat = new THREE.MeshBasicMaterial({
      colorWrite: false, depthWrite: true,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2,
    });
    fios.forEach((o) => {
      const mascara = new THREE.Mesh(o.geometry, mascaraMat);
      mascara.renderOrder = 1;
      mascara.position.copy(centro).negate();
      giro.add(mascara);

      // linhas = arestas dos triângulos, levando a normal de cada ponto (para
      // o shader saber a curvatura do casco ali)
      const g = o.geometry;
      g.computeVertexNormals();
      const tri = g.index.array, vistas = new Set(), pares = [];
      for (let i = 0; i < tri.length; i += 3) {
        for (const [a, b] of [[tri[i], tri[i + 1]], [tri[i + 1], tri[i + 2]], [tri[i + 2], tri[i]]]) {
          const k = a < b ? a * 1e6 + b : b * 1e6 + a;
          if (!vistas.has(k)) { vistas.add(k); pares.push(a, b); }
        }
      }
      const arestas = new THREE.BufferGeometry();
      arestas.setAttribute('position', g.attributes.position);
      arestas.setAttribute('normal', g.attributes.normal);
      arestas.setAttribute('destaque', g.attributes._destaque
        || new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
      arestas.setIndex(pares);
      const linhas = new THREE.LineSegments(arestas, fioMat);
      linhas.renderOrder = 2;
      linhas.position.copy(centro).negate();
      giro.add(linhas);
    });
    pronto = true;
    conferirCarregado();
  });

  // ---------- estado ----------
  const estado = {
    alvoX: -9999, alvoY: -9999,
    raioAlvo: 0, raio: 0,
    rotX: 0, rotY: 0, alvoRotX: 0, alvoRotY: 0,
    fio: 0, // opacidade do wireframe (animada de fora)
    varre: -1, // 0..1 durante a varredura de luz da entrada
    brilho: 0, brilhoAlvo: 0,
    ativo: true,
  };

  const medir = () => {
    // tamanho sem a inclinação 3D (offsetWidth/Height ignoram transform)
    const r = { width: area.offsetWidth, height: area.offsetHeight };
    renderer.setSize(r.width, r.height, false);
    estado.escala = r.height / FOTO.h; // px da tela por px da foto
    estado.alturaCss = r.height;
  };
  medir();
  window.addEventListener('resize', medir);

  // A área da foto pode estar inclinada em 3D (main.js). Para a lente ficar
  // exatamente sob o mouse, a conversão tela <-> foto usa a matriz completa
  // da área (com a perspectiva), e não o retângulo da tela.
  const matrizDaArea = () => {
    const cs = getComputedStyle(area);
    const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
    const [ox, oy] = cs.transformOrigin.split(' ').map(parseFloat);
    const pai = area.offsetParent.getBoundingClientRect();
    return new DOMMatrix()
      .translate(pai.left + area.offsetLeft + ox, pai.top + area.offsetTop + oy)
      .multiply(m)
      .translate(-ox, -oy);
  };
  // ponto da foto (px CSS, origem no canto de cima) -> ponto da tela
  const paraTela = (u, v) => {
    const p = matrizDaArea().transformPoint(new DOMPoint(u, v, 0, 1));
    return [p.x / p.w, p.y / p.w];
  };
  // ponto da tela -> ponto da foto (inverte a projeção do plano da foto)
  const paraFoto = (x, y) => {
    const M = matrizDaArea();
    const a = M.m11, b = M.m21, c = M.m41, d = M.m12, e = M.m22, f = M.m42, g = M.m14, h = M.m24, i = M.m44;
    // inversa da homografia [[a b c][d e f][g h i]]
    const A = e * i - f * h, B = c * h - b * i, C = b * f - c * e;
    const D = f * g - d * i, E = a * i - c * g, F = c * d - a * f;
    const G = d * h - e * g, H = b * g - a * h, I = a * e - b * d;
    const w = G * x + H * y + I;
    return [(A * x + B * y + C) / w, (D * x + E * y + F) / w];
  };

  // Posição do mouse em coordenadas do canvas (origem embaixo, como gl_FragCoord)
  const mover = (clientX, clientY) => {
    const [u, v] = paraFoto(clientX, clientY);
    estado.alvoX = u * dpr;
    estado.alvoY = (area.offsetHeight - v) * dpr;
    // o capacete não gira sozinho: ele acompanha a foto (parallax em main.js)
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
    capacete.rotation.set(estado.rotX, estado.rotY, 0);
    // a foto gira junto: mesmo ângulo, normalizado (-1 a 1)
    uFoto.uGiro.value.set(estado.rotY / GIRO.y, -estado.rotX / GIRO.x);
    fioMat.opacity = estado.fio;
    // fase do pulso (mesmo relógio da topografia do fundo, para baterem juntos)
    const fase = ((performance.now() / 1000) % PULSO.periodo) / PULSO.periodo;
    // a linha desce revelando os polígonos; depois tudo some junto.
    // Com "reduzir movimento" ligado no sistema, fica parado e sem piscar.
    if (REDUZIR) { uPulso.uOnda.value = PULSO.base; uPulso.uGeral.value = 0.5; } else {
    const desce = Math.min(1, fase / PULSO.descida);
    uPulso.uOnda.value = PULSO.topo - desce * (PULSO.topo - PULSO.base);
    const fim = (fase - (1 - PULSO.some)) / PULSO.some; // 0..1 no trecho final
    uPulso.uGeral.value = fim <= 0 ? 1 : 1 - fim * fim * (3 - 2 * fim);
    }

    U.uTempo.value = performance.now() / 1000;
    U.uTrilhaT.value = U.uTempo.value;
    if (U.uTrilha.value) U.uTrilha.value.needsUpdate = true; // tinta nova deste quadro
    U.uAltPx.value = estado.alturaCss * dpr;
    const rc = canvas.getBoundingClientRect();
    U.uTela.value.set(rc.left, rc.top, dpr, window.innerHeight);
    U.uLargTela.value = window.innerWidth;

    // luz dos polígonos: vem do lado onde está o mouse (o outro lado escurece)
    if (U.uMouse.value.x > -1000) {
      const k1 = estado.escala * dpr;
      const dx = (U.uMouse.value.x - CAP.x * k1) / (500 * k1);
      const dy = (U.uMouse.value.y - (FOTO.h - CAP.y) * k1) / (500 * k1);
      uNoCap.uLuzDir.value.set(dx, dy, 0.9).normalize();
    }

    // brilho do verniz: segue o mouse; quando o mouse entra, varre o capacete
    estado.brilho += (estado.brilhoAlvo - estado.brilho) * 0.08;
    const brilhoMouse = (estado.brilho / 2.4) * BRILHO.forca;
    if (estado.varre >= 0 && estado.varre < 1) {
      // varredura: passa da esquerda para a direita e se junta ao brilho do mouse
      const k2 = estado.escala * dpr;
      uFoto.uLuz.value.set((560 + estado.varre * 880) * k2, (FOTO.h - 560) * k2);
      uFoto.uBrilho.value = Math.sin(estado.varre * Math.PI) * BRILHO.forca * 1.3 + brilhoMouse * estado.varre;
    } else {
      uFoto.uLuz.value.copy(U.uMouse.value);
      uFoto.uBrilho.value = brilhoMouse;
    }

    renderer.autoClear = true;
    renderer.render(cenaFoto, cam);   // 1º a foto
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(cena, cam);       // 2º o wireframe por cima
    // com a foto 3D desenhada, o <img> original sai de cena (fica como reserva)
    if (fotoPronta && !imgEscondida) {
      const img = area.querySelector('img');
      if (img) img.style.visibility = 'hidden';
      imgEscondida = true;
    }
  };

  return {
    tick,
    mover,
    // tinta do rastro de água (canvas da simulação em rastro.js); é relida a
    // cada quadro
    usarTrilha(canvasTrilha) {
      if (!canvasTrilha) return;
      const t = new THREE.CanvasTexture(canvasTrilha);
      t.colorSpace = THREE.NoColorSpace;
      t.minFilter = t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      U.uTrilha.value = t;
    },
    // brilho que segue o mouse (no computador não tem lente redonda)
    brilhar(ligado) { estado.brilhoAlvo = ligado ? 2.4 : 0; },
    // nx, ny de -0,5 a 0,5 (posição do mouse na tela): gira cabeça + capacete
    inclinar(nx, ny) {
      if (REDUZIR) return;
      estado.alvoRotY = nx * 2 * GIRO.y;
      estado.alvoRotX = ny * 2 * GIRO.x;
    },
    abrir() { estado.raioAlvo = raioPadrao(); estado.brilhoAlvo = 2.4; },
    fechar() { estado.raioAlvo = 0; estado.brilhoAlvo = 0; },
    set varre(v) { estado.varre = v; },
    get varre() { return estado.varre; },
    // mostra o capacete inteiro (útil para conferir o encaixe)
    vestirTudo() { estado.alvoX = estado.alvoY = 0; U.uMouse.value.set(0, 0); estado.raioAlvo = estado.raio = 1e5; },
    get pronto() { return pronto; },
    // cortina que revela o capacete inteiro (0 a 1), animada pelo card da corrida
    set cortina(v) { U.uCortina.value = v; },
    get cortina() { return U.uCortina.value; },
    set barriga(v) { U.uBarriga.value = v; },
    carregado, // Promise: fotos e wireframe prontos
    // para ajustar posição/escala/giro ao vivo pelo console (só para testes)
    _ajuste: { capacete, giro, U, uFoto },
    set fio(v) { estado.fio = v; },
    get fio() { return estado.fio; },
    set ativo(v) { estado.ativo = v; },
    // raio e centro atuais da lente em px CSS da tela (para o anel em HTML)
    lenteNaTela() {
      const [x, y] = paraTela(U.uMouse.value.x / dpr, area.offsetHeight - U.uMouse.value.y / dpr);
      return {
        x, y,
        r: Math.min(estado.raio, raioPadrao() * 1.01) / dpr,
        max: raioPadrao() / dpr,
      };
    },
  };
}
