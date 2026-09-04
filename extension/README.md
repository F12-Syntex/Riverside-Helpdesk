# Riverside Practice Chrome extension

A Manifest V3 Chrome extension for the practice, built here, signed in GitHub
Actions, and updated on every machine over the practice's own shared drive.

**It is not published anywhere.** No Chrome Web Store, no public hosting. The
GitHub release is a pickup point that one script on the practice network reads;
Chrome only ever fetches from the shared drive.

> **This repository must be private.** The workflow attaches the signed `.crx`
> to a GitHub release, and releases on a public repository are downloadable by
> anyone. Check Settings → General → Danger Zone → Change visibility before the
> first release is cut.

## What this build does

Nothing yet, deliberately. The popup shows the installed version, a counter
button, and a line of placeholder text. That is enough to prove the whole
pipeline end to end: push a change, watch CI cut a release, sync it to the
drive, and see the version number in the popup go up on its own. Once that is
confirmed, the real feature goes in the same popup.

## Developing

```bash
cd extension
npm ci
npm run build        # writes dist/
```

Then in Chrome: `chrome://extensions` → Developer mode on → **Load unpacked** →
pick `extension/dist`. Reload the extension after each build.

An unpacked build shows `dev (unpacked)` where a released one shows its version,
because the version is read from the manifest the build stamped.

| Command | |
| --- | --- |
| `npm run build` | development build into `dist/` |
| `npm run build:release` | what CI ships — minified |
| `npm run check` | build, then run the packer's tests |
| `npm run icons` | regenerate the toolbar icons from `tools/make-icons.mjs` |
| `npm run id -- key.pem` | print the extension id for a signing key |
| `npm run pack` | sign `dist/` into `dist-pack/extension.crx` |

The tests live with the rest of the repository's, at
`test/extension-crx.test.mjs`, and run under the root `npm test` too. They pull
the packed `.crx` apart again and verify the signature the way Chrome does —
worth having, because a packer that is subtly wrong produces a file that looks
fine and simply refuses to install.

## The signing key

The key is generated **once** and never again. The extension's id is the
SHA-256 of its public half, so the key *is* the extension's identity: replacing
it makes a different extension, and every machine has to install by hand again.
Losing it costs the same.

```bash
openssl genrsa -out riverside-extension.pem 2048
```

Store it somewhere the practice can get it back from (the same place as the
other practice credentials), then put it in GitHub and delete your copy:

```bash
gh secret set CRX_PRIVATE_KEY --repo F12-Syntex/Riverside-Helpdesk < riverside-extension.pem
```

or paste the whole file — `-----BEGIN` line to `-----END` line — into
Settings → Secrets and variables → Actions → New repository secret, named
`CRX_PRIVATE_KEY`.

**Never commit it.** `*.pem` is git-ignored for that reason; that is a
safety net, not a policy.

### The extension id

`updates.xml` has to name the extension, and any Chrome policy has to name it
too. It comes from the key alone, so it can be computed the moment the key
exists — before anything has been built:

```bash
node tools/extension-id.mjs riverside-extension.pem
# gpoibmmnhmiopnnoimjlehlafnlomnlj
```

Without this repository to hand, the same 32 letters come out of:

```bash
openssl rsa -in riverside-extension.pem -pubout -outform DER \
  | openssl dgst -sha256 -binary | head -c 16 \
  | od -An -tx1 | tr -d ' \n' | tr '0-9a-f' 'a-p'
```

CI derives it from the secret on every run and writes it into `updates.xml`, so
it does not need to be configured anywhere.

## Where the shared drive is

One repository variable holds the practice's drive path as Chrome sees it —
Settings → Secrets and variables → Actions → **Variables** → `EXT_UPDATE_BASE`:

```
file:///Z:/RiversideExtension
```

Everything derives from it: the manifest's `update_url` becomes
`<base>/updates.xml` and the `codebase` in `updates.xml` becomes
`<base>/extension.crx`. Until it is set, both keep the placeholder
`file:///Z:/PLACEHOLDER_PATH`, and the build says so in its log.

Use the path the *staff machines* see (the mapped drive letter or the UNC path),
not the path the sync machine sees, if the two differ.

## What CI does

`.github/workflows/build.yml`, on every push to `main` that touches
`extension/`:

1. installs and builds `dist/`, minified
2. works out the version — the highest `ext-v` git tag with its patch moved on
3. stamps that version and `EXT_UPDATE_BASE` into `dist/manifest.json`
4. runs the packer's tests
5. signs `dist/` into `extension.crx` with `CRX_PRIVATE_KEY`
6. writes `updates.xml` naming the extension id, the version, and the codebase
7. publishes both as a GitHub release tagged `ext-v<version>`

It is skipped for pushes that only touch the web app: the two share this
repository, and otherwise every app commit would cut an extension release
identical to the last but for its version.

### Versions

The released versions are recorded as **git tags**, not as commits. The web app
in this repository bumps its own version in every commit and checks that number
against the history (`CLAUDE.md`, `scripts/versions.mjs`), so a workflow that
pushed its own bump commit would falsify that check — and re-trigger itself.

So: patch releases need no commit at all, and to move the minor or the major,
raise `src/manifest.json`'s `version` by hand in the commit that earns it. A
baseline higher than every tag ships exactly as written.

## Local sync + install

### 1. Sync — the one step outside GitHub

`sync/sync-extension.ps1` downloads the latest release onto the shared drive.
Run it on a machine that can see both GitHub and the drive. It needs the
[GitHub CLI](https://cli.github.com), signed in once as an account that can read
this private repository (`gh auth login`).

```powershell
.\sync\sync-extension.ps1 -Destination Z:\RiversideExtension
```

It stages the download and then moves the `.crx` into place before
`updates.xml`, so Chrome never sees an announcement for a package that has not
finished arriving.

To make it automatic, register it as a scheduled task on that machine — hourly
is plenty, since Chrome only asks every five hours or so:

```powershell
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -ExecutionPolicy Bypass -File "C:\Tools\sync-extension.ps1" -Destination Z:\RiversideExtension'
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
  -RepetitionInterval (New-TimeSpan -Hours 1)
Register-ScheduledTask -TaskName 'Riverside extension sync' -Action $action -Trigger $trigger `
  -RunLevel Highest -Description 'Copies the latest signed extension onto the shared drive.'
```

The shared folder ends up holding exactly two files, and staff need read access
to both:

```
Z:\RiversideExtension\extension.crx
Z:\RiversideExtension\updates.xml
```

### 2. One-time install, per machine

Open `chrome://extensions`, turn on Developer mode, and drag
`Z:\RiversideExtension\extension.crx` onto the page. Accept the permission
prompt.

That is the only manual step, ever. From then on Chrome reads the `update_url`
baked into the installed extension, polls `updates.xml` on the drive roughly
every five hours, and installs anything newer on its own. To check it now
rather than wait, press **Update** on `chrome://extensions`.

### If Chrome refuses the drag-and-drop install

On managed Windows machines Chrome usually blocks extensions that did not come
from the Web Store — the `.crx` is downloaded and immediately discarded, or the
page says it can only be added from the Chrome Web Store. This is a policy
decision, not a broken package, and NHS-managed devices very often have it on.

The supported way round it is to let policy install the extension, which also
removes the per-machine manual step. IT sets, under
`HKLM\SOFTWARE\Policies\Google\Chrome`:

* `ExtensionInstallAllowlist` — the extension id
* `ExtensionSettings` — for that id, `"installation_mode": "normal_installed"`
  (or `"force_installed"`) with `"update_url": "file:///Z:/RiversideExtension/updates.xml"`
* `ExtensionInstallSources` — `file:///Z:/*`, if the `.crx` is to be installed
  by hand at all

Worth agreeing with whoever manages the estate before the first install: it
decides whether the drag-and-drop step above is available.

## Layout

```
extension/
  src/               what ships: manifest, popup, icons
  build.mjs          esbuild → dist/
  tools/
    config.mjs       where the shared drive is (EXT_UPDATE_BASE)
    version.mjs      which version this build ships
    next-version.mjs   the same, as a command
    crx.mjs          CRX3 packing and the id derivation
    zip.mjs          a deterministic zip, since Node has none
    crc32.mjs
    pack-crx.mjs     sign dist/ → .crx
    extension-id.mjs print the id for a key
    make-updates-xml.mjs
    make-icons.mjs   regenerates src/icons
  sync/
    sync-extension.ps1   release → shared drive
```

No dependency but esbuild: the `.crx`, the zip inside it, its signature and the
PNGs are all written with `node:crypto` and `node:zlib` directly. That is not
minimalism for its own sake — this package is installed on clinical machines
and signed with a key that cannot be rotated cheaply, so its supply chain is
worth keeping to something one person can read.
