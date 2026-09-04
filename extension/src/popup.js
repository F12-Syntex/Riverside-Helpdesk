// The popup answers two questions and nothing else:
//
//   1. which version of the extension is actually installed right now
//      (read from the manifest, so it cannot drift from the packaged build)
//   2. does anything in here still run
//
// When the version shown here changes after a push, sync and Chrome update
// check, the whole pipeline is proven.
import { bumpCount, readCount } from './counter.js';

const DEV_VERSION = 'dev (unpacked)';

function version() {
  try {
    return globalThis.chrome?.runtime?.getManifest?.().version ?? DEV_VERSION;
  } catch {
    return DEV_VERSION;
  }
}

async function main() {
  document.getElementById('version').textContent = version();

  const button = document.getElementById('counter');
  const count = document.getElementById('count');

  count.textContent = String(await readCount());

  button.addEventListener('click', async () => {
    count.textContent = String(await bumpCount());
  });
}

main();
