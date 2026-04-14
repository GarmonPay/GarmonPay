import sharp from "sharp";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const publicDir = join(root, "public");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#7C3AED"/>
  <path fill="#5B21B6" opacity="0.4" d="M256 96 L384 152 V288 C384 368 320 432 256 456 C192 432 128 368 128 288 V152 Z"/>
  <text x="256" y="318" text-anchor="middle" font-family="system-ui, -apple-system, Segoe UI, Arial, sans-serif" font-size="160" font-weight="800" fill="#F5C842">GP</text>
</svg>`;

writeFileSync(join(publicDir, "pwa-icon.svg"), svg, "utf8");

const buf = Buffer.from(svg);

await sharp(buf).resize(192, 192).png().toFile(join(publicDir, "icon-192.png"));
await sharp(buf).resize(512, 512).png().toFile(join(publicDir, "icon-512.png"));

console.log("Wrote public/icon-192.png, public/icon-512.png, public/pwa-icon.svg");
