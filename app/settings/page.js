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

const LIST_LIMIT = 40;

// Kept in step with ROLE_SETTING_KEY in lib/settings.js. The reasoning role is
// the model itself, so it is saved as `model` rather than as an override.
const ROLE_KEYS = ['fast', 'web', 'vision'];

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

function Row({ name, job, children }) {
  return (
    <div style={s('display:flex;flex-wrap:wrap;gap:6px 18px;align-items:baseline;padding:14px 0;border-top:1px solid #eef1f2;')}>
      <div style={s('flex:0 0 150px;min-width:0;')}>
        <span style={s('display:block;font-size:15.5px;font-weight:600;color:#212b32;')}>{name}</span>
        <span style={s('display:block;font-size:13px;color:#4c6272;')}>{job}</span>
      </div>
      <div style={s('flex:1 1 260px;min-width:0;')}>{children}</div>
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

  // The reasoning model reads pasted images unless the vision role takes over.
  const resolvedVision = roleValue('vision') || model;
  const visionModel = models.find((m) => m.id === resolvedVision.split(':')[0]);
  const blindToImages = !!visionModel && !visionModel.vision;

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
          <Row name="Reasoning" job="Researches and writes">
            <ModelField
              label="Reasoning model" value={model} models={models} index={index}
              placeholder={setting ? setting.defaultModel : 'vendor/model'}
              onChange={(v) => { setModel(v); setNote(''); }}
            />
          </Row>
          <Row name="Fast" job="Background jobs">
            <ModelField
              label="Fast model" value={roleValue('fast')} models={models} index={index}
              placeholder={model || 'inherit'} onChange={(v) => setRole('fast', v)}
            />
          </Row>
          <Row name="Web search" job="Searches the internet">
            <ModelField
              label="Web search model" value={roleValue('web')} models={models} index={index}
              placeholder={model || 'inherit'} onChange={(v) => setRole('web', v)}
            />
          </Row>
          <Row name="Vision" job="Reads pasted images">
            <ModelField
              label="Vision model" value={roleValue('vision')} models={models} index={index}
              placeholder={model || 'inherit'} onChange={(v) => setRole('vision', v)}
            />
          </Row>

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
          {blindToImages && (
            <p style={s('margin:12px 0 0;font-size:13.5px;color:#8a6100;')}>
              {resolvedVision} cannot read images. Pasted screenshots will not be understood.
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
