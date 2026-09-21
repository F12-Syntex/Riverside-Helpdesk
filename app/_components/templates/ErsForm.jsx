'use client';

// The e-RS "Search for a service" screen, drawn with the answer filled in.
//
// A referral is typed into that screen and nowhere else. The card used to show
// a table of labels — Speciality, Clinic type — and leave the reader to find
// the box each one goes in. Now the card IS the screen: the same headings, the
// same order, the same controls, with the practice's values already in them.
// The reader's eye lands on e-RS and on this in the same place.
//
// Nothing here is interactive — UNLESS IT IS BEING WRITTEN. Given an `edit`
// prop, the same screen is the editor: the radios move, the boxes are typed
// into, and the values go straight back to the note. That is deliberate and it
// is the point. What somebody fills in at the Notebook *is* the e-RS screen, so
// a two-column form of labelled inputs beside a picture of that screen would be
// two representations of one thing, which is how the two drift apart. There is
// one layout here and it serves both.
//
// Referring clinician is deliberately blank in both modes: it is whoever
// created the task, which is neither the card's business nor the practice's to
// record in advance.
import React from 'react';
import { s, Svg, Icons } from '../ui';
import { EditBox, EditHint, EditList, EditRadios } from './edit';

const INK = '#212b32';
const LINE = '#4c6272';
const AMBER = '#8a6100';

// "2WW", "2 week wait", "two week" all tick the same radio.
function priorityOf(value) {
  const v = String(value || '').toLowerCase();
  if (/2\s*ww|two|2[\s-]*week/.test(v)) return '2-week wait';
  if (/urgent/.test(v)) return 'Urgent';
  return 'Routine';
}

function Label({ children }) {
  return <div style={s('font-size:15px;font-weight:700;color:' + INK + ';margin:0 0 6px;')}>{children}</div>;
}

function Step({ children }) {
  return <div style={s('font-size:17px;font-weight:700;color:' + INK + ';margin:0 0 12px;')}>{children}</div>;
}

// A select box in the state it should be left in. No Copy beside it: the
// values are short, and the screen is meant to look like e-RS, not like a
// card about e-RS. A value the practice does not record is said IN the box,
// in amber, so an empty box never reads as "leave this blank".
function Select({ value, missing, placeholder = 'Select an option' }) {
  const has = !!value;
  return (
    <div style={s('display:flex;align-items:center;gap:10px;')}>
      <div role="img" aria-label={has ? value : (missing || placeholder)}
        style={s('flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:8px;min-height:40px;padding:6px 10px 6px 12px;background:#fff;border:2px solid ' + (has || !missing ? LINE : '#b58500') + ';')}>
        {has ? (
          <span style={s('flex:1;min-width:0;font-size:16px;font-weight:700;color:' + INK + ';overflow-wrap:anywhere;')}>{value}</span>
        ) : missing ? (
          <span style={s('flex:1;min-width:0;display:flex;gap:7px;align-items:center;font-size:14.5px;font-weight:600;color:' + AMBER + ';')}>
            <Svg w={15} stroke="#b58500" sw={2.2} style={s('flex:none;')}>{Icons.alertCircle}</Svg>{missing}
          </span>
        ) : (
          <span style={s('flex:1;min-width:0;font-size:15px;color:#768692;')}>{placeholder}</span>
        )}
        <Svg w={16} stroke={INK} sw={2.4} style={s('flex:none;')}>{Icons.chevronDown}</Svg>
      </div>
    </div>
  );
}

function Radio({ label, on }) {
  return (
    <div role="img" aria-label={label + (on ? ' (selected)' : '')} style={s('display:flex;align-items:center;gap:10px;')}>
      <span style={s('flex:none;width:24px;height:24px;border-radius:50%;border:2px solid ' + LINE + ';background:#fff;display:inline-flex;align-items:center;justify-content:center;')}>
        {on && <span style={s('width:12px;height:12px;border-radius:50%;background:' + INK + ';')} />}
      </span>
      <span style={s('font-size:16px;color:' + INK + ';font-weight:' + (on ? '700' : '400') + ';')}>{label}</span>
    </div>
  );
}

function Radios({ options, chosen }) {
  return (
    <div style={s('display:flex;flex-direction:column;gap:8px;')}>
      {options.map((o) => <Radio key={o} label={o} on={o === chosen} />)}
    </div>
  );
}

// A rule the practice records against a field: "Extended Scope only when the
// doctor has asked for it". Against the box it applies to.
function Condition({ text }) {
  return (
    <div style={s('display:flex;gap:7px;align-items:flex-start;margin-top:7px;font-size:13.5px;line-height:1.45;font-weight:500;color:' + AMBER + ';')}>
      <span style={s('flex:none;display:flex;margin-top:2px;')}><Svg w={14} stroke="#b58500" sw={2.2}>{Icons.alertCircle}</Svg></span>
      <span>{text}</span>
    </div>
  );
}

// `block` is the ers block from lib/templates/blocks.mjs, or anything with the
// same keys. `below` is rendered inside the screen's frame, under the form —
// the provenance of a determined pairing, on the prose path.
//
// `edit` turns the picture into the editor: `{ set(key, value), issues }`,
// where `issues` is the list from noteIssues() so a box the note cannot be
// served without is outlined in red with its reason under it. `head` is the
// strip above the screen for what the note needs and e-RS does not — what
// staff call this service, and the letter template.
export default function ErsForm({ block, below = null, edit = null, head = null }) {
  const b = block || {};
  const options = (b.clinicTypeOptions || []).filter(Boolean);
  const priority = priorityOf(b.priority);
  const requestType = /advice/i.test(String(b.requestType || '')) ? 'Advice' : 'Referral';
  // WRITING, EVERY SECTION IS OPEN. A disclosure that hides the hospital rule
  // until something is typed into it is a disclosure nobody opens, and a rule
  // nobody records.
  const more = !!edit || !!(b.hospital || b.hospitalRule || b.pathway);
  const missing = b.missing || 'Not recorded — take it from the doctor’s task';
  const bad = (key) => (edit ? (edit.issues || []).find((i) => i.field === key) : null);
  // A box: typed into while writing, a picture of the value while reading.
  const box = (key, { placeholder = '', hint = '', fallback = missing } = {}) => (edit ? (
    <>
      <EditBox value={b[key]} onChange={(v) => edit.set(key, v)} placeholder={placeholder}
        invalid={!!bad(key)} label={key} />
      <EditHint bad={!!bad(key)}>{bad(key) ? bad(key).message : hint}</EditHint>
    </>
  ) : <Select value={b[key]} missing={fallback} />);

  return (
    <div style={s('border:1px solid #d8e1e5;border-radius:12px;background:#fff;overflow:hidden;')}>
      <div style={s('display:flex;align-items:center;gap:8px;padding:8px 16px;background:#005eb8;color:#fff;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;')}>
        <Svg w={14} stroke="#fff" sw={2.4}>{Icons.check}</Svg>Set on e-RS
      </div>
      {head}
      <div style={s('padding:16px 18px 18px;background:#f0f4f5;')}>
        <div style={s('font-size:20px;font-weight:700;color:' + INK + ';margin:0 0 14px;')}>Search for a service</div>

        <Step>Step 1: Confirm request details</Step>
        <div style={s('margin:0 0 14px;')}>
          <Label>Referring clinician</Label>
          <Select value="" placeholder="Select an option" />
          <div style={s('margin-top:5px;font-size:13px;color:#4c6272;')}>The doctor who created the task. Dr Goel if it came from someone who is not a doctor.</div>
        </div>
        <div style={s('margin:0 0 14px;')}>
          <Label>Request type</Label>
          {edit
            ? <EditRadios name="Request type" options={['Referral', 'Advice and Guidance']} value={b.requestType || 'Referral'} onChange={(v) => edit.set('requestType', v)} />
            : <Radios options={['Referral', 'Advice']} chosen={requestType} />}
        </div>
        <div style={s('margin:0 0 18px;')}>
          <Label>Priority</Label>
          {edit
            ? <EditRadios name="Priority" options={['Routine', 'Urgent', '2WW']} value={b.priority || 'Routine'} onChange={(v) => edit.set('priority', v)} />
            : <Radios options={['Routine', 'Urgent', '2-week wait']} chosen={priority} />}
        </div>

        <Step>Step 2: Select service details</Step>
        <div style={s('margin:0 0 14px;')}>
          <Label>Specialty</Label>
          {box('specialty', { placeholder: 'Dermatology', hint: 'Exactly as e-RS spells it.' })}
        </div>
        <div style={s('margin:0 0 ' + (more ? '14px' : '4px') + ';')}>
          <Label>Clinic type</Label>
          {edit ? (
            <>
              {box('clinicType', { placeholder: 'Not otherwise specified', hint: 'Exactly as e-RS spells it. Leave empty where the reader has to choose, and give the choices below.' })}
              <div style={s('margin-top:10px;')}>
                <Label>…or the choices to pick between</Label>
                <EditList value={b.clinicTypeOptions} onChange={(v) => edit.set('clinicTypeOptions', v)}
                  placeholder="One clinic type" addLabel="Add a choice" label="Clinic type choice" />
              </div>
              <div style={s('margin-top:10px;')}>
                <Label>Rule against the clinic type</Label>
                <EditBox value={b.clinicTypeCondition} onChange={(v) => edit.set('clinicTypeCondition', v)}
                  placeholder="Extended Scope only when the doctor has asked for it" label="Clinic type rule" big={false} />
              </div>
            </>
          ) : options.length > 1 ? (
            // The practice records a choice. Picking one for the reader is
            // exactly the thing that cannot be done safely, so both are shown.
            <div style={s('display:flex;flex-direction:column;gap:6px;')}>
              {options.map((o, i) => (
                <div key={o} style={s('display:flex;align-items:center;gap:8px;')}>
                  {i > 0 && <span style={s('flex:none;font-size:13px;font-weight:600;color:#768692;width:18px;')}>or</span>}
                  <div style={s('flex:1;min-width:0;')}><Select value={o} /></div>
                </div>
              ))}
            </div>
          ) : (
            <Select value={b.clinicType} missing={missing} />
          )}
          {!edit && b.clinicTypeCondition && <Condition text={b.clinicTypeCondition} />}
        </div>

        {more && (
          <div style={s('margin:0 0 4px;border-top:1px solid #d8e1e5;padding-top:12px;')}>
            <div style={s('display:flex;align-items:center;justify-content:space-between;font-size:17px;font-weight:700;color:' + INK + ';margin:0 0 12px;')}>
              <span>Add more search detail</span>
              <span style={s('font-size:22px;line-height:1;color:#005eb8;')}>&minus;</span>
            </div>
            {(edit || b.hospital || b.hospitalRule) && (
              <div style={s('margin:0 0 14px;')}>
                <Label>Organisation or site</Label>
                {/* Where the practice records HOW to pick the hospital rather
                    than which one — "the first that is not a telederm" — the box
                    stays open and the rule goes against it. Drawn inside the
                    dropdown a rule reads as the name of a hospital, and the
                    reader looks for it in the list and does not find it. */}
                {edit ? (
                  <>
                    <EditBox value={b.hospital} onChange={(v) => edit.set('hospital', v)}
                      placeholder="Homerton University Hospital" label="Organisation or site" />
                    <EditHint>A named site. Where there is no one name, leave this empty and give the rule instead.</EditHint>
                    <div style={s('margin-top:10px;')}>
                      <Label>…or the rule for picking one</Label>
                      <EditBox value={b.hospitalRule} onChange={(v) => edit.set('hospitalRule', v)}
                        placeholder="First hospital that is a teledermatology service" label="Hospital rule" big={false} />
                    </div>
                  </>
                ) : (
                  <>
                    <Select value={b.hospital} placeholder={b.hospitalRule ? 'Pick by the rule below' : undefined} />
                    {b.hospitalRule && <Condition text={b.hospitalRule} />}
                  </>
                )}
              </div>
            )}
            {(edit || b.pathway) && (
              <div style={s('margin:0 0 4px;')}>
                <Label>Service name</Label>
                {edit ? (
                  <>
                    <EditBox value={b.pathway} onChange={(v) => edit.set('pathway', v)}
                      placeholder="A named service to search for" label="Service name" />
                    <EditHint>Only where the practice says to search for one by name.</EditHint>
                  </>
                ) : <Select value={b.pathway} />}
              </div>
            )}
          </div>
        )}

        {/* The screen's own buttons. Drawn while reading, because they are part
            of the picture the reader is matching against; left off while
            writing, where a Search button that searches nothing is a button
            somebody presses once and never trusts again. */}
        {!edit && (
          <div style={s('display:flex;gap:10px;margin-top:16px;')} aria-hidden="true">
            <span style={s('display:inline-flex;align-items:center;padding:9px 18px;background:#007f3b;color:#fff;font-size:15px;font-weight:700;box-shadow:0 4px 0 #00401e;')}>Search</span>
            <span style={s('display:inline-flex;align-items:center;padding:9px 18px;background:#4c6272;color:#fff;font-size:15px;font-weight:700;box-shadow:0 4px 0 #263139;')}>Reset</span>
          </div>
        )}
      </div>
      {below}
    </div>
  );
}
