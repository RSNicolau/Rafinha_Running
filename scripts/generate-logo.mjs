import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, '..', 'apps', 'mobile', 'assets');

// Official RR logo: White italic "RR" with speed lines on red background (#DC2626)
function createLogoSvg(size, padding = 0.15) {
  const p = Math.round(size * padding);
  const inner = size - p * 2;

  // Scale factor relative to a 512 base
  const s = inner / 512;

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#DC2626" rx="${Math.round(size * 0.18)}"/>
  <g transform="translate(${p}, ${p})">
    <!-- RR letters - bold italic style with motion lines -->
    <g fill="white" transform="skewX(-8)">
      <!-- First R -->
      <rect x="${Math.round(70*s)}" y="${Math.round(80*s)}" width="${Math.round(52*s)}" height="${Math.round(350*s)}" rx="${Math.round(6*s)}"/>
      <path d="M${Math.round(70*s)} ${Math.round(80*s)}
               h${Math.round(140*s)}
               q${Math.round(70*s)} 0 ${Math.round(70*s)} ${Math.round(75*s)}
               q0 ${Math.round(75*s)} -${Math.round(70*s)} ${Math.round(75*s)}
               h-${Math.round(88*s)}
               v-${Math.round(46*s)}
               h${Math.round(76*s)}
               q${Math.round(30*s)} 0 ${Math.round(30*s)} -${Math.round(29*s)}
               q0 -${Math.round(29*s)} -${Math.round(30*s)} -${Math.round(29*s)}
               h-${Math.round(128*s)}
               z"/>
      <!-- First R leg -->
      <polygon points="${Math.round(185*s)},${Math.round(230*s)} ${Math.round(290*s)},${Math.round(430*s)} ${Math.round(235*s)},${Math.round(430*s)} ${Math.round(145*s)},${Math.round(250*s)}"/>

      <!-- Second R -->
      <rect x="${Math.round(270*s)}" y="${Math.round(80*s)}" width="${Math.round(52*s)}" height="${Math.round(350*s)}" rx="${Math.round(6*s)}"/>
      <path d="M${Math.round(270*s)} ${Math.round(80*s)}
               h${Math.round(140*s)}
               q${Math.round(70*s)} 0 ${Math.round(70*s)} ${Math.round(75*s)}
               q0 ${Math.round(75*s)} -${Math.round(70*s)} ${Math.round(75*s)}
               h-${Math.round(88*s)}
               v-${Math.round(46*s)}
               h${Math.round(76*s)}
               q${Math.round(30*s)} 0 ${Math.round(30*s)} -${Math.round(29*s)}
               q0 -${Math.round(29*s)} -${Math.round(30*s)} -${Math.round(29*s)}
               h-${Math.round(128*s)}
               z"/>
      <!-- Second R leg -->
      <polygon points="${Math.round(385*s)},${Math.round(230*s)} ${Math.round(490*s)},${Math.round(430*s)} ${Math.round(435*s)},${Math.round(430*s)} ${Math.round(345*s)},${Math.round(250*s)}"/>
    </g>

    <!-- Speed/motion lines on the left side -->
    <g stroke="white" stroke-width="${Math.round(6*s)}" stroke-linecap="round" opacity="0.7" transform="skewX(-8)">
      <line x1="${Math.round(20*s)}" y1="${Math.round(160*s)}" x2="${Math.round(58*s)}" y2="${Math.round(160*s)}"/>
      <line x1="${Math.round(10*s)}" y1="${Math.round(210*s)}" x2="${Math.round(58*s)}" y2="${Math.round(210*s)}"/>
      <line x1="${Math.round(25*s)}" y1="${Math.round(260*s)}" x2="${Math.round(58*s)}" y2="${Math.round(260*s)}"/>
    </g>
  </g>
</svg>`;
}

// Splash screen: logo centered on red background
function createSplashSvg(width, height) {
  const logoSize = Math.round(Math.min(width, height) * 0.3);
  const x = Math.round((width - logoSize) / 2);
  const y = Math.round((height - logoSize) / 2.5);

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="#DC2626"/>
  <g transform="translate(${x}, ${y})">
    ${createLogoInner(logoSize)}
  </g>
  <text x="${width/2}" y="${y + logoSize + 80}" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="48" font-weight="bold" letter-spacing="4">RAFINHA RUNNING</text>
</svg>`;
}

function createLogoInner(size) {
  const s = size / 512;
  return `
    <g fill="white" transform="skewX(-8)">
      <rect x="${Math.round(70*s)}" y="${Math.round(80*s)}" width="${Math.round(52*s)}" height="${Math.round(350*s)}" rx="${Math.round(6*s)}"/>
      <path d="M${Math.round(70*s)} ${Math.round(80*s)} h${Math.round(140*s)} q${Math.round(70*s)} 0 ${Math.round(70*s)} ${Math.round(75*s)} q0 ${Math.round(75*s)} -${Math.round(70*s)} ${Math.round(75*s)} h-${Math.round(88*s)} v-${Math.round(46*s)} h${Math.round(76*s)} q${Math.round(30*s)} 0 ${Math.round(30*s)} -${Math.round(29*s)} q0 -${Math.round(29*s)} -${Math.round(30*s)} -${Math.round(29*s)} h-${Math.round(128*s)} z"/>
      <polygon points="${Math.round(185*s)},${Math.round(230*s)} ${Math.round(290*s)},${Math.round(430*s)} ${Math.round(235*s)},${Math.round(430*s)} ${Math.round(145*s)},${Math.round(250*s)}"/>
      <rect x="${Math.round(270*s)}" y="${Math.round(80*s)}" width="${Math.round(52*s)}" height="${Math.round(350*s)}" rx="${Math.round(6*s)}"/>
      <path d="M${Math.round(270*s)} ${Math.round(80*s)} h${Math.round(140*s)} q${Math.round(70*s)} 0 ${Math.round(70*s)} ${Math.round(75*s)} q0 ${Math.round(75*s)} -${Math.round(70*s)} ${Math.round(75*s)} h-${Math.round(88*s)} v-${Math.round(46*s)} h${Math.round(76*s)} q${Math.round(30*s)} 0 ${Math.round(30*s)} -${Math.round(29*s)} q0 -${Math.round(29*s)} -${Math.round(30*s)} -${Math.round(29*s)} h-${Math.round(128*s)} z"/>
      <polygon points="${Math.round(385*s)},${Math.round(230*s)} ${Math.round(490*s)},${Math.round(430*s)} ${Math.round(435*s)},${Math.round(430*s)} ${Math.round(345*s)},${Math.round(250*s)}"/>
    </g>
    <g stroke="white" stroke-width="${Math.round(6*s)}" stroke-linecap="round" opacity="0.7" transform="skewX(-8)">
      <line x1="${Math.round(20*s)}" y1="${Math.round(160*s)}" x2="${Math.round(58*s)}" y2="${Math.round(160*s)}"/>
      <line x1="${Math.round(10*s)}" y1="${Math.round(210*s)}" x2="${Math.round(58*s)}" y2="${Math.round(210*s)}"/>
      <line x1="${Math.round(25*s)}" y1="${Math.round(260*s)}" x2="${Math.round(58*s)}" y2="${Math.round(260*s)}"/>
    </g>`;
}

async function generate() {
  console.log('Generating RR logo assets...');

  // App icon (1024x1024)
  await sharp(Buffer.from(createLogoSvg(1024)))
    .png()
    .toFile(path.join(assetsDir, 'icon.png'));
  console.log('  ✓ icon.png (1024x1024)');

  // Adaptive icon (1024x1024, more padding)
  await sharp(Buffer.from(createLogoSvg(1024, 0.2)))
    .png()
    .toFile(path.join(assetsDir, 'adaptive-icon.png'));
  console.log('  ✓ adaptive-icon.png (1024x1024)');

  // Favicon (48x48)
  await sharp(Buffer.from(createLogoSvg(192)))
    .resize(48, 48)
    .png()
    .toFile(path.join(assetsDir, 'favicon.png'));
  console.log('  ✓ favicon.png (48x48)');

  // Splash screen (1284x2778)
  await sharp(Buffer.from(createSplashSvg(1284, 2778)))
    .png()
    .toFile(path.join(assetsDir, 'splash.png'));
  console.log('  ✓ splash.png (1284x2778)');

  // Logo for in-app use (512x512)
  await sharp(Buffer.from(createLogoSvg(512, 0)))
    .png()
    .toFile(path.join(assetsDir, 'logo.png'));
  console.log('  ✓ logo.png (512x512)');

  console.log('\nAll logo assets generated!');
}

generate().catch(console.error);
