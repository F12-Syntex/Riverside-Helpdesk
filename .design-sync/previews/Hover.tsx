// Preview cells for Hover. Every composition here is lifted from how the app
// actually builds controls — app/_components/AppHeader.jsx, MobileNav.jsx and
// Notifications.jsx — so the cards show the real vocabulary, not invented UI.

import { Hover, Svg, Icons, s } from 'riverside-emis-helper';

const row = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap;';

/** The three button weights the product uses: primary, secondary, quiet. */
export function Buttons() {
  return (
    <div style={s(row)}>
      <Hover
        tag="button"
        base="display:inline-flex;align-items:center;gap:7px;border:none;border-radius:10px;padding:0 18px;height:42px;background:#005eb8;color:#fff;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;"
        hover="background:#003087;"
      >
        <Svg w={16}>{Icons.check}</Svg>
        <span>Save rota</span>
      </Hover>

      <Hover
        tag="button"
        base="display:inline-flex;align-items:center;gap:7px;border:1px solid #d8dde0;border-radius:10px;padding:0 18px;height:42px;background:#fff;color:#212b32;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;"
        hover="background:#e8f1f8;border-color:#005eb8;"
      >
        <Svg w={16}>{Icons.copy}</Svg>
        <span>Copy</span>
      </Hover>

      <Hover
        tag="button"
        base="display:inline-flex;align-items:center;gap:7px;border:none;background:none;padding:0 6px;height:42px;color:#4c6272;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;"
        hover="color:#212b32;"
      >
        <Svg w={16}>{Icons.trash}</Svg>
        <span>Delete</span>
      </Hover>
    </div>
  );
}

/** The header's segmented control — one pill active, the rest quiet. */
export function SegmentedTabs() {
  const tabs = [
    { key: 'assistant', label: 'Assistant', icon: Icons.chat },
    { key: 'kb', label: 'Knowledge base', icon: Icons.book },
    { key: 'rota', label: 'Rota', icon: Icons.calendar },
  ];
  const active = 'assistant';

  return (
    <div style={s('display:inline-flex;align-items:center;gap:3px;background:#f0f4f5;border:1px solid #d8dde0;border-radius:10px;padding:3px;')}>
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Hover
            key={t.key}
            tag="button"
            base={
              'display:inline-flex;align-items:center;gap:7px;border:none;border-radius:7px;padding:7px 15px;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;' +
              (on
                ? 'background:#fff;color:#005eb8;box-shadow:0 1px 2px rgba(33,43,50,.14);'
                : 'background:none;color:#4c6272;')
            }
            hover={on ? '' : 'color:#212b32;'}
          >
            <Svg w={16}>{t.icon}</Svg>
            <span>{t.label}</span>
          </Hover>
        );
      })}
    </div>
  );
}

/** Square icon buttons — the 42px tap target used across toolbars. */
export function IconButtons() {
  const base =
    'display:inline-flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:10px;background:#f0f4f5;border:1px solid #d8dde0;color:#212b32;cursor:pointer;';
  return (
    <div style={s(row)}>
      <Hover tag="button" aria-label="Open menu" base={base} hover="background:#e8f1f8;border-color:#005eb8;">
        <Svg w={22} sw={2.2}>{Icons.menu}</Svg>
      </Hover>
      <Hover tag="button" aria-label="Undo" base={base} hover="background:#e8f1f8;border-color:#005eb8;">
        <Svg w={20} sw={2.2}>{Icons.undo}</Svg>
      </Hover>
      <Hover tag="button" aria-label="Redo" base={base} hover="background:#e8f1f8;border-color:#005eb8;">
        <Svg w={20} sw={2.2}>{Icons.redo}</Svg>
      </Hover>
      <Hover
        tag="button"
        aria-label="Delete week"
        base={base + 'color:#d5281b;'}
        hover="background:#fbeae8;border-color:#d5281b;"
      >
        <Svg w={20} sw={2.2}>{Icons.trash}</Svg>
      </Hover>
      <Hover
        tag="button"
        aria-label="Dismiss"
        base="display:inline-flex;align-items:center;justify-content:center;background:none;border:none;color:#768692;cursor:pointer;padding:2px;"
        hover="color:#212b32;"
      >
        <Svg w={16}>{Icons.close}</Svg>
      </Hover>
    </div>
  );
}

/** `tag` swaps the rendered element: a link, and a full-width menu row. */
export function OtherElements() {
  return (
    <div style={s('display:flex;flex-direction:column;gap:14px;max-width:420px;')}>
      <Hover
        tag="a"
        href="#"
        base="display:inline-flex;align-items:center;gap:7px;color:#005eb8;font-size:15.5px;font-weight:600;text-decoration:none;"
        hover="text-decoration:underline;"
      >
        <span>Open the referral form</span>
        <Svg w={16}>{Icons.external}</Svg>
      </Hover>

      <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:12px;overflow:hidden;')}>
        {[
          { label: 'Assistant', icon: Icons.chat },
          { label: 'Knowledge base', icon: Icons.book },
          { label: 'Medication check', icon: Icons.pill },
        ].map((item, i) => (
          <Hover
            key={item.label}
            tag="div"
            base={
              'display:flex;align-items:center;gap:11px;padding:14px 16px;font-size:15.5px;font-weight:600;color:#212b32;cursor:pointer;' +
              (i ? 'border-top:1px solid #eef1f2;' : '')
            }
            hover="background:#f0f6fb;color:#005eb8;"
          >
            <Svg w={18}>{item.icon}</Svg>
            <span style={s('flex:1;')}>{item.label}</span>
            <Svg w={16} stroke="#768692">{Icons.chevronRight}</Svg>
          </Hover>
        ))}
      </div>
    </div>
  );
}
