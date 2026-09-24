// Renders the app icons (NeoPop lime block with a "b") to PNG. Run: node scripts/generate-icons.mjs
import sharp from "sharp";

const glyph = (cx, cy, s) => `
  <rect x="${cx - 92 * s}" y="${cy - 150 * s}" width="${46 * s}" height="${250 * s}" fill="#0d0d0d"/>
  <circle cx="${cx + 20 * s}" cy="${cy + 30 * s}" r="${70 * s}" fill="none" stroke="#0d0d0d" stroke-width="${46 * s}"/>`;

// Standard icon: dark tile, extruded lime block.
const standard = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0d0d0d"/>
  <polygon points="416,72 440,96 440,440 416,416" fill="#8fb312"/>
  <polygon points="72,416 416,416 440,440 96,440" fill="#62800a"/>
  <rect x="72" y="72" width="344" height="344" fill="#d4ff3a"/>
  ${glyph(244, 244, 1)}
</svg>`;

// Maskable: full-bleed lime, glyph inside the 80% safe zone.
const maskable = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#d4ff3a"/>
  ${glyph(256, 256, 0.9)}
</svg>`;

const out = [
  [standard, 192, "public/icons/icon-192.png"],
  [standard, 512, "public/icons/icon-512.png"],
  [maskable, 512, "public/icons/maskable-512.png"],
  [maskable, 180, "app/apple-icon.png"],
  [standard, 64, "app/icon.png"],
];
for (const [svg, size, file] of out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(file);
  console.log("wrote", file);
}
