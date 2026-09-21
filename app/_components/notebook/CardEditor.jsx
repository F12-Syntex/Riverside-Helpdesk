'use client';

// A typed note, edited as the screen it is about.
//
// THE EDITOR IS THE CARD. The three screens a referral is actually typed into
// are already drawn for the reader (ErsForm, ProfMessage, PathologyForm), and
// this hands those same components the note's fields plus a way to write them
// back. So the person filling a card in sees the e-RS screen, in the e-RS
// order, with the e-RS wording — not a form of labelled inputs that happens to
// produce one.
//
// WHY NOT TWO COMPONENTS. Because two drift. A labelled form beside a picture
// of a screen is two representations of one thing, and the day somebody adds a
// box to one of them is the day they stop agreeing. There is one layout, and
// `edit` is what it does with it.
//
// THE STRIP ABOVE THE SCREEN is the part that is not on the screen: what staff
// call this service, the words they would search for, the letter template, when
// the sample has to go. Those belong to the note rather than to e-RS or EMIS,
// and putting them inside the drawn screen would be putting boxes on it that
// are not on it.
import React from 'react';
import { s } from '../ui';
import ErsForm from '../templates/ErsForm';
import ProfMessage from '../templates/ProfMessage';
import PathologyForm from '../templates/PathologyForm';
import { noteKind } from '@/lib/notebook/kinds.mjs';
import { EditBox, EditHint, EditList } from '../templates/edit';

const QUIET = '#768692';

function Head({ children }) {
  return (
    <div style={s('padding:13px 16px 15px;background:#fff;border-bottom:1px solid #d8e1e5;display:flex;flex-wrap:wrap;gap:14px;')}>
      {children}
    </div>
  );
}

function HeadField({ label, wide = false, children }) {
  return (
    <div style={s('flex:1 1 ' + (wide ? '100%' : '220px') + ';min-width:0;')}>
      <span style={s('display:block;font-size:12px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:' + QUIET + ';margin-bottom:5px;')}>{label}</span>
      {children}
    </div>
  );
}

/**
 * @param kind    the note's kind id
 * @param fields  its values, already complete for the kind
 * @param issues  what noteIssues() found, so a box that has to be filled in is
 *                outlined in red with its reason under it
 * @param onChange called with the whole fields object
 */
export default function CardEditor({ kind, fields, issues = [], onChange }) {
  const def = noteKind(kind);
  const set = (key, value) => onChange({ ...fields, [key]: value });
  const edit = { set, issues };
  const bad = (key) => issues.find((i) => i.field === key);

  // The service, and how staff ask for it. Every kind has these two under
  // different names, and they are the note's own: the aliases are what the
  // search is meant to match, not anything e-RS or EMIS knows about.
  const named = (key, label, placeholder) => (
    <HeadField label={label}>
      <EditBox value={fields[key]} onChange={(v) => set(key, v)} placeholder={placeholder}
        invalid={!!bad(key)} label={label} />
      <EditHint bad={!!bad(key)}>{bad(key) ? bad(key).message : 'What staff would call this.'}</EditHint>
    </HeadField>
  );

  const aliases = (
    <HeadField label="Also called">
      <EditList value={fields.aliases} onChange={(v) => set('aliases', v)}
        placeholder="hearing test" addLabel="Add another wording" label="Alias" />
      <EditHint>How somebody might ask for it. These are matched exactly.</EditHint>
    </HeadField>
  );

  if (def.id === 'ersReferral') {
    return (
      <ErsForm
        edit={edit}
        head={(
          <Head>
            {named('service', 'Service', 'Audiology / hearing test')}
            {aliases}
            <HeadField label="Form">
              <EditBox value={fields.form} onChange={(v) => set('form', v)} big={false}
                placeholder="AQP Direct Access" label="Form" />
              <EditHint>The letter template to search for, if the practice names one.</EditHint>
            </HeadField>
          </Head>
        )}
        block={{
          requestType: fields.requestType,
          priority: fields.priority,
          specialty: fields.specialty,
          clinicType: fields.clinicType,
          clinicTypeOptions: fields.clinicTypeOptions,
          clinicTypeCondition: fields.clinicTypeCondition,
          hospital: fields.hospital,
          hospitalRule: fields.hospitalRule,
          pathway: fields.pathway,
        }}
      />
    );
  }

  if (def.id === 'emailReferral') {
    return (
      <ProfMessage
        edit={edit}
        head={(
          <Head>
            {named('service', 'Service', 'ECG')}
            {aliases}
          </Head>
        )}
        block={{
          to: fields.to,
          // The rule for finding the address sits in the To box's own second
          // line, which is where the reader is told about it, so the editor
          // writes it there too.
          toMissing: fields.toRule,
          org: fields.org,
          body: fields.body,
          attach: fields.attach,
          form: fields.form,
        }}
      />
    );
  }

  if (def.id === 'bloodTestSet') {
    return (
      <PathologyForm
        edit={edit}
        head={(
          <Head>
            {named('review', 'Review', 'Diabetes review')}
            {aliases}
            <HeadField label="Timing">
              <EditBox value={fields.timing} onChange={(v) => set('timing', v)} big={false}
                placeholder="Before 1pm for the same-day courier" label="Timing" />
              <EditHint>When the sample has to be taken or sent, if it matters.</EditHint>
            </HeadField>
          </Head>
        )}
        block={{
          ordered: fields.ordered,
          groups: [],
          clinicalDetails: fields.clinicalDetails,
        }}
      />
    );
  }

  // A plain note has no card. The caller does not render this, and returning
  // null rather than throwing means a kind added to the registry before its
  // screen exists opens as a page instead of breaking the Notebook.
  return null;
}
