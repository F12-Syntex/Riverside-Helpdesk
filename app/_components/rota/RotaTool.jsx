'use client';

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';

/* ------------------------------------------------------------------ *
 * Staff rota generator — client UI.
 *
 * Manages the staff list (Neon-backed via /api/staff) and asks the AI to
 * generate a weekly rota from the staff plus the week's constraints
 * (/api/rota). Generated rotas are saved server-side; recent ones load on
 * mount. Styling reuses the shared inline-style kit for visual consistency.
 * ------------------------------------------------------------------ */

function pad(n) { return String(n).padStart(2, '0'); }
function isoLocal(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// The coming Monday (today if today is already Monday).
function comingMondayISO() {
  const d = new Date();
  const until = (1 - d.getDay() + 7) % 7; // 0 if Monday
  d.setDate(d.getDate() + until);
  return isoLocal(d);
}

function prettyDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const CARD = 'background:#fff;border:1px solid #d8dde0;border-radius:14px;box-shadow:0 1px 3px rgba(33,43,50,.08);';
const FIELD = 'width:100%;font:inherit;font-size:16px;padding:10px 12px;border:2px solid #4c6272;border-radius:4px;background:#fff;outline:none;';
const LABEL = 'display:block;font-weight:600;font-size:15px;margin-bottom:6px;';
const SECTION_TITLE = 'font-size:13px;font-weight:700;color:#768692;text-transform:uppercase;letter-spacing:.05em;margin:0 0 12px;';

export default function RotaTool() {
  const [staff, setStaff] = React.useState([]);
  const [staffStatus, setStaffStatus] = React.useState('loading'); // loading | done | error
  const [form, setForm] = React.useState({ name: '', role: '', hours: '' });
  const [adding, setAdding] = React.useState(false);
  const [staffError, setStaffError] = React.useState('');

  const [weekStarting, setWeekStarting] = React.useState(comingMondayISO());
  const [openingHours, setOpeningHours] = React.useState('Mon–Fri 08:00–18:30, closed weekends');
  const [requirements, setRequirements] = React.useState('');

  const [generating, setGenerating] = React.useState(false);
  const [genError, setGenError] = React.useState('');
  const [rota, setRota] = React.useState(null); // { weekStarting, schedule:{days,notes}, ... }
  const [recent, setRecent] = React.useState([]);

  React.useEffect(() => { loadStaff(); loadRecent(); }, []);

  async function loadStaff() {
    setStaffStatus('loading');
    try {
      const res = await fetch('/api/staff');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed');
      setStaff(Array.isArray(data.staff) ? data.staff : []);
      setStaffStatus('done');
    } catch (e) {
      setStaffStatus('error');
    }
  }

  async function loadRecent() {
    try {
      const res = await fetch('/api/rota');
      const data = await res.json();
      if (res.ok && Array.isArray(data.rotas)) setRecent(data.rotas);
    } catch (e) { /* non-fatal */ }
  }

  async function addStaff(e) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) { setStaffError('Enter a name.'); return; }
    setAdding(true);
    setStaffError('');
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role: form.role.trim(), hoursPerWeek: form.hours, notes: '' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed');
      setStaff((prev) => [...prev, data.staff].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({ name: '', role: '', hours: '' });
    } catch (e) {
      setStaffError(e.message || 'Could not add staff member.');
    } finally {
      setAdding(false);
    }
  }

  async function removeStaff(id) {
    setStaff((prev) => prev.filter((p) => p.id !== id));
    try { await fetch('/api/staff?id=' + id, { method: 'DELETE' }); } catch (e) { loadStaff(); }
  }

  async function generate() {
    setGenerating(true);
    setGenError('');
    try {
      const res = await fetch('/api/rota', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStarting, openingHours, requirements }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Generation failed.');
      setRota(data.rota);
      setRecent((prev) => [data.rota, ...prev].slice(0, 20));
    } catch (e) {
      setGenError(e.message || 'Could not generate the rota.');
    } finally {
      setGenerating(false);
    }
  }

  const schedule = rota && rota.schedule ? rota.schedule : null;

  return (
    <div style={s('display:flex;flex-direction:column;gap:22px;')}>
      <div>
        <h1 className="riva-hero-h1" style={s('font-size:34px;margin:0 0 6px;letter-spacing:-0.02em;')}>Staff rota generator</h1>
        <p style={s('font-size:18px;color:#4c6272;margin:0;text-wrap:pretty;')}>Add your team, set the week and any constraints, and the assistant will draft a balanced rota.</p>
      </div>

      {/* Staff */}
      <div style={s(CARD + 'padding:20px 22px;')}>
        <div style={s(SECTION_TITLE)}>Staff ({staff.length})</div>

        {staffStatus === 'error' && (
          <div style={s('color:#d5281b;font-size:15px;margin-bottom:12px;')}>Could not load staff. <Hover tag="button" onClick={loadStaff} base="background:none;border:none;color:#005eb8;font:inherit;font-weight:600;text-decoration:underline;cursor:pointer;padding:0;" hover="color:#003087;">Retry</Hover></div>
        )}

        {staff.length > 0 && (
          <div style={s('display:flex;flex-direction:column;gap:8px;margin-bottom:16px;')}>
            {staff.map((p) => (
              <div key={p.id} style={s('display:flex;align-items:center;gap:12px;border:1px solid #eef2f4;border-radius:10px;padding:10px 12px;')}>
                <span style={s('flex:1;min-width:0;')}>
                  <span style={s('font-size:16px;font-weight:600;')}>{p.name}</span>
                  <span style={s('font-size:14px;color:#768692;')}>{p.role ? '  ·  ' + p.role : ''}{p.hoursPerWeek ? '  ·  ' + p.hoursPerWeek + 'h/wk' : ''}</span>
                </span>
                <Hover tag="button" onClick={() => removeStaff(p.id)} aria-label={'Remove ' + p.name} base="flex:none;background:none;border:none;cursor:pointer;color:#768692;padding:4px;display:flex;" hover="color:#d5281b;"><Svg w={18}>{Icons.close}</Svg></Hover>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={addStaff} style={s('display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;')}>
          <div style={s('flex:2;min-width:160px;')}>
            <label style={s(LABEL)}>Name</label>
            <input className="riva-form-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Jane Doe" style={s(FIELD)} />
          </div>
          <div style={s('flex:1;min-width:120px;')}>
            <label style={s(LABEL)}>Role</label>
            <input className="riva-form-field" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Receptionist" style={s(FIELD)} />
          </div>
          <div style={s('flex:none;width:96px;')}>
            <label style={s(LABEL)}>Hours/wk</label>
            <input className="riva-form-field" type="number" min="0" max="168" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} placeholder="37" style={s(FIELD)} />
          </div>
          <Hover tag="button" type="submit" disabled={adding} base={'flex:none;display:inline-flex;align-items:center;gap:7px;background:#005eb8;color:#fff;border:none;border-radius:8px;padding:11px 16px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;' + (adding ? 'opacity:.6;' : '')} hover="background:#003087;"><Svg w={17} sw={2.2}>{Icons.plus}</Svg>{adding ? 'Adding…' : 'Add'}</Hover>
        </form>
        {staffError && <div style={s('color:#d5281b;font-size:14px;font-weight:600;margin-top:8px;')}>{staffError}</div>}
      </div>

      {/* Generate */}
      <div style={s(CARD + 'padding:20px 22px;')}>
        <div style={s(SECTION_TITLE)}>Generate a rota</div>
        <div style={s('display:flex;flex-direction:column;gap:14px;')}>
          <div className="riva-grid-2" style={s('display:grid;grid-template-columns:1fr 1fr;gap:14px;')}>
            <div>
              <label style={s(LABEL)}>Week starting (Monday)</label>
              <input className="riva-form-field" type="date" value={weekStarting} onChange={(e) => setWeekStarting(e.target.value)} style={s(FIELD)} />
            </div>
            <div>
              <label style={s(LABEL)}>Opening hours</label>
              <input className="riva-form-field" value={openingHours} onChange={(e) => setOpeningHours(e.target.value)} placeholder="Mon–Fri 08:00–18:30" style={s(FIELD)} />
            </div>
          </div>
          <div>
            <label style={s(LABEL)}>Requirements &amp; constraints <span style={s('font-weight:400;color:#768692;')}>(optional)</span></label>
            <textarea className="riva-form-field" value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={3} placeholder="e.g. At least 2 receptionists on the front desk at all times. Jane can't work Wednesdays. One person must cover phones 08:00–18:30." style={s(FIELD + 'resize:vertical;line-height:1.5;')} />
          </div>
          <div>
            <Hover tag="button" onClick={generate} disabled={generating || !staff.length}
              base={'display:inline-flex;align-items:center;gap:8px;background:#007f3b;color:#fff;border:none;border-radius:8px;padding:12px 20px;font:inherit;font-size:16px;font-weight:600;cursor:pointer;box-shadow:0 4px 0 #003419;' + ((generating || !staff.length) ? 'opacity:.55;box-shadow:none;cursor:not-allowed;' : '')}
              active={(generating || !staff.length) ? '' : 'transform:translateY(4px);box-shadow:none;'}>
              <Svg w={18} sw={2.2}>{Icons.refresh}</Svg>{generating ? 'Generating…' : 'Generate rota'}
            </Hover>
            {!staff.length && <span style={s('margin-left:12px;font-size:14px;color:#768692;')}>Add staff first.</span>}
          </div>
          {genError && <div style={s('color:#d5281b;font-size:15px;font-weight:600;')}>{genError}</div>}
        </div>
      </div>

      {/* Result */}
      {schedule && <RotaResult rota={rota} schedule={schedule} />}

      {/* Recent */}
      {recent.length > 0 && (
        <div style={s(CARD + 'padding:20px 22px;')}>
          <div style={s(SECTION_TITLE)}>Recent rotas</div>
          <div style={s('display:flex;flex-direction:column;gap:8px;')}>
            {recent.map((r) => (
              <Hover key={r.id} tag="button" onClick={() => setRota(r)} base="display:flex;align-items:center;gap:10px;text-align:left;background:#f7fbff;border:1px solid #eef2f4;border-radius:10px;padding:10px 12px;cursor:pointer;font:inherit;" hover="border-color:#005eb8;">
                <Svg w={17} stroke="#005eb8">{Icons.fileLines}</Svg>
                <span style={s('flex:1;min-width:0;font-size:15px;font-weight:600;color:#212b32;')}>Week of {prettyDate(r.weekStarting)}</span>
                <Svg w={16} sw={2.2} stroke="#768692">{Icons.chevronRight}</Svg>
              </Hover>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RotaResult({ rota, schedule }) {
  const days = Array.isArray(schedule.days) ? schedule.days : [];
  return (
    <div style={s(CARD + 'padding:20px 22px;')}>
      <div style={s('display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;')}>
        <span style={s('flex:none;width:34px;height:34px;border-radius:8px;background:#e8f1f8;color:#005eb8;display:inline-flex;align-items:center;justify-content:center;')}><Svg w={19}>{Icons.fileLines}</Svg></span>
        <div style={s('flex:1;min-width:0;')}>
          <div style={s('font-size:20px;font-weight:700;letter-spacing:-0.01em;')}>Rota — week of {prettyDate(rota.weekStarting)}</div>
          <div style={s('font-size:13px;color:#007f3b;font-weight:600;')}>Saved</div>
        </div>
      </div>

      <div style={s('display:flex;flex-direction:column;gap:12px;')}>
        {days.map((d, i) => (
          <div key={i} style={s('border:1px solid #eef2f4;border-radius:10px;overflow:hidden;')}>
            <div style={s('display:flex;align-items:baseline;gap:8px;background:#f7fbff;padding:9px 14px;border-bottom:1px solid #eef2f4;')}>
              <span style={s('font-size:16px;font-weight:700;')}>{d.day}</span>
              <span style={s('font-size:13px;color:#768692;')}>{prettyDate(d.date)}</span>
            </div>
            {d.shifts && d.shifts.length ? (
              <div style={s('display:flex;flex-direction:column;')}>
                {d.shifts.map((sh, j) => (
                  <div key={j} style={s('display:flex;align-items:center;gap:12px;padding:10px 14px;' + (j ? 'border-top:1px solid #f3f6f7;' : ''))}>
                    <span style={s('flex:none;min-width:104px;font-size:15px;font-weight:700;color:#005eb8;font-variant-numeric:tabular-nums;')}>{sh.start}{sh.end ? '–' + sh.end : ''}</span>
                    <span style={s('flex:1;min-width:0;')}>
                      <span style={s('font-size:16px;')}>{sh.staff}</span>
                      {sh.role && <span style={s('font-size:13.5px;color:#768692;')}>{'  ·  ' + sh.role}</span>}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={s('padding:10px 14px;font-size:14.5px;color:#768692;')}>Closed / no shifts</div>
            )}
          </div>
        ))}
      </div>

      {schedule.notes && (
        <div style={s('margin-top:16px;border-left:4px solid #005eb8;background:#e8f1f8;padding:12px 16px;border-radius:0 8px 8px 0;font-size:15.5px;line-height:1.5;')}>
          <strong>Notes:</strong> {schedule.notes}
        </div>
      )}
    </div>
  );
}
