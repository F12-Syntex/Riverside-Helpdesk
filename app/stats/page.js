'use client';

/* ------------------------------------------------------------------ *
 * /stats — what the assistant was asked, and what was done in the app.
 *
 * Two tabs, and the order is the point. First the questions, each with
 * the answer that was given, because that is what somebody comes here
 * to check: not how busy the app was, but whether it is saying the
 * right things. The audit log — pages, actions, failures, machines —
 * is second, where it belongs: it is the record, read when something
 * needs tracing rather than every time.
 *
 * The time window and the chosen machine are held here, so switching
 * tabs keeps the question you were asking of the data.
 *
 * Deliberately not linked from the tools page or the menu. It is
 * reached by typing the address, and it is listed at /site-index with
 * that noted.
 * ------------------------------------------------------------------ */

import React from 'react';
import Link from 'next/link';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import QuestionsView from '../_components/stats/QuestionsView';
import ActivityView from '../_components/stats/ActivityView';
import { RANGES, Segmented } from '../_components/stats/parts';

const TABS = [
  { key: 'questions', label: 'Questions and answers', subtitle: 'Questions' },
  { key: 'activity', label: 'Everything else', subtitle: 'Audit log' },
];

export default function StatsPage() {
  const [tab, setTab] = React.useState('questions');
  const [range, setRange] = React.useState('week');
  const [machineId, setMachineId] = React.useState('');

  const active = TABS.find((t) => t.key === tab) || TABS[0];

  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle={active.subtitle} />

      <main style={s('flex:1;width:100%;max-width:1100px;margin:0 auto;padding:36px 24px 64px;')}>
        <h1 style={s('font-size:30px;margin:0 0 14px;letter-spacing:-0.02em;')}>{active.label}</h1>

        {/* The two tabs and the window they are both read through, in one row
            above everything they change. */}
        <div style={s('display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;margin-bottom:18px;')}>
          <div role="tablist" aria-label="What to look at" style={s('display:inline-flex;flex-wrap:wrap;gap:6px;')}>
            {TABS.map((t) => {
              const on = t.key === tab;
              return (
                <Hover key={t.key} tag="button" type="button" role="tab" aria-selected={on}
                  onClick={() => setTab(t.key)}
                  base={'border-radius:999px;padding:8px 17px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;border:1px solid '
                    + (on ? '#005eb8;background:#005eb8;color:#fff;' : '#d8e1e5;background:#fff;color:#4c6272;')}
                  hover={on ? 'background:#00437e;border-color:#00437e;' : 'border-color:#005eb8;color:#005eb8;'}>
                  {t.label}
                </Hover>
              );
            })}
          </div>

          <Segmented options={RANGES} value={range} onChange={setRange} name="Time range" />
        </div>

        {tab === 'questions'
          ? <QuestionsView range={range} machineId={machineId} onMachine={setMachineId} />
          : <ActivityView range={range} machineId={machineId} onMachine={setMachineId} />}

        <p style={s('margin:32px 0 0;font-size:14px;color:#768692;line-height:1.5;')}>
          Verdicts on their own, without the questions around them, are at{' '}
          <Hover tag={Link} href="/feedback" base="color:#005eb8;font-weight:600;" hover="color:#003087;">/feedback</Hover>.
          {' '}Nothing on this page can change what was recorded &mdash; only a machine&rsquo;s name.
        </p>

        <Hover tag={Link} href="/" base="display:inline-flex;align-items:center;gap:7px;margin-top:18px;background:#fff;border:1px solid #d5dee2;border-radius:999px;padding:6px 14px;font-size:14px;font-weight:600;color:#005eb8;text-decoration:none;"
          hover="border-color:#005eb8;background:#f7fbff;">
          <Svg w={15} sw={2.4}>{Icons.arrowLeft}</Svg>Back to the assistant
        </Hover>
      </main>
    </div>
  );
}
