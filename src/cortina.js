// Formato da cortina que desce do topo (hover no card da corrida / toque no
// celular): uma barriga só, com o meio descendo na frente das laterais.
// A mesma conta roda no capacete (capacete.js), no fundo (topo.js) e nos
// textos (main.js), para a borda bater nos três.
//
// "repouso" = barriga com a cortina parada; "puxao" = quanto ela afunda
// conforme a velocidade (desce rápido = barriga funda, como um pano puxado);
// "maximo" = barriga mais funda possível; "suave" = quão rápido a barriga
// acompanha a velocidade (0 a 1).
export const CORTINA_FORMA = { repouso: 0.06, puxao: 0.16, maximo: 0.32, suave: 0.12 };

// borda (fração da altura da tela, a partir do topo) na posição x (0 a 1),
// com a cortina em "c" (0 a 1) e a barriga atual "b"
export function bordaCortina(xn, c, b) {
  const meio = (xn - 0.5) * 2;
  const bojo = 1 - meio * meio; // 1 no meio, 0 nas laterais
  return c * (1.02 + b) - b * (1 - bojo);
}

export const GLSL_CORTINA = /* glsl */ `
uniform float uBarriga;
float bordaCortina(float xn, float c) {
  float meio = (xn - 0.5) * 2.0;
  float bojo = 1.0 - meio * meio;
  return c * (1.02 + uBarriga) - uBarriga * (1.0 - bojo);
}`;

// Barriga que acompanha a velocidade da cortina (chamar a cada quadro)
export function criarBarriga() {
  let b = CORTINA_FORMA.repouso, antes = 0, tAntes = performance.now();
  return (c) => {
    const t = performance.now();
    const dt = Math.max(1, t - tAntes) / 1000;
    const vel = Math.abs(c - antes) / dt; // cortinas por segundo
    antes = c; tAntes = t;
    const alvo = Math.min(CORTINA_FORMA.maximo, CORTINA_FORMA.repouso + vel * CORTINA_FORMA.puxao);
    b += (alvo - b) * CORTINA_FORMA.suave;
    return b;
  };
}
