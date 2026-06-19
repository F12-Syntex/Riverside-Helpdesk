'use client';

import React from 'react';
import { SEED_GUIDES, CATEGORIES, BROWSE_AREAS as BROWSE, POPULAR_IDS, QUICK_IDS } from '../lib/guides';
import { askRiva } from '../lib/ai/client';

/* ------------------------------------------------------------------ *
 * Small helpers that let us keep the design's inline-style strings
 * almost verbatim while rendering real React.
 * ------------------------------------------------------------------ */

// Convert a CSS declaration string ("a:b;c-d:e") into a React style object.
function s(str) {
  const o = {};
  if (!str) return o;
  for (const part of String(str).split(';')) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (!k) continue;
    const val = part.slice(idx + 1).trim();
    const ck = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    o[ck] = val;
  }
  return o;
}

// A button/element with hover + active styling. The hover/active styles are
// applied via real CSS pseudo-classes (:hover / :active) rather than JS state,
// so they can never get "stuck" if a mouseleave is missed (which happened when
// a card shifted up on hover via translateY).
const _hoverReg = new Map();
let _hoverSeq = 0;

function _important(css) {
  return String(css).split(';').map((p) => {
    const i = p.indexOf(':');
    if (i === -1) return '';
    const k = p.slice(0, i).trim();
    const val = p.slice(i + 1).trim();
    if (!k || !val) return '';
    return k + ':' + val + ' !important;';
  }).join('');
}

function _hoverClass(hover, active) {
  const key = hover + '@@' + active;
  let cls = _hoverReg.get(key);
  if (!cls) { cls = 'rh' + (++_hoverSeq); _hoverReg.set(key, cls); }
  return cls;
}

function _injectHover(cls, hover, active) {
  if (typeof document === 'undefined') return;
  if (document.getElementById('rh-' + cls)) return;
  let body = '';
  if (hover) body += '.' + cls + ':hover{' + _important(hover) + '}';
  if (active) body += '.' + cls + ':active{' + _important(active) + '}';
  if (!body) return;
  const el = document.createElement('style');
  el.id = 'rh-' + cls;
  el.textContent = body;
  document.head.appendChild(el);
}

function Hover({ tag = 'button', base = '', hover = '', active = '', className = '', children, ...rest }) {
  const cls = _hoverClass(hover, active);
  React.useEffect(() => { _injectHover(cls, hover, active); }, [cls, hover, active]);
  const Tag = tag;
  return (
    <Tag {...rest} className={(className ? className + ' ' : '') + cls} style={s(base)}>
      {children}
    </Tag>
  );
}

// Inline SVG wrapper — applies the root attributes (the inner path/line/etc.
// elements are already valid JSX).
function Svg({ w = 24, h, stroke = 'currentColor', sw = 2, fill = 'none', style, children }) {
  return (
    <svg
      width={w}
      height={h || w}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={stroke}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {children}
    </svg>
  );
}

// Reusable icon glyphs (the inner geometry only).
const Icons = {
  bot: (<><path d="M4 13v-1a8 8 0 0 1 16 0v1" /><rect x="2.5" y="13" width="4" height="6" rx="1.5" /><rect x="17.5" y="13" width="4" height="6" rx="1.5" /><path d="M19.5 19v1a2 2 0 0 1-2 2H13" /></>),
  triangle: (<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>),
  play: (<><circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" /></>),
  calendar: (<><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>),
  pill: (<><path d="M10.5 20.5a4.95 4.95 0 0 1-7-7l6-6a4.95 4.95 0 0 1 7 7z" /><line x1="8.5" y1="8.5" x2="15.5" y2="15.5" /></>),
  pen: (<><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></>),
  file: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>),
  userplus: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" y1="8" x2="19" y2="14" /><line x1="22" y1="11" x2="16" y2="11" /></>),
  send: (<><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>),
  keyboard: (<><rect x="2" y="6" width="20" height="12" rx="2" /><line x1="6" y1="10" x2="6" y2="10" /><line x1="10" y1="10" x2="10" y2="10" /><line x1="14" y1="10" x2="14" y2="10" /><line x1="8" y1="14" x2="16" y2="14" /></>),
  arrow: (<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>),
  alertCircle: (<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>),
  infoCircle: (<><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>),
  phone: (<><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></>),
  image: (<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>),
  copy: (<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  banner: (<><path d="M12 3v3" /><rect x="5" y="6" width="14" height="12" rx="2" /><path d="M9 12h.01M15 12h.01" /><path d="M2 12h3M19 12h3" /></>),
  up: (<><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>),
  close: (<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>),
  plus: (<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>),
};

// Browse-by-area cards come from lib/guides (imported above as BROWSE).

function assetSrc(p) {
  if (!p) return p;
  if (/^(https?:)?\//.test(p)) return p;
  return '/' + p;
}

/* ------------------------------------------------------------------ *
 * The Riva component — logic ported from the Claude Design source.
 * ------------------------------------------------------------------ */

class Riva extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      input: '',
      messages: [],
      customGuides: [],
      showAdd: false,
      draft: this.blankDraft(),
      copiedIdx: null,
      draftError: false,
      viewer: null,
    };
  }

  openViewer(citation) { this.setState({ viewer: citation }); }
  closeViewer() { this.setState({ viewer: null }); }

  blankDraft() {
    return { question: '', category: 'appointments', intro: '', steps: ['', ''], tip: '' };
  }

  componentDidMount() {
    try {
      const g = JSON.parse(localStorage.getItem('riva-guides-v1') || '[]');
      const m = JSON.parse(localStorage.getItem('riva-chat-v1') || '[]');
      this.setState({
        customGuides: Array.isArray(g) ? g : [],
        messages: Array.isArray(m) ? m : [],
      });
    } catch (e) {}
  }

  // Build a short transcript of the conversation so the AI understands follow-ups.
  buildHistory(upto) {
    const all = this.allGuides();
    const msgs = this.state.messages.slice(0, upto).slice(-8);
    const lines = [];
    for (const m of msgs) {
      if (m.role === 'user') { lines.push('Staff member: ' + m.text); continue; }
      if (m.kind === 'answer') {
        const g = all.find((x) => x.id === m.guideId);
        if (g) {
          const steps = (g.steps || []).map((st, i) => (st.kbd ? st.kbd + ' = ' + st.text : (i + 1) + ') ' + st.text)).join('  ');
          lines.push('The assistant showed the guide “' + g.question + '”: ' + steps + (g.tip ? '  Tip: ' + g.tip : ''));
        }
      } else if (m.kind === 'ai') {
        const steps = (m.steps || []).map((t, i) => (i + 1) + ') ' + t).join('  ');
        if (steps) lines.push('The assistant answered: ' + steps);
      } else if (m.kind === 'suggest') {
        lines.push('The assistant: ' + m.text);
      }
    }
    return lines.join('\n');
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState && prevState.messages !== this.state.messages) {
      const el = document.getElementById('riva-scroll');
      if (el) el.scrollTop = el.scrollHeight;
    }
  }

  save() {
    try {
      localStorage.setItem('riva-chat-v1', JSON.stringify(this.state.messages));
      localStorage.setItem('riva-guides-v1', JSON.stringify(this.state.customGuides));
    } catch (e) {}
  }

  cats() { return CATEGORIES; }

  seed() { return SEED_GUIDES; }

  allGuides() {
    return this.seed().concat(this.state.customGuides || []);
  }

  popularIds() { return POPULAR_IDS; }
  quickIds() { return QUICK_IDS; }

  ask(text) {
    const t = (text || '').trim();
    if (!t) return;
    const userMsg = { role: 'user', text: t };
    // Every typed question is routed through the AI assistant, which decides
    // whether to surface an existing guide or compose an answer.
    const aiMsg = { role: 'bot', kind: 'ai', question: t, status: 'loading', intro: '', steps: null, tip: '', message: '' };
    const messages = this.state.messages.concat([userMsg, aiMsg]);
    const aiIdx = messages.length - 1;
    this.setState({ messages, input: '' }, () => { this.save(); this.fetchAI(t, aiIdx); });
  }

  async fetchAI(question, idx) {
    const history = this.buildHistory(idx);
    try {
      const data = await askRiva({ question, history, customGuides: this.state.customGuides });
      if (data.guideId && this.allGuides().some((g) => g.id === data.guideId)) {
        const messages = this.state.messages.slice();
        messages[idx] = { role: 'bot', kind: 'answer', guideId: data.guideId, feedback: null };
        this.setState({ messages }, () => this.save());
        return;
      }
      if (!data.steps.length && !data.message) { this.updateAi(idx, { status: 'error' }); return; }
      this.updateAi(idx, { status: 'done', intro: data.intro, steps: data.steps, message: data.message, tip: data.tip, images: data.images || [], citations: data.citations || [] });
    } catch (e) {
      this.updateAi(idx, { status: 'error' });
    }
  }

  updateAi(idx, patch) {
    const messages = this.state.messages.slice();
    if (messages[idx]) messages[idx] = Object.assign({}, messages[idx], patch);
    this.setState({ messages }, () => this.save());
  }

  copyAi(m, idx) {
    if (m.message) {
      try { navigator.clipboard.writeText(m.message); } catch (e) {}
      this.flagCopied(idx);
      return;
    }
    const lines = [m.question, ''];
    (m.steps || []).forEach((t, i) => lines.push((i + 1) + '. ' + t));
    if (m.tip) lines.push('', 'Tip: ' + m.tip);
    lines.push('', '(AI answer — not from the practice knowledge base.)');
    try { navigator.clipboard.writeText(lines.join('\n')); } catch (e) {}
    this.flagCopied(idx);
  }

  flagCopied(idx) {
    this.setState({ copiedIdx: idx });
    clearTimeout(this._ct);
    this._ct = setTimeout(() => this.setState({ copiedIdx: null }), 1800);
  }

  prefillFromAi(m) {
    this.setState({
      showAdd: true,
      draftError: false,
      draft: {
        question: m.question || '',
        category: 'appointments',
        intro: m.intro || '',
        steps: (m.steps && m.steps.length) ? m.steps.slice() : ['', ''],
        tip: m.tip || '',
      },
    });
  }

  askGuide(g) {
    const userMsg = { role: 'user', text: g.question };
    const bot = { role: 'bot', kind: 'answer', guideId: g.id, feedback: null };
    this.setState({ messages: this.state.messages.concat([userMsg, bot]) }, () => this.save());
  }

  browse(catId) {
    const guides = this.allGuides().filter((x) => x.category === catId);
    const cat = this.cats().find((c) => c.id === catId) || { label: '' };
    const bot = {
      role: 'bot', kind: 'suggest',
      text: 'Here are the ' + cat.label.toLowerCase() + ' guides:',
      guideIds: guides.map((g) => g.id),
    };
    this.setState({ messages: this.state.messages.concat([bot]) }, () => this.save());
  }

  feedback(idx, val) {
    const messages = this.state.messages.slice();
    messages[idx] = Object.assign({}, messages[idx], { feedback: val });
    this.setState({ messages }, () => this.save());
  }

  copySteps(g, idx) {
    const lines = [g.question, ''];
    (g.steps || []).forEach((st, i) => lines.push((i + 1) + '. ' + st.text));
    if (g.tip) lines.push('', 'Tip: ' + g.tip);
    try { navigator.clipboard.writeText(lines.join('\n')); } catch (e) {}
    this.flagCopied(idx);
  }

  newChat() {
    this.setState({ messages: [] }, () => this.save());
  }

  setDraftField(k, v) { this.setState({ draft: Object.assign({}, this.state.draft, { [k]: v }) }); }
  setDraftStep(i, v) {
    const steps = this.state.draft.steps.slice();
    steps[i] = v;
    this.setState({ draft: Object.assign({}, this.state.draft, { steps }) });
  }
  addStep() { this.setState({ draft: Object.assign({}, this.state.draft, { steps: this.state.draft.steps.concat(['']) }) }); }
  removeStep(i) {
    const steps = this.state.draft.steps.slice();
    steps.splice(i, 1);
    this.setState({ draft: Object.assign({}, this.state.draft, { steps }) });
  }

  saveGuide() {
    const d = this.state.draft;
    const steps = d.steps.map((st) => st.trim()).filter(Boolean);
    if (!d.question.trim() || steps.length === 0) {
      this.setState({ draftError: true });
      return;
    }
    const id = 'custom-' + Date.now();
    const keywords = d.question.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    const guide = {
      id, category: d.category, question: d.question.trim(),
      keywords, intro: d.intro.trim(),
      steps: steps.map((t) => ({ text: t, img: true })),
      tip: d.tip.trim() || null, warning: null, related: [],
    };
    const customGuides = (this.state.customGuides || []).concat([guide]);
    this.setState({ customGuides, showAdd: false, draft: this.blankDraft(), draftError: false }, () => {
      this.save();
      this.askGuide(guide);
    });
  }

  buildGuideVM(g) {
    const cat = this.cats().find((c) => c.id === g.category) || { label: '' };
    const showShots = this.props.showScreenshots != null ? this.props.showScreenshots : true;
    const self = this;
    return {
      id: g.id,
      title: g.question,
      intro: g.intro || '',
      hasIntro: !!(g.intro && g.intro.length),
      categoryLabel: cat.label,
      steps: (g.steps || []).map((st, i) => ({
        badge: st.kbd ? st.kbd : String(i + 1),
        isKbd: !!st.kbd,
        notKbd: !st.kbd,
        text: st.text,
        hasShot: showShots && !!st.image,
        shotEl: (showShots && st.image)
          ? React.createElement('img', { src: assetSrc(st.image), alt: 'EMIS Web screenshot', style: { display: 'block', width: '100%', height: 'auto' } })
          : null,
        hasSlot: showShots && !!st.img && !st.image,
        slotId: 'slot-' + g.id + '-' + i,
      })),
      hasTip: !!g.tip,
      tip: g.tip || '',
      hasWarning: !!g.warning,
      warning: g.warning || '',
      hasCards: !!(g.cards && g.cards.length),
      cards: (g.cards || []).map((c) => ({
        title: c.title,
        body: c.body || '',
        hasBody: !!c.body,
        sub: c.sub || '',
        hasSub: !!c.sub,
        phone: c.phone || '',
        hasPhone: !!c.phone,
        phoneLabel: c.phoneLabel || 'Call',
        isEmergency: c.level === 'emergency',
        isUrgent: c.level === 'urgent',
        isInfo: c.level !== 'emergency' && c.level !== 'urgent',
      })),
      hasRelated: !!(g.related && g.related.length),
      related: (g.related || []).map((rid) => {
        const rg = self.allGuides().find((x) => x.id === rid);
        return rg ? { id: rid, question: rg.question, onClick: () => self.askGuide(rg) } : null;
      }).filter(Boolean),
    };
  }

  renderVals() {
    const self = this;
    const all = this.allGuides();
    const counts = {}, browse = {};
    for (const c of this.cats()) {
      counts[c.id] = all.filter((g) => g.category === c.id).length;
      browse[c.id] = () => self.browse(c.id);
    }

    const messages = this.state.messages.map((m, idx) => {
      if (m.role === 'user') {
        return { isUser: true, text: m.text };
      }
      if (m.kind === 'ai') {
        return {
          isAi: true,
          aiLoading: m.status === 'loading',
          aiError: m.status === 'error',
          aiDone: m.status === 'done',
          question: m.question,
          intro: m.intro || '',
          hasIntro: !!(m.intro && m.intro.length),
          steps: (m.steps || []).map((t, i) => ({ num: i + 1, text: t })),
          hasSteps: !!(m.steps && m.steps.length),
          message: m.message || '',
          hasMessage: !!(m.message && m.message.length),
          hasTip: !!(m.tip && m.tip.length),
          tip: m.tip || '',
          images: (m.images || []).map((src) => ({ src: assetSrc(src) })),
          hasImages: !!(m.images && m.images.length),
          citations: (m.citations || []).map((c) => ({ ...c, onOpen: () => self.openViewer(c) })),
          hasCitations: !!(m.citations && m.citations.length),
          onCopy: () => self.copyAi(m, idx),
          copyLabel: this.state.copiedIdx === idx ? 'Copied' : 'Copy steps',
          onSave: () => self.prefillFromAi(m),
        };
      }
      if (m.kind === 'answer') {
        const g = all.find((x) => x.id === m.guideId);
        if (!g) {
          return { isSuggest: true, text: 'That guide is no longer available.', suggestions: [] };
        }
        return {
          isAnswer: true,
          guide: this.buildGuideVM(g),
          feedbackGiven: m.feedback != null,
          showFeedbackButtons: m.feedback == null,
          thanksText: m.feedback === 'down' ? 'Thanks — we’ll review this guide.' : 'Thanks for your feedback.',
          onHelpful: () => self.feedback(idx, 'up'),
          onNotHelpful: () => self.feedback(idx, 'down'),
          onCopy: () => self.copySteps(g, idx),
          copyLabel: this.state.copiedIdx === idx ? 'Copied' : 'Copy steps',
        };
      }
      return {
        isSuggest: true,
        text: m.text,
        suggestions: (m.guideIds || []).map((id) => {
          const gg = all.find((x) => x.id === id);
          return gg ? { id, question: gg.question, onClick: () => self.askGuide(gg) } : null;
        }).filter(Boolean),
      };
    });

    const popular = this.popularIds().map((id) => {
      const g = all.find((x) => x.id === id);
      return g ? { question: g.question, onClick: () => self.askGuide(g) } : null;
    }).filter(Boolean);

    const quick = this.quickIds().map((id) => {
      const g = all.find((x) => x.id === id);
      return g ? { question: g.question, onClick: () => self.askGuide(g) } : null;
    }).filter(Boolean);

    const draftSteps = this.state.draft.steps.map((v, i) => ({
      num: i + 1,
      value: v,
      onChange: (e) => self.setDraftStep(i, e.target.value),
      onRemove: () => self.removeStep(i),
      canRemove: self.state.draft.steps.length > 1,
    }));

    return {
      botName: this.props.botName != null ? this.props.botName : 'The Riverside Practice Q&A bot',
      welcome: this.props.welcome != null ? this.props.welcome : 'For reception. Ask how to do something in EMIS, or what to do at the front desk — I’ll guide you step by step.',
      isEmpty: this.state.messages.length === 0,
      input: this.state.input,
      messages,
      popular,
      quick,
      counts,
      browse,
      cats: this.cats(),
      showAdd: this.state.showAdd,
      draft: this.state.draft,
      draftSteps,
      draftError: this.state.draftError,
      onInput: (e) => self.setState({ input: e.target.value }),
      onSubmit: (e) => { e.preventDefault(); self.ask(self.state.input); },
      onNewChat: () => self.newChat(),
      onOpenAdd: () => self.setState({ showAdd: true, draftError: false }),
      onCloseAdd: () => self.setState({ showAdd: false }),
      onDraftQuestion: (e) => self.setDraftField('question', e.target.value),
      onDraftCategory: (e) => self.setDraftField('category', e.target.value),
      onDraftIntro: (e) => self.setDraftField('intro', e.target.value),
      onDraftTip: (e) => self.setDraftField('tip', e.target.value),
      onAddStep: () => self.addStep(),
      onSaveGuide: () => self.saveGuide(),
    };
  }

  renderGuide(v) {
    const g = v.guide;
    return (
      <div style={s('display:flex;gap:12px;align-items:flex-start;animation:rivaUp .25s ease;')}>
        <div style={s('flex:none;width:36px;height:36px;border-radius:50%;background:#fff;border:1px solid #d8dde0;display:flex;align-items:center;justify-content:center;margin-top:2px;')}>
          <img src="/assets/logo.png" alt="" style={s('width:24px;height:24px;display:block;')} />
        </div>
        <div style={s('flex:1;min-width:0;background:#fff;border:1px solid #d8dde0;border-radius:16px;box-shadow:0 1px 3px rgba(33,43,50,.08);overflow:hidden;')}>
          <div style={s('padding:18px 22px 0;')}>
            <div style={s('font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#005eb8;')}>{g.categoryLabel}</div>
            <h3 style={s('font-size:23px;margin:6px 0 0;letter-spacing:-0.01em;')}>{g.title}</h3>
            {g.hasIntro && <p style={s('margin:8px 0 0;font-size:17px;color:#4c6272;')}>{g.intro}</p>}
          </div>

          {g.hasCards && (
            <div style={s('padding:16px 22px 4px;display:flex;flex-direction:column;gap:12px;')}>
              {g.cards.map((c, i) => (
                <div key={i} style={s('border:1px solid #d8dde0;border-radius:10px;overflow:hidden;')}>
                  {c.isEmergency && (
                    <div style={s('background:#8a1538;color:#fff;padding:10px 16px;font-weight:700;font-size:16px;display:flex;align-items:center;gap:8px;')}>
                      <span className="riva-ico"><Svg w={17} stroke="#fff" sw={2.2}>{Icons.triangle}</Svg></span>{c.title}
                    </div>
                  )}
                  {c.isUrgent && (
                    <div style={s('background:#d5281b;color:#fff;padding:10px 16px;font-weight:700;font-size:16px;display:flex;align-items:center;gap:8px;')}>
                      <span className="riva-ico"><Svg w={17} stroke="#fff" sw={2.2}>{Icons.alertCircle}</Svg></span>{c.title}
                    </div>
                  )}
                  {c.isInfo && (
                    <div style={s('background:#005eb8;color:#fff;padding:10px 16px;font-weight:700;font-size:16px;display:flex;align-items:center;gap:8px;')}>
                      <span className="riva-ico"><Svg w={17} stroke="#fff" sw={2.2}>{Icons.infoCircle}</Svg></span>{c.title}
                    </div>
                  )}
                  <div style={s('padding:14px 16px;background:#fff;')}>
                    {c.hasBody && <div style={s('font-size:16px;line-height:1.5;')}>{c.body}</div>}
                    {c.hasSub && <div style={s('margin-top:6px;font-size:14px;color:#768692;line-height:1.45;')}>{c.sub}</div>}
                    {c.hasPhone && (
                      <div style={s('margin-top:12px;display:flex;align-items:center;gap:10px;')}>
                        <span className="riva-ico" style={s('flex:none;width:34px;height:34px;border-radius:50%;background:#e8f1f8;color:#005eb8;')}><Svg w={17}>{Icons.phone}</Svg></span>
                        <span>
                          <span style={s('display:block;font-size:12px;color:#768692;')}>{c.phoneLabel}</span>
                          <span style={s('display:block;font-size:22px;font-weight:800;letter-spacing:.01em;')}>{c.phone}</span>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={s('padding:18px 22px;display:flex;flex-direction:column;gap:18px;')}>
            {g.steps.map((st, i) => (
              <div key={i} style={s('display:flex;gap:14px;align-items:flex-start;')}>
                {st.notKbd && (
                  <div style={s('flex:none;width:28px;height:28px;border-radius:50%;background:#005eb8;color:#fff;font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:center;margin-top:1px;')}>{st.badge}</div>
                )}
                {st.isKbd && (
                  <div style={s('flex:none;min-width:42px;height:30px;padding:0 10px;border-radius:6px;background:#fff;color:#212b32;border:1px solid #aeb7bd;border-bottom-width:3px;font-weight:700;font-size:15px;font-family:ui-monospace,Menlo,Consolas,monospace;display:flex;align-items:center;justify-content:center;')}>{st.badge}</div>
                )}
                <div style={s('flex:1;min-width:0;')}>
                  <div style={s('font-size:17px;line-height:1.5;')}>{st.text}</div>
                  {st.hasShot && (
                    <div style={s('margin-top:10px;border:1px solid #d8dde0;border-radius:8px;overflow:hidden;background:#fff;')}>
                      <div style={s('font-size:12px;color:#768692;padding:6px 10px;border-bottom:1px solid #d8dde0;background:#f7fbff;display:flex;align-items:center;gap:6px;')}>
                        <span className="riva-ico"><Svg w={13} stroke="#768692">{Icons.image}</Svg></span>From the EMIS Web guide
                      </div>
                      {st.shotEl}
                    </div>
                  )}
                  {st.hasSlot && (
                    <div style={s('margin-top:10px;border:1px solid #d8dde0;border-radius:8px;overflow:hidden;background:#f0f4f5;')}>
                      <div style={s('font-size:12px;color:#768692;padding:6px 10px;border-bottom:1px solid #d8dde0;background:#fff;display:flex;align-items:center;gap:6px;')}>
                        <span className="riva-ico"><Svg w={13} stroke="#768692">{Icons.image}</Svg></span>EMIS Web
                      </div>
                      <div style={s('width:100%;height:120px;display:flex;align-items:center;justify-content:center;color:#aeb7bd;font-size:13px;')}>Screenshot can be added later</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {g.hasTip && (
            <div style={s('margin:0 22px 16px;border-left:4px solid #005eb8;background:#e8f1f8;padding:12px 16px;border-radius:0 8px 8px 0;font-size:16px;line-height:1.5;')}><strong>Tip:</strong> {g.tip}</div>
          )}
          {g.hasWarning && (
            <div style={s('margin:0 22px 16px;border-left:4px solid #ffb81c;background:#fff6cc;padding:12px 16px;border-radius:0 8px 8px 0;font-size:16px;line-height:1.5;')}><strong>Important:</strong> {g.warning}</div>
          )}

          <div style={s('border-top:1px solid #d8dde0;padding:12px 22px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;')}>
            {v.showFeedbackButtons && (
              <>
                <span style={s('font-size:15px;color:#4c6272;')}>Was this helpful?</span>
                <Hover onClick={v.onHelpful} base="background:#fff;border:2px solid #d8dde0;border-radius:8px;padding:6px 16px;font:inherit;font-size:15px;font-weight:600;color:#212b32;cursor:pointer;" hover="border-color:#007f3b;color:#007f3b;">Yes</Hover>
                <Hover onClick={v.onNotHelpful} base="background:#fff;border:2px solid #d8dde0;border-radius:8px;padding:6px 16px;font:inherit;font-size:15px;font-weight:600;color:#212b32;cursor:pointer;" hover="border-color:#d5281b;color:#d5281b;">No</Hover>
              </>
            )}
            {v.feedbackGiven && <span style={s('font-size:15px;color:#007f3b;font-weight:600;')}>{v.thanksText}</span>}
            <Hover onClick={v.onCopy} base="margin-left:auto;background:#fff;border:2px solid #d8dde0;border-radius:8px;padding:6px 14px;font:inherit;font-size:15px;font-weight:600;color:#005eb8;cursor:pointer;display:inline-flex;align-items:center;gap:7px;" hover="border-color:#005eb8;">
              <span className="riva-ico"><Svg w={15}>{Icons.copy}</Svg></span>{v.copyLabel}
            </Hover>
          </div>

          {g.hasRelated && (
            <div style={s('border-top:1px solid #d8dde0;padding:12px 22px;background:#f7fbff;')}>
              <div style={s('font-size:13px;color:#768692;margin-bottom:8px;')}>Related</div>
              <div style={s('display:flex;gap:8px;flex-wrap:wrap;')}>
                {g.related.map((r) => (
                  <Hover key={r.id} onClick={r.onClick} base="background:#e8f1f8;color:#005eb8;border:1px solid #cfe1f0;border-radius:999px;padding:7px 14px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;" hover="background:#005eb8;color:#fff;border-color:#005eb8;">{r.question}</Hover>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  renderSuggest(v) {
    return (
      <div style={s('display:flex;gap:12px;align-items:flex-start;animation:rivaUp .25s ease;')}>
        <div style={s('flex:none;width:36px;height:36px;border-radius:50%;background:#fff;border:1px solid #d8dde0;display:flex;align-items:center;justify-content:center;margin-top:2px;')}>
          <img src="/assets/logo.png" alt="" style={s('width:24px;height:24px;display:block;')} />
        </div>
        <div style={s('flex:1;min-width:0;background:#fff;border:1px solid #d8dde0;border-radius:16px;padding:16px 20px;box-shadow:0 1px 3px rgba(33,43,50,.08);')}>
          <p style={s('margin:0 0 12px;font-size:17px;line-height:1.45;')}>{v.text}</p>
          <div style={s('display:flex;flex-direction:column;gap:8px;')}>
            {(v.suggestions || []).map((sug) => (
              <Hover key={sug.id} onClick={sug.onClick} base="display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:#f0f4f5;border:1px solid #d8dde0;border-radius:10px;padding:12px 14px;cursor:pointer;font:inherit;font-size:16px;font-weight:600;color:#005eb8;" hover="border-color:#005eb8;background:#f7fbff;">
                <span className="riva-ico" style={s('flex:none;')}><Svg w={17}>{Icons.arrow}</Svg></span>
                <span>{sug.question}</span>
              </Hover>
            ))}
          </div>
        </div>
      </div>
    );
  }

  renderAi(v) {
    return (
      <div style={s('display:flex;gap:12px;align-items:flex-start;animation:rivaUp .25s ease;')}>
        <div style={s('flex:none;width:36px;height:36px;border-radius:50%;background:#fff;border:1px solid #d8dde0;display:flex;align-items:center;justify-content:center;margin-top:2px;')}>
          <img src="/assets/logo.png" alt="" style={s('width:24px;height:24px;display:block;')} />
        </div>
        <div style={s('flex:1;min-width:0;background:#fff;border:1px solid #d8dde0;border-radius:16px;box-shadow:0 1px 3px rgba(33,43,50,.08);overflow:hidden;')}>
          <div style={s('background:#ebe6f1;color:#330072;padding:9px 22px;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;border-bottom:1px solid #ddd4e8;')}>
            <span className="riva-ico" style={s('flex:none;')}><Svg w={16}>{Icons.banner}</Svg></span>
            AI answer &mdash; based on the practice guides, please double-check
          </div>

          {v.aiLoading && (
            <div style={s('padding:20px 22px;display:flex;align-items:center;gap:12px;color:#4c6272;font-size:17px;')}>
              <span style={s('display:inline-flex;gap:5px;align-items:center;')}>
                <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite;')} />
                <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite .2s;')} />
                <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite .4s;')} />
              </span>
              <span>Checking for an answer&hellip;</span>
            </div>
          )}

          {v.aiError && (
            <div style={s('padding:18px 22px;font-size:17px;line-height:1.5;color:#212b32;')}>Sorry, I couldn&rsquo;t generate an answer right now. Try rephrasing your question, or add a guide so the next person gets a verified answer.</div>
          )}

          {v.aiDone && (
            <>
              <div style={s('padding:18px 22px 0;')}>
                <h3 style={s('font-size:23px;margin:0;letter-spacing:-0.01em;')}>{v.question}</h3>
                {v.hasIntro && <p style={s('margin:8px 0 0;font-size:17px;color:#4c6272;')}>{v.intro}</p>}
              </div>
              {v.hasMessage && (
                <div style={s('margin:14px 22px 4px;')}>
                  <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin-bottom:6px;')}>Suggested message</div>
                  <div style={s('padding:14px 16px;background:#f0f4f5;border:1px solid #d8dde0;border-left:4px solid #330072;border-radius:0 8px 8px 0;font-size:16px;line-height:1.55;white-space:pre-wrap;')}>{v.message}</div>
                </div>
              )}
              {v.hasSteps && (
                <div style={s('padding:18px 22px;display:flex;flex-direction:column;gap:16px;')}>
                  {v.steps.map((st) => (
                    <div key={st.num} style={s('display:flex;gap:14px;align-items:flex-start;')}>
                      <div style={s('flex:none;width:28px;height:28px;border-radius:50%;background:#330072;color:#fff;font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:center;margin-top:1px;')}>{st.num}</div>
                      <div style={s('flex:1;min-width:0;font-size:17px;line-height:1.5;')}>{st.text}</div>
                    </div>
                  ))}
                </div>
              )}
              {v.hasImages && (
                <div style={s('padding:0 22px 4px;display:flex;flex-direction:column;gap:12px;')}>
                  {v.images.map((im, i) => (
                    <div key={i} style={s('border:1px solid #d8dde0;border-radius:8px;overflow:hidden;background:#fff;')}>
                      <div style={s('font-size:12px;color:#768692;padding:6px 10px;border-bottom:1px solid #d8dde0;background:#f7fbff;display:flex;align-items:center;gap:6px;')}>
                        <span className="riva-ico"><Svg w={13} stroke="#768692">{Icons.image}</Svg></span>From the EMIS Web guide
                      </div>
                      <img src={im.src} alt="EMIS Web screenshot" style={s('display:block;width:100%;height:auto;')} />
                    </div>
                  ))}
                </div>
              )}
              {v.hasTip && (
                <div style={s('margin:0 22px 16px;border-left:4px solid #330072;background:#ebe6f1;padding:12px 16px;border-radius:0 8px 8px 0;font-size:16px;line-height:1.5;')}><strong>Tip:</strong> {v.tip}</div>
              )}
              {v.hasCitations && (
                <div style={s('margin:0 22px 16px;')}>
                  <div style={s('font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#768692;margin-bottom:8px;')}>Sources</div>
                  <div style={s('display:flex;flex-direction:column;gap:8px;')}>
                    {v.citations.map((c, i) => (
                      <Hover key={i} onClick={c.onOpen} base="display:flex;flex-direction:column;gap:3px;width:100%;text-align:left;background:#f7fbff;border:1px solid #cfe1f0;border-radius:10px;padding:10px 14px;cursor:pointer;font:inherit;" hover="border-color:#005eb8;background:#eef6fd;">
                        <span style={s('font-size:15px;font-weight:600;color:#005eb8;display:flex;align-items:center;gap:7px;')}>
                          <span className="riva-ico" style={s('flex:none;')}><Svg w={15} stroke="#005eb8">{Icons.file}</Svg></span>
                          <span>{c.docTitle}{c.location ? ' — ' + c.location : ''}</span>
                        </span>
                        {c.snippet && <span style={s('font-size:13px;color:#768692;line-height:1.45;')}>{c.snippet}</span>}
                      </Hover>
                    ))}
                  </div>
                </div>
              )}
              <div style={s('border-top:1px solid #d8dde0;padding:12px 22px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;')}>
                <span style={s('font-size:14px;color:#768692;')}>Always check AI answers before you act on them.</span>
                <div style={s('margin-left:auto;display:flex;gap:10px;')}>
                  <Hover onClick={v.onCopy} base="background:#fff;border:2px solid #d8dde0;border-radius:8px;padding:6px 14px;font:inherit;font-size:15px;font-weight:600;color:#005eb8;cursor:pointer;display:inline-flex;align-items:center;gap:7px;" hover="border-color:#005eb8;">
                    <span className="riva-ico"><Svg w={15}>{Icons.copy}</Svg></span>{v.copyLabel}
                  </Hover>
                  <Hover onClick={v.onSave} base="background:#005eb8;color:#fff;border:none;border-radius:8px;padding:7px 14px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;" hover="background:#003087;">Save to knowledge base</Hover>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // In-page viewer for a citation's source — opens the document without leaving
  // the browser. PDFs jump to the cited page (#page=N); images and HTML
  // renditions are shown inline; otherwise the cited snippet is shown.
  renderViewer() {
    const c = this.state.viewer;
    const view = c.view || {};
    const url = view.url ? assetSrc(view.url) : '';
    const isPdf = view.kind === 'pdf';
    const isImage = view.kind === 'image';
    const isHtml = view.kind === 'html';
    const src = isPdf && view.page ? url + '#page=' + view.page : url;
    return (
      <div onClick={() => this.closeViewer()} style={s('position:fixed;inset:0;background:rgba(33,43,50,.55);display:flex;align-items:center;justify-content:center;padding:24px;z-index:60;')}>
        <div onClick={(e) => e.stopPropagation()} style={s('width:100%;max-width:920px;height:90vh;background:#fff;border-radius:14px;box-shadow:0 12px 40px rgba(33,43,50,.3);display:flex;flex-direction:column;overflow:hidden;')}>
          <div style={s('flex:none;display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid #d8dde0;')}>
            <span className="riva-ico" style={s('flex:none;color:#005eb8;')}><Svg w={18}>{Icons.file}</Svg></span>
            <div style={s('min-width:0;')}>
              <div style={s('font-size:16px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;')}>{c.docTitle}</div>
              {c.location && <div style={s('font-size:13px;color:#768692;')}>{c.location}</div>}
            </div>
            <button onClick={() => this.closeViewer()} aria-label="Close" style={s('margin-left:auto;background:none;border:none;cursor:pointer;color:#4c6272;padding:4px;display:flex;')}>
              <span className="riva-ico"><Svg w={24}>{Icons.close}</Svg></span>
            </button>
          </div>
          <div style={s('flex:1;min-height:0;background:#f0f4f5;overflow:auto;')}>
            {url && isImage && (
              <div style={s('padding:16px;')}><img src={url} alt="Source" style={s('display:block;max-width:100%;margin:0 auto;border:1px solid #d8dde0;border-radius:6px;')} /></div>
            )}
            {url && !isImage && (
              <iframe src={src} title="Source document" style={s('width:100%;height:100%;border:none;background:#fff;')} />
            )}
            {!url && (
              <div style={s('padding:22px;font-size:16px;line-height:1.6;color:#212b32;white-space:pre-wrap;')}>{c.snippet || 'This source is not available to open.'}</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  render() {
    const v = this.renderVals();
    return (
      <div style={s('display:flex;flex-direction:column;height:100vh;min-height:100vh;background:#f0f4f5;')}>

        <header style={s('flex:none;height:72px;display:flex;align-items:center;gap:14px;padding:0 24px;background:#fff;border-bottom:1px solid #d8dde0;')}>
          <Hover tag="button" onClick={v.onNewChat} aria-label="Start a new chat" base="background:none;border:none;padding:0;cursor:pointer;display:flex;align-items:center;" hover="opacity:.85;">
            <img src="/assets/nhs-logo.png" alt="NHS — start a new chat" style={s('height:30px;width:auto;display:block;')} />
          </Hover>
          <div style={s('display:flex;flex-direction:column;line-height:1.15;')}>
            <span style={s('font-weight:700;font-size:18px;white-space:nowrap;')}>The Riverside Practice</span>
            <span style={s('font-size:13px;color:#4c6272;')}>Reception help &amp; guidance</span>
          </div>
          <div style={s('margin-left:auto;display:flex;gap:10px;align-items:center;')}>
            <Hover tag="button" onClick={v.onNewChat} base="background:#fff;color:#005eb8;border:2px solid #005eb8;border-radius:8px;padding:8px 14px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;" hover="background:#e8f1f8;">New chat</Hover>
            <Hover tag="button" onClick={v.onOpenAdd} base="background:#005eb8;color:#fff;border:none;border-radius:8px;padding:9px 16px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 4px 0 #002a52;" active="transform:translateY(4px);box-shadow:none;">Add a guide</Hover>
          </div>
        </header>

        <div id="riva-scroll" style={s('flex:1;overflow-y:auto;')}>
          <div style={s('max-width:820px;margin:0 auto;padding:32px 24px 28px;display:flex;flex-direction:column;gap:20px;')}>

            {v.isEmpty && (
              <>
                <div style={s('text-align:center;padding:20px 0 4px;')}>
                  <div style={s('width:64px;height:64px;border-radius:18px;background:#fff;border:1px solid #d8dde0;display:inline-flex;align-items:center;justify-content:center;')}>
                    <img src="/assets/logo.png" alt="" style={s('width:42px;height:42px;display:block;')} />
                  </div>
                  <h1 style={s('font-size:34px;margin:18px 0 8px;letter-spacing:-0.01em;')}>{v.botName}</h1>
                  <p style={s('font-size:19px;color:#4c6272;max-width:540px;margin:0 auto;text-wrap:pretty;')}>{v.welcome}</p>
                </div>

                <div>
                  <div style={s('font-size:14px;font-weight:600;color:#768692;text-transform:uppercase;letter-spacing:.04em;margin-bottom:12px;')}>Browse by area</div>
                  <div style={s('display:grid;grid-template-columns:repeat(3,1fr);gap:12px;')}>
                    {BROWSE.map((b) => {
                      const border = b.border || '#d8dde0';
                      const hoverBorder = b.hoverBorder || '#005eb8';
                      return (
                        <Hover key={b.id} tag="button" onClick={v.browse[b.id]}
                          base={`text-align:left;display:flex;flex-direction:column;gap:12px;background:#fff;border:1px solid ${border};border-radius:12px;padding:16px;cursor:pointer;font:inherit;color:inherit;`}
                          hover={`border-color:${hoverBorder};box-shadow:0 4px 12px rgba(33,43,50,.12);transform:translateY(-2px);`}>
                          <span className="riva-ico" style={s(`width:40px;height:40px;border-radius:10px;background:${b.bg};color:${b.color};`)}><Svg w={22}>{Icons[b.icon]}</Svg></span>
                          <span>
                            <span style={s('display:block;font-weight:600;font-size:17px;')}>{b.label}</span>
                            <span style={s('display:block;font-size:14px;color:#768692;')}>{v.counts[b.id]} guides</span>
                          </span>
                        </Hover>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={s('font-size:14px;font-weight:600;color:#768692;text-transform:uppercase;letter-spacing:.04em;margin:8px 0 12px;')}>Popular questions</div>
                  <div style={s('display:flex;flex-direction:column;gap:8px;')}>
                    {v.popular.map((p, i) => (
                      <Hover key={i} tag="button" onClick={p.onClick} base="display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:#fff;border:1px solid #d8dde0;border-radius:10px;padding:13px 16px;cursor:pointer;font:inherit;font-size:16px;font-weight:600;color:#005eb8;" hover="border-color:#005eb8;background:#f7fbff;">
                        <span className="riva-ico" style={s('flex:none;')}><Svg w={18}>{Icons.arrow}</Svg></span>
                        <span>{p.question}</span>
                      </Hover>
                    ))}
                  </div>
                </div>
              </>
            )}

            {v.messages.map((m, i) => (
              <React.Fragment key={i}>
                {m.isUser && (
                  <div style={s('display:flex;justify-content:flex-end;animation:rivaUp .25s ease;')}>
                    <div style={s('max-width:75%;background:#005eb8;color:#fff;border-radius:16px 16px 4px 16px;padding:12px 16px;font-size:17px;line-height:1.45;')}>{m.text}</div>
                  </div>
                )}
                {m.isAnswer && this.renderGuide(m)}
                {m.isSuggest && this.renderSuggest(m)}
                {m.isAi && this.renderAi(m)}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div style={s('flex:none;background:#fff;border-top:1px solid #d8dde0;')}>
          <div style={s('max-width:820px;margin:0 auto;padding:14px 24px 18px;')}>
            <div style={s('display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px;')}>
              <span style={s('font-size:14px;color:#768692;')}>Try:</span>
              {v.quick.map((q, i) => (
                <Hover key={i} tag="button" onClick={q.onClick} base="background:#e8f1f8;color:#005eb8;border:1px solid #cfe1f0;border-radius:999px;padding:7px 14px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;" hover="background:#005eb8;color:#fff;border-color:#005eb8;">{q.question}</Hover>
              ))}
            </div>
            <form onSubmit={v.onSubmit} style={s('display:flex;gap:10px;align-items:center;')}>
              <input
                className="riva-input"
                value={v.input}
                onChange={v.onInput}
                placeholder="Ask a question, or describe the situation…"
                style={s('flex:1;min-width:0;font:inherit;font-size:17px;padding:14px 18px;border:2px solid #d8dde0;border-radius:999px;background:#f0f4f5;outline:none;')}
              />
              <Hover tag="button" type="submit" aria-label="Send" base="flex:none;width:48px;height:48px;border-radius:50%;background:#005eb8;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;" hover="background:#003087;">
                <span className="riva-ico"><Svg w={22} stroke="#fff" sw={2.2}>{Icons.up}</Svg></span>
              </Hover>
            </form>
          </div>
        </div>

        {this.state.viewer && this.renderViewer()}

        {v.showAdd && (
          <div style={s('position:fixed;inset:0;background:rgba(33,43,50,.45);display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto;z-index:50;')}>
            <div style={s('width:100%;max-width:560px;background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(33,43,50,.18);overflow:hidden;')}>
              <div style={s('display:flex;align-items:center;padding:18px 22px;border-bottom:1px solid #d8dde0;')}>
                <h3 style={s('font-size:21px;margin:0;')}>Add a guide</h3>
                <button onClick={v.onCloseAdd} aria-label="Close" style={s('margin-left:auto;background:none;border:none;cursor:pointer;color:#4c6272;padding:4px;display:flex;')}>
                  <span className="riva-ico"><Svg w={24}>{Icons.close}</Svg></span>
                </button>
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
                        {st.canRemove && (
                          <button onClick={st.onRemove} aria-label="Remove step" style={s('flex:none;background:none;border:none;cursor:pointer;color:#768692;padding:4px;display:flex;')}>
                            <span className="riva-ico"><Svg w={20}>{Icons.close}</Svg></span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={v.onAddStep} style={s('margin-top:10px;background:none;border:none;color:#005eb8;font:inherit;font-size:15px;font-weight:600;cursor:pointer;padding:0;display:inline-flex;align-items:center;gap:6px;')}>
                    <span className="riva-ico"><Svg w={17}>{Icons.plus}</Svg></span>Add step
                  </button>
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
        )}
      </div>
    );
  }
}

export default function Page() {
  return <Riva />;
}
