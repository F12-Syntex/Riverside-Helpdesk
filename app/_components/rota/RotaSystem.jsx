'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';
import { notify } from '../notify';
import {
  weekDays, weekRangeLabel, mondayPlusWeeks, isoOf, currentMonday,
  initials, firstName, cellView, analyze, buildWhatsApp, shiftRange,
  DEFAULT_TIMES, SHIFT_META,
} from '../../../lib/rota/logic';

/* ------------------------------------------------------------------ *
 * Staff rota system — adapted from the Claude design (Rota.dc.html).
 * Neon-backed staff and weekly grids, deterministic auto-generation, a
 * natural-language chat bar (AI, applies then rebalances), per-week undo/redo,
 * a desktop grid + a per-staff card view on mobile, and bottom-sheet popups.
 * The Rota/Staff switch lives in the header; `page` is passed in.
 * ------------------------------------------------------------------ */

const CARD = 'background:#141416;border:1px solid #26262a;border-radius:16px;';
const FIELD = 'width:100%;font-family:inherit;font-size:16px;padding:10px 12px;border:2px solid #9a9aa3;border-radius:4px;background:#141416;color:#e9e9ec;';
const GREEN_BTN = 'font-family:inherit;font-weight:700;color:#ffffff;background:#56c98a;border:none;border-radius:8px;cursor:pointer;box-shadow:0 4px 0 #9de8bf;';
const ICON_BTN = 'width:40px;height:40px;border-radius:8px;border:1px solid #55555e;background:#141416;color:#e0554f;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;';
const TEMP_TAG = 'display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.03em;color:#ebc984;background:#1e1e22;border:1px solid #51442a;border-radius:5px;padding:1px 6px;text-transform:uppercase;';

function api(url, opts) {
  return fetch(url, opts).then(async (r) => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error || 'Request failed');
    return d;
  });
}

function Sheet({ maxWidth = 460, onClose, children }) {
  return (
    <div className="riva-modal-overlay" onClick={onClose}>
      <div className="riva-sheet" style={{ maxWidth: maxWidth + 'px' }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export default function RotaSystem({ page = 'rota' }) {
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [staff, setStaff] = React.useState([]);
  const [staffStatus, setStaffStatus] = React.useState('loading');
  const [cache, setCache] = React.useState({});   // weekISO -> schedule | null
  const [status, setStatus] = React.useState({});  // weekISO -> 'loading'|'done'|'error'
  const [hist, setHist] = React.useState({});      // weekISO -> { stack:[schedule], ptr }
  const [busy, setBusy] = React.useState(false);
  const [warning, setWarning] = React.useState(null);
  const [confirm, setConfirm] = React.useState(null);
  const [chatInput, setChatInput] = React.useState('');

  const [showAdd, setShowAdd] = React.useState(false);
  const [draft, setDraft] = React.useState({ name: '', about: '', phone: '', temporary: false });
  const [editId, setEditId] = React.useState(null);
  const [editDraft, setEditDraft] = React.useState({ name: '', about: '', phone: '', temporary: false, leave: [], start: '', end: '' });
  // Which temporary-staff cell is being set by hand (the bottom-sheet picker).
  const [cellEdit, setCellEdit] = React.useState(null); // { staffId, day } | null

  function flash(msg, type) { notify(msg, type || 'info'); }

  const weekISO = isoOf(mondayPlusWeeks(weekOffset));
  const todayMondayISO = isoOf(currentMonday());
  // The earliest week the rota goes back to: the first seeded official week
  // (15–19 Jun 2026). Browsing can't step before it.
  const EARLIEST_MONDAY_ISO = '2026-06-15';
  const minWeekOffset = Math.round((new Date(EARLIEST_MONDAY_ISO + 'T00:00:00').getTime() - currentMonday().getTime()) / (7 * 86400000));
  const canGoBack = weekOffset > minWeekOffset;
  // Official weeks — this week and earlier — are the published record and are
  // locked; only future weeks can be generated or edited.
  const isReadOnly = weekISO <= todayMondayISO;
  const schedule = cache[weekISO] || null;
  const grid = schedule && schedule.grid ? schedule.grid : null;
  const times = (schedule && schedule.times && schedule.times.E) ? schedule.times : DEFAULT_TIMES;
  const rules = schedule && Array.isArray(schedule.rules) ? schedule.rules : [];
  const seed = schedule && Number.isInteger(schedule.seed) ? schedule.seed : null;
  const hasRota = !!grid;
  const canEdit = hasRota && !isReadOnly;
  // Who the grid shows for this week. Locked (past/current) weeks render from
  // the roster frozen into the saved schedule, so they stay correct even after
  // a staff member is deleted. Editable weeks use the live team.
  const roster = (isReadOnly && schedule && Array.isArray(schedule.staff) && schedule.staff.length) ? schedule.staff : staff;
  const days = weekDays(weekISO);
  const h = hist[weekISO];
  const canUndo = !!h && h.ptr > 0 && canEdit;
  const canRedo = !!h && h.ptr < h.stack.length - 1 && canEdit;
  const curStatus = status[weekISO];

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
      const sched = d.rota ? d.rota.schedule : null;
      setCache((c) => ({ ...c, [iso]: sched }));
      setHist((x) => (x[iso] !== undefined ? x : { ...x, [iso]: sched ? { stack: [sched], ptr: 0 } : { stack: [], ptr: -1 } }));
      setStatus((m) => ({ ...m, [iso]: 'done' }));
    } catch (e) { setStatus((m) => ({ ...m, [iso]: 'error' })); }
  }

  function pushHist(iso, sched) {
    setHist((x) => {
      const cur = x[iso] || { stack: [], ptr: -1 };
      const stack = cur.stack.slice(0, cur.ptr + 1).concat([sched]).slice(-40);
      return { ...x, [iso]: { stack, ptr: stack.length - 1 } };
    });
  }

  function persist(sched) {
    api('/api/rota', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStarting: weekISO, grid: sched.grid, times: sched.times, rules: sched.rules || [], seed: sched.seed }) }).catch(() => {});
  }

  // Hand-set one day for a temporary staff member (early / late / blank). Saves
  // straight away and records an undo step. Leave days are managed in the staff
  // editor, so they're left untouched here.
  function setTempCell(staffId, day, code) {
    if (!canEdit || !grid) { setCellEdit(null); return; }
    const row = (grid[staffId] || [null, null, null, null, null]).slice();
    if (row[day] === 'AL') { setCellEdit(null); return; }
    row[day] = code; // 'E' | 'L' | null (blank = not working)
    const sched = { ...schedule, grid: { ...grid, [staffId]: row } };
    setCache((c) => ({ ...c, [weekISO]: sched }));
    pushHist(weekISO, sched);
    persist(sched);
    setCellEdit(null);
  }

  // (Re)generate: deterministic base + AI applies the rule list on top.
  async function applyRules(nextRules, nextSeed) {
    setBusy(true);
    try {
      const d = await api('/api/rota', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ weekStarting: weekISO, rules: nextRules, seed: nextSeed }) });
      const sched = d.rota.schedule;
      setCache((c) => ({ ...c, [weekISO]: sched }));
      pushHist(weekISO, sched);
      return sched;
    } finally { setBusy(false); }
  }

  async function generate() {
    try {
      const sched = await applyRules(rules, Math.floor(Math.random() * 100000));
      const issues = analyze(sched.grid, staff);
      flash(issues.length ? 'Done. A couple of things could still be tidied.' : 'Done: a balanced week.', 'success');
    } catch (e) { flash(e.message, 'error'); }
  }

  async function addRule(text) {
    const rule = String(text || '').trim();
    if (!rule) return;
    if (isReadOnly) { flash('This week is locked.', 'error'); return; }
    if (!hasRota) { flash('Generate a rota for this week first.', 'error'); return; }
    try { await applyRules([...rules, rule], seed != null ? seed : Math.floor(Math.random() * 100000)); flash('Added rule: ' + rule, 'success'); }
    catch (e) { flash(e.message, 'error'); }
  }

  async function removeRule(i) {
    try { await applyRules(rules.filter((_, j) => j !== i), seed != null ? seed : Math.floor(Math.random() * 100000)); flash('Rule removed.'); }
    catch (e) { flash(e.message, 'error'); }
  }

  function undo() {
    const hh = hist[weekISO];
    if (!hh || hh.ptr <= 0) return;
    const ptr = hh.ptr - 1;
    const sched = hh.stack[ptr];
    setHist((x) => ({ ...x, [weekISO]: { ...hh, ptr } }));
    setCache((c) => ({ ...c, [weekISO]: sched }));
    persist(sched);
  }
  function redo() {
    const hh = hist[weekISO];
    if (!hh || hh.ptr >= hh.stack.length - 1) return;
    const ptr = hh.ptr + 1;
    const sched = hh.stack[ptr];
    setHist((x) => ({ ...x, [weekISO]: { ...hh, ptr } }));
    setCache((c) => ({ ...c, [weekISO]: sched }));
    persist(sched);
  }

  function sendChat(e) {
    if (e && e.preventDefault) e.preventDefault();
    const message = chatInput.trim();
    if (!message) return;
    setChatInput('');
    addRule(message);
  }

  function askDeleteRota() {
    setConfirm({
      title: 'Delete this rota',
      message: 'Clear the rota for ' + weekRangeLabel(weekISO) + '? You can auto-generate a fresh one afterwards. Any rules added to this week are removed too.',
      confirmLabel: 'Delete rota', noLabel: 'Cancel',
      onConfirm: async () => {
        setConfirm(null);
        try {
          await api('/api/rota?week=' + weekISO, { method: 'DELETE' });
          setCache((c) => ({ ...c, [weekISO]: null }));
          setHist((x) => ({ ...x, [weekISO]: { stack: [], ptr: -1 } }));
          flash('Rota cleared. Generate a fresh one whenever you like.');
        } catch (e) { flash(e.message, 'error'); }
      },
    });
  }

  function copyWhatsApp() {
    const text = buildWhatsApp(grid, roster, weekISO, times);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => flash('Copied. Paste it straight into WhatsApp.')).catch(() => flash('Could not copy automatically.'));
    } else flash('Copying is not available here.');
  }

  // staff actions
  async function addStaff() {
    const name = draft.name.trim();
    if (!name) { flash('Enter a name.'); return; }
    try {
      const d = await api('/api/staff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, about: draft.about.trim(), phone: draft.phone.trim(), temporary: !!draft.temporary, leave: [] }) });
      setStaff((prev) => [...prev, d.staff].sort((a, b) => a.name.localeCompare(b.name)));
      setDraft({ name: '', about: '', phone: '', temporary: false });
      setShowAdd(false);
      flash(firstName(name) + ' added.');
    } catch (e) { flash(e.message, 'error'); }
  }
  function startEdit(p) { setEditId(p.id); setEditDraft({ name: p.name, about: p.about || '', phone: p.phone || '', temporary: !!p.temporary, leave: (p.leave || []).slice(), start: '', end: '' }); }
  function addLeave() {
    const { start, end } = editDraft;
    if (!start) return;
    setEditDraft((d) => ({ ...d, leave: [...d.leave, { start, end: end || start }].sort((a, b) => a.start.localeCompare(b.start)), start: '', end: '' }));
  }
  function removeLeave(i) { setEditDraft((d) => ({ ...d, leave: d.leave.filter((_, j) => j !== i) })); }
  async function saveEdit() {
    const name = editDraft.name.trim();
    if (!name) { flash('Enter a name.'); return; }
    try {
      const d = await api('/api/staff', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editId, name, about: editDraft.about.trim(), phone: editDraft.phone.trim(), temporary: !!editDraft.temporary, leave: editDraft.leave }) });
      setStaff((prev) => prev.map((x) => (x.id === editId ? d.staff : x)).sort((a, b) => a.name.localeCompare(b.name)));
      setEditId(null);
      flash('Saved.');
    } catch (e) { flash(e.message, 'error'); }
  }
  function askRemove(p) {
    setConfirm({
      title: 'Remove staff member', message: 'Remove ' + p.name + ' from the team? This cannot be undone.', confirmLabel: 'Remove', noLabel: 'Cancel',
      onConfirm: async () => { setConfirm(null); try { await api('/api/staff?id=' + p.id, { method: 'DELETE' }); setStaff((prev) => prev.filter((x) => x.id !== p.id)); flash('Removed.'); } catch (e) { flash(e.message, 'error'); } },
    });
  }

  const weekLabel = weekOffset === 0 ? 'This week' : weekOffset === -1 ? 'Last week' : weekOffset === 1 ? 'Next week' : (weekOffset < 0 ? Math.abs(weekOffset) + ' weeks ago' : 'In ' + weekOffset + ' weeks');

  return (
    <div>
      {page === 'rota' ? renderRota() : renderStaff()}

      {/* The rule bar uses the shared floating dock (see globals.css), the
          same one the chat composer and the lookup search sit in. */}
      {page === 'rota' && hasRota && !isReadOnly && (
        <div className="riva-dock">
          <div className="riva-dock-inner" style={s('max-width:1000px;')}>
            <form onSubmit={sendChat} style={s('display:flex;gap:10px;align-items:center;')}>
              <input className="riva-input riva-dock-field" value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Add a rule, e.g. “Simin is off all week”, “Saif works with Iqra”…" style={s('flex:1;min-width:0;font:inherit;border:2px solid #26262a;border-radius:999px;background:#0b0b0c;outline:none;')} />
              <Hover tag="button" type="submit" className="riva-dock-btn" aria-label="Send" disabled={busy} base={'flex:none;width:62px;height:62px;border-radius:50%;background:#e0554f;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;' + (busy ? 'opacity:.6;' : '')} hover="background:#f0817c;"><Svg w={26} stroke="#ffffff" sw={2.2}>{Icons.up}</Svg></Hover>
            </form>
          </div>
        </div>
      )}

      {warning && (
        <Sheet maxWidth={470} onClose={() => setWarning(null)}>
          <div style={s('display:flex;align-items:center;gap:12px;padding:22px 24px 14px;')}>
            <span style={s('flex:none;width:42px;height:42px;border-radius:50%;background:#241f12;color:#d9ab52;display:flex;align-items:center;justify-content:center;')}><Svg w={23} sw={2.2}>{Icons.triangle}</Svg></span>
            <h2 style={s('font-size:21px;font-weight:700;margin:0;')}>Heads up: this causes an issue</h2>
          </div>
          <div style={s('padding:0 24px 18px;')}>
            <ul style={s('margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px;')}>
              {warning.issues.map((iss, i) => <li key={i} style={s('font-size:16px;line-height:1.45;color:#e9e9ec;')}>{iss}</li>)}
            </ul>
          </div>
          <div style={s('display:flex;gap:10px;padding:0 24px 22px;flex-wrap:wrap;')}>
            <Hover tag="button" onClick={() => { setWarning(null); generate(); }} base={GREEN_BTN + 'font-size:15px;padding:11px 18px;'} active="transform:translateY(4px);box-shadow:none;">Auto-rebalance</Hover>
            {canUndo && <Hover tag="button" onClick={() => { setWarning(null); undo(); }} base="font-family:inherit;font-size:15px;font-weight:600;color:#e0554f;background:#141416;border:1px solid #55555e;border-radius:8px;padding:11px 18px;cursor:pointer;" hover="background:#0b0b0c;">Undo change</Hover>}
            <Hover tag="button" onClick={() => setWarning(null)} base="font-family:inherit;font-size:15px;font-weight:600;color:#9a9aa3;background:transparent;border:none;border-radius:8px;padding:11px 14px;cursor:pointer;" hover="color:#e9e9ec;">Keep anyway</Hover>
          </div>
        </Sheet>
      )}

      {confirm && (
        <Sheet maxWidth={420} onClose={() => setConfirm(null)}>
          <div style={s('padding:24px 24px 8px;')}>
            <h2 style={s('font-size:21px;font-weight:700;margin:0 0 8px;')}>{confirm.title}</h2>
            <p style={s('font-size:16px;line-height:1.5;margin:0;color:#9a9aa3;')}>{confirm.message}</p>
          </div>
          <div style={s('display:flex;gap:10px;padding:16px 24px 22px;')}>
            <Hover tag="button" onClick={confirm.onConfirm} base="font-family:inherit;font-size:16px;font-weight:700;color:#ffffff;background:#ff7b72;border:none;border-radius:8px;padding:11px 22px;cursor:pointer;box-shadow:0 4px 0 #ffb3ad;" active="transform:translateY(4px);box-shadow:none;">{confirm.confirmLabel}</Hover>
            <Hover tag="button" onClick={() => setConfirm(null)} base="font-family:inherit;font-size:16px;font-weight:600;color:#9a9aa3;background:transparent;border:none;border-radius:8px;padding:11px 16px;cursor:pointer;" hover="color:#e9e9ec;">{confirm.noLabel || 'Cancel'}</Hover>
          </div>
        </Sheet>
      )}

      {cellEdit && (() => {
        const p = staff.find((x) => x.id === cellEdit.staffId);
        if (!p) return null;
        const cur = grid && grid[p.id] ? grid[p.id][cellEdit.day] : null;
        const dy = days[cellEdit.day];
        const opt = (code, title, sub, meta) => {
          const onv = cur === code || (code === null && cur !== 'E' && cur !== 'L' && cur !== 'F');
          return (
            <Hover tag="button" onClick={() => setTempCell(p.id, cellEdit.day, code)}
              base={'display:flex;align-items:center;gap:14px;width:100%;text-align:left;font-family:inherit;cursor:pointer;border-radius:12px;padding:14px 16px;border:2px solid ' + (onv ? '#e0554f' : '#1c1c1f') + ';background:' + (onv ? '#1b1b1f' : '#141416') + ';'}
              hover="border-color:#e0554f;">
              <span style={s('flex:none;width:14px;height:14px;border-radius:4px;background:' + (meta ? meta.bg : '#0b0b0c') + ';border:1px solid rgba(0,0,0,.08);')} />
              <span style={s('flex:1;min-width:0;')}>
                <b style={s('display:block;font-size:16px;color:#e9e9ec;')}>{title}</b>
                <span style={s('font-size:13.5px;color:#74747d;font-variant-numeric:tabular-nums;')}>{sub}</span>
              </span>
              {onv && <Svg w={20} stroke="#e0554f" sw={2.4}>{Icons.check}</Svg>}
            </Hover>
          );
        };
        return (
          <Sheet maxWidth={420} onClose={() => setCellEdit(null)}>
            <div style={s('padding:22px 24px 6px;')}>
              <div style={s('font-size:13px;font-weight:700;color:#74747d;text-transform:uppercase;letter-spacing:.04em;')}>{firstName(p.name)} · {dy.long} {dy.date}</div>
              <h2 style={s('font-size:21px;font-weight:700;margin:6px 0 0;')}>Set shift</h2>
            </div>
            <div style={s('display:flex;flex-direction:column;gap:10px;padding:14px 24px 24px;')}>
              {opt('E', 'Early', shiftRange(times, 'E'), SHIFT_META.E)}
              {opt('L', 'Late', shiftRange(times, 'L'), SHIFT_META.L)}
              {opt('F', 'Full day', shiftRange(times, 'F'), SHIFT_META.F)}
              {opt(null, 'Not working', 'Leave this day blank', null)}
            </div>
          </Sheet>
        );
      })()}
    </div>
  );

  // ----------------------------------------------------------------- views

  function renderRota() {
    return (
      <div style={s('padding-bottom:136px;')}>
        <div className="riva-rota-head" style={s('display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:20px;')}>
          <div>
            <h1 className="riva-hero-h1" style={s('font-size:36px;font-weight:700;margin:0;letter-spacing:-0.01em;')}>Duty rota</h1>
            <p style={s('font-size:17px;color:#9a9aa3;margin:6px 0 0;')}>2 staff minimum on every shift · early and late shared evenly</p>
          </div>
          <div className="riva-week-nav" style={s('display:flex;align-items:center;gap:8px;background:#141416;border:1px solid #26262a;border-radius:10px;padding:4px;')}>
            <Hover tag="button" onClick={() => setWeekOffset((w) => Math.max(minWeekOffset, w - 1))} disabled={!canGoBack} aria-label="Previous week" base={'flex:none;width:40px;height:40px;border-radius:8px;border:none;background:transparent;display:flex;align-items:center;justify-content:center;color:#e0554f;' + (canGoBack ? 'cursor:pointer;' : 'opacity:.35;cursor:default;')} hover={canGoBack ? 'background:#221a1a;' : ''}><Svg w={20} sw={2.5}>{Icons.chevronLeft}</Svg></Hover>
            <div className="riva-week-label" style={s('text-align:center;min-width:160px;padding:0 6px;')}>
              <div style={s('font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#74747d;')}>{weekLabel}</div>
              <div style={s('font-size:16px;font-weight:700;color:#e9e9ec;font-variant-numeric:tabular-nums;')}>{weekRangeLabel(weekISO)}</div>
            </div>
            <Hover tag="button" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Next week" base="flex:none;width:40px;height:40px;border-radius:8px;border:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#e0554f;" hover="background:#221a1a;"><Svg w={20} sw={2.5}>{Icons.chevronRight}</Svg></Hover>
          </div>
        </div>

        {isReadOnly && (
          <div style={s('display:flex;align-items:center;gap:10px;background:#1b1b1d;border:1px solid #26262a;border-radius:8px;padding:12px 16px;font-size:16px;color:#9a9aa3;margin-bottom:16px;')}>
            <Svg w={20} sw={2}>{Icons.lock}</Svg>{weekISO === todayMondayISO ? 'This week’s rota is official: locked and cannot be changed.' : 'Past week: locked and cannot be changed.'}
          </div>
        )}

        {curStatus === 'loading' && <div style={s('color:#9a9aa3;font-size:16px;padding:24px 0;')}>Loading…</div>}

        {curStatus === 'done' && !hasRota && !isReadOnly && (
          <div style={s(CARD + 'padding:48px 32px;text-align:center;')}>
            <div style={s('width:72px;height:72px;border-radius:50%;background:#221a1a;color:#e0554f;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;')}><Svg w={36} sw={2}>{Icons.calendar}</Svg></div>
            <h2 style={s('font-size:26px;font-weight:700;margin:0 0 8px;')}>No rota for this week yet</h2>
            <p style={s('font-size:17px;color:#9a9aa3;margin:0 auto 24px;max-width:30em;')}>Generate a balanced week in one click. We keep 2 staff on every shift, work around annual leave, and share early and late evenly.</p>
            {staff.length === 0
              ? <p style={s('font-size:15px;color:#74747d;')}>Add staff on the Staff tab first.</p>
              : <Hover tag="button" onClick={generate} disabled={busy} base={GREEN_BTN + 'font-size:18px;padding:15px 26px;display:inline-flex;align-items:center;gap:10px;' + (busy ? 'opacity:.6;' : '')} active="transform:translateY(4px);box-shadow:none;"><Svg w={21} sw={2.2}>{Icons.sparkle}</Svg>{busy ? 'Generating…' : 'Auto-generate rota'}</Hover>}
          </div>
        )}

        {hasRota && (
          <>
            {renderToolbar()}
            {renderRules()}
            {renderGridDesktop()}
            {renderGridMobile()}
          </>
        )}
      </div>
    );
  }

  function renderRules() {
    const builtin = ['At least 2 staff on every shift', 'Early and late shared evenly', 'Annual leave respected'];
    return (
      <div className="riva-rota-rules" style={s(CARD + 'padding:16px 18px;margin-bottom:14px;')}>
        <div style={s('font-size:13px;font-weight:700;color:#74747d;text-transform:uppercase;letter-spacing:.05em;margin:0 0 12px;')}>Rules for this rota</div>
        <div style={s('display:flex;flex-wrap:wrap;gap:8px;')}>
          {builtin.map((r, i) => (
            <span key={'b' + i} style={s('display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:#9a9aa3;background:#0b0b0c;border:1px solid #26262a;border-radius:8px;padding:7px 12px;')}>
              <Svg w={13} stroke="#74747d" sw={2.4}>{Icons.lock}</Svg>{r}
            </span>
          ))}
          {rules.map((r, i) => (
            <span key={i} style={s('display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:#e0554f;background:#221a1a;border:1px solid #3a2b2a;border-radius:8px;padding:7px 8px 7px 12px;')}>
              {r}
              {canEdit && <Hover tag="button" onClick={() => removeRule(i)} aria-label="Remove rule" disabled={busy} base="border:none;background:transparent;cursor:pointer;color:#9a9aa3;display:flex;padding:1px;" hover="color:#ff7b72;"><Svg w={15} sw={2.4}>{Icons.close}</Svg></Hover>}
            </span>
          ))}
          {rules.length === 0 && <span style={s('font-size:14px;color:#74747d;align-self:center;')}>No extra rules yet. Type a change in the bar below to add one.</span>}
        </div>
      </div>
    );
  }

  function renderToolbar() {
    return (
      <div style={s('display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px;flex-wrap:wrap;')}>
        <div style={s('display:flex;align-items:center;gap:16px;flex-wrap:wrap;')}>
          <span style={s('display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#9a9aa3;')}><span style={s('width:11px;height:11px;border-radius:3px;background:' + SHIFT_META.E.bg + ';')} />Early {shiftRange(times, 'E')}</span>
          <span style={s('display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#9a9aa3;')}><span style={s('width:11px;height:11px;border-radius:3px;background:' + SHIFT_META.L.bg + ';')} />Late {shiftRange(times, 'L')}</span>
          {staff.some((p) => p.temporary) && <span style={s('display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#9a9aa3;')}><span style={s('width:11px;height:11px;border-radius:3px;background:' + SHIFT_META.F.bg + ';')} />Full day {shiftRange(times, 'F')}</span>}
          <span style={s('display:inline-flex;align-items:center;gap:7px;font-size:13px;color:#9a9aa3;')}><span style={s('width:11px;height:11px;border-radius:3px;background:' + SHIFT_META.AL.bg + ';')} />Leave</span>
        </div>
        <div className="riva-rota-actions" style={s('display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
          {canEdit && (
            <div className="riva-rota-history" style={s('display:flex;align-items:center;gap:8px;')}>
              <Hover tag="button" onClick={undo} disabled={!canUndo} aria-label="Undo" base={ICON_BTN + (canUndo ? '' : 'opacity:.4;cursor:default;')} hover={canUndo ? 'background:#0b0b0c;' : ''}><Svg w={18} sw={2.2}>{Icons.undo}</Svg></Hover>
              <Hover tag="button" onClick={redo} disabled={!canRedo} aria-label="Redo" base={ICON_BTN + (canRedo ? '' : 'opacity:.4;cursor:default;')} hover={canRedo ? 'background:#0b0b0c;' : ''}><Svg w={18} sw={2.2}>{Icons.redo}</Svg></Hover>
            </div>
          )}
          {canEdit && <Hover tag="button" className="riva-rota-act" onClick={generate} disabled={busy} aria-label="Regenerate" base="font-family:inherit;font-size:15px;font-weight:600;color:#e0554f;background:#141416;border:1px solid #55555e;border-radius:8px;padding:9px 16px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;" hover="background:#0b0b0c;"><Svg w={17} sw={2.2}>{Icons.refresh}</Svg><span className="riva-btn-label">Regenerate</span></Hover>}
          {canEdit && <Hover tag="button" className="riva-rota-act" onClick={askDeleteRota} disabled={busy} aria-label="Delete rota" base="font-family:inherit;font-size:15px;font-weight:600;color:#ff7b72;background:#141416;border:1px solid #512d2a;border-radius:8px;padding:9px 16px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;" hover="background:#171719;"><Svg w={17} sw={2.2}>{Icons.trash}</Svg><span className="riva-btn-label">Delete</span></Hover>}
          <Hover tag="button" className="riva-rota-act riva-rota-copy" onClick={copyWhatsApp} base="font-family:inherit;font-size:15px;font-weight:700;color:#ffffff;background:#e0554f;border:none;border-radius:8px;padding:10px 18px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;" hover="background:#e96f69;"><Svg w={18}>{Icons.copy}</Svg><span className="riva-btn-label">Copy for WhatsApp</span><span className="riva-btn-label-short">Copy</span></Hover>
        </div>
      </div>
    );
  }

  function renderGridDesktop() {
    const cols = `116px repeat(${roster.length}, minmax(78px, 1fr))`;
    return (
      <div className="riva-grid-desktop" style={s(CARD + 'overflow:hidden;')}>
        <div style={{ overflowX: 'auto' }}>
          {/* Staff header */}
          <div style={{ display: 'grid', gridTemplateColumns: cols }}>
            <div style={s('background:#131315;border-right:1px solid #1c1c1f;border-bottom:2px solid #1c1c1f;')} />
            {roster.map((p, i) => (
              <div key={p.id} style={s('display:flex;flex-direction:column;align-items:center;gap:6px;padding:16px 8px 13px;min-width:0;border-bottom:2px solid #1c1c1f;' + (i ? 'border-left:1px solid #1c1c1f;' : ''))}>
                <span style={s('flex:none;width:36px;height:36px;border-radius:50%;background:#221a1a;color:#f0817c;display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:700;')}>{initials(p.name)}</span>
                <span style={s('max-width:100%;font-size:13px;font-weight:600;color:#e9e9ec;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>{firstName(p.name)}</span>
                {p.temporary && <span style={s(TEMP_TAG)}>Temp</span>}
              </div>
            ))}
          </div>
          {/* Day rows */}
          {days.map((day, d) => (
            <div key={d} style={{ display: 'grid', gridTemplateColumns: cols }}>
              <div style={s('display:flex;flex-direction:column;justify-content:center;padding:0 16px;background:#131315;border-right:1px solid #1c1c1f;' + (d ? 'border-top:1px solid #1c1c1f;' : ''))}>
                <b style={s('font-size:14px;line-height:1.2;color:#e9e9ec;')}>{day.short}</b>
                <span style={s('font-size:12px;color:#74747d;font-variant-numeric:tabular-nums;')}>{day.date}</span>
              </div>
              {roster.map((p, i) => {
                const code = grid[p.id] ? grid[p.id][d] : null;
                const cv = cellView(code, times);
                const border = (d ? 'border-top:1px solid #1c1c1f;' : '') + (i ? 'border-left:1px solid #1c1c1f;' : '');
                const isBlankTemp = p.temporary && code !== 'E' && code !== 'L' && code !== 'F' && code !== 'AL';
                if (p.temporary && canEdit && code !== 'AL') {
                  return (
                    <Hover key={p.id} tag="button" title={'Set ' + firstName(p.name) + "’s shift"} onClick={() => setCellEdit({ staffId: p.id, day: d })}
                      base={'display:flex;align-items:center;justify-content:center;min-height:56px;width:100%;padding:0;margin:0;box-sizing:border-box;cursor:pointer;font-family:inherit;border:none;' + border + 'background:' + (isBlankTemp ? '#141416' : cv.bg) + ';'}
                      hover="filter:brightness(.96);">
                      {isBlankTemp
                        ? <span style={s('display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:700;color:#e0554f;border:1.5px dashed #5a3d3a;border-radius:6px;padding:3px 8px;')}><Svg w={12} sw={2.8}>{Icons.plus}</Svg>Set</span>
                        : <span style={s('font-weight:600;font-size:12.5px;color:' + cv.color + ';font-variant-numeric:tabular-nums;')}>{cv.main}</span>}
                    </Hover>
                  );
                }
                return (
                  <div key={p.id} title={firstName(p.name)}
                    style={s('display:flex;align-items:center;justify-content:center;min-height:56px;text-align:center;background:' + (isBlankTemp ? '#141416' : cv.bg) + ';' + border)}>
                    <span style={s('font-weight:600;font-size:12.5px;color:' + (isBlankTemp ? '#404046' : cv.color) + ';font-variant-numeric:tabular-nums;')}>{isBlankTemp ? 'Not set' : cv.main}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Mobile: one card per staff member showing their week.
  function renderGridMobile() {
    return (
      <div className="riva-grid-mobile" style={s('flex-direction:column;gap:14px;')}>
        {roster.map((p) => (
          <div key={p.id} style={s(CARD + 'overflow:hidden;')}>
            <div style={s('display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #1c1c1f;')}>
              <span style={s('flex:none;width:40px;height:40px;border-radius:50%;background:#e0554f;color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;')}>{initials(p.name)}</span>
              <b style={s('font-size:17px;font-weight:700;')}>{p.name}</b>
              {p.temporary && <span style={s(TEMP_TAG)}>Temp</span>}
            </div>
            <div>
              {days.map((day, d) => {
                const code = grid[p.id] ? grid[p.id][d] : null;
                const cv = cellView(code, times);
                const isBlankTemp = p.temporary && code !== 'E' && code !== 'L' && code !== 'F' && code !== 'AL';
                return (
                  <div key={d} style={s('display:flex;align-items:center;gap:12px;width:100%;padding:11px 16px;' + (d ? 'border-top:1px solid #161618;' : ''))}>
                    <span style={s('flex:1;min-width:0;')}>
                      <b style={s('font-size:15px;color:#e9e9ec;')}>{day.long}</b>
                      <span style={s('font-size:12.5px;color:#74747d;')}>{'  ·  ' + day.date}</span>
                    </span>
                    {p.temporary && canEdit && code !== 'AL'
                      ? <Hover tag="button" onClick={() => setCellEdit({ staffId: p.id, day: d })}
                          base={'flex:none;font-family:inherit;cursor:pointer;font-weight:700;font-size:13px;border-radius:7px;padding:6px 12px;' + (isBlankTemp ? 'color:#e0554f;background:#141416;border:1.5px dashed #5a3d3a;' : 'border:none;background:' + cv.bg + ';color:' + cv.color + ';')}
                          hover="filter:brightness(.96);">{isBlankTemp ? 'Tap to set' : cv.main}</Hover>
                      : <span style={s('flex:none;font-weight:700;font-size:13px;border-radius:7px;padding:6px 12px;background:' + (isBlankTemp ? '#0b0b0c' : cv.bg) + ';color:' + (isBlankTemp ? '#404046' : cv.color) + ';')}>{isBlankTemp ? 'Not set' : (cv.main || 'Off')}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  function renderStaff() {
    return (
      <div>
        <div style={s('display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;margin-bottom:24px;')}>
          <div>
            <h1 className="riva-hero-h1" style={s('font-size:36px;font-weight:700;margin:0;letter-spacing:-0.01em;')}>Staff</h1>
            <p style={s('font-size:17px;color:#9a9aa3;margin:6px 0 0;')}>{staff.length} {staff.length === 1 ? 'person' : 'people'} on the reception rota</p>
          </div>
          <Hover tag="button" onClick={() => { setShowAdd((v) => !v); setDraft({ name: '', about: '', phone: '', temporary: false }); }} base={GREEN_BTN + 'font-size:16px;padding:12px 20px;display:inline-flex;align-items:center;gap:9px;'} active="transform:translateY(4px);box-shadow:none;"><Svg w={20} sw={2.4}>{Icons.plus}</Svg>Add staff</Hover>
        </div>

        {showAdd && (
          <div style={s(CARD + 'padding:24px;margin-bottom:24px;')}>
            <h2 style={s('font-size:22px;font-weight:700;margin:0 0 18px;')}>Add a staff member</h2>
            <label style={s('display:block;font-size:15px;font-weight:700;margin-bottom:6px;')}>Name</label>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Sarah Hughes" style={s(FIELD + 'margin-bottom:16px;')} />
            <label style={s('display:block;font-size:15px;font-weight:700;margin-bottom:6px;')}>Mobile number <span style={s('font-weight:400;color:#74747d;')}>(used to tag them on WhatsApp, optional)</span></label>
            <input value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="e.g. +44 7459 533082" inputMode="tel" style={s(FIELD + 'margin-bottom:16px;')} />
            <label style={s('display:block;font-size:15px;font-weight:700;margin-bottom:6px;')}>Description</label>
            <textarea value={draft.about} onChange={(e) => setDraft({ ...draft, about: e.target.value })} rows={3} placeholder="What they do, what they're good at, anything the rota should know." style={s(FIELD + 'resize:vertical;margin-bottom:16px;')} />
            {tempToggle(draft.temporary, () => setDraft({ ...draft, temporary: !draft.temporary }))}
            <div style={s('display:flex;gap:10px;margin-top:20px;')}>
              <Hover tag="button" onClick={addStaff} base={GREEN_BTN + 'font-size:16px;padding:11px 22px;'} active="transform:translateY(4px);box-shadow:none;">Add staff member</Hover>
              <Hover tag="button" onClick={() => setShowAdd(false)} base="font-family:inherit;font-size:16px;font-weight:600;color:#9a9aa3;background:transparent;border:none;border-radius:8px;padding:11px 16px;cursor:pointer;" hover="color:#e9e9ec;">Cancel</Hover>
            </div>
          </div>
        )}

        {staffStatus === 'error' && <div style={s('color:#ff7b72;font-size:15px;margin-bottom:12px;')}>Could not load staff. <Hover tag="button" onClick={loadStaff} base="background:none;border:none;color:#e0554f;font:inherit;font-weight:600;text-decoration:underline;cursor:pointer;padding:0;" hover="color:#f0817c;">Retry</Hover></div>}

        <div style={s('display:flex;flex-direction:column;gap:14px;')}>
          {staff.map((p) => (
            <div key={p.id} className="rota-staffcard" style={s(CARD + 'padding:20px;')}>
              {editId === p.id ? renderEdit(p) : (
                <div style={s('display:flex;align-items:flex-start;gap:16px;')}>
                  <span style={s('flex:none;width:48px;height:48px;border-radius:50%;background:#e0554f;color:#ffffff;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;')}>{initials(p.name)}</span>
                  <div style={s('flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;')}>
                    <span style={s('display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
                      <b style={s('font-size:19px;font-weight:700;')}>{p.name}</b>
                      {p.temporary && <span style={s(TEMP_TAG)}>Temp · sets own days</span>}
                    </span>
                    {p.phone
                      ? <span style={s('display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:#9a9aa3;')}><Svg w={14} sw={2.2}>{Icons.phone}</Svg>{p.phone}</span>
                      : <span style={s('font-size:13px;color:#e7bd69;')}>No number, so WhatsApp will use their name</span>}
                    <p style={s('font-size:16px;line-height:1.5;margin:0;color:#e9e9ec;')}>{p.about || 'No description yet.'}</p>
                    {(p.leave || []).length > 0 && (
                      <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:2px;')}>
                        <span style={s('font-size:13px;font-weight:600;color:#74747d;')}>On leave</span>
                        {(p.leave || []).map((lv, i) => <span key={i} style={s('font-size:13px;font-weight:600;color:#ebc984;background:#241f12;border-radius:6px;padding:3px 10px;')}>{lv.start === lv.end ? lv.start : lv.start + ' → ' + lv.end}</span>)}
                      </div>
                    )}
                  </div>
                  <div style={s('flex:none;display:flex;gap:8px;')}>
                    <Hover tag="button" onClick={() => startEdit(p)} aria-label="Edit" base="border:none;background:#0b0b0c;border-radius:8px;padding:8px;cursor:pointer;color:#9a9aa3;display:flex;" hover="background:#221a1a;color:#e0554f;"><Svg w={18}>{Icons.edit}</Svg></Hover>
                    <Hover tag="button" onClick={() => askRemove(p)} aria-label="Remove" base="border:none;background:#0b0b0c;border-radius:8px;padding:8px;cursor:pointer;color:#74747d;display:flex;" hover="background:#1c1c1f;color:#ff7b72;"><Svg w={18}>{Icons.trash}</Svg></Hover>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // A toggle marking someone as temporary (they set their own days).
  function tempToggle(checked, onToggle) {
    return (
      <Hover tag="button" onClick={onToggle}
        base={'display:flex;align-items:center;gap:12px;width:100%;text-align:left;font-family:inherit;cursor:pointer;border-radius:10px;padding:14px 16px;background:' + (checked ? '#1b1b1f' : '#141416') + ';border:2px solid ' + (checked ? '#e0554f' : '#26262a') + ';'}
        hover="border-color:#e0554f;">
        <span style={s('flex:none;width:44px;height:26px;border-radius:999px;background:' + (checked ? '#e0554f' : '#29292e') + ';position:relative;')}>
          <span style={s('position:absolute;top:3px;left:' + (checked ? '21px' : '3px') + ';width:20px;height:20px;border-radius:50%;background:#141416;')} />
        </span>
        <span style={s('flex:1;min-width:0;')}>
          <b style={s('display:block;font-size:15px;color:#e9e9ec;')}>Temporary staff</b>
          <span style={s('font-size:13.5px;color:#74747d;line-height:1.4;')}>Picks their own days, so the rota will not auto-fill them. You set each shift by hand on the rota.</span>
        </span>
      </Hover>
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
          <label style={s('display:block;font-size:14px;font-weight:700;margin-bottom:5px;')}>Mobile number <span style={s('font-weight:400;color:#74747d;')}>(used to tag them on WhatsApp)</span></label>
          <input value={editDraft.phone} onChange={(e) => setEditDraft({ ...editDraft, phone: e.target.value })} placeholder="e.g. +44 7459 533082" inputMode="tel" style={s(FIELD)} />
        </div>
        <div>
          <label style={s('display:block;font-size:14px;font-weight:700;margin-bottom:5px;')}>Description</label>
          <textarea value={editDraft.about} onChange={(e) => setEditDraft({ ...editDraft, about: e.target.value })} rows={3} style={s(FIELD + 'resize:vertical;')} />
        </div>
        {tempToggle(editDraft.temporary, () => setEditDraft({ ...editDraft, temporary: !editDraft.temporary }))}
        <div>
          <label style={s('display:block;font-size:14px;font-weight:700;margin-bottom:5px;')}>Annual leave</label>
          <div style={s('display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;')}>
            {editDraft.leave.length === 0 && <span style={s('font-size:14px;color:#74747d;')}>None booked yet.</span>}
            {editDraft.leave.map((lv, i) => (
              <span key={i} style={s('display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:600;color:#ebc984;background:#241f12;border-radius:6px;padding:6px 8px 6px 12px;')}>
                {lv.start === lv.end ? lv.start : lv.start + ' → ' + lv.end}
                <Hover tag="button" onClick={() => removeLeave(i)} aria-label="Remove leave" base="border:none;background:transparent;cursor:pointer;color:#d9ab52;display:flex;padding:1px;" hover="color:#ff7b72;"><Svg w={15} sw={2.4}>{Icons.close}</Svg></Hover>
              </span>
            ))}
          </div>
          <div style={s('display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
            <input type="date" value={editDraft.start} onChange={(e) => setEditDraft({ ...editDraft, start: e.target.value })} aria-label="Leave start" style={s('height:42px;box-sizing:border-box;font:inherit;font-size:16px;padding:0 12px;border:2px solid #9a9aa3;border-radius:4px;background:#141416;')} />
            <span style={s('font-size:16px;color:#9a9aa3;')}>to</span>
            <input type="date" value={editDraft.end} onChange={(e) => setEditDraft({ ...editDraft, end: e.target.value })} aria-label="Leave end" style={s('height:42px;box-sizing:border-box;font:inherit;font-size:16px;padding:0 12px;border:2px solid #9a9aa3;border-radius:4px;background:#141416;')} />
            <Hover tag="button" onClick={addLeave} base="height:42px;box-sizing:border-box;white-space:nowrap;font:inherit;font-size:16px;font-weight:700;color:#ffffff;background:#e0554f;border:none;border-radius:8px;padding:0 18px;cursor:pointer;" hover="background:#e96f69;">Add leave</Hover>
          </div>
        </div>
        <div style={s('display:flex;gap:10px;margin-top:2px;')}>
          <Hover tag="button" onClick={saveEdit} base={GREEN_BTN + 'height:42px;box-sizing:border-box;font-size:16px;padding:0 22px;'} active="transform:translateY(4px);box-shadow:none;">Save changes</Hover>
          <Hover tag="button" onClick={() => setEditId(null)} base="height:42px;box-sizing:border-box;font:inherit;font-size:16px;font-weight:600;color:#9a9aa3;background:transparent;border:none;border-radius:8px;padding:0 16px;cursor:pointer;" hover="color:#e9e9ec;">Cancel</Hover>
        </div>
      </div>
    );
  }
}
