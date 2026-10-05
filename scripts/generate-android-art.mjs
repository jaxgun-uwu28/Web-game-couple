import sharp from "sharp";
import { mkdir, readFile, readdir } from "node:fs/promises";
const source = await readFile("public/icons/icon-512.png");
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
  await sharp(await readFile('public/icons/adaptive-foreground.png'))
    .resize(Math.round(size * 2.25), Math.round(size * 2.25))
    .png()
    .toFile(`${folder}/ic_launcher_foreground.png`);
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
          input: await sharp(source).resize(size, size).toBuffer(),
          gravity: "centre",
        },
      ])
      .png()
      .toFile(`${root}/${folder}/splash.png`);
  }

