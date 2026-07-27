'use client';

import { s, Svg, Icons } from '../ui';

// Exact contacts, shown verbatim from structured data — the practice directory,
// the CQC register, or a page that was read and had its number lifted out of it.
// Nothing here is authored by the AI, so it cannot be mis-typed: this card is the
// trustworthy source for a number, and each row says where its number came from.
export default function ContactsCard({ v }) {
  if (!v.contacts || !v.contacts.length) return null;
  return (
    <div style={s('margin:14px 22px 4px;')}>
      <div style={s('display:flex;align-items:center;gap:7px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin-bottom:8px;')}>
        <Svg w={14} sw={2.2} stroke="#007f3b" style={s('flex:none;')}>{Icons.phone}</Svg>
        Contacts
      </div>
      <div style={s('border:1px solid #d8dde0;border-radius:8px;overflow:hidden;')}>
        {v.contacts.map((c, i) => (
          <div key={i} style={s('display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;padding:10px 14px;' + (i ? 'border-top:1px solid #eef1f2;' : ''))}>
            <span style={s('min-width:120px;flex:1 1 auto;')}>
              <span style={s('display:block;font-size:15px;font-weight:600;color:#212b32;')}>{c.label}</span>
              {c.note ? <span style={s('display:block;font-size:12.5px;color:#4c6272;margin-top:1px;')}>{c.note}</span> : null}
              {/* Where the number came from decides how much it can be trusted:
                  the practice's own sheet is not the same as a page on the web. */}
              {c.source ? (
                c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer" style={s('display:block;font-size:12px;color:#8a6100;margin-top:2px;text-decoration:none;overflow-wrap:anywhere;')}>{c.source} — check before using</a>
                ) : (
                  <span style={s('display:block;font-size:12px;color:#768692;margin-top:2px;')}>{c.source}</span>
                )
              ) : null}
            </span>
            <span style={s('display:flex;flex-wrap:wrap;gap:6px;flex:none;')}>
              {c.phones.map((p, j) => (
                <a key={'p' + j} href={'tel:' + p.tel} style={s('display:inline-flex;align-items:center;gap:5px;background:#e8f1f8;color:#003087;border-radius:999px;padding:3px 11px;font-size:14px;font-weight:600;text-decoration:none;font-variant-numeric:tabular-nums;')}>
                  <Svg w={12} sw={2.2}>{Icons.phone}</Svg>{p.display}
                </a>
              ))}
              {c.emails.map((e, j) => (
                <a key={'e' + j} href={'mailto:' + e} style={s('display:inline-flex;align-items:center;background:#f0f4f5;color:#005eb8;border-radius:999px;padding:3px 11px;font-size:13px;font-weight:600;text-decoration:none;word-break:break-all;')}>
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
