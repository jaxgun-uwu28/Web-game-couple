import { spawn } from "node:child_process";
import { generateAssets } from "./generate-assets.mjs";
await generateAssets();
const watch = spawn(process.execPath, ["scripts/watch-assets.mjs"], {
    stdio: "inherit",
  }),
  next = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "dev", "--hostname", "0.0.0.0"],
    { stdio: "inherit" },
  );
const stop = () => {
  watch.kill();
  next.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
next.on("exit", (code) => {
  watch.kill();
  process.exit(code || 0);
});
