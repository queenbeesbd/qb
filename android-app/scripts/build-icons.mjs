/**
 * Builds the Android launcher icons and the splash image from the owner's own logo.
 *
 * The owner's mark is a black ring on white (`logo.jpeg`, 1500x1500). Nothing here invents a second
 * identity: the icon is that mark, scaled into the sizes Android asks for.
 *
 * Three forms are written, because Android uses all three:
 *
 * - `ic_launcher.png` - the legacy square icon, used below API 26 and by launchers that ignore
 *   adaptive icons.
 * - `ic_launcher_round.png` - the same mark, drawn as a circle.
 * - `ic_launcher_foreground.png` - the adaptive icon's foreground layer. It is drawn on a
 *   transparent 108dp canvas with the mark inside the 66dp safe zone, so a launcher's mask (circle,
 *   squircle, teardrop) can never clip it. The background layer is white, the logo's own field.
 *
 * Run with `node scripts/build-icons.mjs` from `app/`.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const requireFromRepo = createRequire(path.resolve(import.meta.dirname, '..', '..', 'package.json'));
const sharp = requireFromRepo('sharp');

const root = path.resolve(import.meta.dirname, '..');
const repo = path.resolve(root, '..');
const res = path.join(root, 'android/app/src/main/res');
const source = path.join(repo, 'logo.jpeg');

/** mdpi is the 1x bucket; every other bucket is Android's own scale factor. */
const DENSITIES = [
  { name: 'mdpi', scale: 1 },
  { name: 'hdpi', scale: 1.5 },
  { name: 'xhdpi', scale: 2 },
  { name: 'xxhdpi', scale: 3 },
  { name: 'xxxhdpi', scale: 4 },
];

/** Legacy icon size in dp (48), adaptive foreground canvas in dp (108). */
const LEGACY_DP = 48;
const FOREGROUND_DP = 108;
/** The mark occupies two thirds of the adaptive canvas: inside the 66dp safe zone with a hair spare. */
const FOREGROUND_FILL = 0.64;

async function main() {
  const logo = await sharp(source).toBuffer();
  const meta = await sharp(logo).metadata();

  for (const density of DENSITIES) {
    const dir = path.join(res, `mipmap-${density.name}`);
    await mkdir(dir, { recursive: true });

    const legacy = Math.round(LEGACY_DP * density.scale);
    const foreground = Math.round(FOREGROUND_DP * density.scale);

    const square = await sharp(logo).resize(legacy, legacy, { fit: 'cover' }).png().toBuffer();
    await writeFile(path.join(dir, 'ic_launcher.png'), square);

    // The round form: the mark masked by its own inscribed circle, so a round launcher frame sees a
    // round icon rather than a white square behind a black ring.
    const inner = await sharp(logo).resize(legacy, legacy, { fit: 'cover' }).png().toBuffer();
    const mask = Buffer.from(
      `<svg width="${legacy}" height="${legacy}"><circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}"/></svg>`,
    );
    const round = await sharp(inner)
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer();
    await writeFile(path.join(dir, 'ic_launcher_round.png'), round);

    const mark = Math.round(foreground * FOREGROUND_FILL);
    const trimmed = await sharp(logo)
      .resize(mark, mark, { fit: 'cover' })
      .png()
      .toBuffer();
    const offset = Math.round((foreground - mark) / 2);
    const foregroundPng = await sharp({
      create: {
        width: foreground,
        height: foreground,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: trimmed, top: offset, left: offset }])
      .png()
      .toBuffer();
    await writeFile(path.join(dir, 'ic_launcher_foreground.png'), foregroundPng);

    process.stdout.write(
      `mipmap-${density.name}: legacy ${legacy}px, foreground ${foreground}px (source ${meta.width}x${meta.height})\n`,
    );
  }

  // The launch image: the mark on the panel's own pale field.
  //
  // Capacitor's template ships a splash beside every density *and* orientation bucket. Writing only
  // `drawable/splash.png` would leave those in place and they would win the resource match, so each
  // bucket is written here at the size the template expects. A wrong-sized splash is not harmless: a
  // 1080x1920 bitmap requested as an mdpi asset is decoded at ~8 MB into a phone's memory.
  const SPLASH_PORTS = [
    { density: 'mdpi', width: 320, height: 480 },
    { density: 'hdpi', width: 480, height: 800 },
    { density: 'xhdpi', width: 720, height: 1280 },
    { density: 'xxhdpi', width: 960, height: 1600 },
    { density: 'xxxhdpi', width: 1280, height: 1920 },
  ];

  for (const size of SPLASH_PORTS) {
    for (const orientation of ['port', 'land']) {
      const width = orientation === 'port' ? size.width : size.height;
      const height = orientation === 'port' ? size.height : size.width;
      const mark = Math.round(Math.min(width, height) * 0.42);
      const markPng = await sharp(logo).resize(mark, mark, { fit: 'contain', background: '#ffffff' }).png().toBuffer();
      const image = await sharp({
        create: { width, height, channels: 4, background: '#fdfbff' },
      })
        .composite([
          {
            input: markPng,
            top: Math.round((height - mark) / 2),
            left: Math.round((width - mark) / 2),
          },
        ])
        .png()
        .toBuffer();
      const dir = path.join(res, `drawable-${orientation}-${size.density}`);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'splash.png'), image);
    }
  }
  process.stdout.write('drawable-(port|land)-*/splash.png written\n');
}

await main();
