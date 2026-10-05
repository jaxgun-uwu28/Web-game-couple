import sharp from "sharp";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from 'node:path';
import {pngOrigin} from './png-origin.mjs';
const source = await readFile("public/icons/icon-512.png");
const manifest = JSON.parse(await readFile('src/generated/art-manifest.json','utf8'));
const splashPath = manifest.assets?.splash?.src;
let splash = null;
if(splashPath){const absolute=path.resolve('public',splashPath.split('?')[0].replace(/^\//,''));if(!absolute.startsWith(path.resolve('public')+path.sep))throw new Error('Invalid splash source');splash=await readFile(absolute);}
for (const [density, size] of [
  ["mdpi", 48],
  ["hdpi", 72],
  ["xhdpi", 96],
  ["xxhdpi", 144],
  ["xxxhdpi", 192],
]) {
  const folder = `android/app/src/main/res/mipmap-${density}`;
  await mkdir(folder, { recursive: true });
  for (const name of ["ic_launcher", "ic_launcher_round"])
    await sharp(source)
      .resize(size, size)
      .png()
      .toFile(`${folder}/${name}.png`);
  for (const name of ['ic_launcher','ic_launcher_round']) await pngOrigin(`${folder}/${name}.png`, 'Origin: generated from public/icons/icon-512.png. Owner-supplied kitty JPEG or drop-in artwork; recorded in public/icons/PROVENANCE.md.');
  await sharp(await readFile('public/icons/adaptive-foreground.png'))
    .resize(Math.round(size * 2.25), Math.round(size * 2.25))
    .png()
    .toFile(`${folder}/ic_launcher_foreground.png`);
  await pngOrigin(`${folder}/ic_launcher_foreground.png`, 'Origin: adaptive foreground from scripts/generate-app-icons.mjs. Owner-supplied artwork recorded in public/icons/PROVENANCE.md.');
}
const root = "android/app/src/main/res";
for (const folder of await readdir(root))
  if (folder.startsWith("drawable")) {
    const size = folder.includes("xxxhdpi")
      ? 400
      : folder.includes("xxhdpi")
        ? 300
        : folder.includes("xhdpi")
          ? 200
          : folder.includes("hdpi")
            ? 150
            : 100;
    await sharp({
      create: {
        width: size * 3,
        height: size * 3,
        channels: 4,
        background: "#fff8f3",
      },
    })
      .composite([
        {
          input: await sharp(splash || source).resize(splash ? size*3 : size, splash ? size*3 : size,{fit:'contain',background:'#fff8f3'}).toBuffer(),
          gravity: "centre",
        },
      ])
      .png()
      .toFile(`${root}/${folder}/splash.png`);
    await pngOrigin(`${root}/${folder}/splash.png`, splash ? 'Origin: owner-provided splash drop-in art, resized by scripts/generate-android-art.mjs.' : 'Origin: cream canvas and owner-supplied kitty launcher mark from public/icons/PROVENANCE.md.');
  }

