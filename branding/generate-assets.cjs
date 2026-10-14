/**
 * Branding de Playlist Cleaner — sistema "Tarjeta + nota".
 *
 * Genera los PNGs de iconos a partir de SVG (mismo enfoque que el hub).
 * El logo: la tarjeta del deck (con una carta detrás) y una nota musical,
 * en la paleta sage del hub (Verde Sage / fondo #242c26→#141814).
 *
 * Ejecutar:  node branding/generate-assets.cjs
 * Salida:    branding/out/  (revisión)  +  assets/images/ (los que usa la app)
 *
 * Nota: `sharp` se toma del node_modules de score-tracker-gtr3, igual que los
 * scripts de branding del hub-app.
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('C:/VSCode/score_viewer/score-tracker-gtr3/node_modules/sharp');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'out');
const SRC = path.join(ROOT, 'src');
const ASSETS = path.resolve(ROOT, '..', 'assets', 'images');

const SAGE_LIGHT = '#9ed6b1';
const SAGE_DARK = '#4a7c59';
const NOTE_COLOR = SAGE_LIGHT;

const defs = `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${SAGE_LIGHT}"/>
      <stop offset="1" stop-color="${SAGE_DARK}"/>
    </linearGradient>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#242c26"/>
      <stop offset="1" stop-color="#141814"/>
    </linearGradient>
  </defs>`;

const svg = (body, size = 1024) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${defs}${body}</svg>`;

/** Nota corchea. */
const note = (tilt = -8, color = NOTE_COLOR) => `
    <g transform="rotate(${tilt})">
      <ellipse cx="-36" cy="68" rx="60" ry="47" transform="rotate(-18 -36 68)" fill="${color}"/>
      <rect x="8" y="-148" width="24" height="218" rx="12" fill="${color}"/>
      <path d="M32 -148 C 128 -134, 150 -52, 104 16 C 118 -58, 92 -112, 32 -112 Z" fill="${color}"/>
    </g>`;

/** Marca: tarjeta del deck + nota. `monochrome` = silueta blanca para Android 13+. */
const mark = ({ scale = 1, monochrome = false } = {}) => {
  const cardFill = monochrome ? 'none' : '#28322a';
  const cardStroke = monochrome ? '#FFFFFF' : 'url(#g)';
  const backFill = monochrome ? 'none' : '#1d251e';
  const backStroke = monochrome ? '#FFFFFF' : SAGE_DARK;
  const backOpacity = monochrome ? '0.45' : '0.35';
  return `
  <g transform="translate(512,512) scale(${scale})">
    <g transform="rotate(-8)">
      <rect x="-176" y="-240" width="392" height="474" rx="68" fill="${backFill}" stroke="${backStroke}" stroke-opacity="${backOpacity}" stroke-width="16" transform="translate(66 46)"/>
      <rect x="-176" y="-240" width="392" height="474" rx="68" fill="${cardFill}" stroke="${cardStroke}" stroke-width="30"/>
    </g>
    <g transform="translate(8,-8)">${note(-8, monochrome ? '#FFFFFF' : NOTE_COLOR)}</g>
  </g>`;
};

/** Icono completo (tile) — Android legacy / general / favicon. */
const fullIcon = (size = 1024) =>
  svg(
    `<rect width="1024" height="1024" rx="232" fill="url(#bg)"/>
     <rect x="10" y="10" width="1004" height="1004" rx="222" fill="none" stroke="#a2cfae" stroke-opacity="0.12" stroke-width="3"/>
     ${mark({ scale: 1 })}`,
    size
  );

/** Foreground adaptativo (círculo seguro ~66%). */
const foreground = (monochrome = false) => svg(mark({ scale: 1.14, monochrome }));

/** Fondo adaptativo. */
const background = () => svg('<rect width="1024" height="1024" fill="url(#bg)"/>');

/** Splash: solo la marca sobre transparente (el fondo lo pone app.json). */
const splashLogo = () => svg(mark({ scale: 0.86 }));

const FILES = {
  'icon.png': fullIcon(1024),
  'android-icon-foreground.png': foreground(),
  'android-icon-background.png': background(),
  'android-icon-monochrome.png': foreground(true),
  'splash-icon.png': splashLogo(),
  'favicon.png': fullIcon(196),
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(SRC, { recursive: true });
  fs.mkdirSync(ASSETS, { recursive: true });

  // Fuentes SVG (para ajustes futuros, igual que en el hub).
  fs.writeFileSync(path.join(SRC, 'playlist-icon.svg'), fullIcon());
  fs.writeFileSync(path.join(SRC, 'playlist-foreground.svg'), foreground());

  for (const [name, content] of Object.entries(FILES)) {
    const png = await sharp(Buffer.from(content)).png().toBuffer();
    fs.writeFileSync(path.join(OUT, name), png);
    fs.writeFileSync(path.join(ASSETS, name), png);
  }

  // Preview del icono adaptativo compuesto (foreground sobre background).
  const base = await sharp(Buffer.from(background())).png().toBuffer();
  const composedPng = await sharp(base)
    .composite([{ input: Buffer.from(foreground()), left: 0, top: 0 }])
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(OUT, 'preview-adaptive.png'), composedPng);

  console.log(`Iconos generados (${Object.keys(FILES).length}) en:`);
  console.log(`  ${OUT}  (revisión)`);
  console.log(`  ${ASSETS}  (los usa la app)`);
})();
