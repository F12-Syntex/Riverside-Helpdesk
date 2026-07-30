'use client';

/* ------------------------------------------------------------------ *
 * Settings — which model the assistant runs on.
 *
 * The model used to be an environment variable, so changing it meant a
 * redeploy by whoever holds the hosting account. It is now a row in the
 * practice's own database, changed here: pick from every model OpenRouter
 * serves, searched the same fuzzy way as the phone directory ("son 4" reaches
 * "Claude Sonnet 4.6"), and it applies to the next question asked.
 *
 * A model can also carry a routing variant — the ":nitro" in
 * "openai/gpt-oss-120b:nitro" — which tells OpenRouter to serve it from the
 * fastest provider rather than whichever it would otherwise pick. That is one
 * id, not two settings, so it is picked here alongside the model and stored as
 * the single string the AI routes already read.
 * ------------------------------------------------------------------ */

import React from 'react';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import { buildIndex, fuzzySearch } from '@/lib/lookup/fuzzy';
import { MODEL_VARIANTS, isModelSlug, isModelVariant, joinModelId, splitModelId, variantHint } from '@/lib/model-id.mjs';

const LIST_LIMIT = 60;

function priceLabel(model) {
  const parts = [];
  if (model.promptPerMillion !== null && model.promptPerMillion !== undefined) parts.push('$' + model.promptPerMillion + ' in');
  if (model.completionPerMillion !== null && model.completionPerMillion !== undefined) parts.push('$' + model.completionPerMillion + ' out');
  if (!parts.length) return '';
  return parts.join(' / ') + ' per 1M tokens';
}

function contextLabel(model) {
  if (!model.contextLength) return '';
  return model.contextLength >= 1000
    ? Math.round(model.contextLength / 1000) + 'k context'
    : model.contextLength + ' context';
}

// One row of the dropdown. The id matters as much as the name here — it is what
// gets stored, and two models can read almost identically by name alone.
function ModelRow({ model, active, onPick }) {
  return (
    <Hover tag="button" type="button" role="option" aria-selected={active} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(model)}
      base={'display:block;width:100%;text-align:left;border:none;border-radius:8px;padding:9px 11px;font:inherit;cursor:pointer;background:' + (active ? '#e8f1f8' : 'transparent') + ';'}
      hover="background:#e8f1f8;">
      <span style={s('display:block;font-size:15px;font-weight:600;color:#212b32;overflow-wrap:anywhere;')}>{model.name}</span>
      <span style={s('display:block;font-size:12.5px;color:#4c6272;margin-top:1px;overflow-wrap:anywhere;')}>{model.id}</span>
      <span style={s('display:block;font-size:12px;color:#768692;margin-top:2px;')}>
        {[contextLabel(model), priceLabel(model), model.vision ? 'reads images' : 'text only'].filter(Boolean).join(' · ')}
      </span>
    </Hover>
  );
}

// An id typed rather than picked. The catalogue lists models, not variants, so
// "openai/gpt-oss-120b:nitro" will never appear as a row — but it is a real id
// and this is how it gets used.
function TypedRow({ id, active, onPick }) {
  return (
    <Hover tag="button" type="button" role="option" aria-selected={active} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(id)}
      base={'display:block;width:100%;text-align:left;border:none;border-radius:8px;padding:9px 11px;font:inherit;cursor:pointer;background:' + (active ? '#e8f1f8' : 'transparent') + ';'}
      hover="background:#e8f1f8;">
      <span style={s('display:block;font-size:15px;font-weight:600;color:#212b32;overflow-wrap:anywhere;')}>Use &ldquo;{id}&rdquo;</span>
      <span style={s('display:block;font-size:12.5px;color:#4c6272;margin-top:1px;')}>Exactly as typed &mdash; including any :variant</span>
    </Hover>
  );
}

// The routing variant, picked as a button or typed. Shown under the selected
// model because that is what it modifies: same model, different provider
// choice, one stored id.
function VariantPicker({ base, variant, onChange }) {
  const valid = isModelVariant(variant);
  const hint = variantHint(variant);
  return (
    <div style={s('margin-top:14px;padding-top:13px;border-top:1px solid #eef1f2;')}>
      <div style={s('font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#768692;margin-bottom:8px;')}>Routing variant</div>
      <div style={s('display:flex;flex-wrap:wrap;gap:8px;')}>
        {MODEL_VARIANTS.map((v) => (
          <Hover key={v.id || 'default'} tag="button" type="button" title={v.hint} onClick={() => onChange(v.id)}
            base={'border-radius:999px;padding:6px 14px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;border:2px solid '
              + (variant === v.id ? '#005eb8;background:#e8f1f8;color:#005eb8;' : '#d8dde0;background:#fff;color:#4c6272;')}
            hover="border-color:#005eb8;color:#005eb8;">
            {v.label}
          </Hover>
        ))}
      </div>
      <div style={s('display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin-top:11px;')}>
        <label htmlFor="model-variant" style={s('font-size:14px;color:#4c6272;')}>or type one</label>
        <input
          id="model-variant"
          type="text"
          autoComplete="off"
          value={variant}
          placeholder="nitro, floor, thinking, exacto…"
          onChange={(e) => onChange(e.target.value.replace(/^:+/, '').trim())}
          style={s('flex:1 1 200px;min-width:0;box-sizing:border-box;padding:8px 12px;font:inherit;font-size:15px;border:2px solid ' + (valid ? '#4c6272' : '#d5281b') + ';border-radius:8px;background:#fff;color:#212b32;')}
        />
      </div>
      {!valid && (
        <p style={s('margin:8px 0 0;font-size:13.5px;color:#d5281b;font-weight:600;')}>
          A variant is letters, numbers, dots, dashes or underscores &mdash; no colon.
        </p>
      )}
      {valid && hint && <p style={s('margin:8px 0 0;font-size:13.5px;color:#4c6272;')}>{hint}.</p>}
      <p style={s('margin:9px 0 0;font-size:13.5px;color:#4c6272;line-height:1.45;')}>
        Saved as <strong style={s('color:#212b32;overflow-wrap:anywhere;')}>{joinModelId(base, variant) || '—'}</strong>
      </p>
    </div>
  );
}

export default function SettingsPage() {
  const [models, setModels] = React.useState([]);
  const [modelsError, setModelsError] = React.useState('');
  const [setting, setSetting] = React.useState(null);
  const [chosen, setChosen] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [cursor, setCursor] = React.useState(0);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState('');
  const [error, setError] = React.useState('');
  const boxRef = React.useRef(null);

  React.useEffect(() => {
    let live = true;
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        if (d.error) { setError(d.error); return; }
        setSetting(d);
        setChosen(d.model);
      })
      .catch((e) => live && setError('Could not read the current model: ' + e.message));
    fetch('/api/settings/models')
      .then((r) => r.json())
      .then((d) => {
        if (!live) return;
        setModels(d.models || []);
        if (d.error) setModelsError(d.error);
        else if (d.stale) setModelsError('OpenRouter could not be reached just now — this list may be a little behind.');
      })
      .catch((e) => live && setModelsError('Could not load the model list: ' + e.message));
    return () => { live = false; };
  }, []);

  // The directory's fuzzy engine, over the model catalogue: the id carries the
  // vendor, so searching "anthropic", "sonnet" or "gemini flash" all work.
  const index = React.useMemo(
    () => buildIndex(models.map((m) => ({ label: m.name, aliases: [m.id, m.id.replace(/[/:-]/g, ' ')], model: m }))),
    [models],
  );

  const results = React.useMemo(() => {
    if (!query.trim()) return models.slice(0, LIST_LIMIT);
    return fuzzySearch(index, query, LIST_LIMIT).map((r) => r.entry.model);
  }, [index, models, query]);

  React.useEffect(() => { setCursor(0); }, [query]);

  // Clicking away closes the list without changing anything.
  React.useEffect(() => {
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // The id is edited in two halves — the model and its routing variant — and
  // stored as one string.
  const { base: chosenBase, variant: chosenVariant } = splitModelId(chosen);
  // Fall back to the base id so a variant id still shows the model's price,
  // context and vision support: ":nitro" changes the provider, not the model.
  const current = models.find((m) => m.id === chosen) || models.find((m) => m.id === chosenBase) || null;
  const validChoice = isModelSlug(chosen);
  const dirty = !!(setting && chosen && validChoice && chosen !== setting.model);

  // Typed rather than picked. The catalogue does not list variant ids (there is
  // no ":nitro" row for every model), and a brand-new model can be servable
  // before the list catches up — so anything that IS a valid id can be used,
  // whether or not it appears below.
  const typed = query.trim();
  const typedId = isModelSlug(typed) && !models.some((m) => m.id === typed) ? typed : '';

  function choose(id) {
    setChosen(id);
    setQuery('');
    setOpen(false);
    setSaved('');
  }

  // Picking a model keeps whatever variant is already set: someone who has
  // chosen ":nitro" wants the fast provider for the next model too.
  function pick(model) {
    choose(joinModelId(model.id, chosenVariant));
  }

  function setVariant(variant) {
    setChosen(joinModelId(chosenBase, variant));
    setSaved('');
  }

  // The typed id, when there is one, is the first row — so Enter on a
  // hand-typed "openai/gpt-oss-120b:nitro" saves that, rather than the nearest
  // fuzzy match to it.
  const options = (typedId ? [{ id: typedId, typed: true }] : []).concat(results.map((m) => ({ id: m.id, model: m })));

  function take(option) {
    if (!option) return;
    if (option.model) pick(option.model);
    else choose(option.id);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setCursor((c) => {
        const next = e.key === 'ArrowDown' ? c + 1 : c - 1;
        if (next < 0) return options.length - 1;
        if (next >= options.length) return 0;
        return next;
      });
      return;
    }
    if (e.key === 'Enter' && open && options[cursor]) { e.preventDefault(); take(options[cursor]); return; }
    if (e.key === 'Escape') { setOpen(false); }
  }

  async function save() {
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: chosen }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The model could not be saved.');
      setSetting(data);
      setChosen(data.model);
      setSaved('Saved. Every answer from now on uses ' + data.model + '.');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Settings" />

      <main style={s('flex:1;width:100%;max-width:760px;margin:0 auto;padding:36px 24px 56px;')}>
        <h1 style={s('font-size:30px;margin:0 0 4px;letter-spacing:-0.02em;')}>Settings</h1>
        <p style={s('font-size:17px;color:#4c6272;margin:0 0 26px;')}>
          Settings are stored in the practice&rsquo;s own database and take effect straight away &mdash; no redeploy.
        </p>

        <section style={s('background:#fff;border:1px solid #d8e1e5;border-radius:12px;padding:22px 22px 24px;')}>
          <h2 style={s('font-size:20px;margin:0 0 4px;')}>AI model</h2>
          <p style={s('font-size:15px;color:#4c6272;margin:0 0 18px;line-height:1.5;')}>
            Used by every AI feature: the practice assistant, document filing, the rota helper and the knowledge base.
            Pick any model OpenRouter serves &mdash; or type a full id, including a routing variant such as
            <strong> openai/gpt-oss-120b:nitro</strong>.
          </p>

          <div style={s('display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px;padding:12px 14px;background:#f7fafb;border:1px solid #d8dde0;border-radius:10px;margin-bottom:18px;')}>
            <span style={s('font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#768692;')}>In use</span>
            <span style={s('font-size:16px;font-weight:700;color:#212b32;overflow-wrap:anywhere;')}>{setting ? setting.model : '…'}</span>
            {setting && setting.source === 'default' && (
              <span style={s('font-size:13px;color:#4c6272;')}>(the default &mdash; nothing has been chosen yet)</span>
            )}
          </div>

          <label htmlFor="model-search" style={s('display:block;font-size:15px;font-weight:600;color:#212b32;margin-bottom:7px;')}>
            Change the model
          </label>
          <div ref={boxRef} style={s('position:relative;')}>
            <input
              id="model-search"
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls="model-list"
              autoComplete="off"
              value={query}
              placeholder={chosen || 'Search models — try "sonnet", "gemini flash", "gpt"'}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKeyDown}
              style={s('width:100%;box-sizing:border-box;padding:12px 14px;font:inherit;font-size:16px;border:2px solid ' + (open ? '#005eb8' : '#4c6272') + ';border-radius:10px;background:#fff;color:#212b32;')}
            />
            {open && (
              <div id="model-list" role="listbox" style={s('position:absolute;z-index:20;top:calc(100% + 6px);left:0;right:0;max-height:340px;overflow-y:auto;background:#fff;border:1px solid #d8dde0;border-radius:12px;box-shadow:0 8px 24px rgba(33,43,50,.16);padding:6px;')}>
                {options.length ? options.map((option, i) => (option.typed ? (
                  <TypedRow key={'typed:' + option.id} id={option.id} active={i === cursor} onPick={choose} />
                ) : (
                  <ModelRow key={option.id} model={option.model} active={i === cursor} onPick={pick} />
                ))) : (
                  <div style={s('padding:14px;font-size:15px;color:#4c6272;')}>
                    {models.length ? 'No model matches that. Type a full id (vendor/model) to use one that is not listed.' : 'Loading the model list…'}
                  </div>
                )}
              </div>
            )}
          </div>

          {modelsError && (
            <p style={s('margin:10px 0 0;font-size:14px;color:#8a6100;line-height:1.45;')}>{modelsError} You can still type an id and save it.</p>
          )}

          {/* What has been picked but not yet saved, with the two things worth
              knowing before saving: whether it can read images (the ingester
              reads document pages with this model) and what it costs. */}
          <div style={s('margin-top:18px;padding:14px 15px;border:1px solid #d8dde0;border-radius:10px;')}>
            <div style={s('font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#768692;margin-bottom:6px;')}>Selected</div>
            <div style={s('font-size:17px;font-weight:700;color:#212b32;overflow-wrap:anywhere;')}>{chosen || '—'}</div>
            {current && (
              <div style={s('font-size:13.5px;color:#4c6272;margin-top:4px;')}>
                {[current.name, contextLabel(current), priceLabel(current)].filter(Boolean).join(' · ')}
              </div>
            )}
            {current && !current.vision && (
              <div style={s('display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:13.5px;line-height:1.45;color:#8a6100;')}>
                <span style={s('flex:none;display:flex;margin-top:2px;')}><Svg w={15} stroke="#b58500" sw={2.2}>{Icons.alertCircle}</Svg></span>
                <span>This model cannot read images. Pasted screenshots and scanned pages will not be understood.</span>
              </div>
            )}
            {chosenBase && <VariantPicker base={chosenBase} variant={chosenVariant} onChange={setVariant} />}
          </div>

          {chosen && !validChoice && (
            <p style={s('margin:12px 0 0;font-size:14px;color:#d5281b;font-weight:600;line-height:1.45;')}>
              &ldquo;{chosen}&rdquo; is not an OpenRouter id &mdash; it should look like vendor/model, with an optional :variant.
            </p>
          )}

          <div style={s('display:flex;flex-wrap:wrap;gap:12px;align-items:center;margin-top:18px;')}>
            <Hover tag="button" type="button" disabled={!dirty || saving} onClick={save}
              base={'border:none;border-radius:10px;padding:12px 20px;font:inherit;font-size:16px;font-weight:600;color:#fff;background:' + (dirty && !saving ? '#007f3b' : '#aab7bd') + ';cursor:' + (dirty && !saving ? 'pointer' : 'default') + ';'}
              hover={dirty && !saving ? 'background:#00662f;' : ''}>
              {saving ? 'Saving…' : 'Save model'}
            </Hover>
            {setting && chosen !== setting.defaultModel && (
              <Hover tag="button" type="button" onClick={() => { setChosen(setting.defaultModel); setSaved(''); }}
                base="background:none;border:none;padding:0;font:inherit;font-size:15px;font-weight:600;color:#005eb8;text-decoration:underline;cursor:pointer;"
                hover="color:#003087;">
                Use the default ({setting.defaultModel})
              </Hover>
            )}
          </div>

          {saved && (
            <p style={s('display:flex;gap:8px;align-items:flex-start;margin:14px 0 0;font-size:15px;color:#007f3b;font-weight:600;')}>
              <span style={s('flex:none;display:flex;margin-top:2px;')}><Svg w={16} stroke="#007f3b" sw={2.4}>{Icons.check}</Svg></span>{saved}
            </p>
          )}
          {error && (
            <p style={s('display:flex;gap:8px;align-items:flex-start;margin:14px 0 0;font-size:15px;color:#d5281b;font-weight:600;')}>
              <span style={s('flex:none;display:flex;margin-top:2px;')}><Svg w={16} stroke="#d5281b" sw={2.4}>{Icons.alertCircle}</Svg></span>{error}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
