'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';
import {
  weekDays, weekRangeLabel, mondayPlusWeeks, isoOf, currentMonday,
  initials, firstName, cellView, analyze, buildWhatsApp, shiftRange,
  DEFAULT_TIMES, SHIFT_META,
} from '../../../lib/rota/logic';

/* ------------------------------------------------------------------ *
 * Staff rota system — adapted from the Claude design (Rota.dc.html) to our
 * stack: Neon-backed staff and weekly grids, deterministic auto-generation,
 * and a natural-language chat bar wired to our AI. Popups use a shared Sheet
 * that centres on desktop and slides up from the bottom on mobile.
 * ------------------------------------------------------------------ */

const PRACTICE = 'The Riverside Practice';
const CARD = 'background:#fff;border:1px solid #d8dde0;border-radius:16px;';
const FIELD = 'width:100%;font-family:inherit;font-size:16px;padding:10px 12px;border:2px solid #4c6272;border-radius:4px;background:#fff;color:#212b32;';
const GREEN_BTN = 'font-family:inherit;font-weight:700;color:#fff;background:#007f3b;border:none;border-radius:8px;cursor:pointer;box-shadow:0 4px 0 #003419;';

function api(url, opts) {
  return fetch(url, opts).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error || 'Request failed');
    return d;
  });
}

// Popup wrapper: dialog on desktop, bottom sheet on mobile (see globals.css).
function Sheet({ maxWidth = 460, onClose, children }) {
  return (
    <div className="riva-modal-overlay" onClick={onClose}>
      <div className="riva-sheet" style={{ maxWidth: maxWidth + 'px' }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export default function RotaSystem() {
  const [page, setPage] = React.useState('rota');
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [staff, setStaff] = React.useState([]);
  const [staffStatus, setStaffStatus] = React.useState('loading');
  const [cache, setCache] = React.useState({});       // weekISO -> schedule {grid,times} | null
  const [status, setStatus] = React.useState({});     // weekISO -> 'loading'|'done'|'error'
  const [busy, setBusy] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const [warning, setWarning] = React.useState(null); // { issues, undo }
  const [confirm, setConfirm] = React.useState(null);
  const [chatInput, setChatInput] = React.useState('');

  // staff page editing
  const [showAdd, setShowAdd] = React.useState(false);
  const [draft, setDraft] = React.useState({ name: '', about: '' });
  const [editId, setEditId] = React.useState(null);
  const [editDraft, setEditDraft] = React.useState({ name: '', about: '', leave: [], start: '', end: '' });

  const toastTimer = React.useRef(null);
  function flash(msg) {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }

  const weekISO = isoOf(mondayPlusWeeks(weekOffset));
  const todayMondayISO = isoOf(currentMonday());
  const isReadOnly = weekISO < todayMondayISO;
  const schedule = cache[weekISO] || null;
  const grid = schedule && schedule.grid ? schedule.grid : null;
  const times = (schedule && schedule.times && schedule.times.E) ? schedule.times : DEFAULT_TIMES;
  const hasRota = !!grid;
  const canEdit = hasRota && !isReadOnly;
  const days = weekDays(weekISO);

  React.useEffect(() => { loadStaff(); }, []);
  React.useEffect(() => { if (status[weekISO] === undefined) loadRota(weekISO); /* eslint-disable-next-line */ }, [weekISO]);

  async function loadStaff() {
    setStaffStatus('loading');
    try {
      const d = await api('/api/staff');
      setStaff(Array.isArray(d.staff) ? d.staff : []);
      setStaffStatus('done');
    } catch (e) { setStaffStatus('error'); }
  }

  async function loadRota(iso) {
    setStatus((m) => ({ ...m, [iso]: 'loading' }));
    try {
      const d = await api('/api/rota?week=' + iso);
      setCache((c) => ({ ...c, [iso]: d.rota ? d.rota.schedule : null }));
      setStatus((m) => ({ ...m, [iso]: 'done' }));
    } catch (e) { setStatus((m) => ({ ...m, [iso]: 'error' })); }
  }

  async function generate() {
    setBusy(true);
    try {
      const d = await api('/api/rota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStarting: weekISO }) });
      setCache((c) => ({ ...c, [weekISO]: d.rota.schedule }));
      const issues = analyze(d.rota.schedule.grid, staff);
      flash(issues.length ? 'Generated — a few things could be tidied. Ask me to “rebalance”.' : 'Generated a balanced week.');
    } catch (e) { flash(e.message); } finally { setBusy(false); }
  }

  async function saveGrid(newGrid, prevSchedule) {
    setCache((c) => ({ ...c, [weekISO]: { grid: newGrid, times } }));
    try {
      await api('/api/rota', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStarting: weekISO, grid: newGrid, times }) });
    } catch (e) {
      setCache((c) => ({ ...c, [weekISO]: prevSchedule })); // roll back on failure
      flash(e.message);
    }
  }

  function cycleCell(id, d) {
    if (!canEdit) return;
    const cur = grid[id] ? grid[id][d] : null;
    if (cur === 'AL') return; // leave is fixed
    const order = ['E', 'L', 'OFF'];
    let idx = order.indexOf(cur);
    const next = order[(idx + 1) % 3];
    const prevSchedule = schedule;
    const newGrid = {};
    Object.keys(grid).forEach((k) => { newGrid[k] = grid[k].slice(); });
    if (!newGrid[id]) newGrid[id] = ['OFF', 'OFF', 'OFF', 'OFF', 'OFF'];
    newGrid[id][d] = next;
    saveGrid(newGrid, prevSchedule);
    const issues = analyze(newGrid, staff);
    if (issues.length) setWarning({ issues, undo: () => saveGrid(prevSchedule.grid, prevSchedule) });
  }

  async function sendChat() {
    const message = chatInput.trim();
    if (!message) return;
    if (isReadOnly) { flash('This is a published past week and is locked. Switch to a current or future week to make changes.'); return; }
    if (!hasRota) { flash('Generate a rota for this week first.'); return; }
    setChatInput('');
    setBusy(true);
    flash('Working on it…');
    try {
      const d = await api('/api/rota/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStarting: weekISO, message }) });
      setCache((c) => ({ ...c, [weekISO]: d.rota.schedule }));
      flash(d.reply || 'Done.');
      if (Array.isArray(d.issues) && d.issues.length) setWarning({ issues: d.issues, undo: null });
    } catch (e) { flash(e.message); } finally { setBusy(false); }
  }

  function copyWhatsApp() {
    const text = buildWhatsApp(grid, staff, weekISO, times, PRACTICE);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => flash('Copied — paste it straight into WhatsApp.')).catch(() => flash("Couldn't copy automatically."));
    } else flash("Copying isn't available here.");
  }

  // ---- staff actions ----
  async function addStaff() {
    const name = draft.name.trim();
    if (!name) { flash('Enter a name.'); return; }
    try {
      const d = await api('/api/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, about: draft.about.trim(), leave: [] }) });
      setStaff((prev) => [...prev, d.staff].sort((a, b) => a.name.localeCompare(b.name)));
      setDraft({ name: '', about: '' });
      setShowAdd(false);
      flash(firstName(name) + ' added.');
    } catch (e) { flash(e.message); }
  }

  function startEdit(p) {
    setEditId(p.id);
    setEditDraft({ name: p.name, about: p.about || '', leave: (p.leave || []).slice(), start: '', end: '' });
  }
  function addLeave() {
    const { start, end } = editDraft;
    if (!start) return;
    const lv = { start, end: end || start };
    setEditDraft((d) => ({ ...d, leave: [...d.leave, lv].sort((a, b) => a.start.localeCompare(b.start)), start: '', end: '' }));
  }
  function removeLeave(i) { setEditDraft((d) => ({ ...d, leave: d.leave.filter((_, j) => j !== i) })); }
  async function saveEdit() {
    const name = editDraft.name.trim();
    if (!name) { flash('Enter a name.'); return; }
    try {
      const d = await api('/api/staff', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, name, about: editDraft.about.trim(), leave: editDraft.leave }) });
      setStaff((prev) => prev.map((x) => (x.id === editId ? d.staff : x)).sort((a, b) => a.name.localeCompare(b.name)));
      setEditId(null);
      flash('Saved.');
    } catch (e) { flash(e.message); }
  }
  function askRemove(p) {
    setConfirm({
      title: 'Remove staff member', message: 'Remove ' + p.name + " from the team? This can't be undone.",
      confirmLabel: 'Remove', noLabel: 'Cancel',
      onConfirm: async () => {
        setConfirm(null);
        try { await api('/api/staff?id=' + p.id, { method: 'DELETE' }); setStaff((prev) => prev.filter((x) => x.id !== p.id)); flash('Removed.'); }
        catch (e) { flash(e.message); }
      },
    });
  }

  const weekLabel = weekOffset === 0 ? 'This week' : weekOffset === -1 ? 'Last week' : weekOffset === 1 ? 'Next week' : (weekOffset < 0 ? Math.abs(weekOffset) + ' weeks ago' : 'In ' + weekOffset + ' weeks');
  const curStatus = status[weekISO];

  return (
    <div>
      {/* Sub-navigation */}
      <div style={s('display:inline-flex;gap:3px;background:#fff;border:1px solid #d8dde0;border-radius:999px;padding:3px;margin-bottom:24px;')}>
        {[{ k: 'rota', label: 'Rota', icon: Icons.calendar }, { k: 'staff', label: 'Staff', icon: Icons.book }].map((t) => {
          const active = page === t.k;
          return (
            <Hover key={t.k} tag="button" onClick={() => setPage(t.k)}
              base={'display:inline-flex;align-items:center;gap:7px;border:none;border-radius:999px;padding:8px 18px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;' + (active ? 'background:#005eb8;color:#fff;' : 'background:none;color:#4c6272;')}
              hover={active ? '' : 'color:#212b32;'}>
              <Svg w={16} sw={2}>{t.icon}</Svg>{t.label}
            </Hover>
          );
        })}
      </div>

      {page === 'rota' ? renderRota() : renderStaff()}

      {/* Toast + chat bar (rota page) */}
      {page === 'rota' && (
        <div style={s('position:fixed;left:0;right:0;bottom:0;z-index:50;pointer-events:none;')}>
          <div style={s('max-width:1000px;margin:0 auto;padding:0 16px 16px;display:flex;flex-direction:column;')}>
            {toast && <div style={s('pointer-events:auto;align-self:flex-start;background:#212b32;color:#fff;border-radius:10px;padding:11px 16px;font-size:14px;line-height:1.45;margin-bottom:10px;box-shadow:0 6px 20px rgba(33,43,50,.22);white-space:pre-wrap;max-width:560px;')}>{toast}</div>}
            {hasRota && !isReadOnly && (
              <div style={s('pointer-events:auto;display:flex;align-items:center;gap:10px;background:#fff;border:2px solid #005eb8;border-radius:999px;padding:6px 6px 6px 18px;box-shadow:0 4px 16px rgba(33,43,50,.12);')}>
                <Svg w={20} stroke="#005eb8" sw={2} style={s('flex:none;')}>{Icons.sparkle}</Svg>
                <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }} placeholder="Ask for any change — move shifts, days off, swaps…" style={s('flex:1;border:none;outline:none;background:transparent;font:inherit;font-size:16px;color:#212b32;min-width:0;')} />
                <Hover tag="button" onClick={sendChat} aria-label="Send" disabled={busy} base={'flex:none;width:42px;height:42px;border-radius:999px;border:none;background:#005eb8;color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;' + (busy ? 'opacity:.6;' : '')} hover="background:#004a93;"><Svg w={20} sw={2.2}>{Icons.arrow}</Svg></Hover>
              </div>
            )}
          </div>
        </div>
      )}

      {warning && (
        <Sheet maxWidth={470} onClose={() => setWarning(null)}>
          <div style={s('display:flex;align-items:center;gap:12px;padding:22px 24px 14px;')}>
            <span style={s('flex:none;width:42px;height:42px;border-radius:50%;background:#fff6cc;color:#946800;display:flex;align-items:center;justify-content:center;')}><Svg w={23} sw={2.2}>{Icons.triangle}</Svg></span>
            <h2 style={s('font-size:21px;font-weight:700;margin:0;')}>Heads up — this causes an issue</h2>
          </div>
          <div style={s('padding:0 24px 18px;')}>
            <ul style={s('margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px;')}>
              {warning.issues.map((iss, i) => <li key={i} style={s('font-size:16px;line-height:1.45;color:#212b32;')}>{iss}</li>)}
            </ul>
          </div>
          <div style={s('display:flex;gap:10px;padding:0 24px 22px;flex-wrap:wrap;')}>
            <Hover tag="button" onClick={() => { setWarning(null); generate(); }} base={GREEN_BTN + 'font-size:15px;padding:11px 18px;'} active="transform:translateY(4px);box-shadow:none;">Auto-rebalance</Hover>
            {warning.undo && <Hover tag="button" onClick={() => { warning.undo(); setWarning(null); flash('Change undone.'); }} base="font-family:inherit;font-size:15px;font-weight:600;color:#005eb8;background:#fff;border:1px solid #aeb7bd;border-radius:8px;padding:11px 18px;cursor:pointer;" hover="background:#f0f4f5;">Undo change</Hover>}
            <Hover tag="button" onClick={() => setWarning(null)} base="font-family:inherit;font-size:15px;font-weight:600;color:#4c6272;background:transparent;border:none;border-radius:8px;padding:11px 14px;cursor:pointer;" hover="color:#212b32;">Keep anyway</Hover>
          </div>
        </Sheet>
      )}

      {confirm && (
        <Sheet maxWidth={420} onClose={() => setConfirm(null)}>
          <div style={s('padding:24px 24px 8px;')}>
            <h2 style={s('font-size:21px;font-weight:700;margin:0 0 8px;')}>{confirm.title}</h2>
            <p style={s('font-size:16px;line-height:1.5;margin:0;color:#4c6272;')}>{confirm.message}</p>
          </div>
          <div style={s('display:flex;gap:10px;padding:16px 24px 22px;')}>
            <Hover tag="button" onClick={confirm.onConfirm} base="font-family:inherit;font-size:16px;font-weight:700;color:#fff;background:#d5281b;border:none;border-radius:8px;padding:11px 22px;cursor:pointer;box-shadow:0 4px 0 #7a160d;" active="transform:translateY(4px);box-shadow:none;">{confirm.confirmLabel}</Hover>
            <Hover tag="button" onClick={() => setConfirm(null)} base="font-family:inherit;font-size:16px;font-weight:600;color:#4c6272;background:transparent;border:none;border-radius:8px;padding:11px 16px;cursor:pointer;" hover="color:#212b32;">{confirm.noLabel || 'Cancel'}</Hover>
          </div>
        </Sheet>
      )}
    </div>
  );

  // ----------------------------------------------------------------- views

  function renderRota() {
    return (
      <div style={s('padding-bottom:120px;')}>
        <div style={s('display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:20px;')}>
          <div>
            <h1 className="riva-hero-h1" style={s('font-size:36px;font-weight:700;margin:0;letter-spacing:-0.01em;')}>Duty rota</h1>
            <p style={s('font-size:17px;color:#4c6272;margin:6px 0 0;')}>2 staff minimum on every shift · early and late shared evenly</p>
          </div>
          <div style={s('display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #d8dde0;border-radius:999px;padding:4px;')}>
            <Hover tag="button" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Previous week" base="width:40px;height:40px;border-radius:999px;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#005eb8;" hover="background:#e8f1f8;"><Svg w={20} sw={2.5}>{Icons.chevronLeft}</Svg></Hover>
            <div style={s('text-align:center;min-width:172px;padding:0 6px;')}>
              <div style={s('font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#768692;')}>{weekLabel}</div>
              <div style={s('font-size:16px;font-weight:700;color:#212b32;font-variant-numeric:tabular-nums;')}>{weekRangeLabel(weekISO)}</div>
            </div>
            <Hover tag="button" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week" base="width:40px;height:40px;border-radius:999px;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#005eb8;" hover="background:#e8f1f8;"><Svg w={20} sw={2.5}>{Icons.chevronRight}</Svg></Hover>
          </div>
        </div>

        {isReadOnly && (
          <div style={s('display:flex;align-items:center;gap:10px;background:#e8edee;border:1px solid #d8dde0;border-radius:8px;padding:12px 16px;font-size:16px;color:#4c6272;margin-bottom:16px;')}>
            <Svg w={20} sw={2}>{Icons.lock}</Svg>Past week — locked and can't be changed.
          </div>
        )}

        {curStatus === 'loading' && <div style={s('color:#4c6272;font-size:16px;padding:24px 0;')}>Loading…</div>}

        {curStatus === 'done' && !hasRota && (
          <div style={s(CARD + 'padding:48px 32px;text-align:center;')}>
            <div style={s('width:72px;height:72px;border-radius:50%;background:#e8f1f8;color:#005eb8;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;')}><Svg w={36} sw={2}>{Icons.calendar}</Svg></div>
            <h2 style={s('font-size:26px;font-weight:700;margin:0 0 8px;')}>No rota for this week yet</h2>
            <p style={s('font-size:17px;color:#4c6272;margin:0 auto 24px;max-width:30em;')}>Generate a balanced week in one click. We keep 2 staff on every shift, work around annual leave, and share early and late evenly.</p>
            {staff.length === 0
              ? <p style={s('font-size:15px;color:#768692;')}>Add staff on the Staff tab first.</p>
              : <Hover tag="button" onClick={generate} disabled={busy} base={GREEN_BTN + 'font-size:18px;padding:15px 26px;display:inline-flex;align-items:center;gap:10px;' + (busy ? 'opacity:.6;' : '')} active="transform:translateY(4px);box-shadow:none;"><Svg w={21} sw={2.2}>{Icons.sparkle}</Svg>{busy ? 'Generating…' : 'Auto-generate rota'}</Hover>}
          </div>
        )}

        {hasRota && renderGrid()}
      </div>
    );
  }

  function renderGrid() {
    const cols = `64px repeat(${staff.length}, minmax(64px, 1fr))`;
    return (
      <>
        <div style={s('display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px;flex-wrap:wrap;')}>
          <div style={s('display:flex;align-items:center;gap:16px;flex-wrap:wrap;')}>
            <span style={s('display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#4c6272;')}><span style={s('width:11px;height:11px;border-radius:3px;background:' + SHIFT_META.E.bg + ';')} />Early {shiftRange(times, 'E')}</span>
            <span style={s('display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#4c6272;')}><span style={s('width:11px;height:11px;border-radius:3px;background:' + SHIFT_META.L.bg + ';')} />Late {shiftRange(times, 'L')}</span>
            <span style={s('display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#4c6272;')}><span style={s('width:11px;height:11px;border-radius:3px;background:' + SHIFT_META.AL.bg + ';')} />Leave</span>
          </div>
          <div style={s('display:flex;align-items:center;gap:10px;')}>
            {canEdit && <Hover tag="button" onClick={generate} disabled={busy} base="font-family:inherit;font-size:15px;font-weight:600;color:#005eb8;background:#fff;border:1px solid #aeb7bd;border-radius:8px;padding:9px 16px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;" hover="background:#f0f4f5;"><Svg w={17} sw={2.2}>{Icons.refresh}</Svg>Regenerate</Hover>}
            <Hover tag="button" onClick={copyWhatsApp} base="font-family:inherit;font-size:15px;font-weight:700;color:#fff;background:#005eb8;border:none;border-radius:8px;padding:10px 18px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;" hover="background:#004a93;"><Svg w={18}>{Icons.copy}</Svg>Copy for WhatsApp</Hover>
          </div>
        </div>

        <div style={s(CARD + 'padding:4px 8px;overflow-x:auto;')}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '6px', padding: '12px 8px' }}>
            <div />
            {staff.map((p) => (
              <div key={p.id} style={s('display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;')}>
                <span style={s('flex:none;width:34px;height:34px;border-radius:50%;background:#e8f1f8;color:#003087;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;')}>{initials(p.name)}</span>
                <span style={s('max-width:100%;font-size:13px;font-weight:600;color:#212b32;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>{firstName(p.name)}</span>
              </div>
            ))}
          </div>
          {days.map((day, d) => (
            <div key={d} style={{ display: 'grid', gridTemplateColumns: cols, gap: '6px', padding: '4px 8px', borderTop: '1px solid #eef1f2', alignItems: 'stretch' }}>
              <div style={s('display:flex;flex-direction:column;justify-content:center;min-width:0;padding:4px 2px;')}>
                <b style={s('font-size:15px;line-height:1.2;color:#212b32;')}>{day.short}</b>
                <span style={s('font-size:12px;color:#768692;font-variant-numeric:tabular-nums;')}>{day.date}</span>
              </div>
              {staff.map((p) => {
                const code = grid[p.id] ? grid[p.id][d] : null;
                const cv = cellView(code, times);
                const clickable = canEdit && code !== 'AL';
                return (
                  <Hover key={p.id} tag="button" onClick={() => cycleCell(p.id, d)} title={firstName(p.name)} disabled={!clickable}
                    base={'display:flex;align-items:center;justify-content:center;padding:8px;border-radius:8px;min-height:46px;text-align:center;border:none;background:' + cv.bg + ';cursor:' + (clickable ? 'pointer' : 'default') + ';'}
                    hover={clickable ? 'box-shadow:inset 0 0 0 2px rgba(0,94,184,.28);' : ''}>
                    <span style={s('font-weight:600;font-size:12.5px;color:' + cv.color + ';font-variant-numeric:tabular-nums;')}>{cv.main}</span>
                  </Hover>
                );
              })}
            </div>
          ))}
        </div>
      </>
    );
  }

  function renderStaff() {
    return (
      <div>
        <div style={s('display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:24px;')}>
          <div>
            <h1 className="riva-hero-h1" style={s('font-size:36px;font-weight:700;margin:0;letter-spacing:-0.01em;')}>Staff</h1>
            <p style={s('font-size:17px;color:#4c6272;margin:6px 0 0;')}>{staff.length} {staff.length === 1 ? 'person' : 'people'} on the reception rota</p>
          </div>
          <Hover tag="button" onClick={() => { setShowAdd((v) => !v); setDraft({ name: '', about: '' }); }} base={GREEN_BTN + 'font-size:16px;padding:12px 20px;display:inline-flex;align-items:center;gap:9px;'} active="transform:translateY(4px);box-shadow:none;"><Svg w={20} sw={2.4}>{Icons.plus}</Svg>Add staff</Hover>
        </div>

        {showAdd && (
          <div style={s(CARD + 'padding:24px;margin-bottom:24px;')}>
            <h2 style={s('font-size:22px;font-weight:700;margin:0 0 18px;')}>Add a staff member</h2>
            <label style={s('display:block;font-size:15px;font-weight:700;margin-bottom:6px;')}>Name</label>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Sarah Hughes" style={s(FIELD + 'margin-bottom:16px;')} />
            <label style={s('display:block;font-size:15px;font-weight:700;margin-bottom:6px;')}>Description</label>
            <textarea value={draft.about} onChange={(e) => setDraft({ ...draft, about: e.target.value })} rows={3} placeholder="What they do, what they're good at, anything the rota should know." style={s(FIELD + 'resize:vertical;')} />
            <div style={s('display:flex;gap:10px;margin-top:20px;')}>
              <Hover tag="button" onClick={addStaff} base={GREEN_BTN + 'font-size:16px;padding:11px 22px;'} active="transform:translateY(4px);box-shadow:none;">Add staff member</Hover>
              <Hover tag="button" onClick={() => setShowAdd(false)} base="font-family:inherit;font-size:16px;font-weight:600;color:#4c6272;background:transparent;border:none;border-radius:8px;padding:11px 16px;cursor:pointer;" hover="color:#212b32;">Cancel</Hover>
            </div>
          </div>
        )}

        {staffStatus === 'error' && <div style={s('color:#d5281b;font-size:15px;margin-bottom:12px;')}>Could not load staff. <Hover tag="button" onClick={loadStaff} base="background:none;border:none;color:#005eb8;font:inherit;font-weight:600;text-decoration:underline;cursor:pointer;padding:0;" hover="color:#003087;">Retry</Hover></div>}

        <div style={s('display:flex;flex-direction:column;gap:14px;')}>
          {staff.map((p) => (
            <div key={p.id} className="rota-staffcard" style={s(CARD + 'padding:20px;')}>
              {editId === p.id ? renderEdit(p) : (
                <div style={s('display:flex;align-items:flex-start;gap:16px;')}>
                  <span style={s('flex:none;width:48px;height:48px;border-radius:50%;background:#005eb8;color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;')}>{initials(p.name)}</span>
                  <div style={s('flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;')}>
                    <b style={s('font-size:19px;font-weight:700;')}>{p.name}</b>
                    <p style={s('font-size:16px;line-height:1.5;margin:0;color:#212b32;')}>{p.about || 'No description yet.'}</p>
                    {(p.leave || []).length > 0 && (
                      <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:2px;')}>
                        <span style={s('font-size:13px;font-weight:600;color:#768692;')}>On leave</span>
                        {(p.leave || []).map((lv, i) => <span key={i} style={s('font-size:13px;font-weight:600;color:#6b5601;background:#fff6cc;border-radius:6px;padding:3px 10px;')}>{lv.start === lv.end ? lv.start : lv.start + ' → ' + lv.end}</span>)}
                      </div>
                    )}
                  </div>
                  <div style={s('flex:none;display:flex;gap:8px;')}>
                    <Hover tag="button" onClick={() => startEdit(p)} aria-label="Edit" base="border:none;background:#f0f4f5;border-radius:8px;padding:8px;cursor:pointer;color:#4c6272;display:flex;" hover="background:#e8f1f8;color:#005eb8;"><Svg w={18}>{Icons.edit}</Svg></Hover>
                    <Hover tag="button" onClick={() => askRemove(p)} aria-label="Remove" base="border:none;background:#f0f4f5;border-radius:8px;padding:8px;cursor:pointer;color:#768692;display:flex;" hover="background:#f6dedc;color:#d5281b;"><Svg w={18}>{Icons.trash}</Svg></Hover>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderEdit(p) {
    return (
      <div style={s('display:flex;flex-direction:column;gap:14px;')}>
        <div>
          <label style={s('display:block;font-size:14px;font-weight:700;margin-bottom:5px;')}>Name</label>
          <input value={editDraft.name} onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })} style={s(FIELD)} />
        </div>
        <div>
          <label style={s('display:block;font-size:14px;font-weight:700;margin-bottom:5px;')}>Description</label>
          <textarea value={editDraft.about} onChange={(e) => setEditDraft({ ...editDraft, about: e.target.value })} rows={3} style={s(FIELD + 'resize:vertical;')} />
        </div>
        <div>
          <label style={s('display:block;font-size:14px;font-weight:700;margin-bottom:5px;')}>Annual leave</label>
          <div style={s('display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;')}>
            {editDraft.leave.length === 0 && <span style={s('font-size:14px;color:#768692;')}>None booked yet.</span>}
            {editDraft.leave.map((lv, i) => (
              <span key={i} style={s('display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:#6b5601;background:#fff6cc;border-radius:6px;padding:6px 8px 6px 12px;')}>
                {lv.start === lv.end ? lv.start : lv.start + ' → ' + lv.end}
                <Hover tag="button" onClick={() => removeLeave(i)} aria-label="Remove leave" base="border:none;background:transparent;cursor:pointer;color:#946800;display:flex;padding:1px;" hover="color:#d5281b;"><Svg w={15} sw={2.4}>{Icons.close}</Svg></Hover>
              </span>
            ))}
          </div>
          <div style={s('display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
            <input type="date" value={editDraft.start} onChange={(e) => setEditDraft({ ...editDraft, start: e.target.value })} aria-label="Leave start" style={s('height:42px;box-sizing:border-box;font:inherit;font-size:16px;padding:0 12px;border:2px solid #4c6272;border-radius:4px;background:#fff;')} />
            <span style={s('font-size:16px;color:#4c6272;')}>to</span>
            <input type="date" value={editDraft.end} onChange={(e) => setEditDraft({ ...editDraft, end: e.target.value })} aria-label="Leave end" style={s('height:42px;box-sizing:border-box;font:inherit;font-size:16px;padding:0 12px;border:2px solid #4c6272;border-radius:4px;background:#fff;')} />
            <Hover tag="button" onClick={addLeave} base="height:42px;box-sizing:border-box;white-space:nowrap;font:inherit;font-size:16px;font-weight:700;color:#fff;background:#005eb8;border:none;border-radius:8px;padding:0 18px;cursor:pointer;" hover="background:#004a93;">Add leave</Hover>
          </div>
        </div>
        <div style={s('display:flex;gap:10px;margin-top:2px;')}>
          <Hover tag="button" onClick={saveEdit} base={GREEN_BTN + 'height:42px;box-sizing:border-box;font-size:16px;padding:0 22px;'} active="transform:translateY(4px);box-shadow:none;">Save changes</Hover>
          <Hover tag="button" onClick={() => setEditId(null)} base="height:42px;box-sizing:border-box;font:inherit;font-size:16px;font-weight:600;color:#4c6272;background:transparent;border:none;border-radius:8px;padding:0 16px;cursor:pointer;" hover="color:#212b32;">Cancel</Hover>
        </div>
      </div>
    );
  }
}
