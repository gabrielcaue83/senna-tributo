import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RASTRO, GLSL_RASTRO } from './rastro.js';

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
const CAP = { x: 1012, y: 790, escala: 645, largura: 0.93, giroY: 0 };
// Queixo: a partir de "inicio" (fração da altura, de baixo para cima):
// "aperto" afina um pouco a parte de baixo inteira; "bico" afunila só o que
// projeta para a frente (quanto mais à frente, mais estreito) e "avanco"
// empurra a ponta do queixo um pouco para a frente, deixando-o pontudo.
const QUEIXO = { inicio: 0.45, aperto: 0.05, bico: 0.3, avanco: 0.06 };
// Pulso do wireframe: a cada "periodo" segundos uma linha discreta desce de
// "topo" até "base" (alturas do modelo: 0 = base, 1,45 = topo) e os polígonos
// vão aparecendo junto com ela, de leve. Com o capacete todo desenhado, ele
// some inteiro antes do próximo ciclo.
// "descida" = fração do ciclo que a linha leva descendo; "some" = fração final
// em que tudo se apaga. "forca" = quanto os polígonos aparecem; "linha" = brilho.
export const PULSO = { periodo: 0.8, topo: 1.6, base: -0.15, descida: 0.6, some: 0.25, forca: 0.55, linha: 0.6 };
const REDUZIR = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Giro 3D com o mouse: a cabeça (foto com mapa de profundidade) e o capacete
// giram juntos. "y"/"x" = giro máximo do capacete (radianos); "foto" = quanto
// a parte mais próxima da foto (o nariz) se desloca, em fração da largura.
const GIRO = { y: 0.045, x: 0.025, foto: 0.016 };
const URL_FOTO = '/fotos/senna-hero.webp';
const URL_PROFUNDIDADE = '/fotos/senna-profundidade.png?v=2';
const URL_MODELO = '/modelos/capacete-pbr.glb?v=pintura-limpa-1'; // mude o v= ao trocar o arquivo (evita cache)
const URL_FIO = '/modelos/capacete-fio.glb';

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

// Afina o queixo: a parte de baixo estreita um pouco e, principalmente, a
// ponta da frente afunila e avança, como o "bico" de um capacete de F1.
function afinarQueixo(g, yMin, yMax, zMax) {
  const p = g.attributes.position;
  const yIni = yMin + (yMax - yMin) * QUEIXO.inicio;
  const suave = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y >= yIni) continue;
    const ty = suave((yIni - y) / (yIni - yMin)); // 0 no início do queixo, 1 na base
    const z = p.getZ(i);
    const tz = suave(z / zMax);                    // 0 no meio, 1 na ponta da frente
    p.setX(i, p.getX(i) * (1 - QUEIXO.aperto * ty - QUEIXO.bico * ty * tz));
    if (z > 0) p.setZ(i, z + zMax * QUEIXO.avanco * ty * tz);
  }
  p.needsUpdate = true;
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

// Pintura de verdade: a textura já vem limpa (cores sólidas, feita por
// tools/limpar-textura.mjs), sem metal e com verniz brilhante por cima.
// O brilho e os reflexos são todos calculados na hora pela luz da cena.
function materialPintura(orig) {
  const m = new THREE.MeshPhysicalMaterial({
    map: orig.map,
    roughness: 0.3,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 0.6,
  });
  return m;
}

export function criarCapacete({ canvas, area }) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  // até 1,5x: a foto agora pode ficar maior que a tela e o canvas ficaria pesado
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.NeutralToneMapping;

  const cena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const cam = new THREE.OrthographicCamera(0, FOTO.w, 0, -FOTO.h, -4000, 4000);
  cam.position.z = 2000;

  // Luz de estúdio: principal quente, preenchimento suave e duas luzes por
  // trás que desenham um contorno claro nas bordas do capacete.
  const principal = new THREE.DirectionalLight('#fff4dc', 1.1);
  principal.position.set(-0.7, 1, 1.1);
  const preench = new THREE.DirectionalLight('#dfe9ff', 0.35);
  preench.position.set(1, -0.2, 0.8);
  const contornoE = new THREE.DirectionalLight('#cfe6ff', 2.4);
  contornoE.position.set(-1.3, 0.5, -0.9);
  const contornoD = new THREE.DirectionalLight('#fff1c4', 2.0);
  contornoD.position.set(1.3, 0.35, -0.9);
  cena.add(principal, preench, contornoE, contornoD);

  // Brilho que acompanha o mouse (e varre o capacete na entrada)
  const brilho = new THREE.PointLight('#fffaf0', 0, 0, 0);
  brilho.position.set(1000, -700, 650);
  cena.add(brilho);

  // Uniforms compartilhados, em pixels do canvas (origem embaixo, como
  // gl_FragCoord): o rastro do mouse (computador) e o círculo do toque (celular).
  const U = {
    uMouse: { value: new THREE.Vector2(-9999, -9999) },
    uRaio: { value: 0 },
    uTempo: { value: 0 },
    uRastro: { value: Array.from({ length: RASTRO.capacidade }, () => new THREE.Vector4()) },
    uRastroN: { value: 0 },
    uRastroR: { value: RASTRO.raio },
    uRastroT: { value: 0 },
    uCortina: { value: 0 },  // 0 = normal; 1 = cortina desceu e revelou o capacete inteiro
    uAltPx: { value: 1 },    // altura do canvas em pixels
    uTela: { value: new THREE.Vector4(0, 0, 1, 1) }, // canvas na tela: esquerda, topo (px CSS), dpr, altura da janela
  };
  const GLSL_REVELA = /* glsl */ `
uniform vec2 uMouse;
uniform float uRaio, uTempo, uCortina, uAltPx;
uniform vec4 uTela;
${GLSL_RASTRO}
float revelado() {
  // cortina descendo do topo da tela (hover no card da corrida). A conta é
  // feita em px da tela, igual à do fundo (topo.js), para as bordas baterem.
  if (uCortina > 0.0) {
    float tx = uTela.x + gl_FragCoord.x / uTela.z;
    float ty = uTela.y + (uAltPx - gl_FragCoord.y) / uTela.z;
    float onda = (sin(tx * 0.011 + uTempo * 2.4) + 0.5 * sin(tx * 0.027 - uTempo * 3.1)) * 0.025;
    if (ty / uTela.w < uCortina * 1.15 + onda) return 1.0;
  }
  if (distance(gl_FragCoord.xy, uMouse) < uRaio) return 1.0; // toque no celular
  return step(0.5, mascaraRastro(gl_FragCoord.xy));          // rastro do mouse
}`;
  // Recorta um material pela revelação: "dentro" mostra só onde revelou
  // (o capacete pintado); "fora" esconde onde revelou (o wireframe).
  const lente = (mat, modo) => {
    const antes = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      antes?.(sh, r);
      Object.assign(sh.uniforms, U);
      const teste = modo === 'dentro' ? 'if (revelado() < 0.5) discard;' : 'if (revelado() > 0.5) discard;';
      sh.fragmentShader = GLSL_REVELA + '\n' +
        sh.fragmentShader.replace('void main() {', `void main() {\n  ${teste}\n`);
    };
    mat.needsUpdate = true;
    return mat;
  };

  // ---------- Foto do Senna em 3D ----------
  // A foto é desenhada aqui (e não mais só pelo <img>) para poder "girar":
  // cada pixel se desloca conforme a profundidade dele (nariz mais, ombros
  // menos), o que dá a impressão de a cabeça virar um pouquinho.
  const uFoto = {
    uFoto: { value: null }, uProf: { value: null },
    uGiro: { value: new THREE.Vector2() }, uForca: { value: GIRO.foto },
  };
  let fotoPronta = false, imgEscondida = false;
  // avisa quando o capacete 3D e a foto 3D estão prontos (o preloader espera isso)
  let avisarCarregado;
  const carregado = new Promise((ok) => { avisarCarregado = ok; });
  const conferirCarregado = () => { if (fotoPronta && pronto) avisarCarregado(); };
  const carregarTextura = (url) => new Promise((ok) => new THREE.TextureLoader().load(url, ok));
  Promise.all([carregarTextura(URL_FOTO), carregarTextura(URL_PROFUNDIDADE)]).then(([foto, prof]) => {
    foto.colorSpace = THREE.NoColorSpace; // passa a cor da foto como está
    foto.anisotropy = 4;
    uFoto.uFoto.value = foto;
    uFoto.uProf.value = prof;
    fotoPronta = true;
    conferirCarregado();
  });
  const planoFoto = new THREE.Mesh(
    new THREE.PlaneGeometry(FOTO.w, FOTO.h),
    new THREE.ShaderMaterial({
      uniforms: uFoto,
      transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform sampler2D uFoto, uProf;
        uniform vec2 uGiro;
        uniform float uForca;
        varying vec2 vUv;
        vec2 deslocar(vec2 uv) {
          float d = texture2D(uProf, uv).r;
          return uGiro * (d - 0.45) * uForca;
        }
        void main() {
          // duas passadas para achar de onde veio cada pixel depois de "girar"
          vec2 uv = vUv - deslocar(vUv);
          uv = vUv - deslocar(uv);
          vec4 c = texture2D(uFoto, uv);
          gl_FragColor = vec4(c.rgb * c.a, c.a);
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
  const fioBase = new THREE.LineBasicMaterial({ color: '#0f2a1d', transparent: true, opacity: 0, depthTest: true, depthWrite: false });
  fioBase.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uPulso);
    sh.vertexShader = 'varying float vAltura;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vAltura = position.y;');
    sh.fragmentShader = 'uniform float uOnda, uGeral, uForca, uLinha;\nvarying float vAltura;\n' +
      sh.fragmentShader.replace('#include <opaque_fragment>', `
  float linhaP = exp(-pow((vAltura - uOnda) / 0.03, 2.0)); // linha fina do pulso
  float revelado = smoothstep(uOnda - 0.015, uOnda + 0.015, vAltura); // acima da linha: já apareceu
  diffuseColor.a = min(1.0, diffuseColor.a * (uForca * revelado * uGeral + uLinha * linhaP * uGeral));
  #include <opaque_fragment>`);
  };
  const fioMat = lente(fioBase, 'fora');

  let pronto = false;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  Promise.all([loader.loadAsync(URL_MODELO), loader.loadAsync(URL_FIO)]).then(([gModelo, gFio]) => {
    const malhas = [];
    gModelo.scene.traverse((o) => { if (o.isMesh) malhas.push(o); });
    const fios = [];
    gFio.scene.traverse((o) => { if (o.isMesh) fios.push(o); });
    [...malhas, ...fios].forEach(assar);

    // caixa e centro do modelo (os dois arquivos têm as mesmas coordenadas)
    const caixa = new THREE.Box3();
    malhas.forEach((m) => { m.geometry.computeBoundingBox(); caixa.union(m.geometry.boundingBox); });
    const centro = caixa.getCenter(new THREE.Vector3());
    [...malhas, ...fios].forEach((m) => afinarQueixo(m.geometry, caixa.min.y, caixa.max.y, caixa.max.z - centro.z));

    malhas.forEach((o) => {
      o.material = lente(materialPintura(o.material), 'dentro');
      o.position.copy(centro).negate();
      giro.add(o);
    });
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

      const linhas = new THREE.LineSegments(new THREE.WireframeGeometry(o.geometry), fioMat);
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
    capacete.rotation.set(estado.rotX + 0.04, estado.rotY, 0);
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
    U.uAltPx.value = estado.alturaCss * dpr;
    const rc = canvas.getBoundingClientRect();
    U.uTela.value.set(rc.left, rc.top, dpr, window.innerHeight);

    // brilho: segue a lente; quando o capacete aparece, varre o capacete
    if (estado.varre >= 0 && estado.varre < 1) {
      // varredura: passa da esquerda para a direita e se junta ao brilho do mouse
      brilho.position.set(560 + estado.varre * 960, -600, 650);
      brilho.intensity = Math.sin(estado.varre * Math.PI) * 4 + estado.brilho * estado.varre;
    } else {
      estado.brilho += (estado.brilhoAlvo - estado.brilho) * 0.08;
      const fx = U.uMouse.value.x / dpr / estado.escala;
      const fy = (estado.alturaCss - U.uMouse.value.y / dpr) / estado.escala;
      brilho.position.set(fx, -fy, 650);
      brilho.intensity = estado.brilho;
    }

    renderer.autoClear = true;
    renderer.render(cenaFoto, cam);   // 1º a foto
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(cena, cam);       // 2º o capacete e o wireframe por cima
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
    // rastro em px da tela: [{ x, y, idade, liga }] -> uniforms em px do canvas
    definirRastro(lista) {
      const n = Math.min(lista.length, RASTRO.capacidade);
      for (let i = 0; i < n; i++) {
        const p = lista[lista.length - n + i];
        const [u, w] = paraFoto(p.x, p.y);
        U.uRastro.value[i].set(u * dpr, (area.offsetHeight - w) * dpr, p.idade, p.liga);
      }
      U.uRastroN.value = n;
      U.uRastroR.value = RASTRO.raio * dpr;
      U.uRastroT.value = performance.now() / 1000;
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
    // mostra o capacete inteiro (útil para conferir a pintura)
    vestirTudo() { estado.alvoX = estado.alvoY = 0; U.uMouse.value.set(0, 0); estado.raioAlvo = estado.raio = 1e5; },
    get pronto() { return pronto; },
    // cortina que revela o capacete inteiro (0 a 1), animada pelo card da corrida
    set cortina(v) { U.uCortina.value = v; },
    get cortina() { return U.uCortina.value; },
    carregado, // Promise: capacete e foto prontos
    // para ajustar posição/escala/giro ao vivo pelo console (só para testes)
    _ajuste: { capacete, giro, U },
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
