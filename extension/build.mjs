// Builds the unpacked extension into dist/.
//
//   node build.mjs                    a development build
//   node build.mjs --version 1.0.7    stamp a version into the manifest
//   node build.mjs --minify           what CI ships
//
// dist/ is what Chrome loads (Load unpacked) and what tools/pack-crx.mjs zips
// and signs. Nothing else in the repository is shipped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';
import { updatesUrl } from './tools/config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, 'src');
const DIST = path.join(here, 'dist');

const args = process.argv.slice(2);
const flag = (name) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? null : args[at + 1];
};
const minify = args.includes('--minify');
const version = flag('version');

if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`[build] --version must be x.y.z, got "${version}"`);
  process.exit(1);
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(SRC, 'popup.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome110'],
  minify,
  sourcemap: minify ? false : 'inline',
  outfile: path.join(DIST, 'popup.js'),
  logLevel: 'warning',
});

for (const file of ['popup.html', 'popup.css']) {
  fs.copyFileSync(path.join(SRC, file), path.join(DIST, file));
}
fs.cpSync(path.join(SRC, 'icons'), path.join(DIST, 'icons'), { recursive: true });

// The manifest is the one file the build rewrites: the version comes from the
// release being cut, and the update_url from the practice's drive. Both are
// deployment facts, so neither is baked into the committed source.
const manifest = JSON.parse(fs.readFileSync(path.join(SRC, 'manifest.json'), 'utf8'));
if (version) manifest.version = version;
manifest.update_url = updatesUrl();
fs.writeFileSync(path.join(DIST, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`[build] dist/ ready — version ${manifest.version}, update_url ${manifest.update_url}`);
