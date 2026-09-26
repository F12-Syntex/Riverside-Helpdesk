'use client';

// An emailed referral, said as what it is: send the doctor's form by email.
//
// THIS REPLACED A DRAWING OF THE ACCURX WINDOW. The window put an address box,
// an address rule, an organisation, a wording box and an attachment picker in
// front of a receptionist whose whole job is one sentence — the doctor has
// already made the referral form, email it. Every box on the picture was a box
// the practice was asked to fill in and mostly could not, so notes sat as
// drafts for want of an organisation nobody needed. So the card says the
// sentence, names the form, and carries the address and any notes only when
// the practice has them.
//
// Given `edit` (`{ set(key, value), issues }`, as ErsForm) the same card is the
// editor: the form, the address and the notes are typed where they are read.
import React from 'react';
import { s, Svg, Icons } from '../ui';
import CopyButton from './CopyButton';
import { EditBox, EditHint } from './edit';

const INK = '#212b32';
const QUIET = '#768692';
const LINE = '#e3e8eb';

function Row({ label, children, first = false }) {
  return (
    <div style={s('padding:12px 16px;' + (first ? '' : 'border-top:1px solid ' + LINE + ';'))}>
      <span style={s('display:block;font-size:12px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:' + QUIET + ';margin-bottom:5px;')}>{label}</span>
      {children}
    </div>
  );
}

export default function EmailForm({ block, edit = null, head = null }) {
  const b = block || {};
  const bad = (key) => (edit ? (edit.issues || []).find((i) => i.field === key) : null);
  const form = String(b.form || '').trim();
  const to = String(b.to || '').trim();
  const notes = String(b.notes || '').trim();

  return (
    <div style={s('border:1px solid #d8e1e5;border-radius:12px;background:#fff;overflow:hidden;')}>
      <div style={s('display:flex;align-items:center;gap:10px;padding:9px 16px;background:#00786f;color:#fff;')}>
        <Svg w={15} stroke="#fff" sw={2.2}>{Icons.paperclip}</Svg>
        <span style={s('flex:1;min-width:0;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;')}>Email the referral</span>
      </div>
      {head}

      <div style={s('padding:13px 16px;font-size:15px;line-height:1.55;color:' + INK + ';background:#f7f9fa;border-bottom:1px solid ' + LINE + ';')}>
        This referral is sent by email, using the form the doctor has created.
        Attach the form and send it.
      </div>

      <Row label="Form" first>
        {edit ? (
          <>
            <EditBox value={b.form} onChange={(v) => edit.set('form', v)} placeholder="RP Echo"
              invalid={!!bad('form')} label="Form" />
            <EditHint bad={!!bad('form')}>{bad('form') ? bad('form').message : 'The form the doctor fills in, as it is named in EMIS.'}</EditHint>
          </>
        ) : (
          <span style={s('font-size:15px;font-weight:700;color:' + INK + ';')}>{form || 'The referral form the doctor created'}</span>
        )}
      </Row>

      {(edit || to) && (
        <Row label="Email">
          {edit ? (
            <>
              <EditBox value={b.to} onChange={(v) => edit.set('to', v)} placeholder="team@example.nhs.uk"
                invalid={!!bad('to')} label="Email" />
              <EditHint bad={!!bad('to')}>{bad('to') ? bad('to').message : 'Optional. Leave empty where the address comes from the form.'}</EditHint>
            </>
          ) : (
            <span style={s('display:flex;align-items:center;gap:8px;flex-wrap:wrap;')}>
              <span style={s('overflow-wrap:anywhere;font-size:15px;font-weight:700;color:' + INK + ';')}>{to}</span>
              <CopyButton value={to} label="Copy the address" small />
            </span>
          )}
        </Row>
      )}

      {(edit || notes) && (
        <Row label="Additional notes">
          {edit ? (
            <>
              <EditBox value={b.notes} onChange={(v) => edit.set('notes', v)} lines={3} big={false}
                placeholder="Anything else to know when sending it" label="Additional notes" />
              <EditHint>Optional. Never a patient name, date of birth or NHS number.</EditHint>
            </>
          ) : (
            <div style={s('font-size:14.5px;line-height:1.6;white-space:pre-wrap;color:' + INK + ';')}>{notes}</div>
          )}
        </Row>
      )}
    </div>
  );
}