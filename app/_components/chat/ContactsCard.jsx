'use client';

import { s, Svg, Icons } from '../ui';

/* ------------------------------------------------------------------ *
 * Exact contacts, shown verbatim from structured data — the practice
 * directory, the CQC register, or a page that was read and had its
 * number lifted out of it. Nothing here is authored by the AI, so it
 * cannot be mis-typed: this is the trustworthy place to take a number
 * from, and each row says where its number came from.
 *
 * One row per contact: who they are on the left, the number on the
 * right at the size it is read off and dialled, matching the directory
 * panel above the dock and the rest of the answer's furniture.
 * ------------------------------------------------------------------ */

export default function ContactsCard({ v }) {
  if (!v.contacts || !v.contacts.length) return null;
  return (
    <div style={s('margin:18px 0 4px;')}>
      <div style={s('font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#74747d;margin-bottom:10px;')}>Contacts</div>
      <div style={s('display:flex;flex-direction:column;gap:6px;')}>
        {v.contacts.map((c, i) => (
          <div key={i} className="riva-contact-row riva-lift" style={s('display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;background:#141416;border:1px solid #26262a;border-radius:10px;padding:12px 15px;')}>
            <span style={s('flex:1 1 200px;min-width:0;')}>
              <span style={s('display:block;font-size:15.5px;font-weight:700;color:#e9e9ec;line-height:1.35;')}>{c.label}</span>
              {c.note ? <span style={s('display:block;font-size:13.5px;color:#9a9aa3;margin-top:2px;')}>{c.note}</span> : null}
              {/* Where the number came from decides how much it can be trusted:
                  the practice's own sheet is not the same as a page on the web. */}
              {c.source ? (
                c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer" style={s('display:inline-block;font-size:12.5px;color:#e0b85f;margin-top:4px;text-decoration:none;border-bottom:1px dotted #51442a;overflow-wrap:anywhere;')}>{c.source} — check before using</a>
                ) : (
                  <span style={s('display:block;font-size:12.5px;color:#63636c;margin-top:4px;')}>{c.source}</span>
                )
              ) : null}
            </span>

            <span className="riva-contact-nums" style={s('flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:4px;')}>
              {c.phones.map((p, j) => (
                <a key={'p' + j} href={'tel:' + p.tel}
                  style={s('display:inline-flex;align-items:center;gap:7px;font-size:17px;font-weight:700;color:#e0554f;text-decoration:none;font-variant-numeric:tabular-nums;')}>
                  <Svg w={14} sw={2.2} style={s('flex:none;opacity:.75;')}>{Icons.phone}</Svg>{p.display}
                </a>
              ))}
              {c.emails.map((e, j) => (
                <a key={'e' + j} href={'mailto:' + e}
                  style={s('font-size:13.5px;font-weight:600;color:#9a9aa3;text-decoration:none;border-bottom:1px solid #26262a;word-break:break-all;')}>
                  {e}
                </a>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
