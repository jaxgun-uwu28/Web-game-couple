import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { slots } from "./asset-slots.mjs";
// Release source handles promptly so Windows can replace a dropped file.
sharp.cache(false);
export async function generateAssets({dropInRoot="public/drop-in",outputDir="public/generated-art",manifestPath="src/generated/art-manifest.json"}={}) {
  const root=path.resolve(dropInRoot),output=path.resolve(outputDir);
  await fs.mkdir(output, { recursive: true });
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  const manifest = { slots, assets: {} };
  for (const folder of new Set(slots.map((s) => s.folder))) {
    const dir = path.join(root, folder);
    await fs.mkdir(dir, { recursive: true });
    const lines = slots
      .filter((s) => s.folder === folder)
      .map(
        (s) =>
          `${s.name}${s.width ? ".webp — " + s.width + " × " + s.height + " px recommended" : ".mp3 — optional audio"}`,
      );
    await fs.writeFile(
      path.join(dir, "README.txt"),
      `Drop-in artwork: ${folder}\n\n${lines.join("\n")}\n\nImages: jpg, jpeg, png, webp, avif, svg, gif. Case does not matter.\nNumeric suffixes supported, e.g. couple-photo-3.jpg or home-background-2.png.\nSticker files may have any name. Local SVG must be trusted.\nDev watches this folder; production regenerates on build. Originals preserved.\n`,
    );
    for (const file of (await fs.readdir(dir)).sort()) {
      const ext = path.extname(file).toLowerCase(),
        stem = path.basename(file, path.extname(file)).toLowerCase();
      if (
        ![
          ".jpg",
          ".jpeg",
          ".png",
          ".webp",
          ".avif",
          ".svg",
          ".gif",
          ".mp3",
          ".wav",
          ".ogg",
        ].includes(ext)
      )
        continue;
      const exact = slots.find((s) => s.name === stem && s.folder === folder),
        numbered = slots.find(
          (s) => s.folder === folder && s.name === stem.replace(/-?\d+$/, ""),
        );
      const series = /^(couple-photo|wishlist-cover)-\d+$/.test(stem),
        slot = exact || numbered;
      if (!slot && !series && folder !== "stickers") continue;
      const name = slot?.name || stem,
        source = path.join(dir, file),
        stat = await fs.stat(source);
      if (!stat.isFile()) continue;
      const copy = [".svg", ".gif", ".mp3", ".wav", ".ogg"].includes(ext),
        target = `${name}${copy ? ext : ".webp"}`;
      try {
        if (copy) await fs.copyFile(source, path.join(output, target));
        else
          await sharp(source)
            .rotate()
            .resize({
              width: slot?.width || 1000,
              height: slot?.height || 1000,
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: 84 })
            .toFile(path.join(output, target));
        manifest.assets[name] = {
          src: `/generated-art/${target}?v=${stat.mtimeMs}`,
          original: `/drop-in/${folder}/${encodeURIComponent(file)}`,
          kind: folder === "sounds" ? "audio" : "image",
        };
      } catch (error) {
        console.warn(`Could not process ${file}: ${error.message}`);
      }
    }
  }
  const text = JSON.stringify(manifest, null, 2) + "\n",
    dest = manifestPath,
    previous = await fs.readFile(dest, "utf8").catch(() => null);
  if (text !== previous) await fs.writeFile(dest, text);
  console.log(
    `Artwork manifest: ${Object.keys(manifest.assets).length} filled slots`,
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve("scripts/generate-assets.mjs")
)
  generateAssets().catch(error=>{console.error(error);process.exitCode=1;});
