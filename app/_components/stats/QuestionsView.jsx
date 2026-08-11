'use client';

/* ------------------------------------------------------------------ *
 * Every question the assistant was asked, with the answer it gave.
 *
 * This is the half of /stats that answers the question whoever runs the
 * app actually has: is it any good? A count of questions cannot answer
 * that, and neither can the wording on its own, so every row carries
 * the answer as it was shown, what built it — a Notebook page, a
 * template, or the model writing from general knowledge — and whatever
 * verdict was left on it.
 *
 * Rows come from question_log, written as each answer goes out (see
 * lib/questions/log.js). They are the record: the Notebook page behind
 * an answer gets edited, so an answer is only true to what was shown if
 * it was stored at the moment it was given.
 * ------------------------------------------------------------------ */

import React from 'react';
import { s, Hover, Svg, Icons } from '../ui';
import { machineName } from '@/lib/audit/machine';
import { VERDICTS, isGoodVerdict, verdictLabel } from '@/lib/feedback.mjs';
import { CARD, Ranked, Segmented, Tile, ago, dayHeading, dayKey, duration, number, timeOf } from './parts';

const PAGE_SIZE = 40;

/* ---------------------------------------------------------------- *
 * How an answer came about.
 *
 * Three outcomes, and the difference between the first two is the whole
 * point of the page: an answer built from the practice's own material
 * is a different kind of thing from one the model wrote out of general
 * knowledge, and only one of the two can be fixed by editing the
 * Notebook. "Failed" is the reserved status red and always carries the
 * word, never the colour alone.
 * ---------------------------------------------------------------- */
const OUTCOME = {
  template: { label: 'From the practice', hue: '#007f3b', ink: '#00612f', tint: '#e6f4ec', edge: '#a7d8b6' },
  prose: { label: 'Model wrote it', hue: '#a4610a', ink: '#7a4708', tint: '#fdf3e7', edge: '#e4c69a' },
  failed: { label: 'Failed', hue: '#d5281b', ink: '#8a1509', tint: '#fde8e9', edge: '#f0b8b3' },
};

const OUTCOME_FILTERS = [
  { key: '', label: 'Every answer' },
  { key: 'template', label: 'From the practice' },
  { key: 'prose', label: 'Model wrote it' },
  { key: 'failed', label: 'Failed' },
];

const RATED_FILTERS = [
  { key: '', label: 'Rated or not' },
  { key: 'bad', label: 'Problems' },
  { key: 'good', label: 'Helpful' },
  { key: 'any', label: 'Anything rated' },
];

// An answer longer than this is a Notebook page, and Notebook pages in full turn
// the log into a document. Longer ones open on request.
const PREVIEW_CHARS = 420;

function Chip({ tint, edge, ink, hue, icon, children }) {
  return (
    <span style={s(`display:inline-flex;flex:none;align-items:center;gap:5px;padding:2px 9px 2px 7px;border-radius:999px;font-size:12px;font-weight:700;background:${tint};border:1px solid ${edge};color:${ink};`)}>
      {icon
        ? <Svg w={11} sw={2.6} stroke={hue} style={s('flex:none;')}>{icon}</Svg>
        : <span style={s(`flex:none;width:7px;height:7px;border-radius:50%;background:${hue};`)} />}
      {children}
    </span>
  );
}

function OutcomeChip({ outcome }) {
  const meta = OUTCOME[outcome] || OUTCOME.prose;
  return <Chip {...meta} icon={outcome === 'failed' ? Icons.alertCircle : null}>{meta.label}</Chip>;
}

// The verdict somebody left, in the words they pressed rather than as a score.
// Good and bad are told apart by the word first and the colour second.
function VerdictChip({ verdict }) {
  const good = isGoodVerdict(verdict);
  return (
    <Chip
      hue={good ? '#007f3b' : '#d5281b'}
      ink={good ? '#00612f' : '#8a1509'}
      tint={good ? '#e6f4ec' : '#fde8e9'}
      edge={good ? '#a7d8b6' : '#f0b8b3'}
      icon={good ? Icons.check : Icons.alertCircle}>
      {verdictLabel(verdict)}
    </Chip>
  );
}

// The bold the card would have rendered. Nothing else is interpreted: this is a
// log, and text that looks like the answer is worth more here than text that has
// been through a second renderer.
function inline(line) {
  return String(line).split(/(\*\*[^*]+\*\*)/g).map((part, i) => (
    part.startsWith('**') && part.endsWith('**') && part.length > 4
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <React.Fragment key={i}>{part}</React.Fragment>
  ));
}

/**
 * The answer as the reader saw it, near enough.
 *
 * The log stores an answer as text, so the shapes the card gave it — a title, a
 * warning, the label on a disclosure — arrive as marks at the start of a line.
 * Reading those back is the difference between a page somebody can scan and a
 * page of "# " and "[warn]".
 */
function AnswerText({ text }) {
  const lines = String(text || '').split('\n');
  return (
    <div style={s('font-size:14.5px;line-height:1.55;color:#212b32;overflow-wrap:anywhere;')}>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} style={s('height:8px;')} />;

        const heading = line.match(/^(#{1,3})\s+(.*)$/);
        if (heading) {
          return (
            <div key={i} style={s(`font-size:${heading[1].length === 1 ? '16px' : '14.5px'};font-weight:700;${i ? 'margin-top:4px;' : ''}`)}>
              {inline(heading[2])}
            </div>
          );
        }

        // A note block. The safety ones keep the status red they had on the card.
        const note = line.match(/^\[(warn|critical|info)\]\s+(.*)$/);
        if (note) {
          const serious = note[1] !== 'info';
          return (
            <div key={i} style={s(`color:${serious ? '#8a1509' : '#4c6272'};${serious ? 'font-weight:600;' : ''}`)}>
              {inline(note[2])}
            </div>
          );
        }

        // What was behind a disclosure, still marked as having been behind one.
        if (line.startsWith('▸')) {
          return <div key={i} style={s('color:#4c6272;font-weight:600;margin-top:4px;')}>{inline(line)}</div>;
        }

        return <div key={i} style={s(line.startsWith('   ') ? 'padding-left:14px;' : '')}>{inline(line)}</div>;
      })}
    </div>
  );
}

/**
 * One question, and what came back.
 *
 * The question is the heading, because the question is what somebody scanning
 * the page is looking for; the answer sits under it in the shape it was written,
 * with its line breaks kept so a numbered procedure still reads as one.
 */
function QuestionCard({ row, machine, onSearch }) {
  const [open, setOpen] = React.useState(false);
  const answer = String(row.answer || '');
  const long = answer.length > PREVIEW_CHARS;
  const shown = open || !long ? answer : answer.slice(0, PREVIEW_CHARS).trimEnd() + '…';

  return (
    <li style={s(CARD + 'padding:14px 16px;')}>
      <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:7px 10px;margin-bottom:8px;')}>
        <span style={s('font-variant-numeric:tabular-nums;font-size:13px;color:#768692;')}>{timeOf(row.at)}</span>
        <OutcomeChip outcome={row.outcome} />
        {row.verdict && <VerdictChip verdict={row.verdict} />}
        <span style={s('flex:1;')} />
        {machine && <span style={s('font-size:12.5px;color:#768692;')}>{machineName(machine)}</span>}
        {row.durationMs != null && <span style={s('font-size:12.5px;color:#768692;')}>{duration(row.durationMs)}</span>}
      </div>

      <p style={s('margin:0;font-size:17px;line-height:1.4;font-weight:600;color:#212b32;overflow-wrap:anywhere;')}>
        {row.question}
      </p>

      <div style={s('display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:6px;font-size:12.5px;color:#768692;')}>
        {row.source && <span>Built from <strong style={s('color:#4c6272;font-weight:600;')}>{row.source}</strong></span>}
        {row.template && <span>Template <strong style={s('color:#4c6272;font-weight:600;')}>{row.template}</strong></span>}
        {row.model && <span style={s('font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;')}>{row.model}</span>}
        {row.images > 0 && <span>{row.images} image{row.images === 1 ? '' : 's'}</span>}
        {row.attachments > 0 && <span>{row.attachments} document{row.attachments === 1 ? '' : 's'}</span>}
      </div>

      {row.error && (
        <p style={s('margin:10px 0 0;padding:9px 12px;background:#fde8e9;border:1px solid #f0b8b3;border-radius:9px;font-size:14px;color:#8a1509;overflow-wrap:anywhere;')}>
          {row.error}
        </p>
      )}

      {answer && (
        <div style={s('margin-top:10px;border-top:1px solid #eaeff1;padding-top:10px;')}>
          <AnswerText text={shown} />
          {long && (
            <Hover tag="button" type="button" onClick={() => setOpen(!open)}
              base="margin-top:8px;background:none;border:none;padding:0;font:inherit;font-size:13.5px;font-weight:600;color:#005eb8;text-decoration:underline;cursor:pointer;"
              hover="color:#003087;">
              {open ? 'Show less' : `Show the whole answer (${number(answer.length)} characters)`}
            </Hover>
          )}
        </div>
      )}

      {onSearch && (
        <Hover tag="button" type="button" onClick={() => onSearch(row.question)}
          base="margin-top:9px;background:none;border:none;padding:0;font:inherit;font-size:13px;color:#4c6272;text-decoration:underline;cursor:pointer;"
          hover="color:#005eb8;">Find every time this was asked</Hover>
      )}
    </li>
  );
}

export default function QuestionsView({ range, machineId, onMachine }) {
  const [outcome, setOutcome] = React.useState('');
  const [rated, setRated] = React.useState('');
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

  const params = React.useCallback((more = {}) => {
    const p = new URLSearchParams({ range, limit: String(PAGE_SIZE), ...more });
    if (outcome) p.set('outcome', outcome);
    if (rated) p.set('rated', rated);
    if (machineId) p.set('machine', machineId);
    if (query) p.set('q', query);
    return p;
  }, [range, outcome, rated, machineId, query]);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/questions?' + params().toString());
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'The question log could not be read.');
      setData(body);
      setExtra([]);
      setHasMore(!!body.hasMore);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [params]);

  React.useEffect(() => { load(); }, [load]);

  const rows = React.useMemo(() => [...(data?.questions || []), ...extra], [data, extra]);

  async function loadMore() {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const res = await fetch('/api/questions?' + params({
        beforeAt: new Date(last.at).toISOString(),
        beforeId: String(last.id),
      }).toString());
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'More of the log could not be read.');
      setExtra((current) => [...current, ...(body.questions || [])]);
      setHasMore(!!body.hasMore);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMore(false);
    }
  }

  const summary = data?.summary || {};
  const machines = data?.machines || [];
  const byId = React.useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);
  const selected = machineId ? byId.get(machineId) : null;

  // Verdicts arrive as one row per verdict; the tiles want them as good, bad,
  // and which of the five words the bad ones were.
  const verdicts = summary.verdicts || [];
  const verdictTotal = (id) => (verdicts.find((v) => v.verdict === id) || {}).total || 0;
  const good = verdicts.filter((v) => isGoodVerdict(v.verdict)).reduce((n, v) => n + v.total, 0);
  const bad = verdicts.filter((v) => !isGoodVerdict(v.verdict)).reduce((n, v) => n + v.total, 0);
  const asked = summary.questions || 0;
  const share = (n) => (asked ? `${Math.round((n / asked) * 100)}% of ${number(asked)}` : '');

  // Grouped into days, in the order they came back (newest first).
  const days = React.useMemo(() => {
    const groups = [];
    let current = null;
    for (const row of rows) {
      const key = dayKey(row.at);
      if (!current || current.key !== key) {
        current = { key, rows: [] };
        groups.push(current);
      }
      current.rows.push(row);
    }
    return groups;
  }, [rows]);

  return (
    <>
      <p style={s('font-size:16.5px;color:#4c6272;margin:0 0 6px;line-height:1.55;max-width:70ch;')}>
        Every question put to the assistant and the answer it gave, newest first. The answer is stored as it was
        shown, so it still says what the reader saw after the Notebook page behind it has been rewritten.
      </p>
      <p style={s('font-size:14px;color:#768692;margin:0 0 20px;line-height:1.5;max-width:70ch;')}>
        Only the assistant writes here. The tools that exist to have a consultation pasted into them &mdash; Signpost,
        Reason for appointment, Code a document &mdash; record nothing but that they were used. Answers have only been
        kept since this log was added: questions asked before that are on the other tab, counted but without the
        answer they were given, because there was nowhere to keep it.
      </p>

      <div style={s(CARD + 'padding:14px 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:18px;')}>
        <Segmented options={OUTCOME_FILTERS} value={outcome} onChange={setOutcome} name="How it was answered" />
        <Segmented options={RATED_FILTERS} value={rated} onChange={setRated} name="What readers said" />

        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search questions and answers…"
          aria-label="Search questions and answers"
          style={s('flex:1;min-width:200px;font:inherit;font-size:15px;padding:8px 12px;border:2px solid #4c6272;border-radius:9px;background:#fff;')}
        />

        <Hover tag="button" type="button" onClick={load} disabled={loading}
          base="display:inline-flex;align-items:center;gap:7px;border:1px solid #d8dde0;border-radius:9px;padding:8px 14px;font:inherit;font-size:14px;font-weight:600;background:#fff;color:#005eb8;cursor:pointer;"
          hover="border-color:#005eb8;background:#f0f6fb;">
          <Svg w={15} sw={2.2}>{Icons.refresh}</Svg>{loading ? 'Reading…' : 'Refresh'}
        </Hover>
      </div>

      {selected && (
        <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:18px;padding:11px 15px;background:#e8f1f8;border:1px solid #aac7e0;border-radius:10px;font-size:15px;color:#00437e;')}>
          <span>Only questions asked on <strong>{machineName(selected)}</strong>.</span>
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

      <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(158px,1fr));gap:12px;margin-bottom:18px;')}>
        {/* Six tiles, not seven: how long an answer takes is a fact about the
            questions rather than a count of its own, so it rides with them and
            the row stays one row. */}
        <Tile value={number(asked)} caption={asked === 1 ? 'question asked' : 'questions asked'}
          hint={[
            summary.lastAt ? 'last one ' + ago(summary.lastAt) : 'nothing yet in this window',
            summary.averageMs ? 'typically ' + duration(summary.averageMs) : '',
          ].filter(Boolean).join(' · ')} />
        <Tile value={number(summary.fromPractice)} caption="answered from the practice"
          hint={share(summary.fromPractice || 0)} />
        <Tile value={number(summary.fromModel)} caption="the model wrote itself"
          hint={share(summary.fromModel || 0)} />
        <Tile value={number(summary.failed)} caption={summary.failed === 1 ? 'answer failed' : 'answers failed'}
          tone={summary.failed ? 'bad' : ''} hint={share(summary.failed || 0)} />
        <Tile value={number(good)} caption="called helpful" tone={good ? 'good' : ''} />
        <Tile value={number(bad)} caption={bad === 1 ? 'problem reported' : 'problems reported'}
          tone={bad ? 'bad' : ''}
          hint={bad
            ? VERDICTS.filter((v) => !v.good && verdictTotal(v.id))
              .map((v) => `${verdictTotal(v.id)} ${v.label.toLowerCase()}`).join(', ')
            : 'nobody has pressed a button'} />
      </div>

      <div style={s('display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px;margin-bottom:26px;')}>
        <Ranked title="Asked more than once" rows={summary.asked || []} labelKey="question"
          empty="Every question in this window was asked once."
          onPick={(row) => setSearch(row.question)} />
        <Ranked title="What answered them" rows={summary.templates || []} labelKey="template"
          empty="Nothing answered in this window." />
      </div>

      <h2 style={s('font-size:22px;margin:0 0 14px;letter-spacing:-0.01em;')}>
        The questions{rows.length ? ` — ${number(rows.length)} shown` : ''}
      </h2>

      {loading && !rows.length ? (
        <div style={s(CARD + 'padding:26px;font-size:15px;color:#4c6272;')}>Reading the log…</div>
      ) : !rows.length ? (
        <div style={s(CARD + 'padding:26px;font-size:15px;color:#4c6272;')}>
          Nothing matches those filters. Try a longer time range, or clear the search.
        </div>
      ) : (
        <div style={s('display:flex;flex-direction:column;gap:20px;')}>
          {days.map((day) => (
            <section key={day.key}>
              <h3 style={s('margin:0 0 10px;font-size:14px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#4c6272;')}>
                {dayHeading(day.key)}
                <span style={s('float:right;font-weight:600;text-transform:none;letter-spacing:0;color:#768692;')}>
                  {number(day.rows.length)}
                </span>
              </h3>
              <ul style={s('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;')}>
                {day.rows.map((row) => (
                  <QuestionCard
                    key={row.id}
                    row={row}
                    machine={machineId ? null : byId.get(row.machineId)}
                    onSearch={setSearch}
                  />
                ))}
              </ul>
            </section>
          ))}

          {hasMore && (
            <Hover tag="button" type="button" onClick={loadMore} disabled={loadingMore}
              base="align-self:flex-start;border:1px solid #d8dde0;border-radius:10px;padding:11px 18px;font:inherit;font-size:15px;font-weight:600;background:#fff;color:#005eb8;cursor:pointer;"
              hover="border-color:#005eb8;background:#f0f6fb;">
              {loadingMore ? 'Reading…' : 'Load older questions'}
            </Hover>
          )}
        </div>
      )}
    </>
  );
}
