'use client';

/* ------------------------------------------------------------------ *
 * Settings — which model runs which job.
 *
 * One row per role, one field each. The field is the whole control: type in
 * it and it fuzzy-searches every model OpenRouter serves ("son 4" reaches
 * Claude Sonnet 4.6, "perp" reaches the Perplexity models), or type a full id
 * and use it as typed — including a routing variant like ":nitro", which is
 * part of the id rather than a setting of its own, and a provider pin like
 * "@google-vertex/europe", which serves the model from that provider and no
 * other (see lib/model-id.mjs).
 *
 * Blank inherits: only the top row has to be set. The exceptions are Images,
 * which falls back to a vision model of its own rather than to the row above —
 * the row above may not see pictures — and Answer check, which is not a chat
 * model at all. Its field searches the decision models instead (OpenRouter's
 * chat list does not carry them) and still takes any id typed into it.
 * ------------------------------------------------------------------ */

import React from 'react';
import { s, Hover, Svg, Icons } from '../_components/ui';
import Link from 'next/link';
import AppHeader from '../_components/AppHeader';
import AnimatedGradient from '../_components/ThinkingGradient';
import { buildIndex, fuzzySearch } from '@/lib/lookup/fuzzy';
import { isModelSlug, splitProviders } from '@/lib/model-id.mjs';
import { NO_LOG_COOKIE, NO_LOG_STORE_KEY } from '@/lib/questions/opt-out.mjs';
import { estimateQueryCost, summariseModelCosts, formatCost } from '@/lib/ai/usage-cost.mjs';

const LIST_LIMIT = 40;

// Kept in step with ROLE_SETTING_KEY in lib/settings.js. The reasoning role is
// the model itself, so it is saved as `model` rather than as an override.
const ROLE_KEYS = ['fast', 'web', 'accurx', 'superSpeed', 'images', 'check'];

// A model's advertised rate. Shown per row because it is the number people
// compare models on — but it is not what a question costs, which is why the
// measured estimate sits underneath.
function rateLine(model) {
  if (!model) return '';
  const inRate = model.promptPerMillion;
  const outRate = model.completionPerMillion;
  if (inRate == null && outRate == null) return 'price not published';
  const money = (v) => (v ? '$' + v : '$0');
  return `${money(inRate)} in / ${money(outRate)} out per 1M tokens`;
}

const INPUT = 'width:100%;box-sizing:border-box;height:44px;padding:0 14px;font:inherit;font-size:15px;border:none;border-radius:11px;background:rgba(60,70,80,.08);color:#212b32;';

// The page's own look, the same as Referrals, Contacts and Ask: the animated
// light behind a centred heading, and white cards of settings.
const ST_CSS = `
.st-bg{position:fixed;inset:0;z-index:-1;pointer-events:none;background:var(--rv-page);}
.st-bg__canvas{display:block;width:100%;height:100%;}
.st-field{transition:background-color .15s ease,box-shadow .15s ease;}
.st-field:focus{outline:none;background:#fff !important;box-shadow:0 0 0 3px rgba(0,94,184,.35);}
.st-h1{margin:0 0 12px;text-align:center;font-size:56px;font-weight:800;letter-spacing:-.04em;line-height:1.05;color:var(--rv-ink);}
.st-h1 em{font-style:normal;color:var(--rv-accent);}
.st-lede{margin:0 auto 32px;max-width:52ch;text-align:center;font-size:15.5px;line-height:1.55;color:var(--rv-ink-2);}
.st-card{background:#fff;border-radius:22px;box-shadow:0 1px 2px rgba(33,43,50,.04),0 14px 36px -14px rgba(33,43,50,.18);}
.st-h2{margin:36px 0 8px;padding:0 22px;font-size:13px;font-weight:600;color:var(--rv-ink-3);}
.st-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 22px;border:none;border-radius:999px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none;transition:background-color .15s ease,transform .12s ease,opacity .15s ease;}
.st-btn:active:not(:disabled){transform:scale(.98);}
.st-btn:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px;}
.st-btn--primary{background:var(--rv-accent);color:#fff;}
.st-btn--primary:hover:not(:disabled){background:#0068c9;}
.st-btn--primary:disabled{background:rgba(60,70,80,.18);color:#fff;cursor:default;}
.st-btn--on{background:rgba(0,127,59,.12);color:#006a32;}
.st-btn--on:hover{background:rgba(0,127,59,.2);}
.st-btn--off{background:rgba(213,40,27,.1);color:#b81f14;}
.st-btn--off:hover{background:rgba(213,40,27,.18);}
.st-more{display:flex;align-items:center;gap:12px;padding:15px 22px;color:var(--rv-ink);text-decoration:none;font-size:16px;transition:background-color .15s ease;}
.st-more + .st-more{border-top:1px solid #eef1f3;}
.st-more:hover{background:#f4f7f9;}
.st-more small{display:block;font-size:13px;color:var(--rv-ink-3);}
@media (max-width:700px){.st-h1{font-size:38px;}}
`;

function ModelField({ value, placeholder, models, index, onChange, label }) {
  const [open, setOpen] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const boxRef = React.useRef(null);

  React.useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const typed = String(value || '').trim();
  const results = React.useMemo(() => {
    if (!typed) return models.slice(0, LIST_LIMIT);
    return fuzzySearch(index, typed, LIST_LIMIT).map((r) => r.entry.model);
  }, [index, models, typed]);

  // A valid id that the catalogue does not list — a variant, or a model newer
  // than the list — is offered as itself, first, so Enter takes what was typed.
  const exact = models.some((m) => m.id === typed);
  const options = (isModelSlug(typed) && !exact ? [typed] : []).concat(results.map((m) => m.id));
  const bad = !!typed && !isModelSlug(typed);

  React.useEffect(() => { setCursor(0); }, [typed]);

  const take = (id) => { if (id) { onChange(id); setOpen(false); } };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setCursor((c) => {
        const next = e.key === 'ArrowDown' ? c + 1 : c - 1;
        if (next < 0) return options.length - 1;
        return next >= options.length ? 0 : next;
      });
      return;
    }
    if (e.key === 'Enter' && open && options[cursor]) { e.preventDefault(); take(options[cursor]); return; }
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div ref={boxRef} style={s('position:relative;')}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value.trim()); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="st-field" style={s(INPUT + (bad ? 'box-shadow:0 0 0 2px #d5281b;' : ''))}
      />
      {open && options.length > 0 && (
        <div role="listbox" style={s('position:absolute;z-index:20;top:calc(100% + 4px);left:0;right:0;max-height:280px;overflow-y:auto;background:#fff;border:none;border-radius:16px;box-shadow:0 0 0 .5px rgba(0,0,0,.08),0 12px 40px -8px rgba(33,43,50,.3);padding:6px;')}>
          {options.map((id, i) => {
            // A pinned id is still that model — find it by the plain id, and
            // say where it will be served from.
            const { model: plain, providers } = splitProviders(id);
            const model = models.find((m) => m.id === plain) || models.find((m) => m.id === plain.split(':')[0]);
            return (
              <Hover key={id} tag="button" type="button" role="option" aria-selected={i === cursor}
                onMouseDown={(e) => e.preventDefault()} onClick={() => take(id)}
                base={'display:block;width:100%;text-align:left;border:none;border-radius:10px;padding:8px 12px;font:inherit;cursor:pointer;background:' + (i === cursor ? '#e8f1f8' : 'transparent') + ';'}
                hover="background:#e8f1f8;">
                <span style={s('display:block;font-size:14.5px;color:#212b32;overflow-wrap:anywhere;')}>{id}</span>
                {model && model.name ? (
                  <span style={s('display:block;font-size:12.5px;color:#4c6272;overflow-wrap:anywhere;')}>
                    {model.name}{model.vision ? '' : ' · text only'}{providers.length ? ' · only via ' + providers.join(', ') : ''}
                  </span>
                ) : null}
              </Hover>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ name, job, rate, used, children }) {
  return (
    <div style={s('display:flex;flex-wrap:wrap;gap:6px 18px;align-items:baseline;padding:16px 0;border-top:1px solid #eef1f3;')}>
      <div style={s('flex:0 0 150px;min-width:0;')}>
        <span style={s('display:block;font-size:15.5px;font-weight:600;color:#212b32;')}>{name}</span>
        <span style={s('display:block;font-size:13px;color:#4c6272;')}>{job}</span>
      </div>
      <div style={s('flex:1 1 260px;min-width:0;')}>
        {children}
        {(rate || used) && (
          <span style={s('display:block;font-size:12.5px;color:#768692;margin-top:5px;font-variant-numeric:tabular-nums;')}>
            {[rate, used].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [models, setModels] = React.useState([]);
  const [setting, setSetting] = React.useState(null);
  const [model, setModel] = React.useState('');
  const [roles, setRoles] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [error, setError] = React.useState('');
  // Whether questions asked AT THIS COMPUTER are written to the question log.
  // Not a practice setting and not saved on the server: it belongs to the
  // machine it is set at, so switching it off here leaves the front desk
  // logging exactly as it was. Starts null so the switch does not flash the
  // wrong way round before the cookie has been read.
  const [logging, setLogging] = React.useState(null);

  React.useEffect(() => {
    const cookie = document.cookie.split('; ').find((row) => row.startsWith(NO_LOG_COOKIE + '='));
    const fromCookie = cookie ? decodeURIComponent(cookie.slice(NO_LOG_COOKIE.length + 1)) : '';
    let fromStore = '';
    try { fromStore = window.localStorage.getItem(NO_LOG_STORE_KEY) || ''; } catch (e) { /* private mode */ }
    // Either one saying "off" is enough: clearing cookies must not quietly turn
    // the recording back on for somebody who switched it off.
    const off = ['1', 'true', 'off'].includes(String(fromCookie || fromStore).trim().toLowerCase());
    setLogging(!off);
  }, []);

  React.useEffect(() => {
    let live = true;
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        if (d.error) { setError(d.error); return; }
        setSetting(d);
        setModel(d.model);
        setRoles(d.roleStored || {});
      })
      .catch((e) => live && setError('Could not read the settings: ' + e.message));
    fetch('/api/settings/models')
      .then((r) => r.json())
      .then((d) => live && setModels(d.models || []))
      .catch(() => { /* the fields still accept a typed id */ });
    return () => { live = false; };
  }, []);

  // The directory's fuzzy engine, over the model catalogue: the id carries the
  // vendor, so "anthropic", "sonnet" and "gemini flash" all find something.
  const index = React.useMemo(
    () => buildIndex(models.map((m) => ({ label: m.name, aliases: [m.id, m.id.replace(/[/:-]/g, ' ')], model: m }))),
    [models],
  );
  // The answer check's own list: decision models, which the chat catalogue
  // above does not include. Sent by the server with the settings.
  const checkModels = React.useMemo(() => (setting && setting.checkModels) || [], [setting]);
  const checkIndex = React.useMemo(
    () => buildIndex(checkModels.map((m) => ({ label: m.name, aliases: [m.id, m.id.replace(/[/:-]/g, ' ')], model: m }))),
    [checkModels],
  );

  // Written to both places the machine remembers things, for a year, the same
  // way the machine id is held (lib/audit/client.js).
  function setLoggingHere(on) {
    const value = on ? '' : '1';
    const year = 365 * 24 * 60 * 60;
    document.cookie = NO_LOG_COOKIE + '=' + value + '; Max-Age=' + (on ? 0 : year) + '; Path=/; SameSite=Lax';
    try {
      if (on) window.localStorage.removeItem(NO_LOG_STORE_KEY);
      else window.localStorage.setItem(NO_LOG_STORE_KEY, '1');
    } catch (e) { /* private mode — the cookie still carries it */ }
    setLogging(on);
  }

  const roleValue = (key) => String(roles[key] || '');
  const setRole = (key, value) => { setRoles((cur) => ({ ...cur, [key]: value })); setNote(''); };

  const valid = isModelSlug(model)
    && ROLE_KEYS.every((k) => !roleValue(k) || isModelSlug(roleValue(k)));
  const dirty = !!setting && (model !== setting.model
    || ROLE_KEYS.some((k) => roleValue(k) !== String((setting.roleStored || {})[k] || '')));

  // What each role resolves to, and what that model charges. The catalogue is
  // keyed by base id, so a ":nitro" variant is priced as the model it decorates.
  // AccurX routing inherits from FAST, not from the model above — see
  // resolveRoles in lib/settings.js. Its placeholder says so, so an empty box
  // never reads as "the reasoning model".
  const fastModel = roleValue('fast') || model;
  const resolved = {
    reasoning: model,
    fast: fastModel,
    web: roleValue('web') || model,
    accurx: roleValue('accurx') || fastModel,
    superSpeed: roleValue('superSpeed') || fastModel,
    // Images falls back to its own default rather than to any row above: the
    // model above may not see pictures at all. The default comes from the
    // server, so an empty box is captioned with what it actually resolves to.
    images: roleValue('images') || (setting ? setting.defaultImagesModel : ''),
    // Like Images, its own default rather than any row above: no chat model
    // can stand in for a decision model.
    check: roleValue('check') || (setting ? setting.defaultCheckModel : ''),
  };
  // Priced from the catalogue, or — for the decision models it does not list —
  // from the rates the server sent with them.
  const priced = React.useMemo(() => models.concat(checkModels), [models, checkModels]);
  const priceOf = (id) => {
    const plain = String(id).split('@')[0];
    return priced.find((m) => m.id === plain) || priced.find((m) => m.id === plain.split(':')[0]) || null;
  };
  const prices = React.useMemo(() => Object.fromEntries(priced.map((m) => [m.id, m])), [priced]);

  // The estimate. Measured tokens per question from ai_usage, priced at whatever
  // each role is set to now — so changing a model here changes the figure before
  // anything is saved, and a role nobody has run yet is left out rather than
  // guessed at.
  const measured = (setting && setting.usage) || { byRole: {}, byModel: {}, turns: 0, window: 0, rolling: null };
  // What the questions in the rolling window were actually charged, as
  // OpenRouter reported it — beside the estimate, not instead of it: the
  // estimate prices the models chosen NOW, the charge is what was spent.
  const rolling = measured.rolling || null;
  const estimate = estimateQueryCost({ averages: measured.byRole, roleModels: resolved, prices });
  // Every model that has ever answered a question here, with what it cost. Kept
  // per model, so switching away does not erase a model's record and switching
  // back brings it straight back.
  const history = summariseModelCosts({ byModel: measured.byModel || {}, prices, roleModels: resolved });
  const usedLine = (role) => {
    // Only what this role used ON THE MODEL IT IS SET TO NOW. A model that has
    // not run this job yet shows nothing rather than the last model's figures.
    const u = (measured.byRole[role] || {})[resolved[role]];
    if (!u) return 'not measured on this model yet';
    return `${u.inputTokens.toLocaleString()} in / ${u.outputTokens.toLocaleString()} out per question`;
  };

  async function save() {
    setSaving(true);
    setError('');
    setNote('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, roles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'That could not be saved.');
      setSetting(data);
      setModel(data.model);
      setRoles(data.roleStored || {});
      setNote('Saved.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s('position:relative;min-height:100%;display:flex;flex-direction:column;')}>
      <style data-st="1" dangerouslySetInnerHTML={{ __html: ST_CSS }} />
      <div className="st-bg" aria-hidden="true"><AnimatedGradient always alpha={[0.12, 0.62, 0.42]} className="st-bg__canvas" /></div>
      <AppHeader subtitle="Settings" />

      <main style={s('flex:1;width:100%;max-width:688px;margin:0 auto;padding:clamp(20px,9vh,110px) 24px 56px;')}>
        <h1 className="st-h1">Practice <em>settings</em></h1>
        <p className="st-lede">
          Type to search, or paste an id. Blank inherits the model above. Add
          {' '}<code>@provider</code> to pin where a model runs — e.g.{' '}
          <code>anthropic/claude-haiku-5.5@google-vertex/europe</code>.
        </p>

        <h2 className="st-h2" style={{ marginTop: 0 }}>Models</h2>
        <section className="st-card" style={s('padding:4px 22px 22px;')}>
          <Row name="Reasoning" job="Decides and writes the answer" rate={rateLine(priceOf(resolved.reasoning))} used={usedLine('reasoning')}>
            <ModelField
              label="Reasoning model" value={model} models={models} index={index}
              placeholder={setting ? setting.defaultModel : 'vendor/model'}
              onChange={(v) => { setModel(v); setNote(''); }}
            />
          </Row>
          <Row name="Fast" job="Reads, searches, background jobs" rate={rateLine(priceOf(resolved.fast))} used={usedLine('fast')}>
            <ModelField
              label="Fast model" value={roleValue('fast')} models={models} index={index}
              placeholder={model || 'inherit'} onChange={(v) => setRole('fast', v)}
            />
          </Row>
          <Row name="Web search" job="Searches the internet" rate={rateLine(priceOf(resolved.web))} used={usedLine('web')}>
            <ModelField
              label="Web search model" value={roleValue('web')} models={models} index={index}
              placeholder={model || 'inherit'} onChange={(v) => setRole('web', v)}
            />
          </Row>
          {/* The one role that makes a judgement about a patient rather than
              reading or extracting. It inherits from Fast rather than from the
              model above, so leaving it blank changes nothing — the row is here
              so that a practice CAN pay for a better reader on the one decision
              where it shows. */}
          <Row name="AccurX routing" job="Reads a pasted /accurx and says where it goes" rate={rateLine(priceOf(resolved.accurx))} used={usedLine('accurx')}>
            <ModelField
              label="AccurX routing model" value={roleValue('accurx')} models={models} index={index}
              placeholder={fastModel || 'inherit'} onChange={(v) => setRole('accurx', v)}
            />
          </Row>
          {/* The only row where the answer is waited for with nothing on the
              screen yet: this one holds the send while a message is checked for
              patient details. Set it to the quickest thing on the list — it
              answers one closed question with one word, and every millisecond
              is a millisecond somebody spends looking at a message they have
              already finished typing. It inherits from Fast, not from the model
              above, so a careful slow model never ends up in front of the
              keyboard by accident. */}
          <Row name="Super speed" job="Checks a message for patient details before it is sent" rate={rateLine(priceOf(resolved.superSpeed))} used={usedLine('superSpeed')}>
            <ModelField
              label="Super speed model" value={roleValue('superSpeed')} models={models} index={index}
              placeholder={fastModel || 'inherit'} onChange={(v) => setRole('superSpeed', v)}
            />
          </Row>
          {/* The one row that does not inherit. A message with a picture on it
              — a screenshot of the repeat-medication screen, a photo of a
              letter — is read by this model whichever path it takes, because
              the model above may be text-only. Blank is a small vision model
              chosen for exactly this, named in the box. */}
          <Row name="Images" job="Reads any message with a picture attached" rate={rateLine(priceOf(resolved.images))} used={usedLine('images')}>
            <ModelField
              label="Images model" value={roleValue('images')} models={models} index={index}
              placeholder={(setting && setting.defaultImagesModel) || 'vendor/model'} onChange={(v) => setRole('images', v)}
            />
          </Row>
          {/* The one row that is not a chat model. It scores each Notebook
              answer before it is shown — does it answer what was asked? — and
              never writes anything. Its list is OpenRouter's decision models,
              which the chat list above does not carry; any id can still be
              typed. Blank is TypeSafe's Jev, named in the box. */}
          <Row name="Answer check" job="Checks each Notebook answer answers the question" rate={rateLine(priceOf(resolved.check))} used={usedLine('check')}>
            <ModelField
              label="Answer check model" value={roleValue('check')} models={checkModels} index={checkIndex}
              placeholder={(setting && setting.defaultCheckModel) || 'vendor/model'} onChange={(v) => setRole('check', v)}
            />
          </Row>

          <div style={s('border-top:1px solid #eef1f2;padding:14px 0 2px;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline;')}>
            <span style={s('flex:0 0 150px;font-size:15.5px;font-weight:600;color:#212b32;')}>Per question</span>
            <span style={s('flex:1 1 260px;font-size:15.5px;color:#212b32;font-variant-numeric:tabular-nums;')}>
              {estimate.measured ? (
                <>
                  <strong>{formatCost(estimate.total)}</strong>
                  <span style={s('font-size:13px;color:#768692;')}>
                    {' '}— at list prices, measured over the last {measured.turns.toLocaleString()} question{measured.turns === 1 ? '' : 's'}
                    {estimate.missing.length ? `, excluding ${estimate.missing.join(' and ')} (not run yet)` : ''}
                    {estimate.unpriced.length ? `, excluding ${estimate.unpriced.join(' and ')} (no published price)` : ''}
                  </span>
                </>
              ) : (
                <span style={s('font-size:13.5px;color:#768692;')}>
                  Not measured on these models yet — ask a few questions and the real cost appears here.
                </span>
              )}
            </span>
          </div>

          {rolling && rolling.turns > 0 && (
            <div style={s('border-top:1px solid #eef1f2;margin-top:14px;padding:14px 0 2px;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline;')}>
              <span style={s('flex:0 0 150px;font-size:15.5px;font-weight:600;color:#212b32;')}>
                Last {rolling.turns.toLocaleString()} question{rolling.turns === 1 ? '' : 's'}
              </span>
              <span style={s('flex:1 1 260px;font-size:15.5px;color:#212b32;font-variant-numeric:tabular-nums;line-height:1.5;')}>
                {rolling.costedTurns > 0 ? (
                  <>
                    <strong>{formatCost(rolling.totalCost)}</strong> charged in total, <strong>{formatCost(rolling.avgCost)}</strong> per question on average
                  </>
                ) : (
                  <span style={s('font-size:13.5px;color:#768692;')}>No charges recorded yet — they appear as questions are asked.</span>
                )}
                <span style={{ ...s('display:block;font-size:13px;color:#768692;') }}>
                  {rolling.avgInputTokens.toLocaleString()} tokens in
                  {rolling.avgCachedTokens != null ? ` (${rolling.avgCachedTokens.toLocaleString()} from cache)` : ''}
                  {' '}and {rolling.avgOutputTokens.toLocaleString()} out per question
                  {rolling.costedTurns > 0 && rolling.costedTurns < rolling.turns ? `; charges from ${rolling.costedTurns} of them` : ''}
                  {rolling.since ? ` · since ${new Date(rolling.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                </span>
              </span>
            </div>
          )}

          {history.length > 0 && (
            <div style={s('border-top:1px solid #eef1f2;margin-top:14px;padding-top:14px;')}>
              <div style={s('font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#768692;margin-bottom:8px;')}>
                Cost per question, by model
              </div>
              <div style={s('overflow-x:auto;')}>
                <table style={s('width:100%;border-collapse:collapse;font-size:13.5px;')}>
                  <thead>
                    <tr style={s('font-size:11.5px;color:#768692;text-align:right;')}>
                      <th style={s('padding:0 10px 4px 0;font-weight:600;text-align:left;')}>Model</th>
                      <th style={s('padding:0 10px 4px 0;font-weight:600;')}>Estimate</th>
                      <th style={s('padding:0 10px 4px 0;font-weight:600;')}>Charged</th>
                      <th style={s('padding:0 0 4px;font-weight:600;')}>Questions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.model}>
                        <td style={s('padding:5px 10px 5px 0;color:#212b32;overflow-wrap:anywhere;')}>
                          {row.model}
                          {row.inUse ? <span style={s('margin-left:7px;font-size:11.5px;font-weight:700;letter-spacing:.03em;border-radius:4px;padding:1px 6px;background:#eef7ee;color:#00532a;')}>IN USE</span> : null}
                        </td>
                        <td style={s('padding:5px 10px 5px 0;text-align:right;white-space:nowrap;color:#212b32;font-variant-numeric:tabular-nums;')}>
                          {row.priced ? formatCost(row.cost) : 'no published price'}
                        </td>
                        <td style={s('padding:5px 10px 5px 0;text-align:right;white-space:nowrap;color:#212b32;font-variant-numeric:tabular-nums;')}>
                          {row.charged != null ? formatCost(row.charged) : '—'}
                        </td>
                        <td style={s('padding:5px 0;text-align:right;white-space:nowrap;color:#768692;font-variant-numeric:tabular-nums;')}>
                          {row.turns.toLocaleString()} question{row.turns === 1 ? '' : 's'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={s('margin:8px 0 0;font-size:12.5px;color:#768692;line-height:1.45;')}>
                Per model, over the last {measured.window || 100} questions: the estimate at list prices, then what OpenRouter actually charged. Older questions are dropped as new ones come in, so a model shows here only while it has questions in that window.
              </p>
            </div>
          )}

          <div style={s('display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:18px;')}>
            <button type="button" className="st-btn st-btn--primary" disabled={!dirty || !valid || saving} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {note && (
              <span style={s('display:flex;gap:6px;align-items:center;font-size:15px;color:#007f3b;font-weight:600;')}>
                <Svg w={16} stroke="#007f3b" sw={2.4}>{Icons.check}</Svg>{note}
              </span>
            )}
          </div>

          {!valid && (
            <p style={s('margin:12px 0 0;font-size:13.5px;color:#d5281b;font-weight:600;')}>
              An id looks like vendor/model, with an optional :variant and @provider (several separated by commas).
            </p>
          )}
          {error && (
            <p style={s('margin:12px 0 0;font-size:14px;color:#d5281b;font-weight:600;')}>{error}</p>
          )}
        </section>

        {/* THIS COMPUTER, NOT THE PRACTICE. Everything above is saved on the
            server and applies everywhere; this one is a cookie on the machine
            it is set at, takes effect on the next question, and needs no Save.
            It is a switch rather than a promise: what it turns off is the row
            being written at all. */}
        <h2 className="st-h2">This computer: applies to this machine only, from the next question</h2>

        <section className="st-card" style={s('padding:20px 22px;')}>
          <div style={s('display:flex;flex-wrap:wrap;gap:14px 18px;align-items:center;justify-content:space-between;')}>
            <span style={s('flex:1 1 260px;min-width:0;')}>
              <span style={s('display:block;font-size:15.5px;font-weight:600;color:#212b32;')}>Log questions from this computer</span>
              <span style={s('display:block;font-size:13.5px;color:#4c6272;margin-top:3px;line-height:1.45;')}>
                {logging === false
                  ? 'Off. Questions asked here are answered as usual but no record of them is kept, so they do not appear in the statistics.'
                  : 'On. What is asked here, and the answer given, are recorded so they can be read back in the statistics.'}
              </span>
              <span style={s('display:block;font-size:12.5px;color:#768692;margin-top:6px;line-height:1.45;')}>
                The activity log — which pages were opened — is a separate record and is not affected.
              </span>
            </span>
            <button type="button" className={'st-btn ' + (logging === false ? 'st-btn--off' : 'st-btn--on')} style={{ flex: 'none' }} disabled={logging === null}
              onClick={() => setLoggingHere(logging === false)}>
              {logging === false ? 'Logging off' : 'Logging on'}
            </button>
          </div>
        </section>

        {/* Pages that used to be in the menu. The header gear comes here, so the
            two read in a quiet half hour are one click away. */}
        <h2 className="st-h2">Also here</h2>
        <section className="st-card" style={s('overflow:hidden;')}>
          <Link href="/questions" className="st-more"><span style={s('flex:1;min-width:0;')}>Questions<small>What the assistant could not answer</small></span><Svg w={18} sw={2}>{Icons.chevronRight}</Svg></Link>
          <Link href="/feedback" className="st-more"><span style={s('flex:1;min-width:0;')}>Answer feedback<small>How answers were rated</small></span><Svg w={18} sw={2}>{Icons.chevronRight}</Svg></Link>
        </section>
      </main>
    </div>
  );
}
