'use client';

/* ------------------------------------------------------------------ *
 * The message that did not go.
 *
 * The Super speed screen found something in it that identifies a
 * particular patient (lib/safety/patient-data.mjs), so the message was
 * never sent and nothing was written to the transcript. This says so.
 *
 * WHY A MODAL AND NOT A TOAST. Every other warning in this app is a
 * toast, because every other warning is about something that already
 * happened — the name was removed, the answer is general, the search
 * found nothing. This one is about something that did NOT happen. A
 * toast beside an empty conversation reads as a hiccup, and the reader
 * presses Enter again. A box in the middle of the screen, with the field
 * still holding what they typed, is the only shape that says "this is
 * yours to fix" clearly enough that nobody sends it twice.
 *
 * WHAT IT MUST NOT DO IS QUOTE ANYTHING. The kinds are named — a date of
 * birth, an NHS number — and the detail never is. Everything on this box
 * is assembled in code from a fixed list; nothing a model wrote is
 * rendered here. See the head of lib/safety/patient-data.mjs.
 *
 * ONE WAY OUT, AND IT IS BACK TO THE FIELD. There is no "send anyway".
 * The message is still in the composer, untouched, with the cursor in it.
 * ------------------------------------------------------------------ */

import { s, Hover, Svg, Icons } from './ui';

export default function PatientDataModal({ v }) {
  const blocked = v.blocked;
  if (!blocked) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="riva-blocked-title"
      style={s('position:fixed;inset:0;background:rgba(33,43,50,.45);display:flex;align-items:center;justify-content:center;padding:24px 16px;overflow-y:auto;z-index:60;')}
    >
      <div style={s('width:100%;max-width:520px;background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(33,43,50,.22);overflow:hidden;')}>
        <div style={s('display:flex;align-items:center;gap:12px;padding:18px 22px;background:#d5281b;color:#fff;')}>
          <span style={s('display:flex;flex:none;')}><Svg w={26}>{Icons.triangle}</Svg></span>
          <h3 id="riva-blocked-title" style={s('font-size:20px;margin:0;letter-spacing:-0.01em;')}>Not sent — patient details</h3>
        </div>

        <div style={s('padding:22px;display:flex;flex-direction:column;gap:16px;')}>
          <p style={s('font-size:16.5px;line-height:1.5;margin:0;color:#212b32;')}>
            {blocked.message}
          </p>

          {blocked.kinds.length > 0 && (
            <ul style={s('margin:0;padding:0 0 0 20px;font-size:15.5px;line-height:1.6;color:#212b32;')}>
              {blocked.kinds.map((k) => <li key={k.id}>Take out {k.label}.</li>)}
            </ul>
          )}

          <div style={s('background:#f0f4f5;border-left:4px solid #005eb8;border-radius:0 8px 8px 0;padding:12px 14px;font-size:15px;line-height:1.55;color:#4c6272;')}>
            The assistant answers questions about <strong>how the practice works</strong>, so it never needs to know
            which patient. Ask about the process, not the person — “how do I code a discharge summary”, not
            “how do I code Mrs Smith’s”.
          </div>

          <p style={s('font-size:14.5px;line-height:1.55;margin:0;color:#768692;')}>
            Nothing was sent and nothing was saved. Your message is still in the box — edit it and send it again.
          </p>
        </div>

        <div style={s('padding:16px 22px;border-top:1px solid #d8dde0;display:flex;justify-content:flex-end;')}>
          <Hover
            tag="button" type="button" onClick={v.onCloseBlocked} autoFocus
            base="background:#005eb8;color:#fff;border:none;border-radius:8px;padding:11px 20px;font:inherit;font-size:16px;font-weight:600;cursor:pointer;box-shadow:0 4px 0 #003d78;display:inline-flex;align-items:center;gap:8px;"
            active="transform:translateY(4px);box-shadow:none;"
          >
            <span style={s('display:flex;')}><Svg w={18}>{Icons.edit}</Svg></span>
            Edit the message
          </Hover>
        </div>
      </div>
    </div>
  );
}
