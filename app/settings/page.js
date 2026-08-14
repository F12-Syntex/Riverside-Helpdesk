'use client';

/* ------------------------------------------------------------------ *
 * Settings — which model runs which job.
 *
 * One row per role, one field each. The field is the whole control: type in
 * it and it fuzzy-searches every model OpenRouter serves ("son 4" reaches
 * Claude Sonnet 4.6, "perp" reaches the Perplexity models), or type a full id
 * and use it as typed — including a routing variant like ":nitro", which is
 * part of the id rather than a setting of its own.
 *
 * Blank inherits: only the top row has to be set.
 * ------------------------------------------------------------------ */

import React from 'react';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import { buildIndex, fuzzySearch } from '@/lib/lookup/fuzzy';
import { isModelSlug } from '@/lib/model-id.mjs';
import { estimateQueryCost, summariseModelCosts, formatCost } from '@/lib/ai/usage-cost.mjs';

const LIST_LIMIT = 40;

// Kept in step with ROLE_SETTING_KEY in lib/settings.js. The reasoning role is
// the model itself, so it is saved as `model` rather than as an override.
const ROLE_KEYS = ['fast', 'web', 'accurx', 'superSpeed'];

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

const INPUT = 'width:100%;box-sizing:border-box;padding:9px 12px;font:inherit;font-size:15px;border:2px solid #d8dde0;border-radius:8px;background:#fff;color:#212b32;';

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
        style={s(INPUT + (bad ? 'border-color:#d5281b;' : ''))}
      />
      {open && options.length > 0 && (
        <div role="listbox" style={s('position:absolute;z-index:20;top:calc(100% + 4px);left:0;right:0;max-height:280px;overflow-y:auto;background:#fff;border:1px solid #d8dde0;border-radius:8px;box-shadow:0 6px 18px rgba(0,0,0,.12);padding:4px;')}>
          {options.map((id, i) => {
            const model = models.find((m) => m.id === id);
            return (
              <Hover key={id} tag="button" type="button" role="option" aria-selected={i === cursor}
                onMouseDown={(e) => e.preventDefault()} onClick={() => take(id)}
                base={'display:block;width:100%;text-align:left;border:none;border-radius:6px;padding:7px 10px;font:inherit;cursor:pointer;background:' + (i === cursor ? '#e8f1f8' : 'transparent') + ';'}
                hover="background:#e8f1f8;">
                <span style={s('display:block;font-size:14.5px;color:#212b32;overflow-wrap:anywhere;')}>{id}</span>
                {model && model.name ? (
                  <span style={s('display:block;font-size:12.5px;color:#4c6272;overflow-wrap:anywhere;')}>
                    {model.name}{model.vision ? '' : ' · text only'}
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
    <div style={s('display:flex;flex-wrap:wrap;gap:6px 18px;align-items:baseline;padding:14px 0;border-top:1px solid #eef1f2;')}>
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
  };
  const priceOf = (id) => models.find((m) => m.id === id) || models.find((m) => m.id === String(id).split(':')[0]) || null;
  const prices = React.useMemo(() => Object.fromEntries(models.map((m) => [m.id, m])), [models]);

  // The estimate. Measured tokens per question from ai_usage, priced at whatever
  // each role is set to now — so changing a model here changes the figure before
  // anything is saved, and a role nobody has run yet is left out rather than
  // guessed at.
  const measured = (setting && setting.usage) || { byRole: {}, byModel: {}, turns: 0, windowDays: 0 };
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
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Settings" />

      <main style={s('flex:1;width:100%;max-width:680px;margin:0 auto;padding:32px 24px 56px;')}>
        <h1 style={s('font-size:26px;margin:0 0 4px;letter-spacing:-0.02em;')}>Models</h1>
        <p style={s('font-size:15px;color:#4c6272;margin:0 0 20px;')}>
          Type to search, or paste an id. Blank inherits the model above.
        </p>

        <section style={s('background:#fff;border:1px solid #d8e1e5;border-radius:12px;padding:4px 20px 20px;')}>
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

          <div style={s('border-top:1px solid #eef1f2;padding:14px 0 2px;display:flex;flex-wrap:wrap;gap:4px 12px;align-items:baseline;')}>
            <span style={s('flex:0 0 150px;font-size:15.5px;font-weight:600;color:#212b32;')}>Per question</span>
            <span style={s('flex:1 1 260px;font-size:15.5px;color:#212b32;font-variant-numeric:tabular-nums;')}>
              {estimate.measured ? (
                <>
                  <strong>{formatCost(estimate.total)}</strong>
                  <span style={s('font-size:13px;color:#768692;')}>
                    {' '}— measured over {measured.turns.toLocaleString()} question{measured.turns === 1 ? '' : 's'}
                    {measured.windowDays ? ` in the last ${measured.windowDays} days` : ''}
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

          {history.length > 0 && (
            <div style={s('border-top:1px solid #eef1f2;margin-top:14px;padding-top:14px;')}>
              <div style={s('font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#768692;margin-bottom:8px;')}>
                Cost per question, by model
              </div>
              <div style={s('overflow-x:auto;')}>
                <table style={s('width:100%;border-collapse:collapse;font-size:13.5px;')}>
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
                        <td style={s('padding:5px 0;text-align:right;white-space:nowrap;color:#768692;font-variant-numeric:tabular-nums;')}>
                          {row.turns.toLocaleString()} question{row.turns === 1 ? '' : 's'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={s('margin:8px 0 0;font-size:12.5px;color:#768692;line-height:1.45;')}>
                Kept per model. Switching model shows nothing until it has been used; switching back brings its record with it.
              </p>
            </div>
          )}

          <div style={s('display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:18px;')}>
            <Hover tag="button" type="button" disabled={!dirty || !valid || saving} onClick={save}
              base={'border:none;border-radius:10px;padding:11px 20px;font:inherit;font-size:15.5px;font-weight:600;color:#fff;background:'
                + (dirty && valid && !saving ? '#007f3b' : '#aab7bd') + ';cursor:' + (dirty && valid && !saving ? 'pointer' : 'default') + ';'}
              hover={dirty && valid && !saving ? 'background:#00662f;' : ''}>
              {saving ? 'Saving…' : 'Save'}
            </Hover>
            {note && (
              <span style={s('display:flex;gap:6px;align-items:center;font-size:15px;color:#007f3b;font-weight:600;')}>
                <Svg w={16} stroke="#007f3b" sw={2.4}>{Icons.check}</Svg>{note}
              </span>
            )}
          </div>

          {!valid && (
            <p style={s('margin:12px 0 0;font-size:13.5px;color:#d5281b;font-weight:600;')}>
              An id looks like vendor/model, with an optional :variant.
            </p>
          )}
          {error && (
            <p style={s('margin:12px 0 0;font-size:14px;color:#d5281b;font-weight:600;')}>{error}</p>
          )}
        </section>
      </main>
    </div>
  );
}
