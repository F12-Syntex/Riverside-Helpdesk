'use client';

/* ------------------------------------------------------------------ *
 * Settings — which model runs which job.
 *
 * The jobs are not seven equal things, and the page no longer draws them as
 * seven equal cards. They are a chain of inheritance: Reasoning is the
 * practice's model; Fast and Web search fall back to it when blank; AccurX
 * routing and Super speed fall back to Fast; Images and Answer check stand
 * on their own because nothing above them can do their job. The ledger on
 * the left draws exactly that — rows grouped by what they fall back to, with
 * the resolved model written into every blank field — so a blank row never
 * has to be puzzled over.
 *
 * Each field is the whole control: type in it and it fuzzy-searches every
 * model OpenRouter serves ("son 4" reaches Claude Sonnet 4.6, "perp" reaches
 * the Perplexity models), or type a full id and use it as typed — including
 * a routing variant like ":nitro", which is part of the id, and a provider
 * pin like "@google-vertex/europe", which serves the model from that provider
 * and no other (see lib/model-id.mjs). Answer check searches the decision
 * models instead, which OpenRouter's chat list does not carry.
 *
 * The right-hand column is the consequence of what is typed: the cost per
 * question, re-priced live as the rows change and before anything is saved.
 * ------------------------------------------------------------------ */

import React from 'react';
import { s, Svg, Icons } from '../_components/ui';
import Link from 'next/link';
import AppHeader from '../_components/AppHeader';
import { buildIndex, fuzzySearch } from '@/lib/lookup/fuzzy';
import { isModelSlug, splitProviders } from '@/lib/model-id.mjs';
import { NO_LOG_COOKIE, NO_LOG_STORE_KEY } from '@/lib/questions/opt-out.mjs';
import { estimateQueryCost, summariseModelCosts, formatCost } from '@/lib/ai/usage-cost.mjs';

const LIST_LIMIT = 40;

// Kept in step with ROLE_SETTING_KEY in lib/settings.js. The reasoning role is
// the model itself, so it is saved as `model` rather than as an override.
const ROLE_KEYS = ['fast', 'web', 'accurx', 'superSpeed', 'images', 'check'];

// Short names for the roles, used where one role has to be named inside
// another's caption ("falls back to Fast").
const ROLE_NAME = {
  reasoning: 'Reasoning', fast: 'Fast', web: 'Web search', accurx: 'AccurX routing',
  superSpeed: 'Super speed', images: 'Images', check: 'Answer check',
};

// A model's advertised rate, split so the two numbers line up down the page.
function rate(model) {
  if (!model) return null;
  const inRate = model.promptPerMillion;
  const outRate = model.completionPerMillion;
  if (inRate == null && outRate == null) return null;
  const money = (v) => (v ? '$' + v : '$0');
  return { in: money(inRate), out: money(outRate) };
}

// Every colour on the page is a token from globals.css; nothing new is named.
const ST_CSS = `
.st-root{position:relative;height:100vh;overflow:hidden;display:flex;flex-direction:column;}
.st-main{flex:1;min-height:0;overflow:hidden;width:100%;max-width:1180px;margin:0 auto;padding:22px 28px 24px;box-sizing:border-box;display:flex;flex-direction:column;}
.st-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;align-items:start;}
.st-card{background:var(--rv-surface);border-radius:18px;box-shadow:0 1px 2px rgba(33,43,50,.04),0 14px 36px -16px rgba(33,43,50,.2);}

/* The ledger. One card, rows grouped by what a blank falls back to. */
.st-ledger{overflow:visible;}
.st-group{padding:6px 0 10px;}
.st-group + .st-group{border-top:1px solid var(--rv-line-soft);}
.st-group__head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:12px 22px 4px;}
.st-group__title{font-size:13px;font-weight:700;color:var(--rv-ink);}
.st-group__note{font-size:12.5px;color:var(--rv-ink-3);text-align:right;}
.st-row{display:grid;grid-template-columns:170px minmax(0,1fr) 150px;gap:0 18px;align-items:start;padding:10px 22px;position:relative;}
.st-row--child{padding-left:22px;}
.st-row--child .st-row__name::before{content:'';position:absolute;left:-14px;top:9px;width:9px;height:9px;border-left:1.5px solid var(--rv-line);border-bottom:1.5px solid var(--rv-line);border-radius:0 0 0 4px;}
.st-row--child .st-row__name{margin-left:22px;position:relative;}
.st-row__name{min-width:0;padding-top:9px;}
.st-row__title{display:block;font-size:15px;font-weight:700;color:var(--rv-ink);line-height:1.2;}
.st-row__job{display:block;font-size:12.5px;color:var(--rv-ink-2);line-height:1.4;margin-top:2px;}
.st-row__field{min-width:0;}
.st-row__caption{display:block;margin:5px 2px 0;font-size:12px;line-height:1.4;color:var(--rv-ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.st-row__caption b{font-weight:600;color:var(--rv-ink-2);}
.st-row__rate{text-align:right;padding-top:7px;font-variant-numeric:tabular-nums;font-size:13px;color:var(--rv-ink);line-height:1.35;}
.st-row__rate small{display:block;font-size:11.5px;color:var(--rv-ink-3);}
.st-row__rate.is-empty{color:var(--rv-ink-4);font-size:12.5px;}

/* The field. Rest is a filled control; focus is a white one with the NHS ring. */
.st-field{width:100%;box-sizing:border-box;height:40px;padding:0 13px;font:inherit;font-size:14.5px;border:1px solid transparent;border-radius:10px;background:var(--rv-surface-3);color:var(--rv-ink);transition:background-color .15s ease,box-shadow .15s ease,border-color .15s ease;}
.st-field::placeholder{color:var(--rv-ink-4);}
.st-field:hover{background:#e9eef0;}
.st-field:focus{outline:none;background:#fff;border-color:var(--rv-accent);box-shadow:0 0 0 3px rgba(0,94,184,.2);}
.st-field.is-set{background:var(--rv-accent-dim);border-color:var(--rv-accent-line);}
.st-field.is-set:focus{background:#fff;border-color:var(--rv-accent);}
.st-field.is-bad,.st-field.is-bad:focus{border-color:#d5281b;box-shadow:0 0 0 3px rgba(213,40,27,.18);}
.st-clear{position:absolute;right:6px;top:6px;width:28px;height:28px;border:none;border-radius:8px;background:transparent;color:var(--rv-ink-3);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;}
.st-clear:hover{background:rgba(60,70,80,.1);color:var(--rv-ink);}
.st-clear:focus-visible{outline:2px solid var(--rv-accent);outline-offset:1px;}
.st-list{position:absolute;z-index:20;top:calc(100% + 6px);left:0;right:0;max-height:300px;overflow-y:auto;background:#fff;border-radius:14px;box-shadow:0 0 0 .5px rgba(0,0,0,.08),0 16px 44px -10px rgba(33,43,50,.32);padding:6px;}
.st-opt{display:block;width:100%;text-align:left;border:none;border-radius:9px;padding:8px 12px;font:inherit;cursor:pointer;background:transparent;}
.st-opt.is-cursor,.st-opt:hover{background:var(--rv-accent-dim);}
.st-opt__id{display:block;font-size:14px;color:var(--rv-ink);overflow-wrap:anywhere;}
.st-opt__meta{display:block;font-size:12.5px;color:var(--rv-ink-2);overflow-wrap:anywhere;}

/* The save bar: the ledger's footer, which wakes up when something changed. */
.st-foot{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 22px;border-top:1px solid var(--rv-line-soft);background:var(--rv-surface);border-radius:0 0 18px 18px;}
.st-foot__msg{margin:0;font-size:13.5px;line-height:1.4;color:var(--rv-ink-2);min-width:0;}
.st-foot__msg.is-error{color:#b81f14;font-weight:600;}
.st-foot__msg.is-saved{color:var(--rv-green);font-weight:600;display:inline-flex;align-items:center;gap:6px;}
.st-foot__actions{display:flex;align-items:center;gap:8px;flex:none;}
.st-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:38px;padding:0 18px;border:none;border-radius:999px;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;text-decoration:none;transition:background-color .15s ease,transform .12s ease,opacity .15s ease,color .15s ease;}
.st-btn:active:not(:disabled){transform:scale(.98);}
.st-btn:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px;}
.st-btn--primary{background:var(--rv-accent);color:#fff;}
.st-btn--primary:hover:not(:disabled){background:var(--rv-accent-hi);}
.st-btn--primary:disabled{background:rgba(60,70,80,.14);color:var(--rv-ink-4);cursor:default;}
.st-btn--quiet{background:transparent;color:var(--rv-ink-2);}
.st-btn--quiet:hover:not(:disabled){background:var(--rv-surface-3);color:var(--rv-ink);}
.st-btn--quiet:disabled{opacity:0;pointer-events:none;}

/* The right-hand column. */
.st-side{display:flex;flex-direction:column;gap:14px;position:sticky;top:calc(var(--rv-top-h) + 10px);}
.st-cost{padding:18px 20px 16px;}
.st-cost__label{font-size:13px;font-weight:700;color:var(--rv-ink);}
.st-cost__hint{font-size:12.5px;color:var(--rv-ink-3);margin-left:6px;}
.st-cost__big{display:flex;align-items:baseline;gap:8px;margin-top:6px;font-variant-numeric:tabular-nums;}
.st-cost__num{font-size:40px;font-weight:800;letter-spacing:-.03em;line-height:1;color:var(--rv-ink);transition:color .2s ease;}
.st-cost__num.is-dirty{color:var(--rv-accent);}
.st-cost__unit{font-size:13.5px;color:var(--rv-ink-2);}
.st-cost__foot{margin:8px 0 0;font-size:12.5px;line-height:1.45;color:var(--rv-ink-3);}
.st-cost__empty{margin:8px 0 0;font-size:13.5px;line-height:1.5;color:var(--rv-ink-2);}
.st-split{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;padding-top:14px;border-top:1px solid var(--rv-line-soft);font-variant-numeric:tabular-nums;}
.st-split__num{display:block;font-size:19px;font-weight:700;letter-spacing:-.01em;color:var(--rv-ink);line-height:1.1;}
.st-split__lbl{display:block;margin-top:3px;font-size:12px;line-height:1.4;color:var(--rv-ink-3);}
.st-table{width:100%;border-collapse:collapse;font-size:12.5px;table-layout:fixed;margin-top:14px;padding-top:12px;border-top:1px solid var(--rv-line-soft);}
.st-table thead th{font-size:11.5px;font-weight:600;color:var(--rv-ink-3);text-align:right;padding:12px 0 5px 8px;}
.st-table thead th:first-child{text-align:left;padding-left:0;}
.st-table td{padding:4px 0 4px 8px;text-align:right;color:var(--rv-ink);font-variant-numeric:tabular-nums;border-top:1px solid var(--rv-line-soft);}
.st-table td:first-child{text-align:left;padding-left:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.st-table tr.is-use td{font-weight:600;}
.st-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--rv-green);margin-right:7px;vertical-align:1px;}
.st-table__foot{margin:8px 0 0;font-size:11.5px;color:var(--rv-ink-3);line-height:1.4;}

.st-local{padding:16px 20px;display:flex;gap:14px;align-items:center;justify-content:space-between;}
.st-local__title{display:block;font-size:14.5px;font-weight:700;color:var(--rv-ink);}
.st-local__text{display:block;font-size:12.5px;color:var(--rv-ink-2);margin-top:3px;line-height:1.45;}
.st-switch{position:relative;flex:none;width:46px;height:26px;border:none;border-radius:999px;background:var(--rv-line);cursor:pointer;transition:background-color .18s ease;padding:0;}
.st-switch::after{content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s ease;}
.st-switch[aria-checked="true"]{background:var(--rv-green);}
.st-switch[aria-checked="true"]::after{transform:translateX(20px);}
.st-switch:disabled{opacity:.5;cursor:default;}
.st-switch:focus-visible{outline:2px solid var(--rv-accent);outline-offset:2px;}

.st-more{display:flex;align-items:center;gap:10px;padding:12px 20px;color:var(--rv-ink);text-decoration:none;font-size:14.5px;font-weight:600;transition:background-color .15s ease;}
.st-more:first-child{border-radius:18px 18px 0 0;}
.st-more:last-child{border-radius:0 0 18px 18px;}
.st-more + .st-more{border-top:1px solid var(--rv-line-soft);}
.st-more:hover{background:var(--rv-surface-2);}
.st-more small{display:block;font-size:12px;font-weight:400;color:var(--rv-ink-3);}
.st-more svg{color:var(--rv-ink-3);flex:none;}

@media (prefers-reduced-motion:reduce){.st-field,.st-btn,.st-switch,.st-switch::after,.st-cost__num{transition:none;}}
@media (max-width:1040px){
.st-grid{grid-template-columns:1fr;}
.st-side{position:static;}
.st-row{grid-template-columns:150px minmax(0,1fr) 130px;}
}
@media (max-width:700px){
.st-main{padding:16px 16px 20px;}
.st-row{grid-template-columns:1fr;gap:6px;padding:12px 18px;}
.st-row--child .st-row__name{margin-left:0;}
.st-row--child .st-row__name::before{display:none;}
.st-row__name{padding-top:0;}
.st-row__rate{text-align:left;padding-top:0;}
.st-row__rate small{display:inline;margin-left:5px;}
.st-group__head{padding:12px 18px 2px;flex-direction:column;align-items:flex-start;gap:2px;}
.st-group__note{text-align:left;}
.st-foot{flex-direction:column;align-items:stretch;}
.st-foot__actions{justify-content:flex-end;}
}
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
        className={'st-field' + (typed ? ' is-set' : '') + (bad ? ' is-bad' : '')}
        style={typed ? { paddingRight: 38 } : undefined}
      />
      {typed && (
        <button type="button" className="st-clear" aria-label={'Clear ' + label} title="Clear"
          onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(''); setOpen(false); }}>
          <Svg w={14} sw={2.2}>{Icons.close}</Svg>
        </button>
      )}
      {open && options.length > 0 && (
        <div role="listbox" className="st-list">
          {options.map((id, i) => {
            // A pinned id is still that model — find it by the plain id, and
            // say where it will be served from.
            const { model: plain, providers } = splitProviders(id);
            const model = models.find((m) => m.id === plain) || models.find((m) => m.id === plain.split(':')[0]);
            return (
              <button key={id} type="button" role="option" aria-selected={i === cursor}
                className={'st-opt' + (i === cursor ? ' is-cursor' : '')}
                onMouseDown={(e) => e.preventDefault()} onClick={() => take(id)}>
                <span className="st-opt__id">{id}</span>
                {model && model.name ? (
                  <span className="st-opt__meta">
                    {model.name}{model.vision ? '' : ', text only'}{providers.length ? ', only via ' + providers.join(', ') : ''}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// One line of the ledger. `caption` says what the field resolves to when it is
// blank, or what the row measured when it is set; `price` is the resolved
// model's advertised rate, right-aligned so the column reads down.
function Row({ child, name, job, caption, price, children }) {
  return (
    <div className={'st-row' + (child ? ' st-row--child' : '')}>
      <div className="st-row__name">
        <span className="st-row__title">{name}</span>
        <span className="st-row__job">{job}</span>
      </div>
      <div className="st-row__field">
        {children}
        {caption && <span className="st-row__caption" title={caption.title || undefined}>{caption.node}</span>}
      </div>
      <div className={'st-row__rate' + (price ? '' : ' is-empty')}>
        {price ? (<>{price.in} in / {price.out} out<small>per 1M tokens</small></>) : 'price not published'}
      </div>
    </div>
  );
}

function Group({ title, note, children }) {
  return (
    <div className="st-group">
      <div className="st-group__head">
        <span className="st-group__title">{title}</span>
        {note && <span className="st-group__note">{note}</span>}
      </div>
      {children}
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
  const changed = ROLE_KEYS.filter((k) => roleValue(k) !== String((setting && setting.roleStored || {})[k] || ''));
  if (setting && model !== setting.model) changed.unshift('reasoning');
  const dirty = !!setting && changed.length > 0;

  // What each role resolves to, and what that model charges. The catalogue is
  // keyed by base id, so a ":nitro" variant is priced as the model it decorates.
  // AccurX routing and Super speed inherit from FAST, not from the model above —
  // see resolveRoles in lib/settings.js — and the ledger groups them under it.
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

  // The line under a field. Blank: where it falls back to, by name, and the
  // model that is. Set: what this role measured on the model it is set to.
  const caption = (role, inheritsFrom) => {
    const own = role === 'reasoning' ? model : roleValue(role);
    const u = (measured.byRole[role] || {})[resolved[role]];
    const measuredText = u ? `${u.inputTokens.toLocaleString()} in / ${u.outputTokens.toLocaleString()} out per question` : 'not measured on this model yet';
    if (!own) {
      const from = inheritsFrom ? ROLE_NAME[inheritsFrom] : 'its own default';
      return {
        title: `${resolved[role] || ''}. ${measuredText}`,
        node: inheritsFrom
          ? (<>Blank, so it uses <b>{from}</b>{resolved[role] ? <>, {resolved[role]}</> : null}</>)
          : (<>Blank, so it uses <b>{resolved[role] || 'the default'}</b></>),
      };
    }
    return { title: measuredText, node: measuredText };
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
      setNote('Saved. Every page uses the new models from the next question.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    if (!setting) return;
    setModel(setting.model);
    setRoles(setting.roleStored || {});
    setNote('');
    setError('');
  }

  const HISTORY_ROWS = 5;
  const shownHistory = history.slice(0, HISTORY_ROWS);
  const n = (v) => Number(v || 0).toLocaleString();

  let footMsg = null;
  if (error) footMsg = <p className="st-foot__msg is-error">{error}</p>;
  else if (!valid) footMsg = <p className="st-foot__msg is-error">An id looks like vendor/model, with an optional :variant and @provider.</p>;
  else if (note) footMsg = <p className="st-foot__msg is-saved"><Svg w={16} sw={2.4}>{Icons.check}</Svg>{note}</p>;
  else if (dirty) footMsg = <p className="st-foot__msg">{changed.length === 1 ? ROLE_NAME[changed[0]] + ' changed' : changed.length + ' models changed'}. Nothing takes effect until you save.</p>;
  else if (setting) footMsg = <p className="st-foot__msg">Saved for the whole practice. Changes apply from the next question asked on any computer.</p>;
  else footMsg = <p className="st-foot__msg">Loading the current settings…</p>;

  return (
    <div className="st-root">
      <style data-st="1" dangerouslySetInnerHTML={{ __html: ST_CSS }} />
      <AppHeader subtitle="Settings" />

      <main className="st-main">
        <div className="st-grid">
          <section className="st-card st-ledger" aria-label="Models">
            <Group title="Answering" note="Blank rows here use Reasoning">
              <Row name="Reasoning" job="Decides and writes the answer" caption={caption('reasoning', null)} price={rate(priceOf(resolved.reasoning))}>
                <ModelField
                  label="Reasoning model" value={model} models={models} index={index}
                  placeholder={setting ? setting.defaultModel : 'vendor/model'}
                  onChange={(v) => { setModel(v); setNote(''); }}
                />
              </Row>
              <Row child name="Fast" job="Reads, searches, background jobs" caption={caption('fast', 'reasoning')} price={rate(priceOf(resolved.fast))}>
                <ModelField
                  label="Fast model" value={roleValue('fast')} models={models} index={index}
                  placeholder={model || 'Same as Reasoning'} onChange={(v) => setRole('fast', v)}
                />
              </Row>
              <Row child name="Web search" job="Searches the internet" caption={caption('web', 'reasoning')} price={rate(priceOf(resolved.web))}>
                <ModelField
                  label="Web search model" value={roleValue('web')} models={models} index={index}
                  placeholder={model || 'Same as Reasoning'} onChange={(v) => setRole('web', v)}
                />
              </Row>
            </Group>

            {/* Both inherit from Fast rather than from Reasoning: each is a
                quick, cheap read of one message, and the only one of the two
                a person waits on with nothing on screen yet is Super speed. */}
            <Group title="Messages" note="Blank rows here use Fast">
              <Row child name="AccurX routing" job="Says where a pasted /accurx goes" caption={caption('accurx', 'fast')} price={rate(priceOf(resolved.accurx))}>
                <ModelField
                  label="AccurX routing model" value={roleValue('accurx')} models={models} index={index}
                  placeholder={fastModel || 'Same as Fast'} onChange={(v) => setRole('accurx', v)}
                />
              </Row>
              <Row child name="Super speed" job="Checks a message for patient details before it is sent" caption={caption('superSpeed', 'fast')} price={rate(priceOf(resolved.superSpeed))}>
                <ModelField
                  label="Super speed model" value={roleValue('superSpeed')} models={models} index={index}
                  placeholder={fastModel || 'Same as Fast'} onChange={(v) => setRole('superSpeed', v)}
                />
              </Row>
            </Group>

            {/* Neither can borrow from above: Reasoning may be text-only, and
                no chat model can stand in for a decision model. */}
            <Group title="On their own" note="Blank rows here use a default of their own">
              <Row name="Images" job="Reads any message with a picture" caption={caption('images', null)} price={rate(priceOf(resolved.images))}>
                <ModelField
                  label="Images model" value={roleValue('images')} models={models} index={index}
                  placeholder={(setting && setting.defaultImagesModel) || 'vendor/model'} onChange={(v) => setRole('images', v)}
                />
              </Row>
              <Row name="Answer check" job="Scores each Notebook answer against the question" caption={caption('check', null)} price={rate(priceOf(resolved.check))}>
                <ModelField
                  label="Answer check model" value={roleValue('check')} models={checkModels} index={checkIndex}
                  placeholder={(setting && setting.defaultCheckModel) || 'vendor/model'} onChange={(v) => setRole('check', v)}
                />
              </Row>
            </Group>

            <div className="st-foot">
              {footMsg}
              <div className="st-foot__actions">
                <button type="button" className="st-btn st-btn--quiet" disabled={!dirty || saving} onClick={discard}>Discard</button>
                <button type="button" className="st-btn st-btn--primary" disabled={!dirty || !valid || saving} onClick={save}>
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </section>

        </div>
      </main>
    </div>
  );
}
