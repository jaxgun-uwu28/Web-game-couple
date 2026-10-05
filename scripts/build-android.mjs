import { readFile, copyFile, mkdir, access } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const env = { ...process.env };
try {
  const local = await readFile(".env.local", "utf8");
  for (const line of local.split(/\r?\n/)) {
    const m = line.match(/^(ARCADE_[A-Z_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
  }
} catch {}
env.ARCADE_APP_URL ||= "https://web-game-couple.vercel.app/";
for (const script of [
  "generate-app-icons.mjs",
  "prepare-native.mjs",
  "generate-android-art.mjs",
]) {
  const prepared = spawnSync(process.execPath, [`scripts/${script}`], {
    env,
    stdio: "inherit",
  });
  if (prepared.status !== 0) process.exit(prepared.status || 1);
}
if (process.platform === "win32") {
  env.JAVA_HOME ||= "C:/Program Files/Android/Android Studio/jbr";
  env.ANDROID_HOME ||= resolve(
    process.env.LOCALAPPDATA || "C:/Users/Lance/AppData/Local",
    "Android/Sdk",
  );
}
const signing = JSON.parse(
  await readFile(".local-signing/signing.json", "utf8"),
);
env.ARCADE_KEYSTORE = signing.keystore;
env.ARCADE_STORE_PASSWORD = signing.storePassword;
env.ARCADE_KEY_PASSWORD = signing.keyPassword;
env.ARCADE_KEY_ALIAS = signing.keyAlias;
const cap = spawnSync(
  process.execPath,
  ["node_modules/@capacitor/cli/bin/capacitor", "sync", "android"],
  { env, stdio: "inherit" },
);
if (cap.status !== 0) process.exit(cap.status || 1);
const args = [
  "-p",
  "android",
  "assembleDebug",
  "assembleRelease",
  "--no-daemon",
];
const build =
  process.platform === "win32"
    ? spawnSync(
        "cmd.exe",
        ["/d", "/s", "/c", "android\\gradlew.bat", ...args],
        { env, stdio: "inherit" },
      )
    : spawnSync("./android/gradlew", args, { env, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status || 1);
await mkdir("dist-apk", { recursive: true });
for (const type of ["debug", "release"])
  await copyFile(
    `android/app/build/outputs/apk/${type}/app-${type}.apk`,
    `dist-apk/our-little-arcade-${type}.apk`,
  );
console.log("Debug and signed release APKs saved in dist-apk.");
