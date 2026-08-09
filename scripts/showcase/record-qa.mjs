/* ------------------------------------------------------------------ *
 * Records the showcase film of the practice Q&A.
 *
 * It drives the real app in a real browser — nothing here is a mock-up:
 * the question is typed into the live field, the answer is the one the
 * model and the practice's own documents produce, and the feedback row
 * is pressed for real. The camera is Chrome's screencast, so what is
 * captured is exactly what the page painted, at the moment it painted
 * it; the frames carry their own timestamps and ffmpeg lays them back
 * down on a 30fps timeline, so the app's motion keeps its real timing.
 *
 * The only thing added on top is the film's own furniture: a title
 * card, the captions and a cursor. Their motion follows the same rules
 * as the app's — ease-out on the way in, ease-in-out for something
 * already on screen, and nothing longer than it has to be.
 *
 * Run:
 *   node scripts/showcase/record-qa.mjs
 *
 * Needs: the app running (APP_URL, default http://127.0.0.1:3000/),
 * a Chromium binary (CHROME), playwright-core (PW_CORE) and ffmpeg on
 * PATH. Writes the film to showcase/showcase-qa.mp4.
 * ------------------------------------------------------------------ */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);

const APP_URL = process.env.APP_URL || 'http://127.0.0.1:3000/';
const OUT_DIR = process.env.OUT_DIR || path.join(process.cwd(), 'showcase');
const FRAME_DIR = process.env.FRAME_DIR || path.join(os.tmpdir(), 'riva-showcase-frames');
const OUT_FILE = path.join(OUT_DIR, 'showcase-qa.mp4');
const FPS = Number(process.env.FPS || 30);
const W = 1920;
const H = 1080;

function loadPlaywright() {
  const tries = [process.env.PW_CORE, 'playwright-core', 'playwright'].filter(Boolean);
  for (const t of tries) {
    try { return require(t); } catch { /* next */ }
  }
  throw new Error('playwright-core not found. Set PW_CORE to its path.');
}

const { chromium } = loadPlaywright();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* The film's furniture, injected into the page: a cursor, a caption
   strip and the title card. Motion tokens are the ones the plugin's
   reference sheet lists, used the way its decision tree says — ease-out
   for anything arriving or leaving, ease-in-out for the cursor, which
   is already on screen and only ever moves. */
const LAYER = `
(() => {
  if (window.__sc) return;
  const css = document.createElement('style');
  css.textContent = \`
    /* The dev-mode badge is not part of the product. */
    nextjs-portal { display: none !important; }
    #sc-cursor {
      position: fixed; z-index: 2147483000; left: 0; top: 0; width: 26px; height: 26px;
      margin: -13px 0 0 -13px; border-radius: 50%; pointer-events: none;
      background: rgba(33,43,50,.82); border: 2px solid rgba(255,255,255,.92);
      box-shadow: 0 6px 18px rgba(33,43,50,.28); opacity: 0;
      transition: opacity 240ms cubic-bezier(.165,.84,.44,1);
    }
    #sc-ring {
      position: fixed; z-index: 2147482999; left: 0; top: 0; width: 26px; height: 26px;
      margin: -13px 0 0 -13px; border-radius: 50%; pointer-events: none;
      border: 2px solid #005eb8; opacity: 0;
    }
    #sc-caption {
      position: fixed; z-index: 2147483000; left: 50%; bottom: 46px;
      pointer-events: none; display: flex; align-items: center; gap: 11px;
      padding: 13px 24px; border-radius: 999px;
      background: rgba(33,43,50,.92); color: #fff;
      font-family: 'Hanken Grotesk', Arial, sans-serif; font-size: 20px; font-weight: 600;
      letter-spacing: -.01em; box-shadow: 0 12px 40px rgba(33,43,50,.28);
      transform: translateX(-50%); opacity: 0;
    }
    #sc-caption i { display: block; flex: none; width: 7px; height: 7px; border-radius: 50%; background: #41b6e6; }
    #sc-card {
      position: fixed; z-index: 2147483001; inset: 0; pointer-events: none;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 16px; background: #f0f4f5;
      font-family: 'Hanken Grotesk', Arial, sans-serif; color: #212b32; opacity: 0;
    }
    #sc-card .sc-mark { display: flex; align-items: center; gap: 18px; }
    #sc-card .sc-nhs {
      background: #005eb8; color: #fff; font-weight: 800; font-size: 32px; letter-spacing: -.05em;
      padding: 8px 15px; border-radius: 5px;
    }
    #sc-card h1 { margin: 0; font-size: 60px; font-weight: 700; letter-spacing: -.03em; }
    #sc-card p { margin: 0; font-size: 25px; color: #4c6272; }
    #sc-card .sc-rule { width: 78px; height: 4px; border-radius: 2px; background: #005eb8; transform-origin: left center; }
  \`;
  document.head.appendChild(css);

  const mk = (id, html) => {
    const el = document.createElement('div');
    el.id = id;
    if (html) el.innerHTML = html;
    document.body.appendChild(el);
    return el;
  };
  const cursor = mk('sc-cursor');
  const ring = mk('sc-ring');
  const caption = mk('sc-caption', '<i></i><span></span>');
  const card = mk('sc-card',
    '<div class="sc-mark"><span class="sc-nhs">NHS</span><h1></h1></div><div class="sc-rule"></div><p></p>');

  const anim = (el, frames, ms, easing, fill = 'forwards', delay = 0) =>
    el.animate(frames, { duration: ms, easing, fill, delay });

  let cx = 960, cy = 980;
  const put = (el, x, y) => { el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };

  window.__sc = {
    /* The cursor is on screen throughout, so it moves on ease-in-out —
       accelerate away, settle on arrival. */
    cursorShow(x, y) {
      cx = x; cy = y;
      put(cursor, x, y); put(ring, x, y);
      cursor.style.opacity = '1';
    },
    cursorTo(x, y, ms = 600) {
      const from = 'translate(' + cx + 'px,' + cy + 'px)';
      const to = 'translate(' + x + 'px,' + y + 'px)';
      cx = x; cy = y;
      anim(cursor, [{ transform: from }, { transform: to }], ms, 'cubic-bezier(.645,.045,.355,1)');
      anim(ring, [{ transform: from }, { transform: to }], ms, 'cubic-bezier(.645,.045,.355,1)');
    },
    cursorHide() { cursor.style.opacity = '0'; },
    /* A press: the cursor gives a little, and a ring leaves it. */
    press() {
      cursor.animate([{ scale: '1' }, { scale: '.8' }, { scale: '1' }],
        { duration: 260, easing: 'cubic-bezier(.25,.46,.45,.94)' });
      ring.style.opacity = '1';
      const a = ring.animate([
        { scale: '1', opacity: .9 },
        { scale: '2.6', opacity: 0 },
      ], { duration: 420, easing: 'cubic-bezier(.165,.84,.44,1)' });
      a.finished.then(() => { ring.style.opacity = '0'; }).catch(() => {});
    },
    /* Captions arrive and leave, so: ease-out, and short. */
    captionIn(text) {
      caption.querySelector('span').textContent = text;
      caption.style.opacity = '1';
      anim(caption, [
        { opacity: 0, transform: 'translateX(-50%) translateY(14px) scale(.97)' },
        { opacity: 1, transform: 'translateX(-50%) translateY(0) scale(1)' },
      ], 260, 'cubic-bezier(.165,.84,.44,1)');
    },
    captionOut() {
      const a = anim(caption, [
        { opacity: 1, transform: 'translateX(-50%) translateY(0) scale(1)' },
        { opacity: 0, transform: 'translateX(-50%) translateY(8px) scale(.985)' },
      ], 180, 'cubic-bezier(.55,.085,.68,.53)');
      a.finished.then(() => { caption.style.opacity = '0'; }).catch(() => {});
    },
    /* The card is illustrative, not UI: it gets the long, steep curve. */
    cardIn(title, sub) {
      card.querySelector('h1').textContent = title;
      card.querySelector('p').textContent = sub;
      card.style.opacity = '1';
      anim(card, [{ opacity: 0 }, { opacity: 1 }], 220, 'linear');
      anim(card.querySelector('.sc-mark'), [
        { opacity: 0, transform: 'translateY(22px)' },
        { opacity: 1, transform: 'none' },
      ], 800, 'cubic-bezier(.19,1,.22,1)');
      anim(card.querySelector('.sc-rule'),
        [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
        640, 'cubic-bezier(.19,1,.22,1)', 'both', 180);
      anim(card.querySelector('p'),
        [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }],
        700, 'cubic-bezier(.19,1,.22,1)', 'both', 260);
    },
    cardOut(ms = 420) {
      const a = anim(card, [{ opacity: 1 }, { opacity: 0 }], ms, 'cubic-bezier(.165,.84,.44,1)');
      a.finished.then(() => { card.style.opacity = '0'; }).catch(() => {});
    },
    /* Scrolling is time, so it runs at a near-constant rate with only
       the ends softened. */
    scrollBy(dy, ms = 1600) {
      const sc = document.getElementById('riva-scroll') || document.scrollingElement || document.body;
      const from = sc.scrollTop;
      const t0 = performance.now();
      const ease = (p) => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
      return new Promise((done) => {
        const step = (now) => {
          const p = Math.min(1, (now - t0) / ms);
          sc.scrollTop = from + dy * ease(p);
          if (p < 1) requestAnimationFrame(step); else done();
        };
        requestAnimationFrame(step);
      });
    },
    box(sel, text) {
      const els = [...document.querySelectorAll(sel)];
      const el = text ? els.find((e) => (e.textContent || '').trim() === text) : els[0];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
  };
})();
`;

async function main() {
  fs.rmSync(FRAME_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAME_DIR, { recursive: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME || undefined,
    args: ['--force-device-scale-factor=1', '--hide-scrollbars'],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

  await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
  const field = page.locator('input[aria-label="Ask a question"]');
  await field.waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500); // fonts, gradient, first paint settled

  await page.evaluate(LAYER);

  const sc = (fn, ...args) => page.evaluate(
    ([f, a]) => window.__sc[f](...a), [fn, args],
  );
  const at = (sel, text) => page.evaluate(
    ([s, t]) => window.__sc.box(s, t), [sel, text],
  );

  await sc('cardIn', 'The Riverside Practice', 'Practice Q&A');
  await wait(300);

  const client = await page.context().newCDPSession(page);
  const frames = [];
  let n = 0;
  client.on('Page.screencastFrame', (f) => {
    const file = path.join(FRAME_DIR, String(n++).padStart(6, '0') + '.jpg');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    client.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await client.send('Page.startScreencast', {
    format: 'jpeg', quality: 92, maxWidth: W, maxHeight: H, everyNthFrame: 1,
  });

  // 1 — the card holds, then gives way to the app.
  await wait(2200);
  await sc('cardOut', 520);
  await wait(1000);
  await sc('captionIn', 'One field. Every question reception has to answer.');
  await wait(2000);
  await sc('captionOut');
  await wait(400);

  // 2 — the question is typed into the real field.
  const fieldBox = await at('input[aria-label="Ask a question"]');
  await sc('cursorShow', 960, 1010);
  await sc('cursorTo', fieldBox.x - 220, fieldBox.y, 700);
  await wait(780);
  await sc('press');
  await field.click();
  await wait(320);
  await sc('cursorHide');
  await field.type('How do I do a 2WW dermatology referral?', { delay: 55 });
  await wait(700);

  // 3 — asking. The dock falls to the foot, the question lands, the
  //     agent's lookups deal in, the answer arrives.
  await page.keyboard.press('Enter');
  await wait(1400);
  await sc('captionIn', 'Answered from the practice’s own documents — not from the model’s memory.');
  await page.getByText('Was this right?').first().waitFor({ timeout: 120000 });
  await wait(1700);
  await sc('captionOut');
  await wait(500);

  // 4 — down through the answer: the referral's own fields, then its steps.
  await sc('captionIn', 'The referral’s fields, filled in — speciality, clinic type, priority.');
  await page.evaluate(() => window.__sc.scrollBy(420, 1800));
  await wait(2500);
  await sc('captionOut');
  await wait(350);
  await sc('captionIn', 'Then the steps, in the order someone at the desk does them.');
  await page.evaluate(() => window.__sc.scrollBy(560, 2000));
  await wait(2700);
  await sc('captionOut');
  await wait(400);

  // 5 — the feedback row, pressed.
  await page.evaluate(() => window.__sc.scrollBy(420, 1300));
  await wait(1600);
  const helpful = await at('button', 'Helpful');
  if (helpful) {
    await sc('captionIn', 'Every answer can be marked in one press.');
    await sc('cursorShow', helpful.x - 260, helpful.y + 150);
    await sc('cursorTo', helpful.x, helpful.y, 640);
    await wait(700);
    await sc('press');
    await page.getByRole('button', { name: 'Helpful' }).first().click();
    await wait(1700);
    await sc('cursorHide');
    await sc('captionOut');
    await wait(500);
  }

  // 6 — the outro.
  await sc('cardIn', 'The Riverside Practice', 'Ask once. Get back to the patient.');
  await wait(2600);

  await client.send('Page.stopScreencast').catch(() => {});
  await wait(400);
  await browser.close();

  if (frames.length < 2) throw new Error('No frames captured.');
  console.log('captured ' + frames.length + ' frames over '
    + (frames[frames.length - 1].t - frames[0].t).toFixed(1) + 's');

  // The frames arrive only when the page repaints, each stamped with the
  // moment it did, so the list carries a duration per frame and a still
  // stretch simply holds. ffmpeg resamples that to a constant 30fps.
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const dur = i < frames.length - 1
      ? Math.max(0.001, frames[i + 1].t - frames[i].t)
      : 0.8;
    lines.push("file '" + frames[i].file.replace(/\\/g, '/') + "'");
    lines.push('duration ' + dur.toFixed(4));
  }
  lines.push("file '" + frames[frames.length - 1].file.replace(/\\/g, '/') + "'");
  const listFile = path.join(FRAME_DIR, 'frames.txt');
  fs.writeFileSync(listFile, lines.join('\n'));

  const args = [
    '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
    '-vf', 'fps=' + FPS + ',format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19',
    '-movflags', '+faststart', OUT_FILE,
  ];
  const r = spawnSync('ffmpeg', args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
  console.log('wrote ' + OUT_FILE);
}

main().catch((e) => { console.error(e); process.exit(1); });
