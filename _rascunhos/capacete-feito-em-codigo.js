import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Tudo é medido em pixels da foto original (2000 × 1600).
// A câmera ortográfica usa essas mesmas unidades, então o capacete
// fica sempre em cima da cabeça, qualquer que seja o tamanho da tela.
const FOTO = { w: 2000, h: 1600 };
const CAP = { x: 1012, y: 830, s: 548 }; // centro e raio da casca
const CORTE = 0.72; // até onde a casca desce (fração de π)

// Viseira (em frações de π para theta, radianos para phi a partir da frente)
const VIS = { meia: 1.05, de: 0.385, ate: 0.605 };

const COR = {
  amarelo: '#ffcf00', verde: '#008a3e', azul: '#1e4fb4',
  escuro: '#0f2a1d', preto: '#111111', branco: '#f7f5ee',
};
const FONTE = '"Mona Sans Variable", "Arial Black", sans-serif';

const suave = (a, b, t) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

// Tira a forma de "bola": o queixo vem para frente e afina,
// como um capacete fechado de verdade. Recebe um ponto da esfera unitária.
function deformar(x, y, z) {
  const baixo = suave(0.05, -0.62, y); // 0 em cima, 1 no queixo
  const frente = Math.max(0, z);
  return [
    x * (1 - 0.08 * baixo),
    y - 0.05 * baixo * frente,
    z + 0.16 * baixo * frente * frente,
  ];
}
function deformarGeo(geo) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, y, z) || 1;
    const [a, b, c] = deformar(x / r, y / r, z / r);
    p.setXYZ(i, a * r, b * r, c * r);
  }
  geo.computeVertexNormals();
  return geo;
}
const pontoEsfera = (phi, th, r = 1) => {
  const [x, y, z] = deformar(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th));
  return [x * r, y * r, z * r];
};

function novoCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function textura(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function retArredondado(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

// ---------- PINTURA DA CASCA ----------
// x do canvas = volta horizontal (frente em W/4), y = de cima até CORTE·π.
function pintarCasca(c, g) {
  const W = c.width, H = c.height;
  const yDe = (theta) => (theta / CORTE) * H;
  const xFrente = W / 4;
  const pxPorRadU = W / (Math.PI * 2);
  const pxPorRadV = H / (Math.PI * CORTE);

  g.fillStyle = COR.amarelo;
  g.fillRect(0, 0, W, H);

  // Faixa que contorna o capacete: "frente" e "nuca" são a altura do centro.
  const faixa = (frente, nuca, esp, cor) => {
    const borda = (lado) => {
      const pts = [];
      for (let x = 0; x <= W; x += 6) {
        const phi = (x / W) * Math.PI * 2;
        const t = (1 - Math.cos(phi - Math.PI / 2)) / 2; // 0 na frente, 1 na nuca
        const centro = frente + (nuca - frente) * suave(0.15, 1, t);
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

  // Faixa verde larga por cima da viseira, com filetes branco e preto acima
  faixa(0.338 - 0.046, 0.47 - 0.046, 0.007, COR.preto);
  faixa(0.338 - 0.040, 0.47 - 0.040, 0.006, COR.branco);
  faixa(0.338, 0.47, 0.074, COR.verde);
  // Faixa azul logo abaixo da verde (aparece nas laterais e na nuca)
  faixa(0.5, 0.548, 0.05, COR.azul);
  // Filetes verde e branco embaixo da viseira
  faixa(0.617, 0.585, 0.012, COR.verde);
  faixa(0.631, 0.596, 0.007, COR.branco);

  // Respiros do queixo (vincos mais escuros)
  g.strokeStyle = 'rgba(150,110,0,0.45)';
  g.lineWidth = 5;
  [-1, 1].forEach((lado) => {
    g.beginPath();
    g.moveTo(xFrente + lado * 30, yDe(0.645));
    g.quadraticCurveTo(xFrente + lado * 120, yDe(0.655), xFrente + lado * 160, yDe(0.675));
    g.stroke();
  });

  // Adesivo preto no queixo
  {
    const th = 0.688, h = 58, larg = 300;
    g.save();
    g.translate(xFrente, yDe(th));
    retArredondado(g, -larg / 2, -h / 2, larg, h, 6);
    g.fillStyle = COR.preto; g.fill();
    g.scale(pxPorRadV / (pxPorRadU * Math.sin(th * Math.PI)), 1);
    g.fillStyle = COR.branco;
    g.font = `800 40px ${FONTE}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('BRASIL', 0, 2);
    g.restore();
  }

  // Bandeira do Brasil no topo da frente
  {
    const th = 0.2, h = 104;
    const k = pxPorRadV / (pxPorRadU * Math.sin(th * Math.PI)); // corrige a esfera
    const w = h * 1.43 * k / 1;
    g.save();
    g.translate(xFrente, yDe(th));
    g.fillStyle = COR.branco;
    retArredondado(g, -w / 2 - 10 * k, -h / 2 - 10, w + 20 * k, h + 20, 8); g.fill();
    g.fillStyle = '#009c3b'; g.fillRect(-w / 2, -h / 2, w, h);
    g.fillStyle = '#ffdf00';
    g.beginPath();
    g.moveTo(-w / 2 + 12 * k, 0); g.lineTo(0, -h / 2 + 10); g.lineTo(w / 2 - 12 * k, 0); g.lineTo(0, h / 2 - 10);
    g.closePath(); g.fill();
    g.fillStyle = '#002776';
    g.beginPath(); g.ellipse(0, 0, h * 0.25 * k, h * 0.25, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = COR.branco; g.lineWidth = 5;
    g.beginPath(); g.ellipse(0, h * 0.18, h * 0.42 * k, h * 0.3, 0, Math.PI * 1.18, Math.PI * 1.82); g.stroke();
    g.restore();
  }

  // Adesivos pretos nas laterais de cima, inclinados
  [-1, 1].forEach((lado) => {
    const th = 0.27, phi = Math.PI / 2 + lado * 1.12;
    const x = (phi / (Math.PI * 2)) * W;
    const k = pxPorRadV / (pxPorRadU * Math.sin(th * Math.PI));
    g.save();
    g.translate(x, yDe(th));
    g.rotate(lado * -0.42);
    retArredondado(g, -150, -26, 300, 52, 6);
    g.fillStyle = COR.preto; g.fill();
    g.scale(k * 0.62, 1);
    g.fillStyle = COR.branco;
    g.font = `800 34px ${FONTE}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('SENNA', 0, 2);
    g.restore();
  });

  // Nome na nuca, sobre a faixa azul
  {
    const th = 0.548;
    const k = pxPorRadV / (pxPorRadU * Math.sin(th * Math.PI));
    g.save();
    g.translate(W * 0.75, yDe(th));
    g.scale(k, 1);
    g.fillStyle = COR.branco;
    g.font = `800 30px ${FONTE}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('AYRTON SENNA', 0, 2);
    g.restore();
  }
}

// ---------- VISEIRA ----------
// Canvas cobre só o pedaço da viseira: em cima a faixa preta com o nome,
// embaixo o vidro fumê com reflexos verticais.
function pintarViseira(c, g) {
  const W = c.width, H = c.height;
  const faixa = H * 0.23;

  const vidro = g.createLinearGradient(0, faixa, 0, H);
  vidro.addColorStop(0, '#3a4549');
  vidro.addColorStop(0.35, '#151b1d');
  vidro.addColorStop(1, '#07090a');
  g.fillStyle = vidro;
  g.fillRect(0, 0, W, H);

  // reflexos: faixas claras verticais como na foto
  [[0.17, 26, 0.16], [0.21, 8, 0.12], [0.78, 30, 0.14], [0.83, 10, 0.1], [0.5, 120, 0.05]].forEach(([x, w, a]) => {
    const gr = g.createLinearGradient(0, faixa, 0, H);
    gr.addColorStop(0, `rgba(255,255,255,${a * 1.6})`);
    gr.addColorStop(0.7, `rgba(255,255,255,${a * 0.3})`);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(W * x - w / 2, faixa, w, H - faixa);
  });

  // faixa preta de cima (a "testeira")
  g.fillStyle = COR.preto;
  g.fillRect(0, 0, W, faixa);
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(0, faixa * 0.12, W, 3);

  g.fillStyle = COR.branco;
  g.font = `900 ${faixa * 0.6}px ${FONTE}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.save();
  g.translate(W / 2, faixa * 0.54);
  g.scale(1.1, 1);
  g.fillText('AYRTON SENNA', 0, 0);
  g.restore();
  // quadradinhos nas pontas
  [W * 0.13, W * 0.87].forEach((x) => {
    g.strokeStyle = COR.branco; g.lineWidth = 4;
    retArredondado(g, x - 26, faixa * 0.2, 52, faixa * 0.64, 6); g.stroke();
    g.font = `800 ${faixa * 0.38}px ${FONTE}`;
    g.fillText('12', x, faixa * 0.54);
  });
}

// Máscara de cantos arredondados (branco = aparece)
function mascaraArredondada(w, h, raio, recuo = 0) {
  const [c, g] = novoCanvas(w, h);
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff';
  retArredondado(g, recuo, recuo, w - recuo * 2, h - recuo * 2, raio);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
}

// Grade de linhas (meridianos + paralelos) para o modo "wireframe".
function grade(r, nMer, nPar) {
  const pos = [];
  const thMax = CORTE * Math.PI;
  const passos = 64;
  for (let i = 0; i < nMer; i++) {
    const phi = (i / nMer) * Math.PI * 2;
    for (let k = 0; k < passos; k++) {
      pos.push(...pontoEsfera(phi, (k / passos) * thMax, r), ...pontoEsfera(phi, ((k + 1) / passos) * thMax, r));
    }
  }
  for (let j = 1; j <= nPar; j++) {
    const th = (j / nPar) * thMax;
    for (let k = 0; k < passos * 2; k++) {
      const a = (k / (passos * 2)) * Math.PI * 2, b = ((k + 1) / (passos * 2)) * Math.PI * 2;
      pos.push(...pontoEsfera(a, th, r), ...pontoEsfera(b, th, r));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
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

  const luz = new THREE.DirectionalLight('#fff7e0', 1.4);
  luz.position.set(-0.6, 1, 1.2);
  cena.add(luz);

  // Uniforms compartilhados: posição da lente e raio, em pixels do canvas.
  const U = {
    uMouse: { value: new THREE.Vector2(-9999, -9999) },
    uRaio: { value: 0 },
  };
  // Recorta o material pela lente: "dentro" mostra só no círculo, "fora" esconde nele.
  const lente = (mat, modo) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uMouse = U.uMouse;
      sh.uniforms.uRaio = U.uRaio;
      const teste = modo === 'dentro' ? 'if (dL > uRaio) discard;' : 'if (dL < uRaio) discard;';
      sh.fragmentShader = 'uniform vec2 uMouse;\nuniform float uRaio;\n' +
        sh.fragmentShader.replace('void main() {', `void main() {\n  float dL = distance(gl_FragCoord.xy, uMouse);\n  ${teste}\n`);
    };
    return mat;
  };

  const capacete = new THREE.Group();
  capacete.position.set(CAP.x, -CAP.y, 0);
  capacete.scale.set(CAP.s * 0.88, CAP.s, CAP.s);
  cena.add(capacete);

  // Casca pintada
  const [cCasca, gCasca] = novoCanvas(2048, 1024);
  pintarCasca(cCasca, gCasca);
  const texCasca = textura(cCasca);
  const casca = new THREE.Mesh(
    deformarGeo(new THREE.SphereGeometry(1, 160, 80, 0, Math.PI * 2, 0, Math.PI * CORTE)),
    lente(new THREE.MeshPhysicalMaterial({
      map: texCasca, roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06,
    }), 'dentro'),
  );
  capacete.add(casca);

  // Borracha preta em volta da viseira (um pouco maior que ela)
  const folga = 0.05;
  const moldura = new THREE.Mesh(
    deformarGeo(new THREE.SphereGeometry(1.006, 96, 40,
      Math.PI / 2 - VIS.meia - folga, (VIS.meia + folga) * 2,
      Math.PI * (VIS.de - 0.012), Math.PI * (VIS.ate - VIS.de + 0.024))),
    lente(new THREE.MeshStandardMaterial({
      color: '#161616', roughness: 0.7,
      alphaMap: mascaraArredondada(512, 256, 70), alphaTest: 0.5,
    }), 'dentro'),
  );
  capacete.add(moldura);

  // Viseira: faixa preta com o nome + vidro fumê
  const [cVis, gVis] = novoCanvas(1024, 512);
  pintarViseira(cVis, gVis);
  const texVis = textura(cVis);
  const viseira = new THREE.Mesh(
    deformarGeo(new THREE.SphereGeometry(1.014, 96, 40,
      Math.PI / 2 - VIS.meia, VIS.meia * 2, Math.PI * VIS.de, Math.PI * (VIS.ate - VIS.de))),
    lente(new THREE.MeshPhysicalMaterial({
      map: texVis, roughness: 0.55, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.5,
      envMapIntensity: 0.12, specularIntensity: 0.3,
      alphaMap: mascaraArredondada(1024, 512, 120), alphaTest: 0.5,
    }), 'dentro'),
  );
  capacete.add(viseira);

  // Botões de fixação da viseira (um de cada lado)
  [-1, 1].forEach((lado) => {
    const b = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.04, 32),
      lente(new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.35, metalness: 0.6 }), 'dentro'),
    );
    const [x, y, z] = pontoEsfera(Math.PI / 2 + lado * (VIS.meia + 0.1), Math.PI * 0.46, 1.012);
    b.position.set(x, y, z);
    b.lookAt(x * 2, y * 2, z * 2);
    b.rotateX(Math.PI / 2);
    capacete.add(b);
  });

  // Borda de borracha embaixo
  const rBase = Math.sin(Math.PI * CORTE);
  const bordaGeo = new THREE.TorusGeometry(rBase, 0.06, 16, 128);
  bordaGeo.rotateX(Math.PI / 2);
  bordaGeo.translate(0, Math.cos(Math.PI * CORTE), 0);
  const borda = new THREE.Mesh(
    deformarGeo(bordaGeo),
    lente(new THREE.MeshStandardMaterial({ color: '#0e0e0e', roughness: 0.8 }), 'dentro'),
  );
  capacete.add(borda);

  // Wireframe por cima, escondido dentro da lente
  const fioMat = lente(new THREE.LineBasicMaterial({ color: COR.escuro, transparent: true, opacity: 0, depthTest: false }), 'fora');
  const fio = new THREE.LineSegments(grade(1.004, 36, 14), fioMat);
  fio.renderOrder = 2;
  capacete.add(fio);

  // As pinturas usam a Mona Sans: redesenha quando a fonte terminar de carregar
  document.fonts.load(`800 40px "Mona Sans Variable"`).then(() => {
    pintarCasca(cCasca, gCasca); texCasca.needsUpdate = true;
    pintarViseira(cVis, gVis); texVis.needsUpdate = true;
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
    if (!estado.ativo) return;
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
