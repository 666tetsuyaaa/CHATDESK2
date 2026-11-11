// Runs after `expo export --platform web` (see "build:web" in package.json).
// Adds what the web version of the app needs on iPhones to every exported
// page: the ChatDesk name, the home-screen icon, and a viewport that fits the
// notch and stops Safari zooming in on text boxes.
//
// Done here rather than in app/+html.tsx: with this Expo version, any custom
// +html.tsx stops the export from adding the app's <script> tags, leaving a
// blank page.
//
// Usage: node scripts/finish-web-export.mjs [output folder, default "dist"]
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const outDir = process.argv[2] ?? "dist";

const VIEWPORT = "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover";
const HEAD_TAGS = [
  "<title>ChatDesk</title>",
  '<meta name="theme-color" content="#122254"/>',
  '<meta name="apple-mobile-web-app-title" content="ChatDesk"/>',
  '<meta name="apple-mobile-web-app-capable" content="yes"/>',
  '<meta name="mobile-web-app-capable" content="yes"/>',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>',
].join("");

function htmlFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return htmlFiles(full);
    return name.endsWith(".html") ? [full] : [];
  });
}

let changed = 0;
for (const file of htmlFiles(outDir)) {
  let html = readFileSync(file, "utf8");
  if (html.includes('name="apple-mobile-web-app-title"')) continue; // already done
  html = html.replace(/<meta name="viewport" content="[^"]*"\s*\/?>/, `<meta name="viewport" content="${VIEWPORT}"/>`);
  html = html.replace(/<title>[^<]*<\/title>/, "");
  html = html.replace("</head>", `${HEAD_TAGS}</head>`);
  writeFileSync(file, html);
  changed += 1;
}

if (changed === 0 && htmlFiles(outDir).length === 0) {
  console.error(`No .html files found in ${outDir} - run "expo export --platform web" first.`);
  process.exit(1);
}
console.log(`finish-web-export: updated ${changed} page(s) in ${outDir}`);
