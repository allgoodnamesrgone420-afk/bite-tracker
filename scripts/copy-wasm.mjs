// Copies the barcode scanner's WebAssembly decoder into public/vendor so it's
// served from our own origin (no third-party CDN). Runs on npm install.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const src = new URL("../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm", import.meta.url);
const dir = new URL("../public/vendor/", import.meta.url);
if (!existsSync(src)) {
  console.warn("[copy-wasm] zxing-wasm not installed; barcode photo fallback on iOS won't work.");
  process.exit(0);
}
mkdirSync(dir, { recursive: true });
copyFileSync(src, new URL("zxing_reader.wasm", dir));
