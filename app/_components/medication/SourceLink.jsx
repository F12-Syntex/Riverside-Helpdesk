'use client';

import { s, Hover, Svg, Icons } from '../ui';

// A short, friendly label for an authoritative source, derived from its host so
// the chip stays readable even when the page title is long.
function sourceLabel(url, title) {
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { host = ''; }
  if (host === 'nhs.uk' || host.endsWith('.nhs.uk')) return 'NHS';
  if (host === 'bnf.nice.org.uk') return 'BNF';
  if (host.endsWith('nice.org.uk')) return 'NICE';
  if (host.endsWith('medicines.org.uk')) return 'eMC (SPC/PIL)';
  return host || title || 'Source';
}

// A reference chip linking out to the authoritative source a point came from.
// Opens in a new tab; the page title is the accessible label and tooltip so the
// short visible label never hides where it goes. Mirrors the look of CiteChip.
export default function SourceLink({ url, title }) {
  const label = sourceLabel(url, title);
  const full = title && title !== url ? title : label;
  return (
    <Hover
      tag="a"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={full}
      aria-label={'Open source: ' + full + ' (opens in a new tab)'}
      base="margin-top:8px;display:inline-flex;align-items:center;gap:7px;max-width:100%;background:#fff;border:1px solid #cfe1f0;border-radius:999px;padding:4px 11px 4px 9px;font:inherit;font-size:12.5px;font-weight:600;color:#005eb8;cursor:pointer;text-decoration:none;"
      hover="background:#f7fbff;border-color:#005eb8;">
      <Svg w={13} stroke="#007f3b" sw={2.4} style={s('flex:none;')}>{Icons.shield}</Svg>
      <span style={s('min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{label}</span>
      <Svg w={12} sw={2.2} style={s('flex:none;opacity:.7;')}>{Icons.external}</Svg>
    </Hover>
  );
}
