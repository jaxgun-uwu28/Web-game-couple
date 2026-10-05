import sharp from "sharp";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { pngOrigin } from "./png-origin.mjs";
await mkdir("public/icons", { recursive: true });
let assets = {};
try {
  assets =
    JSON.parse(await readFile("src/generated/art-manifest.json", "utf8"))
      .assets || {};
} catch {}
async function dropIn(name) {
  const src = assets[name]?.src;
  if (!src) return null;
  const absolute = path.resolve("public", src.split("?")[0].replace(/^\//, ""));
  if (!absolute.startsWith(path.resolve("public") + path.sep))
    throw new Error("Invalid icon source");
  return readFile(absolute);
}
const foreground = await dropIn("icon-foreground"),
  background = await dropIn("icon-background");
// Preserve the supplied JPEG; trim its empty margin only for readable launcher sizing.
const kitty = await readFile("public/icons/kitty-original.jpg");
const source =
  foreground ||
  (await sharp(kitty)
    .trim({ background: "#ffffff", threshold: 20 })
    .png()
    .toBuffer());
const fg = await sharp(source)
  .resize(360, 360, {
    fit: "contain",
    background: foreground ? "#00000000" : "#ffffff",
  })
  .png()
  .toBuffer();
const base = background
  ? await sharp(background).resize(512, 512, { fit: "cover" }).png().toBuffer()
  : await sharp({
      create: { width: 512, height: 512, channels: 4, background: "#ffffff" },
    })
      .png()
      .toBuffer();
const icon = await sharp(base)
  .composite([{ input: fg, gravity: "centre" }])
  .png()
  .toBuffer();
for (const n of [192, 512])
  await sharp(icon).resize(n, n).png().toFile(`public/icons/icon-${n}.png`);
await sharp(icon).resize(64, 64).png().toFile("public/icons/favicon.png");
await writeFile("public/icons/maskable-512.png", icon);
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#00000000" },
})
  .composite([{ input: fg, gravity: "centre" }])
  .png()
  .toFile("public/icons/adaptive-foreground.png");
const origin =
  "Owner-supplied kitty doodle #1 (transparent background).jpg. JPEG has an opaque white background; original preserved in public/icons/kitty-original.jpg. Empty margins trimmed and image resized within launcher safe areas. Drop-in icon assets override the default.";
await writeFile("public/icons/PROVENANCE.md", origin + "\n");
for (const file of [
  "icon-192",
  "icon-512",
  "favicon",
  "maskable-512",
  "adaptive-foreground",
])
  await pngOrigin(
    `public/icons/${file}.png`,
    foreground || background
      ? "Origin: owner-provided drop-in icon assets."
      : "Origin: " + origin,
  );
