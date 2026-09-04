// Prints the version this build should ship, from the ext-v tags in the clone
// and the baseline in src/manifest.json. See tools/version.mjs for the rule.
//
//   node tools/next-version.mjs
//
// CI needs every tag for this to be right, so it fetches them before asking.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { highestTag, nextVersion } from './version.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(
  fs.readFileSync(path.join(here, '..', 'src', 'manifest.json'), 'utf8'),
).version;

let released = null;
try {
  released = highestTag(execSync('git tag --list "ext-v*"', { encoding: 'utf8' }).split('\n'));
} catch {
  // No git, or no tags fetched: the baseline stands.
}

const next = nextVersion(baseline, released);
console.log(next);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${next}\n`);
}
