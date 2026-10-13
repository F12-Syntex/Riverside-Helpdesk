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

import { Svg, Icons } from './ui';

export default function PatientDataModal({ v }) {
  const blocked = v.blocked;
  if (!blocked) return null;

  return (
    <div className="ap-overlay" role="alertdialog" aria-modal="true" aria-labelledby="riva-blocked-title">
      <div className="ap-panel">
        <div className="ap-head" style={{ flexDirection: 'column', paddingTop: 30 }}>
          <span className="ap-alert__ico"><Svg w={26} sw={2}>{Icons.triangle}</Svg></span>
          <h2 id="riva-blocked-title" className="ap-title">Not sent: patient details</h2>
        </div>

        <div className="ap-body" style={{ textAlign: 'center' }}>
          <p>{blocked.message}</p>

          {blocked.kinds.length > 0 && (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', lineHeight: 1.6 }}>
              {blocked.kinds.map((k) => <li key={k.id}>Take out {k.label}.</li>)}
            </ul>
          )}

          <div className="ap-note" style={{ textAlign: 'left' }}>
            The assistant answers questions about <strong>how the practice works</strong>, so it never needs to know
            which patient. Ask about the process, not the person: “how do I code a discharge summary”, not
            “how do I code Mrs Smith’s”.
          </div>

          <p style={{ fontSize: 13.5, color: 'var(--rv-ink-3)' }}>
            Nothing was sent and nothing was saved. Your message is still in the box. Edit it and send it again.
          </p>
        </div>

        <div className="ap-foot">
          <button type="button" className="ap-btn ap-btn--primary" onClick={v.onCloseBlocked} autoFocus>Edit the message</button>
        </div>
      </div>
    </div>
  );
}
