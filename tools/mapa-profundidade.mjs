// Gera um mapa de profundidade aproximado para a foto do hero (claro = perto).
// Não usa IA: monta o volume a partir do recorte (silhueta) + um elipsoide
// para a cabeça + um volume pequeno para o nariz. Serve para o efeito de
// "foto 3D" no hero, em que a cabeça parece girar com o mouse.
//
// Uso: node tools/mapa-profundidade.mjs public/fotos/senna-hero.webp public/fotos/senna-profundidade.png
import sharp from 'sharp';

const [entrada, saida] = process.argv.slice(2);

// Medidas em pixels da foto original (2000 × 1600)
const CABECA = { x: 1012, y: 770, rx: 335, ry: 430 };
const NARIZ = { x: 1010, y: 900, raio: 70, altura: 0.12 };
const ESCALA = 0.25; // o mapa sai em 500 × 400 (suave, não precisa de detalhe)

const meta = await sharp(entrada).metadata();
const W = Math.round(meta.width * ESCALA), H = Math.round(meta.height * ESCALA);

// silhueta borrada = "volume" do corpo (meio do corpo mais perto que as bordas)
const corpo = await sharp(entrada).ensureAlpha().extractChannel(3).resize(W, H).blur(18).raw().toBuffer();
const alfa = await sharp(entrada).ensureAlpha().extractChannel(3).resize(W, H).raw().toBuffer();

const prof = Buffer.alloc(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    const fx = x / ESCALA, fy = y / ESCALA;
    // cabeça: elipsoide (frente da cabeça = 1, contorno = 0)
    const u = ((fx - CABECA.x) / CABECA.rx) ** 2 + ((fy - CABECA.y) / CABECA.ry) ** 2;
    const cabeca = u < 1 ? Math.sqrt(1 - u) : 0;
    // nariz: um morrinho no meio do rosto
    const dn = Math.hypot(fx - NARIZ.x, fy - NARIZ.y) / NARIZ.raio;
    const nariz = NARIZ.altura * Math.exp(-dn * dn);
    const b = corpo[i] / 255;
    let d = Math.max(b * 0.5, cabeca > 0 ? 0.32 + 0.6 * cabeca : 0) + nariz * (cabeca > 0 ? 1 : 0);
    // fora da silhueta fica no fundo (mas sem degrau seco na borda)
    d *= 0.35 + 0.65 * (alfa[i] / 255);
    prof[i] = Math.round(Math.min(1, d) * 255);
  }
}
// borrado forte: transições suaves entre cabeça, corpo e fundo = menos "esticado"
await sharp(prof, { raw: { width: W, height: H, channels: 1 } }).blur(9).png().toFile(saida);
console.log('ok', saida, `${W}×${H}`);
