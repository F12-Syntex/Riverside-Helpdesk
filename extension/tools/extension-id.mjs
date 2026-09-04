// Prints the extension id for a signing key — the appid that updates.xml and
// any Chrome policy must name.
//
//   node tools/extension-id.mjs key.pem
//   CRX_PRIVATE_KEY="$(cat key.pem)" node tools/extension-id.mjs
//
// The id is a property of the key alone, so it is stable for the life of the
// key and can be computed before anything has ever been built or published.
import fs from 'node:fs';
import { extensionId, publicKeyDer } from './crx.mjs';

const file = process.argv[2];
const pem = file ? fs.readFileSync(file, 'utf8') : process.env.CRX_PRIVATE_KEY;
if (!pem) {
  console.error('usage: node tools/extension-id.mjs <key.pem>   (or set CRX_PRIVATE_KEY)');
  process.exit(1);
}

console.log(extensionId(publicKeyDer(pem)));
