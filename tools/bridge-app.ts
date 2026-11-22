/**
 * The launcher as a macOS application: `pnpm bridge:app`.
 *
 *   pnpm bridge:app [--out dist/bridge] [--version 0.2.0]
 *
 * A `.app` is a folder LaunchServices knows how to open, so a player
 * double-clicks it instead of running a terminal command. It wraps the SEA
 * binary (`launcher/sea.ts`) with an `Info.plist` and an icon; the executable
 * runs `launch`, which serves the page and opens the browser.
 *
 * macOS only: the format is macOS's, and the icon is built with `iconutil`.
 * The app is signed ad hoc, which is enough to run it on the machine that
 * built it; distributing it to another Mac needs a Developer ID signature and
 * notarisation, which is a release-credentials problem, not a build one.
 */
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { buildSeaBinary } from "./optcgsim/launcher/sea.js";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};

if (process.platform !== "darwin") {
  console.error("bridge:app builds a macOS application; run it on macOS");
  process.exit(1);
}

const outDir = resolve(flag("out") ?? "dist/bridge");
const version =
  flag("version") ??
  (JSON.parse(readFileSync("package.json", "utf8")) as { version: string })
    .version;

const { path: binary } = await buildSeaBinary(outDir, (line) => {
  console.log(line);
});

const app = join(outDir, "open-optcg-bridge.app");
const contents = join(app, "Contents");
const macos = join(contents, "MacOS");
const resources = join(contents, "Resources");
rmSync(app, { recursive: true, force: true });
mkdirSync(macos, { recursive: true });
mkdirSync(resources, { recursive: true });

const executable = join(macos, "open-optcg-bridge");
copyFileSync(binary, executable);
chmodSync(executable, 0o755);

writeFileSync(join(contents, "Info.plist"), plist(version));
await makeIcon(resources);

// The inner binary is already signed ad hoc; signing the bundle last covers
// the plist and the icon too, which is what LaunchServices checks.
execFileSync("codesign", ["--force", "--sign", "-", app], { stdio: "inherit" });

// Zipped here rather than in the release tool so the tool stays able to run
// anywhere: `ditto` preserves the executable bit and the bundle's extended
// attributes, which is what makes the unzipped app run.
const zip = join(outDir, "open-optcg-bridge-macos.app.zip");
rmSync(zip, { force: true });
execFileSync(
  "ditto",
  ["-c", "-k", "--sequesterRsrc", "--keepParent", app, zip],
  { stdio: "inherit" },
);

console.log(`app: ${app}`);
console.log(`zip: ${zip} (this is the release asset)`);
console.log(`open it, or run \`${executable} status\``);

function plist(appVersion: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>open-optcg bridge</string>
  <key>CFBundleDisplayName</key><string>open-optcg bridge</string>
  <key>CFBundleIdentifier</key><string>dev.open-optcg.bridge</string>
  <key>CFBundleExecutable</key><string>open-optcg-bridge</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${appVersion}</string>
  <key>CFBundleVersion</key><string>${appVersion}</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.card-games</string>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
`;
}

/**
 * The icon, drawn rather than committed.
 *
 * `iconutil` wants one PNG per slot of an `.iconset`; the artwork is an SVG so
 * the whole thing is one readable source rather than a binary blob, and a
 * changed mark needs no image editor.
 */
async function makeIcon(directory: string): Promise<void> {
  // Two cards on the table, the top one gold. The artwork is an SVG so it is
  // one readable source rather than a binary blob, and a changed mark needs
  // no image editor.
  const artwork =
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" rx="228" fill="#141312"/>
  <g transform="translate(512 528)">
    <rect x="-250" y="-330" width="380" height="560" rx="40" fill="#2b2a28" transform="rotate(-12)"/>
    <rect x="-120" y="-350" width="380" height="560" rx="40" fill="#e8b13c" transform="rotate(-3)"/>
    <rect x="10" y="-330" width="380" height="560" rx="40" fill="#f4f1ea" transform="rotate(9)"/>
    <circle cx="200" cy="230" r="74" fill="#141312"/>
    <circle cx="200" cy="230" r="34" fill="#e8b13c"/>
  </g>
</svg>
`);
  const iconset = join(directory, "icon.iconset");
  mkdirSync(iconset, { recursive: true });
  for (const base of [16, 32, 128, 256, 512]) {
    for (const [suffix, size] of [
      ["", base],
      ["@2x", base * 2],
    ] as const) {
      const png = await sharp(artwork).resize(size, size).png().toBuffer();
      writeFileSync(join(iconset, `icon_${base}x${base}${suffix}.png`), png);
    }
  }
  execFileSync(
    "iconutil",
    ["-c", "icns", iconset, "-o", join(directory, "icon.icns")],
    { stdio: "inherit" },
  );
  rmSync(iconset, { recursive: true, force: true });
}
