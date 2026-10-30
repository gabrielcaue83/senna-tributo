import * as THREE from 'three';

// Rastro de ÁGUA (mouse e gotas fantasmas), feito como uma pintura que
// escorre: o cursor e as gotas pintam com um pincel pequeno numa "tela"
// invisível (um quarto da resolução da tela). A cada passo essa tinta:
//  - ESPALHA para os vizinhos num ritmo irregular (como água num papel): atrás
//    do pincel o rastro fica largo e na frente fino — a ponta mostra a direção;
//  - ESCORRE um pouco na direção do movimento e num redemoinho lento;
//  - SOME aos poucos e, perto do fim, se desfaz em ilhas.
// O capacete (capacete.js) e o fundo (topo.js) leem essa mesma tela, então
// onde tem tinta o capacete aparece e o fundo inverte, com o mesmo contorno.

export const TRILHA = {
  raio: 130,         // raio de referência em px da tela (tamanho das gotas fantasmas)
  pincelMouse: 0.28, // raio do pincel do mouse (em raios)
  pincelGota: 0.45,  // raio do pincel das gotas fantasmas (em raios)
  forcaGota: 0.75,   // tinta das gotas (menos tinta = faixa mais fina, some antes)
  resolucao: 0.25,   // tamanho da tela invisível em relação à tela de verdade
  espalha: 0.972,    // quanto a tinta passa para o vizinho a cada passo (< 1)
  espalhaVaria: 0.06, // irregularidade do espalhar (ruído)
  some: 0.985,       // quanto da tinta fica a cada passo (menor = some mais rápido)
  arrasto: 0.3,      // quanto a tinta é levada na direção do movimento
  freio: 0.9,        // quanto esse empurrão dura (por passo)
  redemoinho: 75,    // velocidade do redemoinho (px/s)
  limite: 0.3,       // tinta a partir da qual o capacete aparece
  borda: 0.09,       // irregularidade fina da borda (lida em resolução cheia)
};
const VEL_MAX = 3000; // px/s guardados na textura (velocidade do empurrão)
const PASSO = 1 / 60; // a simulação anda em passos fixos (igual em 60 ou 120 Hz)
const f3 = (v) => v.toFixed(3);

const RUIDO = /* glsl */ `
float trHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float trRuido(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(trHash(i), trHash(i + vec2(1, 0)), f.x), mix(trHash(i + vec2(0, 1)), trHash(i + vec2(1, 1)), f.x), f.y);
}`;

const PASSO_FRAG = /* glsl */ `
uniform sampler2D uAnterior;
uniform vec2 uRes, uTela;          // texels da simulação; px da tela
uniform float uTempo;
uniform vec4 uSeg[4];              // pincéis: de (x, y) até (z, w), px da tela, y para cima
uniform vec4 uSegInfo[4];          // raio (px), força (0 a 1), velocidade x, y (px/s)
uniform float uNSeg;
varying vec2 vUv;
${RUIDO}
// redemoinho: "curl" de um ruído (gira sem acumular)
vec2 curl(vec2 p) {
  float e = 0.35;
  return vec2(trRuido(p + vec2(0.0, e)) - trRuido(p - vec2(0.0, e)), trRuido(p - vec2(e, 0.0)) - trRuido(p + vec2(e, 0.0))) / (2.0 * e);
}
void main() {
  vec2 px = vUv * uTela;
  vec2 tx = 1.0 / uRes;
  vec4 aqui = texture2D(uAnterior, vUv);
  vec2 vel = (aqui.gb - 0.5) * ${f3(VEL_MAX)};
  // escorre: pelo empurrão do movimento e por um redemoinho lento
  vec2 fluxo = vel * ${f3(TRILHA.arrasto)} + curl(px / 170.0 + uTempo * 0.06) * ${f3(TRILHA.redemoinho)};
  vec2 uv = vUv - fluxo * ${f3(PASSO)} / uTela;
  vec4 c = texture2D(uAnterior, uv);
  // espalha: a tinta avança para os vizinhos, num ritmo irregular
  float k = ${f3(TRILHA.espalha)} - ${f3(TRILHA.espalhaVaria)} * trRuido(px / 46.0 + uTempo * 0.25);
  float m = max(max(texture2D(uAnterior, uv + vec2(tx.x, 0.0)).r, texture2D(uAnterior, uv - vec2(tx.x, 0.0)).r),
                max(texture2D(uAnterior, uv + vec2(0.0, tx.y)).r, texture2D(uAnterior, uv - vec2(0.0, tx.y)).r));
  float md = max(max(texture2D(uAnterior, uv + tx).r, texture2D(uAnterior, uv - tx).r),
                 max(texture2D(uAnterior, uv + vec2(tx.x, -tx.y)).r, texture2D(uAnterior, uv + vec2(-tx.x, tx.y)).r));
  float tinta = max(c.r, max(m * k, md * k * 0.955)) * ${f3(TRILHA.some)};
  vec2 v = (c.gb - 0.5) * ${f3(VEL_MAX)} * ${f3(TRILHA.freio)};
  // pincéis (mouse e gotas)
  for (int i = 0; i < 4; i++) {
    if (float(i) >= uNSeg) break;
    vec4 s = uSeg[i], info = uSegInfo[i];
    vec2 ab = s.zw - s.xy;
    float h = clamp(dot(px - s.xy, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    float d = length(px - s.xy - ab * h);
    float p = (1.0 - smoothstep(info.x * 0.45, info.x, d)) * info.y;
    tinta = max(tinta, p);
    v = mix(v, info.zw, p);
  }
  gl_FragColor = vec4(clamp(tinta, 0.0, 1.0), clamp(v / ${f3(VEL_MAX)} + 0.5, 0.0, 1.0), 1.0);
}`;

// GLSL para quem LÊ a tinta (capacete e fundo): trilha(tela, tamanho) devolve
// 0 a 1 se o ponto (px da tela, y para baixo) está dentro da água.
export const GLSL_TRILHA = /* glsl */ `
uniform sampler2D uTrilha;
uniform float uTrilhaT;
${RUIDO}
float trilha(vec2 tela, vec2 tamanho) {
  float tinta = texture2D(uTrilha, vec2(tela.x / tamanho.x, 1.0 - tela.y / tamanho.y)).r;
  // borda irregular fina (em resolução cheia), que mexe devagar
  float n = trRuido(tela / 34.0 + uTrilhaT * 0.5) * 0.65 + trRuido(tela / 13.0 - uTrilhaT * 0.8) * 0.35;
  return smoothstep(${f3(TRILHA.limite - 0.015)}, ${f3(TRILHA.limite + 0.015)}, tinta + (n - 0.5) * ${f3(TRILHA.borda)});
}`;

// Cria a simulação. pincel(id, [x, y] | null, raio, forca) a cada quadro para
// cada pincel ativo (px da tela); passo() avança e desenha em "canvas".
export function criarTrilha() {
  const canvas = document.createElement('canvas');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(1);
  renderer.autoClear = false;
  const temFloat = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
  const tipo = temFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;

  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const vert = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

  const U = {
    uAnterior: { value: null }, uRes: { value: new THREE.Vector2() }, uTela: { value: new THREE.Vector2() },
    uTempo: { value: 0 },
    uSeg: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
    uSegInfo: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
    uNSeg: { value: 0 },
  };
  const cenaPasso = new THREE.Scene();
  cenaPasso.add(new THREE.Mesh(tri, new THREE.ShaderMaterial({ uniforms: U, vertexShader: vert, fragmentShader: PASSO_FRAG, depthTest: false })));
  const uMostra = { uTex: { value: null } };
  const cenaMostra = new THREE.Scene();
  cenaMostra.add(new THREE.Mesh(tri, new THREE.ShaderMaterial({
    uniforms: uMostra, vertexShader: vert, depthTest: false,
    fragmentShader: 'uniform sampler2D uTex; varying vec2 vUv; void main(){ float t = texture2D(uTex, vUv).r; gl_FragColor = vec4(t, t, t, 1.0); }',
  })));

  let alvos = [], atual = 0;
  const medir = () => {
    const w = Math.max(16, Math.round(window.innerWidth * TRILHA.resolucao));
    const h = Math.max(16, Math.round(window.innerHeight * TRILHA.resolucao));
    renderer.setSize(w, h, false);
    alvos.forEach((a) => a.dispose());
    alvos = [0, 1].map(() => new THREE.WebGLRenderTarget(w, h, {
      type: tipo, format: THREE.RGBAFormat, depthBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    }));
    // começa sem tinta e sem empurrão (velocidade 0 = 0,5 na textura)
    alvos.forEach((a) => { renderer.setRenderTarget(a); renderer.setClearColor(new THREE.Color(0, 0.5, 0.5), 1); renderer.clear(); });
    renderer.setRenderTarget(null);
    U.uRes.value.set(w, h);
    U.uTela.value.set(window.innerWidth, window.innerHeight);
  };
  medir();
  window.addEventListener('resize', medir);

  const pinceis = new Map(); // id -> { de, para, raio, porMov, antes }
  const ativosAgora = new Set();
  let acumulado = 0, tAntes = performance.now(), tPintou = performance.now();

  return {
    canvas,
    // pincel deste quadro (px da tela, y para baixo). "forcaPorMovimento":
    // a tinta depende de quanto o pincel andou (mouse parado não pinta)
    pincel(id, pos, raio, { forcaPorMovimento = false, forca = 1 } = {}) {
      if (!pos) return;
      ativosAgora.add(id);
      const [x, y] = [pos[0], window.innerHeight - pos[1]];
      const p = pinceis.get(id) || { antes: null };
      p.de = p.antes || [x, y];
      p.para = [x, y];
      p.raio = raio;
      p.porMov = forcaPorMovimento;
      p.forca = forca;
      pinceis.set(id, p);
    },
    passo() {
      const agora = performance.now();
      const dt = Math.min(0.1, (agora - tAntes) / 1000);
      tAntes = agora;
      // pincéis que não vieram neste quadro "levantam"
      for (const id of [...pinceis.keys()]) if (!ativosAgora.has(id)) pinceis.delete(id);
      ativosAgora.clear();
      // a simulação anda em passos fixos de 1/60 s; numa tela de 120 Hz, um
      // quadro sem passo só junta o caminho do pincel para o próximo
      acumulado = Math.min(acumulado + dt, PASSO * 4);
      if (acumulado < PASSO) return;

      // segmentos: de onde o pincel estava (último passo) até onde está
      const dtP = Math.max(1e-3, (agora - tPintou) / 1000);
      tPintou = agora;
      const lista = [...pinceis.values()].slice(0, 4);
      lista.forEach((p, i) => {
        const dx = p.para[0] - p.de[0], dy = p.para[1] - p.de[1];
        const anda = Math.hypot(dx, dy);
        const forca = p.porMov ? Math.min(1, anda / 14) * p.forca : p.forca;
        const raio = p.raio * (p.porMov ? Math.min(1.35, 0.75 + anda / 70) : 1);
        U.uSeg.value[i].set(p.de[0], p.de[1], p.para[0], p.para[1]);
        U.uSegInfo.value[i].set(raio, forca, dx / dtP, dy / dtP);
        p.antes = p.para;
        p.de = p.para;
      });
      U.uNSeg.value = lista.length;

      // o pincel entra só no primeiro passo
      let n = 0;
      while (acumulado >= PASSO && n < 4) {
        U.uTempo.value = agora / 1000;
        U.uAnterior.value = alvos[atual].texture;
        renderer.setRenderTarget(alvos[1 - atual]);
        renderer.render(cenaPasso, cam);
        atual = 1 - atual;
        U.uNSeg.value = 0;
        acumulado -= PASSO;
        n++;
      }
      // mostra a tinta no canvas (é ele que o capacete e o fundo leem)
      uMostra.uTex.value = alvos[atual].texture;
      renderer.setRenderTarget(null);
      renderer.render(cenaMostra, cam);
    },
  };
}
