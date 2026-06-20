'use client';

import { s, Hover, Svg, Icons } from './ui';

export default function AddGuideModal({ v }) {
  return (
    <div style={s('position:fixed;inset:0;background:rgba(33,43,50,.45);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;z-index:50;')}>
      <div style={s('width:100%;max-width:560px;background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(33,43,50,.18);overflow:hidden;')}>
        <div style={s('display:flex;align-items:center;padding:18px 22px;border-bottom:1px solid #d8dde0;')}>
          <h3 style={s('font-size:21px;margin:0;')}>Add a guide</h3>
          <button onClick={v.onCloseAdd} aria-label="Close" style={s('margin-left:auto;background:none;border:none;cursor:pointer;color:#4c6272;padding:4px;display:flex;')}><span><Svg w={24}>{Icons.close}</Svg></span></button>
        </div>
        <div style={s('padding:22px;display:flex;flex-direction:column;gap:18px;max-height:70vh;overflow-y:auto;')}>
          <div>
            <label style={s('display:block;font-weight:600;font-size:16px;margin-bottom:6px;')}>Question</label>
            <input className="riva-form-field" value={v.draft.question} onChange={v.onDraftQuestion} placeholder="e.g. How do I print a patient summary?" style={s('width:100%;font:inherit;font-size:16px;padding:10px 12px;border:2px solid #4c6272;border-radius:4px;background:#fff;outline:none;')} />
          </div>
          <div>
            <label style={s('display:block;font-weight:600;font-size:16px;margin-bottom:6px;')}>Area</label>
            <select className="riva-form-field" value={v.draft.category} onChange={v.onDraftCategory} style={s('width:100%;font:inherit;font-size:16px;padding:10px 12px;border:2px solid #4c6272;border-radius:4px;background:#fff;outline:none;')}>
              {v.cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={s('display:block;font-weight:600;font-size:16px;margin-bottom:6px;')}>Short summary <span style={s('font-weight:400;color:#768692;')}>(optional)</span></label>
            <input className="riva-form-field" value={v.draft.intro} onChange={v.onDraftIntro} placeholder="One line about what this does" style={s('width:100%;font:inherit;font-size:16px;padding:10px 12px;border:2px solid #4c6272;border-radius:4px;background:#fff;outline:none;')} />
          </div>
          <div>
            <label style={s('display:block;font-weight:600;font-size:16px;margin-bottom:8px;')}>Steps</label>
            <div style={s('display:flex;flex-direction:column;gap:8px;')}>
              {v.draftSteps.map((st, i) => (
                <div key={i} style={s('display:flex;gap:8px;align-items:center;')}>
                  <span style={s('flex:none;width:26px;height:26px;border-radius:50%;background:#e8f1f8;color:#005eb8;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;')}>{st.num}</span>
                  <input className="riva-form-field" value={st.value} onChange={st.onChange} placeholder="Describe this step" style={s('flex:1;min-width:0;font:inherit;font-size:16px;padding:9px 12px;border:2px solid #4c6272;border-radius:4px;background:#fff;outline:none;')} />
                  {st.canRemove && <button onClick={st.onRemove} aria-label="Remove step" style={s('flex:none;background:none;border:none;cursor:pointer;color:#768692;padding:4px;display:flex;')}><span><Svg w={20}>{Icons.close}</Svg></span></button>}
                </div>
              ))}
            </div>
            <button onClick={v.onAddStep} style={s('margin-top:10px;background:none;border:none;color:#005eb8;font:inherit;font-size:15px;font-weight:600;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:6px;')}><span><Svg w={17}>{Icons.plus}</Svg></span>Add step</button>
          </div>
          <div>
            <label style={s('display:block;font-weight:600;font-size:16px;margin-bottom:6px;')}>Tip <span style={s('font-weight:400;color:#768692;')}>(optional)</span></label>
            <input className="riva-form-field" value={v.draft.tip} onChange={v.onDraftTip} placeholder="A helpful note for colleagues" style={s('width:100%;font:inherit;font-size:16px;padding:10px 12px;border:2px solid #4c6272;border-radius:4px;background:#fff;outline:none;')} />
          </div>
          {v.draftError && <div style={s('color:#d5281b;font-size:15px;font-weight:600;')}>Add a question and at least one step.</div>}
        </div>
        <div style={s('padding:16px 22px;border-top:1px solid #d8dde0;display:flex;gap:12px;justify-content:flex-end;')}>
          <Hover tag="button" onClick={v.onCloseAdd} base="background:#fff;color:#4c6272;border:2px solid #d8dde0;border-radius:8px;padding:10px 18px;font:inherit;font-size:16px;font-weight:600;cursor:pointer;" hover="border-color:#4c6272;">Cancel</Hover>
          <Hover tag="button" onClick={v.onSaveGuide} base="background:#007f3b;color:#fff;border:none;border-radius:8px;padding:11px 20px;font:inherit;font-size:16px;font-weight:600;cursor:pointer;box-shadow:0 4px 0 #003419;" active="transform:translateY(4px);box-shadow:none;">Save guide</Hover>
        </div>
      </div>
    </div>
  );
}
