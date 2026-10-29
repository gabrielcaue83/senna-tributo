# Ayrton Senna — Homenagem

Site-homenagem de fã ao Ayrton Senna, inspirado na experiência do landonorris.com.
Projeto **não oficial**, sem fins comerciais e sem ligação com a família Senna, o Instituto Ayrton Senna ou qualquer marca.

**Ver no ar:** https://gabrielcaue83.github.io/senna-tributo/

A cada envio para a branch `main`, o GitHub Actions gera o build e publica no GitHub Pages (`.github/workflows/deploy.yml`).

## Rodar

```bash
npm install
npm run dev
```

Abre em http://localhost:5177.

## O que tem no hero

- Preloader com a logo do Senna sendo desenhada
- Foto em WebGL com giro 3D da cabeça e deslize com o mouse
- Capacete 3D revelado pelo rastro do mouse e por uma gota em zigue-zague
- Wireframe pulsando e fundo de curvas de nível vivo
- Card "Última corrida" (Ímola, 1994): com o mouse parado 2 s em cima, uma cortina desce e revela o capacete inteiro

## Stack

Vite, GSAP, Lenis e Three.js. Os scripts em `tools/` preparam as fotos, a logo e os modelos 3D.

## Créditos

- Modelo antigo do capacete (`public/modelos/capacete.glb`, usado em `teste-modelo.html`): Chiavatta, MakerWorld, licença CC BY-NC.
- Nomes e marcas citados pertencem aos seus donos.
