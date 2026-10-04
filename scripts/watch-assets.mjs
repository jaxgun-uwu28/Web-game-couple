import chokidar from "chokidar";
import { generateAssets } from "./generate-assets.mjs";
await generateAssets();
let timer,
  chain = Promise.resolve();
chokidar
  .watch("public/drop-in", {
    ignoreInitial: true,
    ignored: /README\.txt$/i,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  })
  .on("all", () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      chain = chain.then(generateAssets).catch(console.error);
    }, 200);
  });
