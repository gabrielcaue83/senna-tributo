import './style.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { criarCapacete } from './capacete.js';
import { criarTrilha, TRILHA } from './rastro.js';
import { criarTopoVivo } from './topo.js';
import { iniciarPreloader } from './preloader.js';
import { criarLogoTopo } from './logo-topo.js';
import { criarCorrida } from './corrida.js';
import { bordaCortina, criarBarriga } from './cortina.js';

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
// "acelera" = como ela desce: começa devagar e vai pegando impulso (o formato,
// uma barriga só que afunda com a velocidade, fica em cortina.js).
const CORTINA = { espera: 1, desce: 1.5, sobe: 1, acelera: 'power3.in' };
const cargaCorrida = document.querySelector('.corrida__carga i');
let esperaCortina = null;
criarCorrida(document.querySelector('.corrida'), {
  temHover, reduzir,
  aoEntrar: () => {
    esperaCortina?.kill();
    esperaCortina = gsap.fromTo(cargaCorrida, { scaleX: 0 }, {
      scaleX: 1, duration: CORTINA.espera, ease: 'none',
      onComplete: () => {
        // a cortina vai descer: o Senna volta para a posição padrão e para de seguir o mouse
        seguirMouse = false;
        voltarAoCentro(CORTINA.desce, CORTINA.acelera);
        gsap.to(cap, { cortina: 1, duration: CORTINA.desce, ease: CORTINA.acelera, overwrite: true });
      },
    });
  },
  aoSair: () => {
    esperaCortina?.kill();
    seguirMouse = true; // volta a acompanhar no próximo movimento do mouse
    gsap.to(cargaCorrida, { scaleX: 0, duration: 0.3, ease: 'power2.out' });
    gsap.to(cap, { cortina: 0, duration: CORTINA.sobe, ease: 'power3.inOut', overwrite: true });
  },
});

// Fundo topográfico vivo: as curvas só andam devagar, sem pulso
// (para ligar um pulso saindo do capacete: forca > 0 e um "centro")
// mancha: 1 = as gotas invertem as cores do fundo por onde passam (0 desliga)
const topo = criarTopoVivo(document.querySelector('.topo'), { forca: 0, base: 0.15, mancha: 1 });

// Rastro de água (mouse e gotas fantasmas): uma pintura que escorre, numa
// tela invisível que o capacete e o fundo leem (valores em rastro.js, TRILHA).
// Onde tem "tinta", o capacete aparece e o fundo inverte as cores.
const trilha = criarTrilha();
cap.usarTrilha(trilha?.canvas);
topo?.usarTrilha(trilha?.canvas);
let mouse = null;       // última posição do mouse dentro do hero (para o brilho)
let pincelMouse = null; // última posição do mouse na janela (pinta o rastro)
if (temHover) {
  hero.addEventListener('pointerenter', (e) => { mouse = [e.clientX, e.clientY]; cap.mover(...mouse); cap.brilhar(true); });
  hero.addEventListener('pointermove', (e) => { mouse = [e.clientX, e.clientY]; });
  hero.addEventListener('pointerleave', () => { mouse = null; cap.brilhar(false); });
  if (!reduzir) window.addEventListener('pointermove', (e) => { pincelMouse = [e.clientX, e.clientY]; });
  // mouse saiu da janela: levanta o pincel (senão ao voltar riscaria a tela)
  window.addEventListener('pointerout', (e) => { if (!e.relatedTarget) pincelMouse = null; });
} else {
  // No toque: um toque desce a cortina e veste o capacete inteiro (a mesma do
  // card da corrida); outro toque sobe a cortina
  let vestido = false;
  hero.addEventListener('click', () => {
    vestido = !vestido;
    gsap.to(cap, vestido
      ? { cortina: 1, duration: CORTINA.desce, ease: CORTINA.acelera, overwrite: true }
      : { cortina: 0, duration: CORTINA.sobe, ease: 'power3.inOut', overwrite: true });
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
// Enquanto a cortina do card está descida, o Senna fica parado no centro
// (posição padrão) e não acompanha o mouse; volta a acompanhar quando o mouse
// sai do card.
// A posição fica num lugar só ("pos", de -0,5 a 0,5; 0, 0 = posição padrão):
// o mouse define o alvo e a posição chega nele suavemente a cada quadro; a
// volta da cortina anima a mesma posição. Assim corpo, cabeça e palavra
// sempre andam juntos.
let seguirMouse = true;
const pos = { nx: 0, ny: 0 }, alvoPos = { nx: 0, ny: 0 };
let voltaTween = null;
const MOUSE_SUAVE = 3.2; // quão rápido o Senna alcança o mouse (maior = mais rápido)
const fotoEl = document.querySelector('.hero__foto'), palavraEl = document.querySelector('.hero__palavra');
const aplicarPosicao = () => {
  gsap.set(fotoEl, { x: pos.nx * PARALLAX.fotoX, y: pos.ny * PARALLAX.fotoY }); // imagem inteira desliza
  gsap.set(palavraEl, { x: -pos.nx * PARALLAX.palavraX, y: -pos.ny * PARALLAX.palavraY });
  cap.inclinar(pos.nx, pos.ny);                                                  // cabeça + capacete viram em 3D
};
// volta para a posição padrão no mesmo ritmo da cortina (desce junto com ela,
// como se o Senna soubesse o que vai acontecer)
const voltarAoCentro = (duracao, ease) => {
  if (!temHover || reduzir) return;
  alvoPos.nx = alvoPos.ny = 0;
  voltaTween?.kill();
  voltaTween = gsap.to(pos, { nx: 0, ny: 0, duration: duracao, ease });
};
let quadroPos = performance.now();
const atualizarPosicao = () => {
  if (!temHover || reduzir) return;
  const agora = performance.now();
  const dt = Math.min(0.1, (agora - quadroPos) / 1000);
  quadroPos = agora;
  if (!voltaTween?.isActive()) {
    const k = 1 - Math.exp(-dt * MOUSE_SUAVE);
    pos.nx += (alvoPos.nx - pos.nx) * k;
    pos.ny += (alvoPos.ny - pos.ny) * k;
  }
  aplicarPosicao();
};
if (temHover && !reduzir) {
  window.addEventListener('pointermove', (e) => {
    if (!seguirMouse) return;
    alvoPos.nx = e.clientX / window.innerWidth - 0.5;
    alvoPos.ny = e.clientY / window.innerHeight - 0.5;
  });
}

// ---------- RAJADAS DE ÁGUA EM ZIGUE-ZAGUE ----------
// Ritmo medido no vídeo de referência que o usuário mandou: rajadas de 4
// passadas horizontais que cruzam a tela inteira, uma em cada altura do rosto
// (testa → olhos → boca → queixo). Cada passada nova sai ~0,43 s depois da
// anterior, no sentido contrário (esquerda→direita, direita→esquerda...), então
// elas se cruzam em cascata. Uma rajada DESCE, a seguinte SOBE, e assim vai.
// Cada passada é um pincel que pinta no rastro de água (rastro.js): revela o
// capacete e inverte o fundo.
// alturas = px da foto do hero (testa, olhos, boca, queixo); intervalo = s
// entre o início de uma passada e o da próxima; entreRajadas = s entre o início
// de uma rajada e o da seguinte; velocidade = larguras de tela por segundo;
// inclinacao = quanto a passada desce/sobe de um lado ao outro (px); nasce = s
// até o pincel chegar ao tamanho cheio.
const FANTASMA = {
  alturas: [711, 882, 1166, 1290],
  intervalo: [0.38, 0.48],
  entreRajadas: [4, 5.5],
  velocidade: [1.4, 1.7],
  inclinacao: 24,
  variaAltura: 14, // px da foto de sorteio em cada altura
  nasce: 0.08,
  descanso: 5, // segundos sem mexer o mouse para as rajadas voltarem
};
let idGota = 0;
const sorteio = (a, b) => a + Math.random() * (b - a);

const gotasAtivas = [];
const rajada = { descendo: true, feitas: FANTASMA.alturas.length, lado: 1, inicio: 0 };
let proximaPassada = performance.now() / 1000 + 1.4; // 1ª rajada logo após a entrada
// Enquanto o mouse se mexe, não sai passada nova (as que estão passando
// terminam). Depois de FANTASMA.descanso segundos parado, volta.
let ultimoMouse = -Infinity;
if (temHover) window.addEventListener('pointermove', () => { ultimoMouse = performance.now() / 1000; });
// uma passada: da borda de um lado (fora da tela) até a do outro, na altura y
const novaPassada = (y, lado) => {
  const W = window.innerWidth;
  const fora = TRILHA.raio * 0.6 + 60;
  const ini = [lado < 0 ? -fora : W + fora, y - FANTASMA.inclinacao / 2];
  const fim = [lado < 0 ? W + fora : -fora, y + FANTASMA.inclinacao / 2];
  return { id: `gota${++idGota}`, ini, fim, total: Math.hypot(fim[0] - ini[0], fim[1] - ini[1]), andado: 0, tempo: 0, vel: W * sorteio(...FANTASMA.velocidade) };
};
// altura (px da tela) de um ponto da foto do hero
const alturaNaTela = (yFoto) => { const r = area.getBoundingClientRect(); return r.top + yFoto * (r.height / 1600); };
// a cada quadro cada passada vira um pincel na frente dela (o rastro de água
// atrás é a própria tinta escorrendo)
let quadroAnterior = performance.now() / 1000;
const pintarFantasmas = () => {
  const agora = performance.now() / 1000;
  const dt = Math.min(0.05, agora - quadroAnterior);
  quadroAnterior = agora;
  if (reduzir || !trilha) return;
  // mouse mexendo: segura as passadas novas; voltam depois do descanso
  if (agora - ultimoMouse < FANTASMA.descanso) {
    proximaPassada = Math.max(proximaPassada, ultimoMouse + FANTASMA.descanso);
  } else if (agora >= proximaPassada) {
    const n = FANTASMA.alturas.length;
    if (rajada.feitas >= n) { // começa uma rajada nova (inverte: desce ↔ sobe)
      rajada.descendo = !rajada.descendo;
      rajada.feitas = 0;
      rajada.lado = Math.random() < 0.5 ? -1 : 1;
      rajada.inicio = agora;
    }
    const k = rajada.descendo ? rajada.feitas : n - 1 - rajada.feitas;
    const y = alturaNaTela(FANTASMA.alturas[k] + sorteio(-1, 1) * FANTASMA.variaAltura);
    gotasAtivas.push(novaPassada(y, rajada.lado));
    rajada.lado = -rajada.lado; // a próxima vem do outro lado
    rajada.feitas++;
    proximaPassada = rajada.feitas < n
      ? agora + sorteio(...FANTASMA.intervalo)
      : rajada.inicio + sorteio(...FANTASMA.entreRajadas);
  }
  for (let i = gotasAtivas.length - 1; i >= 0; i--) {
    const p = gotasAtivas[i];
    p.tempo += dt;
    p.andado += p.vel * dt;
    if (p.andado > p.total) { gotasAtivas.splice(i, 1); continue; }
    const t = p.andado / p.total;
    const cresce = Math.sin((Math.min(1, p.tempo / FANTASMA.nasce) * Math.PI) / 2);
    trilha.pincel(p.id, [p.ini[0] + (p.fim[0] - p.ini[0]) * t, p.ini[1] + (p.fim[1] - p.ini[1]) * t],
      TRILHA.raio * TRILHA.pincelGota * cresce, { forca: TRILHA.forcaGota });
  }
};

// Desenha só enquanto o hero está na tela
const medirBarriga = criarBarriga();
let visivel = true;
new IntersectionObserver(([e]) => { visivel = e.isIntersecting; }).observe(hero);
gsap.ticker.add(() => {
  // rastro de água: mouse e gotas pintam, a tinta escorre (um passo)
  if (trilha) {
    if (pincelMouse) trilha.pincel('mouse', pincelMouse, TRILHA.raio * TRILHA.pincelMouse, { forcaPorMovimento: true });
    pintarFantasmas();
    trilha.passo();
  }
  // cortina: a barriga afunda com a velocidade; capacete e fundo usam a mesma
  const barriga = medirBarriga(cap.cortina);
  cap.barriga = barriga;
  if (topo) { topo.U.uCortina.value = cap.cortina; topo.U.uBarriga.value = barriga; topo.quadro(); }
  if (!visivel) return;
  // a foto se mexe com o parallax: reposiciona o brilho/lente todo quadro
  atualizarPosicao(); // Senna acompanha o mouse (ou volta ao centro com a cortina)
  if (mouse) cap.mover(...mouse);
  // textos escuros viram creme quando a borda da cortina passa por eles
  // (topo: marca e menu; base: título e card, perto da lateral esquerda)
  document.body.classList.toggle('cortina-topo', cap.cortina > 0 && bordaCortina(0.05, cap.cortina, barriga) > 0.09);
  document.body.classList.toggle('cortina-base', cap.cortina > 0 && bordaCortina(0.08, cap.cortina, barriga) > 0.69);
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
  gsap, cap, lenis, trilha, topo,
  // teste: lista das gotas em rasante e uma função para criar uma agora
  gotas: { lista: gotasAtivas, rajada, agora: () => { proximaPassada = 0; ultimoMouse = -Infinity; } },
};
