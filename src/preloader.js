import gsap from 'gsap';
import logoSvg from './logo-senna.svg?raw';

// Preloader: a logo do Senna é desenhada traço por traço (contorno) e depois
// preenchida de baixo para cima. Uma linha amarela mostra o carregamento.
// Só sai quando a animação acabou E o que importa já carregou (capacete e foto).
//
// aguardar: Promise que resolve quando o site está pronto
// aoSair: chamada no começo da saída (para o hero começar a entrar junto)
export function iniciarPreloader({ aguardar, aoSair, reduzir = false }) {
  const el = document.querySelector('.preloader');
  if (!el) { aoSair?.(); return; }
  const caixa = el.querySelector('.preloader__logo');
  const barra = el.querySelector('.preloader__barra i');
  const numero = el.querySelector('.preloader__num span');

  // monta duas camadas com as mesmas formas: o contorno (desenhado) e o
  // preenchimento (revelado por um retângulo que sobe)
  const doc = new DOMParser().parseFromString(logoSvg, 'image/svg+xml');
  const original = doc.querySelector('svg');
  const vb = original.getAttribute('viewBox');
  const [, , vw, vh] = vb.split(' ').map(Number);
  const formas = [...original.querySelectorAll('path')].map((p) => p.getAttribute('d'));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', vb);
  svg.setAttribute('fill-rule', 'evenodd');
  svg.innerHTML = `
    <defs><clipPath id="logo-sobe"><rect class="logo-nivel" x="0" y="${vh}" width="${vw}" height="${vh}"/></clipPath></defs>
    <g class="preenchido" clip-path="url(#logo-sobe)">${formas.map((d) => `<path d="${d}"/>`).join('')}</g>
    <g class="contorno">${formas.map((d) => `<path d="${d}"/>`).join('')}</g>`;
  caixa.appendChild(svg);

  const tracos = [...svg.querySelectorAll('.contorno path')];
  tracos.forEach((p) => {
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len}`;
    p.style.strokeDashoffset = `${len}`;
  });
  const nivel = svg.querySelector('.logo-nivel');

  // progresso mostrado = o menor entre a animação e o carregamento real
  const estado = { anim: 0, carregado: 0 };
  const mostrar = () => {
    const p = Math.min(estado.anim, estado.carregado);
    barra.style.transform = `scaleX(${p})`;
    numero.textContent = Math.round(p * 100);
  };
  // carregamento "real": sobe sozinho até 90% e completa quando aguardar resolve
  const carga = gsap.to(estado, { carregado: 0.9, duration: 2.4, ease: 'power1.out', onUpdate: mostrar });

  const anim = gsap.timeline({ onUpdate: () => { estado.anim = anim.progress(); mostrar(); } });
  anim
    // 1) contorno: o "S" duplo primeiro, depois as letras
    .to(tracos.slice(0, 3), { strokeDashoffset: 0, duration: 1.1, ease: 'power2.inOut', stagger: 0.14 })
    .to(tracos.slice(3), { strokeDashoffset: 0, duration: 0.7, ease: 'power2.inOut', stagger: 0.08 }, 0.65)
    // 2) preenchimento subindo de baixo para cima
    .to(nivel, { attr: { y: 0 }, duration: 0.8, ease: 'power2.inOut' }, '-=0.15')
    // 3) o contorno some dentro do preenchido
    .to(tracos, { opacity: 0, duration: 0.3 }, '-=0.2');
  if (reduzir) anim.progress(1);

  const pronto = Promise.race([aguardar, new Promise((ok) => setTimeout(ok, 8000))]); // no máximo 8 s
  Promise.all([pronto, new Promise((ok) => anim.eventCallback('onComplete', ok))]).then(() => {
    carga.kill();
    gsap.to(estado, {
      carregado: 1, duration: 0.35, ease: 'power2.out', onUpdate: mostrar,
      onComplete: () => {
        aoSair?.();
        // saída: a logo dá um "zoom" e a tela do preloader sobe
        gsap.timeline({ onComplete: () => el.remove() })
          .to(caixa, { scale: 0.86, duration: 0.5, ease: 'power2.in' }, 0)
          .to([el.querySelector('.preloader__barra'), el.querySelector('.preloader__num')], { opacity: 0, duration: 0.3 }, 0)
          .to(el, { yPercent: -100, duration: 1, ease: 'expo.inOut' }, 0.25);
      },
    });
  });
}
