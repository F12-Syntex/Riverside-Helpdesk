'use client';

import React from 'react';
import Link from 'next/link';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';

/* ------------------------------------------------------------------ *
 * /diagram — a visual, paged walk-through of how an answer is made.
 *
 * A persistent pipeline "rail" across the top shows the whole flow at a
 * glance; below it, one card per step explains that stage with a simple
 * picture and a sentence or two. Paged so no single screen is crowded.
 *
 * Reflects the current Notebook-only setup: the assistant answers from
 * the practice Notebook alone (document search and the contacts
 * directory are switched off for now).
 * ------------------------------------------------------------------ */

const BLUE = '#005eb8';
const INK = '#212b32';
const MUTED = '#4c6272';
const GREEN = '#007f3b';

/* A rounded node used both in the rail (small) and the hero scenes (big). */
function Node({ icon, label, size = 56, tone = 'idle', style }) {
  const tones = {
    idle: 'background:#fff;border:1.5px solid #cdd8dd;color:#7a8b95;',
    done: 'background:#eaf3fb;border:1.5px solid #9dc3e6;color:#005eb8;',
    active: `background:${BLUE};border:1.5px solid ${BLUE};color:#fff;box-shadow:0 6px 16px rgba(0,94,184,.28);`,
    green: `background:${GREEN};border:1.5px solid ${GREEN};color:#fff;`,
  };
  return (
    <div style={s(`display:flex;flex-direction:column;align-items:center;gap:6px;${style || ''}`)}>
      <div style={s(`flex:none;width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.32)}px;display:flex;align-items:center;justify-content:center;transition:all .2s;${tones[tone]}`)}>
        <Svg w={Math.round(size * 0.44)} sw={2}>{icon}</Svg>
      </div>
      {label && <div style={s(`font-size:12px;font-weight:700;color:${tone === 'active' ? INK : MUTED};text-align:center;max-width:82px;line-height:1.2;`)}>{label}</div>}
    </div>
  );
}

/* A small connector between rail nodes. */
function Link2({ done }) {
  return <div style={s(`flex:1;height:2px;min-width:10px;margin:0 2px;margin-bottom:22px;border-radius:2px;background:${done ? '#9dc3e6' : '#dbe3e7'};`)} />;
}

/* A little labelled card used inside the hero scenes. */
function Card({ children, tone = 'plain', style }) {
  const tones = {
    plain: 'background:#fff;border:1.5px solid #dbe3e7;color:#212b32;',
    blue: 'background:#f0f6fb;border:1.5px solid #9dc3e6;color:#0b4a86;',
    green: 'background:#effaf2;border:1.5px solid #a7d8b6;color:#075e34;',
  };
  return <div style={s(`border-radius:12px;padding:12px 14px;font-size:13.5px;font-weight:600;line-height:1.4;${tones[tone]}${style || ''}`)}>{children}</div>;
}

/* Small pill, e.g. "Only source". */
function Chip({ children, tone = 'blue' }) {
  const tones = {
    blue: `background:${BLUE};color:#fff;`,
    green: `background:${GREEN};color:#fff;`,
    ghost: 'background:#eef3f5;color:#4c6272;',
  };
  return <span style={s(`display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;letter-spacing:.02em;padding:3px 9px;border-radius:999px;${tones[tone]}`)}>{children}</span>;
}

/* A right-pointing flow arrow for hero scenes. */
function Flow() {
  return (
    <Svg w={30} sw={2} style={s('color:#b7c4cb;flex:none;')}>
      <line x1="3" y1="12" x2="19" y2="12" /><polyline points="14 6 20 12 14 18" />
    </Svg>
  );
}

/* Center a hero scene consistently. */
function Scene({ children }) {
  return <div style={s('display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:16px;')}>{children}</div>;
}

/* The five pipeline steps. `hero` renders the picture for that step. */
const STEPS = [
  {
    node: 'You ask',
    icon: Icons.chat,
    title: 'You ask a question',
    blurb: 'Type a question in plain English, the way you would ask a colleague. That question is the only thing that leaves the page.',
    hero: () => (
      <Scene>
        <Card tone="blue" style="max-width:280px;padding:16px 18px;font-size:15px;border-radius:14px;">
          “How do I book a smear test on EMIS?”
        </Card>
        <Flow />
        <Node icon={Icons.home} label="Practice app" size={64} tone="active" />
      </Scene>
    ),
  },
  {
    node: 'Practice app',
    icon: Icons.home,
    title: 'It stays on the practice’s own server',
    blurb: 'Your question arrives at the app’s own back end. Nothing is sent to any outside company except the wording step, and no keys or practice data ever reach the browser.',
    hero: () => (
      <Scene>
        <Node icon={Icons.home} label="Practice app" size={64} tone="active" />
        <div style={s('display:flex;flex-direction:column;gap:8px;')}>
          <Chip tone="green"><Svg w={13} sw={2.5}>{Icons.lock}</Svg> Secure server</Chip>
          <Chip tone="ghost">No data kept by the AI</Chip>
        </div>
      </Scene>
    ),
  },
  {
    node: 'Your Notebook',
    icon: Icons.book,
    title: 'It reads your Notebook',
    blurb: 'The app loads every page of the practice Notebook, in full. Right now the Notebook is the only thing the assistant looks at — nothing else.',
    hero: () => (
      <Scene>
        <div style={s('display:grid;gap:8px;')}>
          <Card style="width:150px;">📄 Booking appointments</Card>
          <Card style="width:150px;">📄 Duty doctor rules</Card>
          <Card style="width:150px;">📄 Signposting notes</Card>
        </div>
        <Flow />
        <div style={s('display:flex;flex-direction:column;align-items:center;gap:10px;')}>
          <Node icon={Icons.book} label="Notebook" size={64} tone="active" />
          <Chip tone="blue">Only source</Chip>
        </div>
      </Scene>
    ),
  },
  {
    node: 'AI wording',
    icon: Icons.sparkle,
    title: 'The AI words the answer',
    blurb: 'The Notebook pages are handed to the AI, which puts the answer into clear NHS English. It may only use those pages — it is not allowed to add anything from its own knowledge.',
    hero: () => (
      <Scene>
        <Node icon={Icons.book} label="Notebook" size={56} tone="done" />
        <Flow />
        <div style={s('display:flex;flex-direction:column;align-items:center;gap:10px;')}>
          <Node icon={Icons.sparkle} label="AI wording" size={64} tone="active" />
          <Chip tone="ghost"><Svg w={13} sw={2.5}>{Icons.lock}</Svg> No outside knowledge</Chip>
        </div>
      </Scene>
    ),
  },
  {
    node: 'Checked answer',
    icon: Icons.check,
    title: 'Checked, then shown to you',
    blurb: 'Every sentence is checked against the exact words in your Notebook. Anything that cannot be matched is dropped, so you get a clear answer with a link to the page it came from.',
    hero: () => (
      <Scene>
        <Node icon={Icons.shield} label="Quote check" size={56} tone="green" />
        <Flow />
        <div style={s('background:#fff;border:1.5px solid #dbe3e7;border-radius:14px;padding:14px 16px;max-width:270px;box-shadow:0 8px 20px rgba(33,43,50,.08);')}>
          <div style={s(`font-size:14px;font-weight:700;color:${INK};margin-bottom:6px;`)}>Book a smear test</div>
          <div style={s(`font-size:12.5px;color:${MUTED};line-height:1.45;`)}>Open the patient record, then…</div>
          <div style={s('margin-top:10px;')}>
            <Chip tone="green"><Svg w={12} sw={3}>{Icons.check}</Svg> From: Booking appointments</Chip>
          </div>
        </div>
      </Scene>
    ),
  },
];

export default function Page() {
  const [i, setI] = React.useState(0);
  const step = STEPS[i];
  const atStart = i === 0;
  const atEnd = i === STEPS.length - 1;

  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="How the system works" />

      <main style={s('flex:1;width:100%;max-width:860px;margin:0 auto;padding:32px 24px 56px;')}>
        <Hover tag={Link} href="/"
          base={`display:inline-flex;align-items:center;gap:7px;font-size:15px;font-weight:600;color:${MUTED};text-decoration:none;margin-bottom:14px;`}
          hover={`color:${BLUE};`}>
          <Svg w={17} sw={2.2}>{Icons.arrowLeft}</Svg>All practice tools
        </Hover>

        <h1 style={s('font-size:30px;margin:0 0 4px;letter-spacing:-0.02em;')}>How the system works</h1>
        <p style={s(`font-size:16.5px;color:${MUTED};margin:0 0 26px;max-width:60ch;`)}>
          The whole flow at a glance. Tap a step, or use the buttons, to see what
          happens to your question.
        </p>

        {/* The pipeline rail — always visible, current step highlighted. */}
        <div style={s('background:#fff;border:1px solid #d8e1e5;border-radius:14px;padding:20px 16px 16px;overflow-x:auto;')}>
          <div style={s('display:flex;align-items:flex-start;justify-content:space-between;min-width:520px;')}>
            {STEPS.map((st, idx) => (
              <React.Fragment key={st.node}>
                {idx > 0 && <Link2 done={idx <= i} />}
                <Hover tag="button" onClick={() => setI(idx)}
                  base="background:none;border:none;padding:0;cursor:pointer;flex:none;" hover="opacity:.9;">
                  <Node icon={st.icon} label={st.node} size={52}
                    tone={idx === i ? 'active' : idx < i ? 'done' : 'idle'} />
                </Hover>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* The detail card for the current step. */}
        <div style={s('background:#fff;border:1px solid #d8e1e5;border-radius:16px;padding:26px 24px;margin-top:18px;box-shadow:0 1px 2px rgba(33,43,50,.05);')}>
          <div style={s(`font-size:12.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${BLUE};`)}>Step {i + 1} of {STEPS.length}</div>
          <h2 style={s(`font-size:23px;margin:6px 0 8px;letter-spacing:-0.01em;color:${INK};`)}>{step.title}</h2>
          <p style={s(`font-size:15.5px;line-height:1.55;color:${MUTED};margin:0 0 24px;max-width:62ch;`)}>{step.blurb}</p>

          {/* The picture for this step. */}
          <div style={s('background:#f7fafb;border:1px dashed #d3dde2;border-radius:14px;padding:28px 18px;min-height:170px;display:flex;align-items:center;justify-content:center;')}>
            {step.hero()}
          </div>
        </div>

        {/* Paging controls. */}
        <div style={s('display:flex;align-items:center;justify-content:space-between;margin-top:18px;gap:12px;')}>
          <Hover tag="button" onClick={() => setI((n) => Math.max(0, n - 1))} disabled={atStart}
            base={`display:inline-flex;align-items:center;gap:7px;padding:11px 18px;border-radius:10px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;border:1px solid #cdd8dd;background:#fff;color:${INK};${atStart ? 'opacity:.4;cursor:default;' : ''}`}
            hover={atStart ? '' : `border-color:${BLUE};color:${BLUE};`}>
            <Svg w={17} sw={2.2}>{Icons.arrowLeft}</Svg>Back
          </Hover>

          <div style={s('display:flex;gap:7px;')}>
            {STEPS.map((_, idx) => (
              <button key={idx} onClick={() => setI(idx)} aria-label={`Go to step ${idx + 1}`}
                style={s(`width:9px;height:9px;border-radius:50%;border:none;padding:0;cursor:pointer;background:${idx === i ? BLUE : '#cdd8dd'};`)} />
            ))}
          </div>

          {atEnd ? (
            <Hover tag={Link} href="/helpbot"
              base={`display:inline-flex;align-items:center;gap:7px;padding:11px 18px;border-radius:10px;font-size:15px;font-weight:600;text-decoration:none;background:${BLUE};color:#fff;`}
              hover="background:#004a94;">
              Try it<Svg w={17} sw={2.2}>{Icons.arrow}</Svg>
            </Hover>
          ) : (
            <Hover tag="button" onClick={() => setI((n) => Math.min(STEPS.length - 1, n + 1))}
              base={`display:inline-flex;align-items:center;gap:7px;padding:11px 18px;border-radius:10px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;border:none;background:${BLUE};color:#fff;`}
              hover="background:#004a94;">
              Next<Svg w={17} sw={2.2}>{Icons.arrow}</Svg>
            </Hover>
          )}
        </div>

        <p style={s(`font-size:13px;color:${MUTED};margin:24px 0 0;line-height:1.5;text-align:center;`)}>
          In short: your question in, your Notebook checked, a plain answer out — with the source shown every time.
        </p>
      </main>
    </div>
  );
}
