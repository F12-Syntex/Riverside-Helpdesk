'use client';

// The Accurx "New professional message" window, drawn with the email written.
//
// Same argument as ErsForm next door, for the other half of the job. An emailed
// referral is typed into this one window, so the card IS the window: the same
// rows in the same order, with the address in the To box and the wording in the
// message body, and a Copy on the wording because the one thing a receptionist
// must never have to do is retype something the card is already showing them.
//
// Nothing here is interactive. The chips, the tick and the Send button are
// pictures of the state the window should end up in, not controls, and they are
// hidden from a screen reader where they carry no information.
//
// THE PATIENT IS NOT DRAWN. Accurx puts the record in the header itself, and a
// name invented for a picture of a window is a name somebody could read as the
// patient they are working on. The header says whose record it is instead.
//
// Nothing here is interactive UNLESS IT IS BEING WRITTEN — see the same note
// at the head of ErsForm. Given an `edit` prop the window is the editor: the
// address, the wording and the attachment are typed into the places they are
// read from.
import React from 'react';
import { s, Svg, Icons } from '../ui';
import CopyButton from './CopyButton';
import { EditBox, EditHint } from './edit';

const INK = '#212b32';
const QUIET = '#768692';
const LINE = '#e3e8eb';
const AMBER = '#8a6100';

// A person, for the "Assigned to" row. The icon set has no such glyph and this
// is the only place that wants one, so it is drawn here rather than added to a
// set every page in the application loads.
const PERSON = (<><circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></>);

function Row({ children, first = false, top = false }) {
  return (
    <div style={s('display:flex;align-items:' + (top ? 'flex-start' : 'center') + ';gap:10px;padding:11px 14px;' + (first ? '' : 'border-top:1px solid ' + LINE + ';'))}>
      {children}
    </div>
  );
}

// `edit` is `{ set(key, value), issues }` — see ErsForm. `head` is the strip
// above the window for what the note needs and AccurX does not.
export default function ProfMessage({ block, edit = null, head = null }) {
  const b = block || {};
  const body = String(b.body || '');
  const attach = b.attach || 'EMIS file';
  const bad = (key) => (edit ? (edit.issues || []).find((i) => i.field === key) : null);

  return (
    <div style={s('border:1px solid #d8e1e5;border-radius:12px;background:#fff;overflow:hidden;')}>
      {/* The card's own bar, not Accurx's: what this picture is, and the Copy
          for the wording inside it. On the bar rather than beside the body so
          there is one obvious button on the block and it is never scrolled
          past. */}
      <div style={s('display:flex;align-items:center;gap:10px;padding:7px 10px 7px 16px;background:#005eb8;color:#fff;')}>
        <Svg w={14} stroke="#fff" sw={2.4} style={s('flex:none;')}>{Icons.chat}</Svg>
        <span style={s('flex:1;min-width:0;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;')}>Send from Accurx</span>
        {!edit && <CopyButton value={body} label="Copy the wording" small />}
      </div>
      {head}

      <div style={s('padding:14px;background:#f0f4f5;')}>
        <div style={s('border:1px solid #d8e1e5;border-radius:10px;background:#fff;box-shadow:0 2px 10px rgba(33,43,50,.07);overflow:hidden;')}>
          {/* The window's title bar, with its own buttons drawn and silent. */}
          <div style={s('display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid ' + LINE + ';')}>
            <span style={s('flex:1;min-width:0;font-size:13px;font-weight:700;color:#0b3a6f;')}>New professional message</span>
            <span aria-hidden="true" style={s('flex:none;display:flex;gap:11px;align-items:center;color:' + QUIET + ';font-size:13px;line-height:1;')}>
              <span>&minus;</span><span>▢</span><span>✕</span>
            </span>
          </div>

          {/* Whose record it is. Named, not invented — see the note at the top. */}
          <div style={s('display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid ' + LINE + ';')}>
            <span style={s('flex:1;min-width:0;font-size:13.5px;color:' + QUIET + ';')}>
              The patient whose record you opened this from
            </span>
            <span aria-hidden="true" style={s('flex:none;display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#0b3a6f;')}>
              <Svg w={13} stroke="#0b3a6f" sw={2.2}>{Icons.external}</Svg>EMIS
            </span>
          </div>

          <div style={s('padding:12px 14px 14px;background:#f7f9fa;')}>
            <span aria-hidden="true" style={s('display:inline-flex;align-items:center;gap:7px;background:#fff;border:1px solid #d8e1e5;border-radius:8px;padding:6px 12px;font-size:12.5px;font-weight:700;color:' + QUIET + ';margin-bottom:11px;')}>
              <Svg w={13} stroke={QUIET} sw={2.2}>{Icons.paperclip}</Svg>Start a referral
            </span>

            <div style={s('border:1px solid ' + LINE + ';border-radius:8px;background:#fff;overflow:hidden;')}>
              {/* To. The address where the practice records one, and where it
                  does not, what actually happens — the document carries it, so
                  an empty box here is not a box left blank by mistake. */}
              {/* Writing, the To row is three boxes tall — the address, the
                  rule for finding it, the organisation — so the label sits at
                  the top of them rather than floating in the middle of a stack
                  it is not the label for. */}
              <Row first top={!!edit}>
                <span style={s('flex:none;font-size:13px;color:' + QUIET + ';min-width:22px;' + (edit ? 'padding-top:10px;' : ''))}>To</span>
                {edit ? (
                  <div style={s('flex:1;min-width:0;')}>
                    <EditBox value={b.to} onChange={(v) => edit.set('to', v)} placeholder="team@example.nhs.uk"
                      invalid={!!bad('to')} label="Send to" />
                    <EditHint bad={!!bad('to')}>
                      {bad('to') ? bad('to').message : 'The address, character for character.'}
                    </EditHint>
                    <div style={s('margin-top:9px;')}>
                      <span style={s('display:block;font-size:12px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:' + QUIET + ';margin-bottom:5px;')}>…or how it is found</span>
                      <EditBox value={b.toMissing} onChange={(v) => edit.set('toRule', v)} big={false}
                        placeholder="Fills in automatically from the document" label="Rule for the address" />
                    </div>
                    <div style={s('margin-top:9px;')}>
                      <span style={s('display:block;font-size:12px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:' + QUIET + ';margin-bottom:5px;')}>Organisation</span>
                      <EditBox value={b.org} onChange={(v) => edit.set('org', v)} big={false}
                        placeholder="The team it goes to" label="Organisation" />
                    </div>
                  </div>
                ) : b.to ? (
                  <span style={s('flex:1;min-width:0;overflow-wrap:anywhere;font-size:15px;font-weight:700;color:' + INK + ';')}>
                    {b.to}
                    {b.org && <span style={s('display:block;font-size:13px;font-weight:400;color:' + QUIET + ';margin-top:2px;')}>{b.org}</span>}
                  </span>
                ) : (
                  <span style={s('flex:1;min-width:0;display:flex;gap:7px;align-items:center;font-size:13.5px;font-weight:600;color:' + AMBER + ';')}>
                    <Svg w={14} stroke="#b58500" sw={2.2} style={s('flex:none;')}>{Icons.alertCircle}</Svg>
                    {b.toMissing || 'Fills in automatically from the document'}
                  </span>
                )}
              </Row>

              {/* Accurx's own template search, drawn as it sits on the screen:
                  the practice keeps no template in it, and the wording below is
                  the card's answer to that. */}
              <Row>
                <Svg w={14} stroke={QUIET} sw={2.2} style={s('flex:none;')}>{Icons.search}</Svg>
                <span style={s('flex:1;min-width:0;font-size:13.5px;color:' + QUIET + ';')}>Search templates</span>
                <span aria-hidden="true" style={s('flex:none;color:' + QUIET + ';font-weight:700;letter-spacing:.08em;')}>···</span>
              </Row>

              {/* The wording itself. Held as written, line breaks and all: it is
                  what gets pasted, not prose to be re-flowed. */}
              {edit ? (
                <div style={s('padding:12px 14px;border-top:1px solid ' + LINE + ';')}>
                  <EditBox value={b.body} onChange={(v) => edit.set('body', v)} lines={6} big={false}
                    placeholder={'Dear Colleague,\n\nPlease find attached a referral for this patient.\n\nThanks,\nThe Riverside Practice'}
                    label="Wording" />
                  <EditHint>
                    Only where the practice dictates the wording; left empty, the card writes it from the service.
                    Never a patient name, date of birth or NHS number — AccurX attaches the record itself.
                  </EditHint>
                </div>
              ) : (
                <div style={s('padding:14px;border-top:1px solid ' + LINE + ';font-size:15px;line-height:1.65;white-space:pre-wrap;color:' + INK + ';')}>
                  {body}
                </div>
              )}

              <Row>
                <Svg w={15} stroke={QUIET} sw={2.2} style={s('flex:none;')}>{PERSON}</Svg>
                <span style={s('flex:1;min-width:0;font-size:13.5px;color:' + INK + ';')}>Assigned to</span>
                <span aria-hidden="true" style={s('flex:none;display:inline-flex;align-items:center;gap:6px;border:1px solid #d8e1e5;border-radius:6px;padding:3px 9px;font-size:13px;font-weight:600;color:' + INK + ';')}>
                  {b.assignedTo || 'You'}
                  <Svg w={13} stroke={INK} sw={2.4}>{Icons.chevronDown}</Svg>
                </span>
              </Row>

              {/* The attach menu, open, with the one to pick marked. This is the
                  step that goes wrong: Desktop file is the first thing under the
                  paperclip and it is the wrong one — the letter is in the
                  record, not on the machine. */}
              <div style={s('border-top:1px solid ' + LINE + ';padding:10px 14px 12px;background:#fbfcfd;')}>
                <div style={s('display:flex;align-items:center;gap:9px;font-size:13.5px;color:' + QUIET + ';')}>
                  <Svg w={14} stroke={QUIET} sw={2.2} style={s('flex:none;')}>{Icons.paperclip}</Svg>Desktop file
                </div>
                {edit ? (
                  <div style={s('display:flex;gap:10px;margin-top:9px;flex-wrap:wrap;')}>
                    <div style={s('flex:1 1 150px;min-width:0;')}>
                      <span style={s('display:block;font-size:12px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:' + QUIET + ';margin-bottom:5px;')}>Attach</span>
                      <EditBox value={b.attach} onChange={(v) => edit.set('attach', v)} big={false}
                        placeholder="EMIS file" label="Attach" />
                    </div>
                    <div style={s('flex:1 1 150px;min-width:0;')}>
                      <span style={s('display:block;font-size:12px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:' + QUIET + ';margin-bottom:5px;')}>Form</span>
                      <EditBox value={b.form} onChange={(v) => edit.set('form', v)} big={false}
                        placeholder="RP Echo" label="Form" />
                    </div>
                  </div>
                ) : (
                  <div style={s('display:flex;align-items:center;gap:9px;margin-top:9px;font-size:14px;font-weight:700;color:#005eb8;')}>
                    <Svg w={14} stroke="#005eb8" sw={2.4} style={s('flex:none;')}>{Icons.paperclip}</Svg>
                    {attach}
                    <span style={s('font-size:13px;font-weight:600;color:' + QUIET + ';')}>
                      — the referral letter{b.form ? ' (' + b.form + ')' : ''}
                    </span>
                  </div>
                )}
              </div>

              <div style={s('display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid ' + LINE + ';')}>
                <span aria-hidden="true" style={s('flex:1;min-width:0;display:flex;gap:12px;align-items:center;color:' + QUIET + ';')}>
                  <Svg w={15} stroke={QUIET} sw={2.2}>{Icons.paperclip}</Svg>
                  <span style={s('font-weight:700;letter-spacing:.08em;')}>···</span>
                </span>
                <span aria-hidden="true" style={s('flex:none;display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:' + INK + ';')}>
                  <span style={s('width:15px;height:15px;border-radius:3px;background:#005eb8;display:inline-flex;align-items:center;justify-content:center;')}>
                    <Svg w={10} stroke="#fff" sw={3}>{Icons.check}</Svg>
                  </span>
                  Save
                </span>
                <span aria-hidden="true" style={s('flex:none;display:inline-flex;align-items:center;gap:7px;background:#005eb8;color:#fff;border-radius:6px;padding:7px 16px;font-size:14px;font-weight:700;')}>
                  <Svg w={14} stroke="#fff" sw={2.4}>{Icons.arrow}</Svg>Send
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
