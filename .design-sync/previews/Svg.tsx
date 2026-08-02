// Preview cells for Svg. The glyph grid is the whole icon set as it exists in
// app/_components/ui.js; the other cells show the sizes, stroke weights and
// colour inheritance the app relies on.

import { Svg, Icons, s } from 'riverside-emis-helper';

const NAMES = Object.keys(Icons);

/** Every glyph in the set, labelled with the key you pass to Icons. */
export function IconGrid() {
  return (
    <div style={s('display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:4px;color:#212b32;')}>
      {NAMES.map((name) => (
        <div
          key={name}
          style={s('display:flex;flex-direction:column;align-items:center;gap:7px;padding:12px 6px;border:1px solid #eef1f2;border-radius:10px;background:#fff;')}
        >
          <Svg w={22}>{Icons[name]}</Svg>
          <span style={s('font-size:11.5px;color:#4c6272;text-align:center;word-break:break-word;')}>{name}</span>
        </div>
      ))}
    </div>
  );
}

/** The sizes the product draws: 16 in controls, 22 for the menu button, 24 at rest. */
export function Sizes() {
  return (
    <div style={s('display:flex;align-items:flex-end;gap:24px;color:#005eb8;')}>
      {[16, 20, 22, 24, 32].map((w) => (
        <div key={w} style={s('display:flex;flex-direction:column;align-items:center;gap:8px;')}>
          <Svg w={w}>{Icons.stethoscope}</Svg>
          <span style={s('font-size:12px;color:#4c6272;')}>w={w}</span>
        </div>
      ))}
    </div>
  );
}

/** Stroke weight. 2 is the default; 2.2 is used where a glyph needs more presence. */
export function StrokeWeights() {
  return (
    <div style={s('display:flex;align-items:flex-end;gap:28px;color:#212b32;')}>
      {[1.5, 2, 2.2, 2.6].map((sw) => (
        <div key={sw} style={s('display:flex;flex-direction:column;align-items:center;gap:8px;')}>
          <Svg w={28} sw={sw}>{Icons.menu}</Svg>
          <span style={s('font-size:12px;color:#4c6272;')}>sw={sw}</span>
        </div>
      ))}
    </div>
  );
}

/** Colour comes from the parent, so an icon picks up its container's intent. */
export function StatusDiscs() {
  const states = [
    { label: 'Information', accent: '#005eb8', tint: '#e8f1f8', icon: Icons.infoCircle },
    { label: 'Saved', accent: '#007f3b', tint: '#e6f3ec', icon: Icons.check },
    { label: 'Could not send', accent: '#d5281b', tint: '#fbeae8', icon: Icons.alertCircle },
    { label: 'Check before acting', accent: '#946800', tint: '#fff6cc', icon: Icons.triangle },
  ];
  return (
    <div style={s('display:flex;flex-direction:column;gap:10px;max-width:360px;')}>
      {states.map((st) => (
        <div
          key={st.label}
          style={s('display:flex;align-items:center;gap:11px;background:#fff;border:1px solid #d8dde0;border-radius:12px;padding:13px 14px;box-shadow:0 6px 24px rgba(33,43,50,.14);')}
        >
          <span
            style={s(
              'flex:none;width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:' +
                st.tint +
                ';color:' +
                st.accent +
                ';',
            )}
          >
            <Svg w={16} sw={2.2}>{st.icon}</Svg>
          </span>
          <span style={s('font-size:14.5px;color:#212b32;')}>{st.label}</span>
        </div>
      ))}
    </div>
  );
}
