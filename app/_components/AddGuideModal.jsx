'use client';

import { Svg, Icons } from './ui';

// A dialog in the app's one popup shape (see the popups block in globals.css).
export default function AddGuideModal({ v }) {
  return (
    <div className="ap-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) v.onCloseAdd(); }}>
      <div className="ap-panel" role="dialog" aria-modal="true" aria-labelledby="riva-add-title">
        <div className="ap-head">
          <h2 id="riva-add-title" className="ap-title">Add a guide</h2>
          <button type="button" className="ap-close" onClick={v.onCloseAdd} aria-label="Close"><Svg w={15} sw={2.4}>{Icons.close}</Svg></button>
        </div>
        <div className="ap-body" style={{ maxHeight: '70vh' }}>
          <div>
            <label className="ap-label">Question</label>
            <input className="ap-field" value={v.draft.question} onChange={v.onDraftQuestion} placeholder="e.g. How do I print a patient summary?" />
          </div>
          <div>
            <label className="ap-label">Area</label>
            <select className="ap-field" value={v.draft.category} onChange={v.onDraftCategory}>
              {v.cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="ap-label">Short summary <span className="ap-hint">(optional)</span></label>
            <input className="ap-field" value={v.draft.intro} onChange={v.onDraftIntro} placeholder="One line about what this does" />
          </div>
          <div>
            <label className="ap-label">Steps</label>
            <div className="ap-steps">
              {v.draftSteps.map((st, i) => (
                <div key={i} className="ap-step">
                  <span className="ap-step__n">{st.num}</span>
                  <input className="ap-field" value={st.value} onChange={st.onChange} placeholder="Describe this step" style={{ flex: 1, minWidth: 0 }} />
                  {st.canRemove && <button type="button" className="ap-x" onClick={st.onRemove} aria-label="Remove step"><Svg w={16} sw={2.2}>{Icons.close}</Svg></button>}
                </div>
              ))}
            </div>
            <button type="button" className="ap-link" onClick={v.onAddStep} style={{ marginTop: 8 }}>Add step</button>
          </div>
          <div>
            <label className="ap-label">Tip <span className="ap-hint">(optional)</span></label>
            <input className="ap-field" value={v.draft.tip} onChange={v.onDraftTip} placeholder="A helpful note for colleagues" />
          </div>
          {v.draftError && <div style={{ color: '#d5281b', fontSize: 14.5, fontWeight: 600 }}>Add a question and at least one step.</div>}
        </div>
        <div className="ap-foot">
          <button type="button" className="ap-btn ap-btn--quiet" onClick={v.onCloseAdd}>Cancel</button>
          <button type="button" className="ap-btn ap-btn--primary" onClick={v.onSaveGuide}>Save guide</button>
        </div>
      </div>
    </div>
  );
}
