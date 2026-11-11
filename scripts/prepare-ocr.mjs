import { mkdir, copyFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const target = "public/ocr";
await mkdir(target, { recursive: true });
const core = dirname(require.resolve("tesseract.js-core/package.json"));
for (const file of await readdir(core))
  if (/\.wasm(?:\.js)?$/.test(file)) await copyFile(join(core, file), join(target, file));
await copyFile(
  join(dirname(require.resolve("tesseract.js/package.json")), "dist/worker.min.js"),
  join(target, "worker.min.js"),
);
await copyFile(
  join(
    dirname(require.resolve("@tesseract.js-data/spa/package.json")),
    "4.0.0_best_int/spa.traineddata.gz",
  ),
  join(target, "spa.traineddata.gz"),
);
console.log("OCR assets ready");
