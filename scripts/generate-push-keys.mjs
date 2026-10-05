import webpush from "web-push";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile, access } from "node:fs/promises";
const path = ".local-signing/push.env";
try {
  await access(path);
  console.log("Existing push keys preserved.");
  process.exit(0);
} catch {}
await mkdir(".local-signing", { recursive: true });
const keys = webpush.generateVAPIDKeys();
await writeFile(
  path,
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nPUSH_WEBHOOK_SECRET=${randomBytes(32).toString("base64url")}\nVAPID_SUBJECT=mailto:YOUR_CONTACT_EMAIL\n`,
  { mode: 0o600 },
);
console.log(
  "Push keys saved privately in .local-signing/push.env. Configure these in Vercel; never commit this file.",
);
