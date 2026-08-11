'use client';

/* ------------------------------------------------------------------ *
 * Everything else that happened in the app.
 *
 * The other half of /stats: pages opened, buttons pressed, requests
 * made and anything that failed, grouped by the machine it was done on
 * rather than by IP address — every machine in the building shares one
 * public address, and a laptop changes address between the car park and
 * the consulting room. See lib/audit/machine.js.
 *
 * Questions appear here too, one line each, because a day reads better
 * with them in it. What was actually answered lives on the Questions
 * tab, which has the answers as well.
 * ------------------------------------------------------------------ */

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';
import ActivityChart from './ActivityChart';
import { machineName } from '@/lib/audit/machine';
import { CARD, Ranked, Segmented, Tile, ago, dayHeading, dayKey, duration, number, timeOf } from './parts';

/* ---------------------------------------------------------------- *
 * The five kinds of event.
 *
 * Three are categories of ordinary use — a page opened, a question
 * asked, something changed — and carry the identity hues (validated for
 * colour-vision deficiency as a set). "Routine" is deliberately grey: it
 * is the background chatter of a page loading its own data and should
 * recede. "Failed" is the reserved status red and always ships with an
 * icon and the word, never colour alone.
 * ---------------------------------------------------------------- */
const KIND = {
  pageview: { label: 'Page',    hue: '#005eb8', ink: '#00437e', tint: '#e8f1f8', edge: '#aac7e0' },
  query:    { label: 'Question',hue: '#a4610a', ink: '#7a4708', tint: '#fdf3e7', edge: '#e4c69a' },
  action:   { label: 'Action',  hue: '#00a499', ink: '#00625c', tint: '#e2f4f2', edge: '#9fd5d0' },
  load:     { label: 'Routine', hue: '#768692', ink: '#4c6272', tint: '#f0f4f5', edge: '#d8dde0' },
  error:    { label: 'Failed',  hue: '#d5281b', ink: '#8a1509', tint: '#fde8e9', edge: '#f0b8b3', icon: true },
};

const VIEWS = [
  { key: 'all', label: 'Everything' },
  { key: 'pageview', label: 'Pages' },
  { key: 'query', label: 'Questions' },
  { key: 'action', label: 'Actions' },
  { key: 'error', label: 'Failures' },
];

const PAGE_SIZE = 100;

// The event's kind, as a coloured mark plus the word. The word is the label —
// the colour is only there to make the pattern of a day visible at a glance.
function KindChip({ kind }) {
  const meta = KIND[kind] || KIND.action;
  return (
    <span style={s(`display:inline-flex;flex:none;align-items:center;gap:5px;padding:2px 9px 2px 7px;border-radius:999px;font-size:12px;font-weight:700;background:${meta.tint};border:1px solid ${meta.edge};color:${meta.ink};`)}>
      {meta.icon
        ? <Svg w={11} sw={2.6} stroke={meta.hue} style={s('flex:none;')}>{Icons.alertCircle}</Svg>
        : <span style={s(`flex:none;width:7px;height:7px;border-radius:50%;background:${meta.hue};`)} />}
      {meta.label}
    </span>
  );
}

/**
 * One machine. Selecting it filters both tabs to what was done there.
 *
 * The name is the practice's to set — "Reception PC 1" reads better in an audit
 * log than a random code — and until someone sets one, the machine is called by
 * the short code derived from its id.
 */
function MachineCard({ machine, selected, onSelect, onRename }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(machine.name || '');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => { setDraft(machine.name || ''); }, [machine.name]);

  async function save(e) {
    e.preventDefault();
    e.stopPropagation();
    setSaving(true);
    try {
      await onRename(machine.id, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  const details = [machine.label, machine.screen, machine.timezone].filter(Boolean).join(' · ');

  return (
    <div style={s(CARD + 'padding:15px 16px;' + (selected ? 'border-color:#005eb8;box-shadow:0 0 0 1px #005eb8;' : ''))}>
      <div style={s('display:flex;align-items:flex-start;gap:10px;')}>
        <div style={s('flex:1;min-width:0;')}>
          {editing ? (
            <form onSubmit={save} style={s('display:flex;gap:8px;align-items:center;')}>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={60}
                placeholder="Reception PC 1"
                aria-label="Name for this machine"
                style={s('flex:1;min-width:0;font:inherit;font-size:15px;padding:6px 9px;border:2px solid #005eb8;border-radius:7px;')}
              />
              <Hover tag="button" type="submit" disabled={saving}
                base="flex:none;border:none;border-radius:7px;padding:7px 12px;font:inherit;font-size:14px;font-weight:600;color:#fff;background:#007f3b;cursor:pointer;"
                hover="background:#00662f;">{saving ? 'Saving…' : 'Save'}</Hover>
              <Hover tag="button" type="button" onClick={() => { setEditing(false); setDraft(machine.name || ''); }}
                base="flex:none;background:none;border:none;padding:4px;font:inherit;font-size:14px;color:#4c6272;cursor:pointer;text-decoration:underline;"
                hover="color:#212b32;">Cancel</Hover>
            </form>
          ) : (
            <div style={s('display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 10px;')}>
              <span style={s('font-size:17px;font-weight:700;color:#212b32;')}>{machineName(machine)}</span>
              <Hover tag="button" type="button" onClick={() => setEditing(true)}
                base="background:none;border:none;padding:0;font:inherit;font-size:13px;color:#005eb8;text-decoration:underline;cursor:pointer;"
                hover="color:#003087;">{machine.name ? 'Rename' : 'Name this machine'}</Hover>
            </div>
          )}
          <div style={s('font-size:13.5px;color:#4c6272;margin-top:3px;overflow-wrap:anywhere;')}>{details || 'Nothing recorded about this machine yet'}</div>
        </div>

        <Hover tag="button" type="button" onClick={() => onSelect(selected ? '' : machine.id)}
          base={'flex:none;border-radius:8px;padding:6px 12px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;border:1px solid ' +
            (selected ? '#005eb8;background:#005eb8;color:#fff;' : '#d8dde0;background:#fff;color:#005eb8;')}
          hover={selected ? 'background:#00437e;' : 'border-color:#005eb8;background:#f0f6fb;'}>
          {selected ? 'Showing' : 'Show only'}
        </Hover>
      </div>

      <div style={s('display:flex;flex-wrap:wrap;gap:4px 18px;margin-top:11px;padding-top:11px;border-top:1px solid #eaeff1;font-size:13px;color:#4c6272;')}>
        <span><strong style={s('color:#212b32;')}>{number(machine.events)}</strong> events</span>
        <span>Last used {ago(machine.lastSeen)}</span>
        <span>First seen {ago(machine.firstSeen)}</span>
        {machine.topTool && <span>Mostly {machine.topTool}</span>}
      </div>
    </div>
  );
}

// One line of the log.
function EventRow({ event, machine }) {
  const meta = KIND[event.kind] || KIND.action;
  return (
    <li style={s('display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;padding:10px 14px;border-top:1px solid #eaeff1;')}>
      <span style={s('flex:none;font-variant-numeric:tabular-nums;font-size:13px;color:#768692;min-width:66px;')}>{timeOf(event.at)}</span>
      <KindChip kind={event.kind} />
      <span style={s('flex:1;min-width:200px;font-size:15px;color:#212b32;overflow-wrap:anywhere;')}>
        {event.label}
        {event.detail && (
          <span style={s(`display:block;font-size:13.5px;color:${meta.ink};margin-top:2px;overflow-wrap:anywhere;`)}>
            {event.detail}
          </span>
        )}
      </span>
      <span style={s('flex:none;display:flex;flex-wrap:wrap;gap:4px 10px;font-size:12.5px;color:#768692;justify-content:flex-end;')}>
        {machine && <span>{machineName(machine)}</span>}
        <span style={s('font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;')}>
          {event.method ? event.method + ' ' : ''}{event.path}
        </span>
        {event.status ? <span>{event.status}</span> : null}
        {event.durationMs != null ? <span>{duration(event.durationMs)}</span> : null}
      </span>
    </li>
  );
}

export default function ActivityView({ range, machineId, onMachine }) {
  const [view, setView] = React.useState('all');
  const [includeLoads, setIncludeLoads] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [query, setQuery] = React.useState('');

  const [data, setData] = React.useState(null);
  const [extra, setExtra] = React.useState([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState('');

  // Typing in the search box should not fire a query per keystroke.
  React.useEffect(() => {
    const id = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  const kindsParam = React.useMemo(() => {
    if (view !== 'all') return view;
    // "Everything" still hides the routine data loads unless they are asked
    // for: a page opening fetches four things, and that chatter would bury the
    // events an audit log exists to show.
    return includeLoads ? '' : 'pageview,query,action,error';
  }, [view, includeLoads]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ range, limit: String(PAGE_SIZE) });
      if (kindsParam) params.set('kinds', kindsParam);
      if (machineId) params.set('machine', machineId);
      if (query) params.set('q', query);
      const res = await fetch('/api/audit?' + params.toString());
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'The audit log could not be read.');
      setData(body);
      setExtra([]);
      setHasMore(!!body.hasMore);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [range, kindsParam, machineId, query]);

  React.useEffect(() => { load(); }, [load]);

  const events = React.useMemo(() => [...(data?.events || []), ...extra], [data, extra]);

  async function loadMore() {
    const last = events[events.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        range,
        limit: String(PAGE_SIZE),
        beforeAt: new Date(last.at).toISOString(),
        beforeId: String(last.id),
      });
      if (kindsParam) params.set('kinds', kindsParam);
      if (machineId) params.set('machine', machineId);
      if (query) params.set('q', query);
      const res = await fetch('/api/audit?' + params.toString());
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'More of the log could not be read.');
      setExtra((rows) => [...rows, ...(body.events || [])]);
      setHasMore(!!body.hasMore);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function rename(id, name) {
    const res = await fetch('/api/audit', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineId: id, name }),
    });
    const body = await res.json();
    if (!res.ok) { setError(body.error || 'That machine could not be renamed.'); return; }
    setData((current) => current && ({
      ...current,
      machines: current.machines.map((m) => (m.id === id ? { ...m, name: body.machine.name } : m)),
    }));
  }

  const machines = data?.machines || [];
  const byId = React.useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);
  const summary = data?.summary || {};
  const selected = machineId ? byId.get(machineId) : null;

  // Grouped into days, in the order they came back (newest first).
  const days = React.useMemo(() => {
    const groups = [];
    let current = null;
    for (const event of events) {
      const key = dayKey(event.at);
      if (!current || current.key !== key) {
        current = { key, events: [] };
        groups.push(current);
      }
      current.events.push(event);
    }
    return groups;
  }, [events]);

  return (
    <>
      <p style={s('font-size:16.5px;color:#4c6272;margin:0 0 6px;line-height:1.55;max-width:70ch;')}>
        Every page opened, action taken and request that failed &mdash; grouped by the machine it was done on.
        Machines are identified by an id the browser generates and keeps, not by IP address, so a machine stays one
        machine when it moves between the surgery&rsquo;s network and a home one.
      </p>
      <p style={s('font-size:14px;color:#768692;margin:0 0 20px;line-height:1.5;max-width:70ch;')}>
        Pasted consultations and document text are never recorded. For those tools the log stores that the tool was
        used and how much text was pasted &mdash; never the text itself.
      </p>

      <div style={s(CARD + 'padding:14px 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:18px;')}>
        <Segmented options={VIEWS} value={view} onChange={setView} name="Kind of event" />

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search the log…"
          aria-label="Search the log"
          style={s('flex:1;min-width:180px;font:inherit;font-size:15px;padding:8px 12px;border:2px solid #4c6272;border-radius:9px;background:#fff;')}
        />

        {view === 'all' && (
          <label style={s('display:inline-flex;align-items:center;gap:7px;font-size:14px;color:#4c6272;cursor:pointer;')}>
            <input type="checkbox" checked={includeLoads} onChange={(e) => setIncludeLoads(e.target.checked)} style={s('width:17px;height:17px;')} />
            Include routine data loads
          </label>
        )}

        <Hover tag="button" type="button" onClick={load} disabled={loading}
          base="display:inline-flex;align-items:center;gap:7px;border:1px solid #d8dde0;border-radius:9px;padding:8px 14px;font:inherit;font-size:14px;font-weight:600;background:#fff;color:#005eb8;cursor:pointer;"
          hover="border-color:#005eb8;background:#f0f6fb;">
          <Svg w={15} sw={2.2}>{Icons.refresh}</Svg>{loading ? 'Reading…' : 'Refresh'}
        </Hover>
      </div>

      {selected && (
        <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:18px;padding:11px 15px;background:#e8f1f8;border:1px solid #aac7e0;border-radius:10px;font-size:15px;color:#00437e;')}>
          <span>Showing only <strong>{machineName(selected)}</strong>.</span>
          <Hover tag="button" type="button" onClick={() => onMachine('')}
            base="background:none;border:none;padding:0;font:inherit;font-size:14.5px;font-weight:600;color:#005eb8;text-decoration:underline;cursor:pointer;"
            hover="color:#003087;">Show every machine</Hover>
        </div>
      )}

      {error && (
        <p style={s('display:flex;gap:8px;align-items:flex-start;margin:0 0 18px;padding:12px 15px;background:#fde8e9;border:1px solid #f0b8b3;border-radius:10px;font-size:15px;color:#8a1509;font-weight:600;')}>
          <span style={s('flex:none;display:flex;margin-top:2px;')}><Svg w={16} stroke="#d5281b" sw={2.4}>{Icons.alertCircle}</Svg></span>{error}
        </p>
      )}

      <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:12px;margin-bottom:18px;')}>
        <Tile value={number(summary.machines)} caption={summary.machines === 1 ? 'machine' : 'machines'} />
        <Tile value={number(summary.visits)} caption="visits" />
        <Tile value={number(summary.pageviews)} caption="pages opened" />
        <Tile value={number(summary.queries)} caption="questions asked" />
        <Tile value={number(summary.actions)} caption="actions taken" />
        <Tile value={number(summary.errors)} caption={summary.errors === 1 ? 'failure' : 'failures'}
          tone={summary.errors ? 'bad' : ''} />
      </div>

      {summary.buckets?.length > 0 && (
        <div style={s(CARD + 'padding:20px 22px 16px;margin-bottom:18px;')}>
          <ActivityChart buckets={summary.buckets} size={summary.bucketSize} />
        </div>
      )}

      <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:26px;')}>
        <Ranked title="Most-opened pages" rows={summary.topPages || []} labelKey="label" empty="No pages opened in this window." />
        <Ranked title="Most-used parts of the app" rows={summary.topTools || []} labelKey="tool" empty="Nothing used in this window." />
      </div>

      <h2 style={s('font-size:22px;margin:0 0 4px;letter-spacing:-0.01em;')}>Machines</h2>
      <p style={s('font-size:15px;color:#4c6272;margin:0 0 14px;')}>
        {machines.length
          ? 'Every machine the app has been opened on. Give one a name and it is used everywhere, including on the questions.'
          : 'No machine has used the app yet.'}
      </p>
      <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:12px;margin-bottom:30px;')}>
        {machines.map((machine) => (
          <MachineCard
            key={machine.id}
            machine={machine}
            selected={machine.id === machineId}
            onSelect={onMachine}
            onRename={rename}
          />
        ))}
      </div>

      <h2 style={s('font-size:22px;margin:0 0 14px;letter-spacing:-0.01em;')}>
        The log{events.length ? ` — ${number(events.length)} event${events.length === 1 ? '' : 's'} shown` : ''}
      </h2>

      {loading && !events.length ? (
        <div style={s(CARD + 'padding:26px;font-size:15px;color:#4c6272;')}>Reading the log…</div>
      ) : !events.length ? (
        <div style={s(CARD + 'padding:26px;font-size:15px;color:#4c6272;')}>
          Nothing matches those filters. Try a longer time range, or turn on routine data loads.
        </div>
      ) : (
        <div style={s('display:flex;flex-direction:column;gap:16px;')}>
          {days.map((day) => (
            <section key={day.key} style={s(CARD + 'overflow:hidden;')}>
              <h3 style={s('margin:0;padding:12px 16px;font-size:14px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#4c6272;background:#f7fafb;')}>
                {dayHeading(day.key)}
                <span style={s('float:right;font-weight:600;text-transform:none;letter-spacing:0;color:#768692;')}>
                  {number(day.events.length)}
                </span>
              </h3>
              <ul style={s('list-style:none;margin:0;padding:0;')}>
                {day.events.map((event) => (
                  <EventRow key={event.id} event={event} machine={machineId ? null : byId.get(event.machineId)} />
                ))}
              </ul>
            </section>
          ))}

          {hasMore && (
            <Hover tag="button" type="button" onClick={loadMore} disabled={loadingMore}
              base="align-self:flex-start;border:1px solid #d8dde0;border-radius:10px;padding:11px 18px;font:inherit;font-size:15px;font-weight:600;background:#fff;color:#005eb8;cursor:pointer;"
              hover="border-color:#005eb8;background:#f0f6fb;">
              {loadingMore ? 'Reading…' : 'Load older events'}
            </Hover>
          )}
        </div>
      )}
    </>
  );
}
