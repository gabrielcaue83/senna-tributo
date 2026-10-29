import './style.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { criarCapacete } from './capacete.js';
import { criarRastro, juntarRastros, RASTRO } from './rastro.js';
import { criarTopoVivo } from './topo.js';
import { iniciarPreloader } from './preloader.js';
import { criarLogoTopo } from './logo-topo.js';
import { criarCorrida } from './corrida.js';

gsap.registerPlugin(ScrollTrigger);

// Rolagem suave ligada ao ScrollTrigger
const lenis = new Lenis({ lerp: 0.1 });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

const reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const temHover = window.matchMedia('(hover: hover)').matches;



// "S" do Senna no topo: enche quando o mouse chega perto
criarLogoTopo(document.querySelector('.barra__logo'), { temHover });

// ---------- HERO ----------
const hero = document.querySelector('.hero');
const area = document.querySelector('.hero__foto');
const anel = document.querySelector('.lente');
const cap = criarCapacete({ canvas: document.querySelector('.hero__gl'), area });

// Card da última corrida: com o mouse parado em cima por CORTINA.espera
// segundos (a barrinha amarela do card vai enchendo), uma cortina desce do
// topo até a base da página invertendo as cores do fundo e revelando o
// capacete inteiro. Mouse sai = a cortina sobe e tudo volta ao normal.
const CORTINA = { espera: 2, desce: 1.6, sobe: 1 };
const cargaCorrida = document.querySelector('.corrida__carga i');
let esperaCortina = null;
criarCorrida(document.querySelector('.corrida'), {
  temHover, reduzir,
  aoEntrar: () => {
    esperaCortina?.kill();
    esperaCortina = gsap.fromTo(cargaCorrida, { scaleX: 0 }, {
      scaleX: 1, duration: CORTINA.espera, ease: 'none',
      onComplete: () => gsap.to(cap, { cortina: 1, duration: CORTINA.desce, ease: 'power2.inOut', overwrite: true }),
    });
  },
  aoSair: () => {
    esperaCortina?.kill();
    gsap.to(cargaCorrida, { scaleX: 0, duration: 0.3, ease: 'power2.out' });
    gsap.to(cap, { cortina: 0, duration: CORTINA.sobe, ease: 'power3.inOut', overwrite: true });
  },
});

// Fundo topográfico vivo: as curvas só andam devagar, sem pulso
// (para ligar um pulso saindo do capacete: forca > 0 e um "centro")
// mancha: 1 = as gotas invertem as cores do fundo por onde passam (0 desliga)
const topo = criarTopoVivo(document.querySelector('.topo'), { forca: 0, base: 0.15, mancha: 1 });

// Rastro do mouse (como no site do Lando): o cursor deixa um rastro macio
// que some em ~1 s; no fundo vira uma mancha cinza e, onde cruza a cabeça,
// o capacete aparece por dentro. Os valores ficam em rastro.js (RASTRO).
const rastro = criarRastro();
let mouse = null; // última posição do mouse dentro do hero (para o brilho)
if (temHover) {
  hero.addEventListener('pointerenter', (e) => { mouse = [e.clientX, e.clientY]; cap.mover(...mouse); cap.brilhar(true); });
  hero.addEventListener('pointermove', (e) => { mouse = [e.clientX, e.clientY]; });
  hero.addEventListener('pointerleave', () => { mouse = null; cap.brilhar(false); });
  if (!reduzir) window.addEventListener('pointermove', (e) => rastro.adicionar(e.clientX, e.clientY));
} else {
  // No toque: um toque veste o capacete inteiro, outro tira
  let vestido = false;
  hero.addEventListener('click', (e) => {
    vestido = !vestido;
    const r = area.getBoundingClientRect();
    cap.mover(r.left + r.width * 0.506, r.top + r.height * 0.52);
    vestido ? cap.abrir() : cap.fechar();
  });
}

// Wireframe aparece um pouco mais forte com o mouse no hero
let fioBase = 0.75; // força dos polígonos quando a linha do pulso passa (entre pulsos eles somem)
hero.addEventListener('pointerenter', () => {
  gsap.to(cap, { fio: 0.9, duration: 0.6, overwrite: 'auto' });
  // faixa de luz passa pelo capacete quando ele aparece
  gsap.fromTo(cap, { varre: 0 }, { varre: 1, duration: 1.2, ease: 'power2.inOut', overwrite: 'auto', onComplete: () => { cap.varre = -1; } });
});
hero.addEventListener('pointerleave', () => gsap.to(cap, { fio: fioBase, duration: 0.8, overwrite: 'auto' }));

// Mouse mexe o Senna de dois jeitos misturados:
// 1) a imagem inteira desliza para o lado do mouse (o primeiro efeito);
// 2) ao mesmo tempo, por dentro, a cabeça vira em 3D (foto com profundidade)
//    e o capacete gira junto.
// A palavra SENNA do fundo vai um tiquinho ao contrário, para dar profundidade.
// fotoX/fotoY/palavra = deslocamento total de um canto da tela ao outro (px).
const PARALLAX = { fotoX: 80, fotoY: 44, palavraX: 50, palavraY: 22 };
if (temHover && !reduzir) {
  const opc = { duration: 1.2, ease: 'power3.out' };
  const fotoX = gsap.quickTo('.hero__foto', 'x', opc), fotoY = gsap.quickTo('.hero__foto', 'y', opc);
  const palX = gsap.quickTo('.hero__palavra', 'x', opc), palY = gsap.quickTo('.hero__palavra', 'y', opc);
  window.addEventListener('pointermove', (e) => {
    const nx = e.clientX / window.innerWidth - 0.5, ny = e.clientY / window.innerHeight - 0.5;
    fotoX(nx * PARALLAX.fotoX); fotoY(ny * PARALLAX.fotoY); // imagem inteira desliza
    cap.inclinar(nx, ny);                                   // cabeça + capacete viram em 3D
    palX(-nx * PARALLAX.palavraX); palY(-ny * PARALLAX.palavraY);
  });
}

// ---------- GOTA EM ZIGUE-ZAGUE ----------
// Uma gota (cabeça redonda e cauda afinando) faz um zigue-zague de passadas
// retas: cruza a tela numa altura, vira fora da tela e volta cruzando em outra
// altura, no sentido contrário. Um zigue-zague DESCE (passada em cima, depois
// embaixo); o próximo SOBE (embaixo, depois em cima), sempre alternando.
// Usa o mesmo efeito do rastro do mouse: revela o capacete e inverte o fundo.
// linhas = alturas das passadas, de cima para baixo (fração da altura da tela);
// inclinacao = quanto cada passada desce de um lado ao outro (px);
// pausa entre um zigue-zague e outro (s); velocidade (px/s); cauda (px);
// tamanho = raio da cabeça (1 = raio do rastro do mouse).
const FANTASMA = {
  maximo: 1, pausa: [1.2, 1.8], velocidade: [1900, 2300],
  descanso: 5, // segundos sem mexer o mouse para o zigue-zague voltar
  linhas: [0.33, 0.6], inclinacao: 30, cauda: 380, tamanho: 1.15, nasce: 0.12,
};
const sorteio = (a, b) => a + Math.random() * (b - a);

const gotasAtivas = [];
let descendo = true;
let proximaGota = performance.now() / 1000 + 1.4; // 1º zigue-zague logo após a entrada
// Enquanto o mouse se mexe, não nasce gota nova (a que está passando termina
// o caminho). Depois de FANTASMA.descanso segundos parado, volta.
let ultimoMouse = -Infinity;
if (temHover) window.addEventListener('pointermove', () => { ultimoMouse = performance.now() / 1000; });
const novaGota = () => {
  const W = hero.clientWidth, H = hero.clientHeight;
  // vira longe o bastante para a gota inteira (com a cauda) sair antes da curva
  const fora = RASTRO.raio * FANTASMA.tamanho + FANTASMA.cauda + 40;
  let alturas = FANTASMA.linhas.map((h) => H * (h + sorteio(-0.025, 0.025)));
  if (!descendo) alturas = alturas.reverse();               // desce, sobe, desce...
  descendo = !descendo;
  let lado = Math.random() < 0.5 ? -1 : 1;                  // -1 começa na esquerda
  const pts = [];
  alturas.forEach((y) => {
    const ini = lado < 0 ? -fora : W + fora, fim = lado < 0 ? W + fora : -fora;
    pts.push([ini, y - FANTASMA.inclinacao / 2], [fim, y + FANTASMA.inclinacao / 2]);
    lado = -lado;                                            // a próxima volta no sentido contrário
  });
  const acum = [0];
  for (let i = 1; i < pts.length; i++) acum.push(acum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, acum, total: acum[acum.length - 1], andado: 0, tempo: 0, vel: sorteio(...FANTASMA.velocidade) };
};
// ponto do caminho a uma distância d do começo (preso entre o início e o fim)
const pontoEm = (p, d) => {
  const { pts, acum } = p;
  d = Math.min(p.total, Math.max(0, d));
  let i = 1;
  while (i < acum.length - 1 && acum[i] < d) i++;
  const [a, b] = [pts[i - 1], pts[i]];
  const t = (d - acum[i - 1]) / Math.max(1, acum[i] - acum[i - 1]);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
};
// uma gota vira pontos do rastro (a largura vira a "idade": o shader afina o
// rastro com a idade, então a idade desenha o formato da gota)
const PONTOS_GOTA = 18;
const pontosDaGota = (p, hr) => {
  const fimCurso = p.andado - p.total;
  const nasce = Math.min(1, p.tempo / FANTASMA.nasce);
  const some = fimCurso > 0 ? 1 - fimCurso / FANTASMA.cauda : 1;
  const escala = Math.sin((Math.max(0, Math.min(nasce, some)) * Math.PI) / 2);
  const lista = [];
  for (let k = 0; k < PONTOS_GOTA; k++) {
    const sk = k / (PONTOS_GOTA - 1);                      // 0 = cabeça, 1 = ponta da cauda
    const [x, y] = pontoEm(p, p.andado - sk * FANTASMA.cauda * escala);
    const f = FANTASMA.tamanho * escala * Math.pow(1 - sk, 0.55);
    // idade negativa = mais largo que o rastro do mouse (o shader aceita)
    lista.push({ x: x + hr.left, y: y + hr.top, idade: 1 - Math.pow(Math.max(0.0001, f), 1 / 0.7), liga: k === 0 ? 0 : 1 });
  }
  return lista;
};

let quadroAnterior = performance.now() / 1000;
const corpoFantasma = () => {
  const agora = performance.now() / 1000;
  const dt = Math.min(0.05, agora - quadroAnterior);
  quadroAnterior = agora;
  if (reduzir) return [];
  // mouse mexendo: pausa o zigue-zague; volta depois do descanso
  if (agora - ultimoMouse < FANTASMA.descanso) {
    proximaGota = Math.max(proximaGota, ultimoMouse + FANTASMA.descanso);
  }
  // uma gota por vez: a próxima só nasce depois que a anterior saiu + a pausa
  else if (agora >= proximaGota && gotasAtivas.length < FANTASMA.maximo) {
    gotasAtivas.push(novaGota());
  }
  const hr = hero.getBoundingClientRect();
  const todos = [];
  for (let i = gotasAtivas.length - 1; i >= 0; i--) {
    const p = gotasAtivas[i];
    p.tempo += dt;
    p.andado += p.vel * dt;
    if (p.andado - p.total > FANTASMA.cauda) {
      gotasAtivas.splice(i, 1);
      proximaGota = agora + sorteio(...FANTASMA.pausa); // pausa conta a partir da saída
      continue;
    }
    todos.push(...pontosDaGota(p, hr));
  }
  return todos;
};

// Desenha só enquanto o hero está na tela
let visivel = true;
new IntersectionObserver(([e]) => { visivel = e.isIntersecting; }).observe(hero);
gsap.ticker.add(() => {
  if (!visivel) return;
  // a foto se mexe com o parallax: reposiciona o brilho/lente todo quadro
  if (mouse) cap.mover(...mouse);
  const pontos = juntarRastros(rastro.atualizar(), corpoFantasma());
  cap.definirRastro(pontos);
  topo?.definirRastro(pontos);
  if (topo) topo.U.uCortina.value = cap.cortina; // a cortina inverte o fundo junto
  // textos escuros viram creme quando a borda da cortina passa por eles
  document.body.classList.toggle('cortina-topo', cap.cortina > 0.09);
  document.body.classList.toggle('cortina-base', cap.cortina > 0.6);
  cap.tick();
  const l = cap.lenteNaTela();
  anel.style.transform = `translate(${l.x}px, ${l.y}px)`;
  anel.style.setProperty('--r', `${l.r}px`);
  anel.style.setProperty('--o', l.max ? Math.min(1, l.r / l.max) : 0);
});

// ---------- ENTRADA ----------

gsap.set('.hero__palavra', { xPercent: -50, yPercent: -50 });
gsap.set('.hero__foto', { xPercent: -50 });

// a entrada fica pausada até o preloader sair (ver PRELOADER, mais abaixo)
const entrada = gsap.timeline({ defaults: { ease: 'expo.out' }, paused: true });
entrada
  .from('.hero__palavra', { scale: 0.9, opacity: 0, duration: 1.6 })
  .from(['.hero__foto img', '.hero__gl'], { y: 60, opacity: 0, duration: 1.4 }, 0.15)
  // wireframe entra junto com a foto (quem mostra os polígonos é o pulso)
  .to(cap, { fio: fioBase, duration: 1, ease: 'power2.out' }, 0.7)
  .from('.barra > *', { y: -20, opacity: 0, duration: 1, stagger: 0.08 }, 0.6)
  .from(['.hero__titulo > span', '.corrida', '.hero__dica'], { y: 24, opacity: 0, duration: 1, stagger: 0.07 }, 1.1);

if (reduzir) entrada.progress(1);

// ---------- PRELOADER ----------
// A logo do Senna é desenhada e preenchida; quando o capacete e a foto 3D
// carregaram, a tela sobe e a entrada do hero começa junto.
lenis.stop(); // sem rolar a página durante o preloader
iniciarPreloader({
  aguardar: cap.carregado,
  reduzir,
  aoSair: () => { lenis.start(); entrada.play(0.2); },
});

// ---------- SAÍDA COM A ROLAGEM ----------
gsap.timeline({
  scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
})
  .to('.hero__foto', { yPercent: 12, ease: 'none' }, 0)
  .to('.hero__palavra', { yPercent: -90, ease: 'none' }, 0);

// Gancho de teste (só no modo dev)
if (import.meta.env.DEV) window.__site = {
  gsap, cap, lenis, rastro,
  // teste: lista das gotas em rasante e uma função para criar uma agora
  gotas: { lista: gotasAtivas, nova: () => gotasAtivas.push(novaGota()) },
};
