// Rastro do mouse (efeito do site do Lando): o cursor deixa um rastro macio
// que se dissolve em ~1 s. No fundo ele aparece como uma mancha cinza
// esfumaçada; onde cruza a cabeça, o capacete aparece por dentro.
//
// Os pontos ficam guardados aqui (em px da tela). Cada renderizador converte
// para o espaço dele e usa o mesmo GLSL, então a forma é sempre a mesma.

export const RASTRO = {
  pontos: 40,     // quantos pontos cada rastro guarda
  capacidade: 96, // total de pontos no shader (rastro do mouse 40 + até 3 gotas de 18)
  vida: 1.1,      // segundos até um ponto sumir
  raio: 130,      // raio do rastro em px da tela (na cabeça do rastro)
  ondulacao: 0.18, // quanto a borda ondula (0 = lisa como gota; 0,9 = fumaça)
  distMin: 6,     // px mínimos entre um ponto e outro
  corte: 260,     // se o mouse "pular" mais que isso, começa um rastro novo
};

// opções: pontos (quantos guarda) e distMin (px entre pontos) — o fantasma,
// por ser muito rápido, usa pontos mais espaçados e em maior quantidade
export function criarRastro({ pontos: maxPontos = RASTRO.pontos, distMin = RASTRO.distMin } = {}) {
  const pontos = []; // { x, y, t, liga } — liga = 0: não conecta com o anterior
  return {
    pontos,
    adicionar(x, y) {
      const t = performance.now() / 1000;
      const ult = pontos[pontos.length - 1];
      if (ult) {
        const d = Math.hypot(x - ult.x, y - ult.y);
        if (d < distMin) return;
        pontos.push({ x, y, t, liga: d < RASTRO.corte && t - ult.t < 0.3 ? 1 : 0 });
      } else {
        pontos.push({ x, y, t, liga: 0 });
      }
      while (pontos.length > maxPontos) pontos.shift();
    },
    // tira os pontos velhos; devolve a lista com a idade (0 = novo, 1 = sumindo)
    atualizar() {
      const agora = performance.now() / 1000;
      while (pontos.length && agora - pontos[0].t > RASTRO.vida) pontos.shift();
      return pontos.map((p) => ({ ...p, idade: (agora - p.t) / RASTRO.vida }));
    },
  };
}

// Junta vários rastros numa lista só para o shader (cada um começa sem se
// ligar ao anterior, para não desenhar uma ponte entre eles).
export function juntarRastros(...listas) {
  const tudo = [];
  for (const l of listas) l.forEach((p, i) => tudo.push(i === 0 ? { ...p, liga: 0 } : p));
  return tudo.slice(-RASTRO.capacidade);
}

// GLSL: mascaraRastro(p) devolve de 0 a 1 o quanto o ponto p (no mesmo espaço
// em px dos pontos) está dentro do rastro. Bordas irregulares com ruído.
export const GLSL_RASTRO = /* glsl */ `
#define RASTRO_N ${RASTRO.capacidade}
uniform vec4 uRastro[RASTRO_N]; // x, y, idade (0..1), liga (1 = conecta com o anterior)
uniform float uRastroN, uRastroR, uRastroT;
float rsHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float rsRuido(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(rsHash(i), rsHash(i + vec2(1, 0)), f.x), mix(rsHash(i + vec2(0, 1)), rsHash(i + vec2(1, 1)), f.x), f.y);
}
float mascaraRastro(vec2 p) {
  if (uRastroN < 0.5) return 0.0;
  // ruído suave e graúdo: a borda só ondula de leve, como uma gota
  float n = rsRuido(p / (uRastroR * 1.1) + uRastroT * 0.5) * 0.8
          + rsRuido(p / (uRastroR * 0.5) - uRastroT * 0.8) * 0.2;
  float m = 0.0;
  for (int i = 0; i < RASTRO_N; i++) {
    if (float(i) >= uRastroN) break;
    vec4 b = uRastro[i];
    vec4 a = b.w > 0.5 ? uRastro[max(i - 1, 0)] : b;
    vec2 ab = b.xy - a.xy;
    float h = clamp(dot(p - a.xy, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    float d = length(p - a.xy - ab * h);
    float idade = mix(a.z, b.z, h);
    float r = uRastroR * pow(max(0.0, 1.0 - idade), 0.7);
    d += (n - 0.5) * r * ${RASTRO.ondulacao.toFixed(3)};
    m = max(m, 1.0 - smoothstep(r * 0.55, r, d));
  }
  return m;
}`;
