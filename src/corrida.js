import gsap from 'gsap';

// Card da última corrida (GP de San Marino, Ímola, 1994):
// - o traçado de Ímola desenhado em 3D, girando no próprio eixo, com um
//   pontinho amarelo dando a volta;
// - com o mouse parado em cima do card, a cortina desce e revela o capacete
//   inteiro; quando o mouse sai, ela sobe e tudo volta ao normal.

// Traçado de Ímola (versão estilizada do circuito de 1994), em metros
// aproximados: x = leste, y = norte. Sentido anti-horário.
const IMOLA = [
  [0, 0], [120, 4], [240, 10], [330, 18], [400, 34], [450, 62],        // reta dos boxes → Tamburello
  [478, 92], [492, 104], [505, 118], [522, 142], [516, 164], [496, 172], // Villeneuve → Tosa
  [462, 176], [420, 192], [380, 214], [352, 238], [326, 250],            // subida → Piratella
  [292, 252], [262, 240], [238, 252], [214, 262], [190, 252],            // Acque Minerali
  [150, 248], [128, 238], [108, 250], [80, 248],                         // Variante Alta
  [46, 232], [14, 206], [-18, 176], [-34, 146], [-30, 116],             // descida → Rivazza
  [-14, 92], [-20, 66], [-16, 34], [-6, 12],                             // Rivazza → reta
];

export function criarCorrida(el, { temHover = true, reduzir = false, aoEntrar, aoSair } = {}) {
  if (!el) return null;
  const tela = el.querySelector('.corrida__pista');
  const ctx = tela.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = 108, H = 72;
  tela.width = W * dpr; tela.height = H * dpr;

  // centraliza e normaliza o traçado
  const xs = IMOLA.map((p) => p[0]), ys = IMOLA.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const escala = 1 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const pontos = IMOLA.map(([x, y]) => [(x - cx) * escala, -(y - cy) * escala]); // plano do chão (x, z)

  // suaviza o traçado (Catmull-Rom fechado) para a linha ficar redonda
  const suave = [];
  const n = pontos.length;
  for (let i = 0; i < n; i++) {
    const p0 = pontos[(i - 1 + n) % n], p1 = pontos[i], p2 = pontos[(i + 1) % n], p3 = pontos[(i + 2) % n];
    for (let k = 0; k < 6; k++) {
      const t = k / 6, t2 = t * t, t3 = t2 * t;
      suave.push([0, 1].map((j) => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }

  // projeção: gira em volta do eixo vertical, câmera inclinada olhando de cima
  const INCLINA = 1.05; // rad (~60°)
  const projetar = ([x, z], giro, alt = 0) => {
    const xr = x * Math.cos(giro) - z * Math.sin(giro);
    const zr = x * Math.sin(giro) + z * Math.cos(giro);
    const y = alt;
    const yc = y * Math.cos(INCLINA) - zr * Math.sin(INCLINA);
    const zc = y * Math.sin(INCLINA) + zr * Math.cos(INCLINA);
    const persp = 1.8 / (1.8 + zc);
    return [W / 2 + xr * W * 0.82 * persp, H / 2 - yc * W * 0.82 * persp];
  };

  const desenhar = (t) => {
    const giro = reduzir ? 0.5 : t * 0.55;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const linha = (alt, cor, larg) => {
      ctx.beginPath();
      suave.forEach((p, i) => { const [x, y] = projetar(p, giro, alt); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.closePath();
      ctx.strokeStyle = cor; ctx.lineWidth = larg; ctx.lineJoin = 'round'; ctx.stroke();
    };
    linha(-0.045, 'rgba(15,42,29,0.22)', 1.2);  // "espessura" embaixo (sombra)
    linha(0, '#0f2a1d', 1.6);                   // traçado
    // pontinho amarelo dando a volta
    const pos = suave[Math.floor((t * 22) % suave.length)];
    const [px, py] = projetar(pos, giro, 0);
    ctx.beginPath(); ctx.arc(px, py, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd400'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = '#0f2a1d'; ctx.stroke();
  };

  let ativo = true;
  new IntersectionObserver(([e]) => { ativo = e.isIntersecting; }).observe(el);
  gsap.ticker.add(() => { if (ativo) desenhar(performance.now() / 1000); });

  // mouse parado em cima: revela o capacete inteiro
  if (temHover) {
    el.addEventListener('pointerenter', () => aoEntrar?.());
    el.addEventListener('pointerleave', () => aoSair?.());
  }
  return { desenhar };
}
