import gsap from 'gsap';
import logoSvg from './logo-senna.svg?raw';

// "S" do Senna no topo, centralizado (sem o escrito SENNA). Fica só com o
// contorno; quando o mouse chega perto, ele se preenche de baixo para cima e
// esvazia quando o mouse se afasta.
// perto = distância (px) do centro do "S" em que ele começa a encher.
const LOGO = { perto: 110, formas: 3 };

export function criarLogoTopo(el, { temHover = true } = {}) {
  const doc = new DOMParser().parseFromString(logoSvg, 'image/svg+xml');
  const formas = [...doc.querySelectorAll('path')].slice(0, LOGO.formas).map((p) => p.getAttribute('d'));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', doc.querySelector('svg').getAttribute('viewBox'));
  svg.setAttribute('fill-rule', 'evenodd');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <defs><clipPath id="logo-topo-sobe"><rect class="logo-topo__nivel" x="0" y="0" width="1" height="1"/></clipPath></defs>
    <g class="logo-topo__cheio" clip-path="url(#logo-topo-sobe)">${formas.map((d) => `<path d="${d}"/>`).join('')}</g>
    <g class="logo-topo__contorno">${formas.map((d) => `<path d="${d}"/>`).join('')}</g>`;
  el.appendChild(svg);

  // recorta o viewBox no tamanho do "S" (a imagem original tinha margem e o texto)
  const bb = svg.querySelector('.logo-topo__contorno').getBBox();
  const folga = bb.width * 0.04;
  svg.setAttribute('viewBox', `${bb.x - folga} ${bb.y - folga} ${bb.width + folga * 2} ${bb.height + folga * 2}`);
  const nivel = svg.querySelector('.logo-topo__nivel');
  // o retângulo do preenchimento começa embaixo (vazio)
  gsap.set(nivel, { attr: { x: bb.x - folga, width: bb.width + folga * 2, height: bb.height + folga * 2, y: bb.y + bb.height + folga } });
  const cheioY = bb.y - folga, vazioY = bb.y + bb.height + folga;

  let cheio = false;
  const encher = (sim) => {
    if (sim === cheio) return;
    cheio = sim;
    gsap.to(nivel, { attr: { y: sim ? cheioY : vazioY }, duration: sim ? 0.55 : 0.7, ease: sim ? 'power3.out' : 'power2.inOut', overwrite: true });
  };

  if (temHover) {
    window.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
      encher(d < LOGO.perto);
    });
    document.documentElement.addEventListener('pointerleave', () => encher(false));
  } else {
    // no toque: enche ao tocar e esvazia logo depois
    el.addEventListener('touchstart', () => { encher(true); setTimeout(() => encher(false), 900); }, { passive: true });
  }
  return { encher };
}
