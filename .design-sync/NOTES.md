# design-sync notes

Findings from syncing this repo to claude.ai/design. Read before the next sync.

## What this repo is, for sync purposes

A Next.js application, not a component library. There is no `dist/`, no
`exports` field, no Storybook. `.design-sync/build-entry.mjs` therefore builds
what the converter needs:

- `dist/index.mjs` — `app/_components/ui.js` compiled to ESM, React external.
  `ui.js` holds JSX inside a `.js` file, so esbuild is given `loader: {'.js':'jsx'}`.
- `dist/design-system.css` — `tokens/fonts.css` + the three token files +
  `app/globals.css`, concatenated in that order (the `@import` must lead, or CSS
  drops it). This is what `cfg.cssEntry` points at.

Both are gitignored build output. Run `node .design-sync/build-entry.mjs`
before the converter, every time.

## Why tokens ship through cssEntry, not tokensGlob

`cfg.tokensGlob` only resolves inside a `node_modules` package —
`copyTokens()` in `.ds-sync/lib/css.mjs` returns immediately unless
`tokensPkg` is set. Repo-local token files are invisible to it. Setting
`tokensGlob` alone produced an empty `ds-bundle/tokens/` and a `styles.css`
with a single import; the tokens never reached a design. Concatenating them
into `cssEntry` puts them in `_ds_bundle.css`, which `styles.css` imports, so
they are inside the closure designs actually receive.

Consequence: `ds-bundle/tokens/` stays empty. That is expected, not a failure.

## The tokens are documentation, not the app's mechanism

`app/globals.css` and every component write literal hex. The `--riva-*`
properties in `.design-sync/tokens/` were derived from the hex actually counted
in `app/**` and exist so designs can use names. **The hex is the source of
truth.** If a colour changes in the app, update the token file by hand — nothing
regenerates it.

## Fonts

Hanken Grotesk is loaded at runtime from Google Fonts by a `<link>` in
`app/layout.js`. The repo ships no woff2. `tokens/fonts.css` carries the same
Google Fonts `@import`, and `cfg.runtimeFontPrefixes: ["Hanken Grotesk"]`
suppresses `[FONT_MISSING]`. Verified in the review screenshots: previews render
in Hanken Grotesk, not a fallback. If the app ever self-hosts the font, drop
`runtimeFontPrefixes` and use `cfg.extraFonts` instead.

## Chromium

No playwright browser is installed for `.ds-sync`, but this machine has a
cached one. Run validate and capture with:

```
DS_CHROMIUM_PATH="C:/Users/synte/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe"
```

Without it, `npx playwright install chromium` would pull ~150 MB for nothing.
Check that build number still exists before reusing the path.

## Scope

Synced: `Hover` and `Svg` only, plus `Icons`, `s`, `assetSrc` as bundle exports.
Deliberate — the user chose "primitives + foundations". Everything else in
`app/_components/` is app-coupled (tiptap editor, pdfjs viewer, fetch-driven
views) and would need decoupling before it could render standalone.

`componentSrcMap` is what makes discovery work at all: with no `.d.ts` tree,
`exportedNames()` finds nothing, and without the map the build exits
`[ZERO_MATCH]`. Props come from `cfg.dtsPropsFor` for the same reason — keep
those in step with `ui.js` by hand.

`Hover` uses `cardMode: "column"`; its `SegmentedTabs` cell is wider than a grid
cell and got cropped otherwise.

## Watch on re-sync

- `Icons` gained `spinner` at some point; the count in `docs/Svg.md` (38) and
  the group lists there are hand-maintained. Re-check them against
  `Object.keys(Icons)` whenever `ui.js` changes.
- `.riva-*` class names and `@keyframes` are enumerated in
  `.design-sync/conventions.md`. That file is human-owned — never rewrite it,
  but do re-validate every name against `ds-bundle/_ds_bundle.css` each run and
  report anything that no longer resolves.
- An unrelated, hand-authored project **"The Riverside Practice Design System"**
  (`c409c763-cf04-4e0b-bb89-648e57640d3b`) holds a fuller NHS component set that
  does not come from this repo. This sync deliberately targets a separate
  project. Do not point `projectId` at that one — a sync would delete its
  `ui_kits/`, `assets/` and `uploads/`.
