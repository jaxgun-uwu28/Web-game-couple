import { readFile, writeFile, mkdir } from "node:fs/promises";
const url = process.env.ARCADE_APP_URL || "https://web-game-couple.vercel.app/";
if (new URL(url).protocol !== "https:")
  throw new Error("The Android app needs an HTTPS address.");
await mkdir("native-shell", { recursive: true });
const html = await readFile("public/offline.html", "utf8");
await writeFile(
  "native-shell/offline.html",
  html.replace(
    "location.reload()",
    `location.href=${JSON.stringify(url).replaceAll('"', "&quot;")}`,
  ),
);
