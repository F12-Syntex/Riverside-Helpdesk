# Showcase film — the practice Q&A

`showcase-qa.mp4` — 1920×1080, 30fps, ~45s, no sound.

Everything in it is the real app: the question is typed into the live
field, the answer is the one the templates and the practice's documents
produce, and the feedback row is really pressed. Nothing is a mock-up.
The only additions are the film's own furniture — the title card, the
captions and the cursor.

## What it shows

1. Title card.
2. The opening screen: one field, nothing else.
3. `How do I do a 2WW referral for suspected skin cancer?` — the dock
   falls to the foot, the question lands, the answer arrives as the
   suspected-skin-cancer template: the e-RS fields (Speciality 2WW,
   Clinic type 2WW Dermatology, Priority 2WW), the warnings, and the
   steps in the order they are done.
4. The feedback row, pressed — "Helpful".
5. `How do I code a hospital discharge letter?` — a different kind of
   answer entirely: the house format and its worked examples.
6. End card.

## Re-recording it

Needs the app running, a Chromium binary, `playwright-core` and
`ffmpeg` on PATH.

```sh
# app first
npm run dev

# then, in another shell
PW_CORE="$(npm root -g)/@playwright/mcp/node_modules/playwright-core" \
CHROME="$LOCALAPPDATA/ms-playwright/chromium-1223/chrome-win64/chrome.exe" \
APP_URL="http://127.0.0.1:3000/" \
node scripts/showcase/record-qa.mjs
```

The answer is generated live, so a re-record is never frame-identical,
and a looser question lets the model pick a different template — the
wording in the script is deliberately unambiguous.

The frames come from Chrome's own screencast, each stamped with the
moment the page painted it, so the app's motion keeps its real timing;
ffmpeg lays them back down at a constant 30fps.

The film's furniture follows the same motion rules the app itself uses,
taken from the `motion-design` skill's tokens: ease-out for anything
arriving or leaving (captions, 260ms in / 180ms out), ease-in-out for
the cursor, which is already on screen and only ever moves
(`cubic-bezier(.645, .045, .355, 1)`, 640–680ms), and the long, steep
`ease-out-expo` for the title cards, which are illustrative rather than
UI.
