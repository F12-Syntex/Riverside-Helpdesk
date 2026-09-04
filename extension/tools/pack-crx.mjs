// Signs dist/ into a .crx.
//
//   CRX_PRIVATE_KEY="$(cat key.pem)" node tools/pack-crx.mjs
//   node tools/pack-crx.mjs --key key.pem --out dist-pack/extension.crx
//
// The key comes from the CRX_PRIVATE_KEY environment variable by default,
// which is how CI passes it — see .github/workflows/build.yml. It is never
// written to disk by this script and never committed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packCrx } from './crx.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};

const dir = path.resolve(flag('dir', path.join(here, '..', 'dist')));
const out = path.resolve(flag('out', path.join(here, '..', 'dist-pack', 'extension.crx')));
const keyFile = flag('key', null);

const pem = keyFile ? fs.readFileSync(keyFile, 'utf8') : process.env.CRX_PRIVATE_KEY;
if (!pem) {
  console.error('[crx] no signing key: pass --key <file.pem> or set CRX_PRIVATE_KEY');
  process.exit(1);
}
if (!fs.existsSync(path.join(dir, 'manifest.json'))) {
  console.error(`[crx] ${dir} has no manifest.json — run the build first`);
  process.exit(1);
}

const { crx, id, files } = packCrx(dir, pem);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, crx);

const version = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).version;
console.log(`[crx] ${path.relative(process.cwd(), out)} — ${files.length} files, ${crx.length} bytes`);
console.log(`[crx] version ${version}`);
console.log(`[crx] extension id ${id}`);

// So the workflow can put the id and the version into updates.xml without
// re-deriving either of them.
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `id=${id}\nversion=${version}\n`);
}
