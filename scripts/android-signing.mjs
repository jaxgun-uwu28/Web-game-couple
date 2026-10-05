import { randomBytes } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const folder = resolve(".local-signing"),
  keystore = resolve(folder, "arcade-release.jks");
try {
  await access(keystore);
  console.log("Existing release key preserved.");
  process.exit(0);
} catch {}
const keytool =
  process.env.ARCADE_KEYTOOL ||
  (process.platform === "win32"
    ? "C:/Program Files/Android/Android Studio/jbr/bin/keytool.exe"
    : "keytool");
const password = randomBytes(32).toString("base64url");
await mkdir(folder, { recursive: true });
const r = spawnSync(
  keytool,
  [
    "-genkeypair",
    "-keystore",
    keystore,
    "-alias",
    "arcade",
    "-keyalg",
    "RSA",
    "-keysize",
    "3072",
    "-validity",
    "10000",
    "-storepass:env",
    "ARCADE_GENERATED_PASSWORD",
    "-keypass:env",
    "ARCADE_GENERATED_PASSWORD",
    "-dname",
    "CN=Our Little Arcade, OU=Private app, O=Our Little Arcade, L=Private, C=PH",
  ],
  {
    env: { ...process.env, ARCADE_GENERATED_PASSWORD: password },
    stdio: "inherit",
  },
);
if (r.error || r.status !== 0)
  throw new Error(
    "Could not create the release key. Set ARCADE_KEYTOOL to your JDK keytool executable.",
  );
await writeFile(
  resolve(folder, "signing.json"),
  JSON.stringify(
    {
      keystore,
      storePassword: password,
      keyPassword: password,
      keyAlias: "arcade",
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(
  "Release key created in .local-signing. Back up that entire folder privately; losing it prevents updates over an existing installation.",
);
