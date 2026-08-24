import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const sourcePath = new URL("./zc8-v6-build-worker-v3.mjs", import.meta.url);
const runtimePath = new URL("./.zc8-v6-build-worker-runtime.mjs", import.meta.url);

let source = await readFile(sourcePath, "utf8");
source = source
  .replace("const TRANSLATE_BATCH = 24;", "const TRANSLATE_BATCH = 8;")
  .replace("const MAX_MODEL_CALLS_PER_BUILD = 25;", "const MAX_MODEL_CALLS_PER_BUILD = 30;");

if (!source.includes("const TRANSLATE_BATCH = 8;") || !source.includes("const MAX_MODEL_CALLS_PER_BUILD = 30;")) {
  throw new Error("ZC8 v6 runtime worker patch did not apply");
}

await writeFile(runtimePath, source, "utf8");
await import(`${pathToFileURL(runtimePath.pathname).href}?run=${Date.now()}`);
