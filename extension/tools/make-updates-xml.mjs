// Writes the updates.xml Chrome polls on the shared drive.
//
//   node tools/make-updates-xml.mjs --id <extension id> --version 1.0.7
//
// Chrome fetches this file every few hours, compares the version attribute
// against what it has installed, and downloads the codebase when it is higher.
// That is the whole update mechanism: no server, no store, one XML file next to
// one .crx on a network share.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crxUrl, isPlaceholder } from './config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};

const id = flag('id', 'EXTENSION_ID_PLACEHOLDER');
const version = flag('version', null);
const out = path.resolve(flag('out', path.join(here, '..', 'dist-pack', 'updates.xml')));

if (!version) {
  console.error('[updates] --version is required');
  process.exit(1);
}

const xml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${id}'>
    <updatecheck codebase='${crxUrl()}' version='${version}' />
  </app>
</gupdate>
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, xml);

console.log(`[updates] ${path.relative(process.cwd(), out)} — appid ${id}, version ${version}`);
if (isPlaceholder()) {
  console.log('[updates] codebase still points at the placeholder path.');
  console.log('[updates] set the EXT_UPDATE_BASE repository variable to the real drive path.');
}
