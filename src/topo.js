import * as THREE from 'three';
import { RASTRO, GLSL_RASTRO } from './rastro.js';

// Fundo de curvas de nível (como um mapa topográfico), desenhado uma vez
// num canvas fixo. Ruído suave + "marching squares" para achar as linhas.

function ruido(semente = 7) {
  const hash = (x, y) => {
    let h = x * 374761393 + y * 668265263 + semente * 982451653;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967295;
  };
  const suave = (t) => t * t * (3 - 2 * t);
  const valor = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = suave(x - xi), yf = suave(y - yi);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x, y) => valor(x, y) * 0.6 + valor(x * 2.1 + 9, y * 2.1 + 3) * 0.28 + valor(x * 4.3 + 1, y * 4.3 + 7) * 0.12;
}

export function desenharTopo(canvas, { cor = 'rgba(15,42,29,0.11)', niveis = 11, freq = 0.0021 } = {}) {
  const n = ruido();
  const desenhar = () => {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    g.strokeStyle = cor;
    g.lineWidth = 1.1;

    const passo = 8;
    const cols = Math.ceil(w / passo) + 1, lins = Math.ceil(h / passo) + 1;
    const campo = new Float32Array(cols * lins);
    for (let j = 0; j < lins; j++)
      for (let i = 0; i < cols; i++)
        campo[j * cols + i] = n(i * passo * freq, j * passo * freq);

    const v = (i, j) => campo[j * cols + i];
    const lerp = (a, b, t) => (t - a) / (b - a);

    g.beginPath();
    for (let l = 1; l < niveis; l++) {
      const t = 0.15 + (l / niveis) * 0.7;
      for (let j = 0; j < lins - 1; j++) {
        for (let i = 0; i < cols - 1; i++) {
          const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1);
          const caso = (a > t) | ((b > t) << 1) | ((c > t) << 2) | ((d > t) << 3);
          if (caso === 0 || caso === 15) continue;
          const x = i * passo, y = j * passo;
          const top = [x + lerp(a, b, t) * passo, y];
          const dir = [x + passo, y + lerp(b, c, t) * passo];
          const bai = [x + lerp(d, c, t) * passo, y + passo];
          const esq = [x, y + lerp(a, d, t) * passo];
          const seg = (p, q) => { g.moveTo(p[0], p[1]); g.lineTo(q[0], q[1]); };
          switch (caso) {
            case 1: case 14: seg(esq, top); break;
            case 2: case 13: seg(top, dir); break;
            case 3: case 12: seg(esq, dir); break;
            case 4: case 11: seg(dir, bai); break;
            case 5: seg(esq, top); seg(dir, bai); break;
            case 6: case 9: seg(top, bai); break;
            case 7: case 8: seg(esq, bai); break;
            case 10: seg(top, dir); seg(esq, bai); break;
          }
        }
      }
    }
    g.stroke();
  };
  desenhar();
  let t;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(desenhar, 150); });
}

// ---------------------------------------------------------------------------
// Versão viva (WebGL): as curvas de nível andam devagar, aparecem e somem aos
// poucos, e a cada "periodo" segundos sai um pulso de um ponto (o capacete)
// que acende as linhas por onde passa. Tudo roda na placa de vídeo.

const NOISE = /* glsl */ `
// Simplex 3D (Ashima Arts / Stefan Gustavson, licença MIT)
vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uTempo, uFase, uDpr, uBase, uForca;
uniform vec2 uCentro;   // px CSS, origem embaixo à esquerda
uniform vec2 uTela;     // px CSS
uniform vec3 uCor, uCreme;
uniform float uMancha;   // 0 = desliga; 1 = gotas invertem as cores do fundo
uniform float uCortina;  // 0 a 1: cortina descendo do topo (também inverte)
${NOISE}
${GLSL_RASTRO}
void main() {
  vec2 px = gl_FragCoord.xy / uDpr;          // pixel em CSS
  vec2 p = px / 520.0;                        // tamanho dos "morros"
  float t = uTempo * 0.035;
  // relevo: três camadas de ruído que mudam devagar (as linhas "andam")
  float n = snoise(vec3(p + vec2(t * 0.6, t * 0.2), t)) * 0.65
          + snoise(vec3(p * 2.1 + 7.0, t * 1.3)) * 0.25
          + snoise(vec3(p * 4.3 + 3.0, t * 1.7)) * 0.10;
  float v = n * 7.0;
  float d = abs(fract(v + 0.5) - 0.5);       // distância até a linha mais próxima
  float w = fwidth(v);
  float linha = 1.0 - smoothstep(w * 0.6, w * 1.6, d);
  // linhas aparecem e somem aos poucos
  float aparece = smoothstep(-0.35, 0.55, snoise(vec3(p * 0.55 + 11.0, t * 2.2)));
  // pulso: anel que sai do capacete e se espalha pela tela
  float raioMax = length(uTela) * 0.9;
  float r = uFase * raioMax;
  float dist = length(px - uCentro);
  float anel = exp(-pow((dist - r) / 170.0, 2.0)) * (1.0 - uFase);
  float a = linha * (uBase * (0.45 + 0.55 * aparece) + uForca * anel);
  // dentro das gotas (rastro do mouse e rasantes) as cores do fundo invertem:
  // o fundo vira verde-escuro e as curvas de nível ficam claras
  float inv = smoothstep(0.42, 0.58, mascaraRastro(px)) * uMancha;
  // cortina: desce do topo até a base, com a borda ondulada (mesma conta do capacete)
  if (uCortina > 0.0) {
    float ondaC = (sin(px.x * 0.011 + uTempo * 2.4) + 0.5 * sin(px.x * 0.027 - uTempo * 3.1)) * 0.025;
    float doTopo = (uTela.y - px.y) / uTela.y;
    inv = max(inv, 1.0 - smoothstep(-0.004, 0.004, doTopo - (uCortina * 1.15 + ondaC)));
  }
  float linhaClara = linha * (0.45 + 0.4 * aparece);
  vec3 corDentro = mix(uCor, uCreme, linhaClara);
  gl_FragColor = vec4(mix(uCor, corDentro, inv), mix(a, 1.0, inv));
}`;

export function criarTopoVivo(canvas, { centro, periodo = 4, cor = '#0f2a1d', creme = '#f2efe3', base = 0.13, forca = 0.42, mancha = 1 } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
  } catch {
    desenharTopo(canvas); // sem WebGL: versão parada
    return null;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(dpr);
  // cores exatamente como no CSS (sem a conversão de espaço de cor do Three,
  // que este shader não desfaz: o verde ficaria quase preto)
  const hexRGB = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const [cr, cg, cb] = hexRGB(cor);
  const c = { r: cr, g: cg, b: cb };
  const U = {
    uTempo: { value: 0 }, uFase: { value: 0 }, uDpr: { value: dpr },
    uBase: { value: base }, uForca: { value: forca },
    uCentro: { value: new THREE.Vector2() }, uTela: { value: new THREE.Vector2() },
    uCor: { value: new THREE.Vector3(c.r, c.g, c.b) },
    uCreme: { value: new THREE.Vector3(...hexRGB(creme)) },
    uMancha: { value: mancha },
    uCortina: { value: 0 },
    uRastro: { value: Array.from({ length: RASTRO.capacidade }, () => new THREE.Vector4()) },
    uRastroN: { value: 0 }, uRastroR: { value: RASTRO.raio }, uRastroT: { value: 0 },
  };
  const cena = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  cena.add(new THREE.Mesh(tri, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthTest: false,
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: FRAG,
  })));

  const medir = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    U.uTela.value.set(window.innerWidth, window.innerHeight);
  };
  medir();
  window.addEventListener('resize', medir);

  const parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const quadro = () => {
    const s = performance.now() / 1000;
    U.uTempo.value = s;
    U.uFase.value = parado ? 1 : (s % periodo) / periodo;
    const [x, y] = centro ? centro() : [window.innerWidth / 2, window.innerHeight / 2];
    U.uCentro.value.set(x, window.innerHeight - y);
    renderer.render(cena, cam);
  };
  if (parado) { quadro(); window.addEventListener('resize', quadro); }
  else renderer.setAnimationLoop(quadro);
  return {
    renderer, U,
    // rastro do mouse em px da tela: [{ x, y, idade, liga }]
    definirRastro(lista) {
      const n = Math.min(lista.length, RASTRO.capacidade);
      for (let i = 0; i < n; i++) {
        const p = lista[lista.length - n + i];
        U.uRastro.value[i].set(p.x, window.innerHeight - p.y, p.idade, p.liga);
      }
      U.uRastroN.value = n;
      U.uRastroT.value = performance.now() / 1000;
    },
  };
}
