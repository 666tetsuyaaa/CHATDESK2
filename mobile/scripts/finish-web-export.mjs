// Runs after `expo export --platform web` (see "build:web" in package.json).
//
// 1. Moves the fonts and icons out of dist/assets/node_modules/. Expo puts
//    the files it takes from npm packages (the Montserrat and Plus Jakarta
//    Sans fonts, the icon font) there, but Cloudflare Pages never uploads a
//    folder called "node_modules" - the fonts were missing, and the app,
//    which waits for its fonts, spun forever. They move to dist/assets/vendor/
//    and every reference to them is updated to match.
//
// 2. Adds what the web version of the app needs on iPhones to every page:
//    the ChatDesk name, the home-screen icon, and a viewport that fits the
//    notch and stops Safari zooming in on text boxes. (Done here rather than
//    in app/+html.tsx: with this Expo version, any custom +html.tsx stops the
//    export from adding the app's <script> tags, leaving a blank page.)
//
// 3. Puts scripts/web-compat.js in every page, before the app: fallbacks for
//    a few features older phones lack, and a "Please update your browser"
//    message on browsers too old to run the app.
//
// Usage: node scripts/finish-web-export.mjs [output folder, default "dist"]
import { existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const outDir = process.argv[2] ?? "dist";

// interactive-widget=resizes-content: Chrome on Android shrinks the page
// itself as the keyboard slides up (instead of only covering it), so the
// message box rides on the keyboard smoothly. iPhones ignore it.
const VIEWPORT =
  "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, interactive-widget=resizes-content";
const HEAD_TAGS = [
  "<title>ChatDesk</title>",
  '<meta name="theme-color" content="#122254"/>',
  '<meta name="apple-mobile-web-app-title" content="ChatDesk"/>',
  '<meta name="apple-mobile-web-app-capable" content="yes"/>',
  '<meta name="mobile-web-app-capable" content="yes"/>',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png"/>',
].join("");

// Kept as is: a "</script>" inside would end the inline script early.
const COMPAT_SCRIPT = readFileSync(new URL("./web-compat.js", import.meta.url), "utf8");
if (COMPAT_SCRIPT.includes("</script")) throw new Error("web-compat.js must not contain </script");

const OLD_ASSET_PATH = "/assets/node_modules/";
const NEW_ASSET_PATH = "/assets/vendor/";
const TEXT_FILE = /\.(html|js|css|json|map)$/;

function files(dir, pattern) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full, pattern);
    return pattern.test(name) ? [full] : [];
  });
}

if (files(outDir, /\.html$/).length === 0) {
  console.error(`No .html files found in ${outDir} - run "expo export --platform web" first.`);
  process.exit(1);
}

// 1. Fonts and icons out of "node_modules".
const oldDir = path.join(outDir, "assets", "node_modules");
const newDir = path.join(outDir, "assets", "vendor");
let moved = 0;
let rewritten = 0;
if (existsSync(oldDir)) {
  if (existsSync(newDir)) {
    console.error(`${newDir} already exists - can't move ${oldDir} there.`);
    process.exit(1);
  }
  moved = files(oldDir, /./).length;
  renameSync(oldDir, newDir);
  for (const file of files(outDir, TEXT_FILE)) {
    const text = readFileSync(file, "utf8");
    if (!text.includes(OLD_ASSET_PATH)) continue;
    writeFileSync(file, text.split(OLD_ASSET_PATH).join(NEW_ASSET_PATH));
    rewritten += 1;
  }
}

// 2 and 3. iPhone name, icon and viewport, and the compatibility script, on every page.
let pages = 0;
for (const file of files(outDir, /\.html$/)) {
  let html = readFileSync(file, "utf8");
  if (html.includes('name="apple-mobile-web-app-title"')) continue; // already done
  html = html.replace(
    /<meta name="viewport" content="[^"]*"\s*\/?>/,
    // The compatibility script first, before anything of the app's. (A
    // function, so a "$" in the script is never read as a replace pattern.)
    () => `<meta name="viewport" content="${VIEWPORT}"/><script>${COMPAT_SCRIPT}</script>`
  );
  html = html.replace(/<title>[^<]*<\/title>/, "");
  html = html.replace("</head>", `${HEAD_TAGS}</head>`);
  writeFileSync(file, html);
  pages += 1;
}

const leftovers = files(outDir, TEXT_FILE).filter((file) => readFileSync(file, "utf8").includes(OLD_ASSET_PATH));
if (leftovers.length) {
  console.error(`Still referencing ${OLD_ASSET_PATH}: ${leftovers.join(", ")}`);
  process.exit(1);
}
console.log(
  `finish-web-export: moved ${moved} font/icon file(s) to assets/vendor (${rewritten} file(s) updated), ` +
    `updated ${pages} page(s) in ${outDir}`
);
