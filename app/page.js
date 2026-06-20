'use client';

import React from 'react';
import { SEED_GUIDES, CATEGORIES, POPULAR_IDS } from '../lib/guides';
import { askQuestion } from '../lib/ai/client';

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

// Hover/active styling via real CSS pseudo-classes (so it can never get "stuck").
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

// Inline SVG wrapper — the inner path/line/etc. geometry is supplied as children.
function Svg({ w = 24, h, stroke = 'currentColor', sw = 2, fill = 'none', style, children }) {
  return (
    <svg width={w} height={h || w} viewBox="0 0 24 24" fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {children}
    </svg>
  );
}

// Reusable icon glyphs (the inner geometry only).
const Icons = {
  triangle: (<><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>),
  alertCircle: (<><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>),
  infoCircle: (<><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></>),
  phone: (<><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></>),
  image: (<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></>),
  copy: (<><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>),
  up: (<><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></>),
  close: (<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>),
  plus: (<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>),
  arrow: (<><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></>),
  arrowLeft: (<><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>),
  chevronRight: (<><polyline points="9 18 15 12 9 6" /></>),
  shield: (<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" /></>),
  refresh: (<><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></>),
  fileLines: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></>),
  file: (<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></>),
  chat: (<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>),
  book: (<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>),
};

function assetSrc(p) {
  if (!p) return p;
  if (/^(https?:)?\//.test(p)) return p;
  return '/' + p;
}

/* ------------------------------------------------------------------ *
 * The Riverside Practice Q&A component.
 * ------------------------------------------------------------------ */

class RiversidePracticeQA extends React.Component {
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
      hoveredArea: null,
      viewer: null,
      view: 'assistant',   // 'assistant' | 'kb'
      kbQuery: '',         // knowledge-base search text
      kb: null,            // loaded knowledge-base groups
      kbStatus: 'idle',    // 'idle' | 'loading' | 'done' | 'error'
    };
  }

  blankDraft() {
    return { question: '', category: 'appointments', intro: '', steps: ['', ''], tip: '' };
  }

  componentDidMount() {
    try {
      const g = JSON.parse(localStorage.getItem('riva-guides-v1') || '[]');
      const m = JSON.parse(localStorage.getItem('riva-chat-v1') || '[]');
      this.setState({ customGuides: Array.isArray(g) ? g : [], messages: Array.isArray(m) ? m : [] });
    } catch (e) {}
    // Load the document library up front so "Browse by area" can surface the
    // full knowledge base, not just the curated guides.
    this.loadKb();
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
  allGuides() { return this.seed().concat(this.state.customGuides || []); }
  popularIds() { return POPULAR_IDS; }

  // Build a short transcript so the AI understands follow-up questions.
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
        const steps = (m.steps || []).map((t, i) => (i + 1) + ') ' + (t && t.text ? t.text : t)).join('  ');
        if (steps) lines.push('The assistant answered: ' + steps);
      } else if (m.kind === 'suggest') {
        lines.push('The assistant: ' + m.text);
      }
    }
    return lines.join('\n');
  }

  ask(text) {
    const t = (text || '').trim();
    if (!t) return;
    const userMsg = { role: 'user', text: t };
    const aiMsg = { role: 'bot', kind: 'ai', question: t, status: 'loading', intro: '', steps: null, tip: '', message: '', messageCite: null, citations: [] };
    const messages = this.state.messages.concat([userMsg, aiMsg]);
    const aiIdx = messages.length - 1;
    this.setState({ messages, input: '' }, () => { this.save(); this.fetchAI(t, aiIdx); });
  }

  async fetchAI(question, idx) {
    const history = this.buildHistory(idx);
    try {
      const data = await askQuestion({ question, history, customGuides: this.state.customGuides });
      if (!data.answerable || (!data.steps.length && !data.message)) {
        this.updateAi(idx, { status: 'declined', intro: data.intro || 'I could not find this in the practice’s documents.', steps: [], message: '', messageCite: null, tip: '', citations: [] });
        return;
      }
      this.updateAi(idx, { status: 'done', intro: data.intro, steps: data.steps, message: data.message, messageCite: data.messageCite, tip: data.tip, citations: data.citations });
    } catch (e) {
      this.updateAi(idx, { status: 'error' });
    }
  }

  retryAi(idx) {
    const m = this.state.messages[idx];
    if (!m || m.kind !== 'ai') return;
    this.updateAi(idx, { status: 'loading' });
    this.fetchAI(m.question, idx);
  }

  updateAi(idx, patch) {
    const messages = this.state.messages.slice();
    if (messages[idx]) messages[idx] = Object.assign({}, messages[idx], patch);
    this.setState({ messages }, () => this.save());
  }

  flagCopied(idx) {
    this.setState({ copiedIdx: idx });
    clearTimeout(this._ct);
    this._ct = setTimeout(() => this.setState({ copiedIdx: null }), 1800);
  }

  copyAi(m, idx) {
    if (m.message) {
      try { navigator.clipboard.writeText(m.message); } catch (e) {}
      this.flagCopied(idx);
      return;
    }
    const lines = [m.question, ''];
    (m.steps || []).forEach((t, i) => {
      const txt = t && t.text ? t.text : t;
      const src = t && t.cite ? '  [' + t.cite.docTitle + ' — ' + t.cite.location + ']' : '';
      lines.push((i + 1) + '. ' + txt + src);
    });
    if (m.tip) lines.push('', 'Tip: ' + m.tip);
    lines.push('', 'Answered from the practice’s documents.');
    try { navigator.clipboard.writeText(lines.join('\n')); } catch (e) {}
    this.flagCopied(idx);
  }

  prefillFromAi(m) {
    this.setState({
      showAdd: true,
      draftError: false,
      draft: {
        question: m.question || '',
        category: 'appointments',
        intro: m.intro || '',
        steps: (m.steps && m.steps.length) ? m.steps.map((s2) => (s2 && s2.text ? s2.text : s2)) : ['', ''],
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
    const bot = { role: 'bot', kind: 'suggest', text: 'Here are the ' + cat.label.toLowerCase() + ' guides:', guideIds: guides.map((g) => g.id) };
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

  newChat() { this.setState({ messages: [], view: 'assistant' }, () => this.save()); }

  setView(view) {
    this.setState({ view });
    if (view === 'kb' && this.state.kbStatus === 'idle') this.loadKb();
  }

  async loadKb() {
    this.setState({ kbStatus: 'loading' });
    try {
      const res = await fetch('/api/kb');
      if (!res.ok) throw new Error('bad status');
      const data = await res.json();
      this.setState({ kb: data, kbStatus: 'done' });
    } catch (e) {
      this.setState({ kbStatus: 'error' });
    }
  }

  openDoc(doc) {
    if (!doc.view) return;
    this.openViewer({ docTitle: doc.title, location: doc.subtitle || '', view: doc.view });
  }

  hoverArea(id) { if (this.state.hoveredArea !== id) this.setState({ hoveredArea: id }); }
  leaveArea(id) { if (this.state.hoveredArea === id) this.setState({ hoveredArea: null }); }

  openViewer(citation) { this.setState({ viewer: citation }); }
  closeViewer() { this.setState({ viewer: null }); }

  buildViewerVM() {
    const c = this.state.viewer;
    if (!c) return { docTitle: '', location: '', isImage: false, isPdf: false, isHtml: false, isText: false, text: '', imageEl: null, pdfEl: null, htmlEl: null };
    const v = c.view || {};
    const url = v.url ? assetSrc(v.url) : '';
    const isImage = v.kind === 'image' && !!url;
    const isPdf = v.kind === 'pdf' && !!url;
    const isFrame = (v.kind === 'html' || v.kind === 'markdown' || v.kind === 'text') && !!url;
    const isText = !url; // no openable file — show the snippet/text inline
    const pdfSrc = isPdf ? (url + (v.page ? '#page=' + v.page : '')) : '';
    return {
      docTitle: c.docTitle || 'Document',
      location: c.location || '',
      isImage,
      isPdf,
      isHtml: isFrame,
      isText,
      text: v.text || c.snippet || 'This source has no preview.',
      imageEl: isImage ? React.createElement('img', { src: url, alt: c.docTitle, style: { display: 'block', maxWidth: '100%', height: 'auto', margin: '0 auto' } }) : null,
      pdfEl: isPdf ? React.createElement('iframe', { src: pdfSrc, title: c.docTitle, style: { width: '100%', height: '78vh', border: 'none', display: 'block' } }) : null,
      htmlEl: isFrame ? React.createElement('iframe', { src: url, title: c.docTitle, style: { width: '100%', height: '78vh', border: 'none', display: 'block' } }) : null,
    };
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
    if (!d.question.trim() || steps.length === 0) { this.setState({ draftError: true }); return; }
    const id = 'custom-' + Date.now();
    const keywords = d.question.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    const guide = { id, category: d.category, question: d.question.trim(), keywords, intro: d.intro.trim(), steps: steps.map((t) => ({ text: t, img: true })), tip: d.tip.trim() || null, warning: null, related: [] };
    const customGuides = (this.state.customGuides || []).concat([guide]);
    this.setState({ customGuides, showAdd: false, draft: this.blankDraft(), draftError: false }, () => { this.save(); this.askGuide(guide); });
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
        shotEl: (showShots && st.image) ? React.createElement('img', { src: assetSrc(st.image), alt: 'EMIS Web screenshot', style: { display: 'block', width: '100%', height: 'auto' } }) : null,
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
        body: c.body || '', hasBody: !!c.body,
        sub: c.sub || '', hasSub: !!c.sub,
        phone: c.phone || '', hasPhone: !!c.phone,
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
    const areas = [];
    for (const c of this.cats()) {
      const inCat = all.filter((g) => g.category === c.id);
      areas.push({
        id: c.id,
        label: c.label,
        count: inCat.length,
        desc: c.desc || '',
        hovered: this.state.hoveredArea === c.id,
        onEnter: () => self.hoverArea(c.id),
        onLeave: () => self.leaveArea(c.id),
        questions: inCat.map((g) => ({ question: g.question, onClick: () => self.askGuide(g) })),
      });
    }

    // Areas that actually have common questions, for the simplified GOV.UK-style
    // link list. The full document library lives in the searchable KB tab.
    const linkAreas = areas.filter((a) => a.questions.length > 0);

    const messages = this.state.messages.map((m, idx) => {
      if (m.role === 'user') return { isUser: true, text: m.text };
      if (m.kind === 'ai') {
        return {
          isAi: true,
          aiLoading: m.status === 'loading',
          aiError: m.status === 'error',
          aiDeclined: m.status === 'declined',
          aiDone: m.status === 'done',
          question: m.question,
          intro: m.intro || '',
          hasIntro: !!(m.intro && m.intro.length),
          steps: (m.steps || []).map((t, i) => {
            const cite = (t && t.cite) ? t.cite : null;
            return {
              num: i + 1,
              text: (t && t.text != null) ? t.text : t,
              hasCite: !!cite,
              citeLabel: cite ? (cite.docTitle + ' — ' + cite.location) : '',
              onCite: cite ? (() => self.openViewer(cite)) : (() => {}),
            };
          }),
          hasSteps: !!(m.steps && m.steps.length),
          message: m.message || '',
          hasMessage: !!(m.message && m.message.length),
          hasMessageCite: !!m.messageCite,
          messageCiteLabel: m.messageCite ? (m.messageCite.docTitle + ' — ' + m.messageCite.location) : '',
          onMessageCite: m.messageCite ? (() => self.openViewer(m.messageCite)) : (() => {}),
          hasTip: !!(m.tip && m.tip.length),
          tip: m.tip || '',
          onRetry: () => self.retryAi(idx),
          onCopy: () => self.copyAi(m, idx),
          copyLabel: this.state.copiedIdx === idx ? 'Copied' : 'Copy steps',
          onSave: () => self.prefillFromAi(m),
        };
      }
      if (m.kind === 'answer') {
        const g = all.find((x) => x.id === m.guideId);
        if (!g) return { isSuggest: true, text: 'That guide is no longer available.', suggestions: [] };
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

    const draftSteps = this.state.draft.steps.map((v, i) => ({
      num: i + 1, value: v,
      onChange: (e) => self.setDraftStep(i, e.target.value),
      onRemove: () => self.removeStep(i),
      canRemove: self.state.draft.steps.length > 1,
    }));

    const kb = this.state.kb || { groups: [], total: 0 };
    const kbQuery = this.state.kbQuery || '';
    const q = kbQuery.trim().toLowerCase();
    const matches = (d) => !q || (d.title + ' ' + (d.summary || '') + ' ' + (d.subtitle || '')).toLowerCase().includes(q);
    let kbMatchCount = 0;
    const kbGroups = (kb.groups || []).map((g) => ({
      key: g.key,
      label: g.label,
      docs: (g.docs || []).filter(matches).map((d) => {
        kbMatchCount++;
        return {
          docId: d.docId,
          title: d.title,
          subtitle: d.subtitle || '',
          summary: d.summary || '',
          thumbs: (d.thumbs || []).map((t) => assetSrc(t)),
          hasThumbs: !!(d.thumbs && d.thumbs.length),
          canOpen: !!d.view,
          onOpen: () => self.openDoc(d),
        };
      }),
    })).filter((g) => g.docs.length);

    return {
      botName: this.props.botName != null ? this.props.botName : 'The Riverside Practice reception help',
      welcome: this.props.welcome != null ? this.props.welcome : 'For reception. Ask how to do something in EMIS, or what to do at the front desk.',
      view: this.state.view,
      isKb: this.state.view === 'kb',
      kbStatus: this.state.kbStatus,
      kbGroups,
      kbTotal: kb.total || 0,
      kbQuery,
      kbHasQuery: !!q,
      kbMatchCount,
      onKbSearch: (e) => self.setState({ kbQuery: e.target.value }),
      linkAreas,
      onSetView: (vw) => self.setView(vw),
      isEmpty: this.state.messages.length === 0,
      notEmpty: this.state.messages.length > 0,
      input: this.state.input,
      messages, popular, areas,
      cats: this.cats(),
      showAdd: this.state.showAdd,
      draft: this.state.draft,
      draftSteps,
      draftError: this.state.draftError,
      viewerOpen: !!this.state.viewer,
      viewer: this.buildViewerVM(),
      onCloseViewer: () => self.closeViewer(),
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

  /* ----------------------------- render parts ----------------------------- */

  renderGuide(v) {
    const g = v.guide;
    return (
      <div style={s('display:flex;gap:12px;align-items:flex-start;animation:rivaUp .25s ease;')}>
        <div style={s('flex:none;width:36px;height:36px;border-radius:50%;background:#fff;border:1px solid #d8dde0;display:flex;align-items:center;justify-content:center;margin-top:2px;')}>
          <img src="/assets/logo.png" alt="" style={s('width:22px;height:22px;display:block;')} />
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
                  {c.isEmergency && <div style={s('background:#8a1538;color:#fff;padding:10px 16px;font-weight:700;font-size:16px;display:flex;align-items:center;gap:8px;')}><Svg w={17} stroke="#fff" sw={2.2}>{Icons.triangle}</Svg>{c.title}</div>}
                  {c.isUrgent && <div style={s('background:#d5281b;color:#fff;padding:10px 16px;font-weight:700;font-size:16px;display:flex;align-items:center;gap:8px;')}><Svg w={17} stroke="#fff" sw={2.2}>{Icons.alertCircle}</Svg>{c.title}</div>}
                  {c.isInfo && <div style={s('background:#005eb8;color:#fff;padding:10px 16px;font-weight:700;font-size:16px;display:flex;align-items:center;gap:8px;')}><Svg w={17} stroke="#fff" sw={2.2}>{Icons.infoCircle}</Svg>{c.title}</div>}
                  <div style={s('padding:14px 16px;background:#fff;')}>
                    {c.hasBody && <div style={s('font-size:16px;line-height:1.5;')}>{c.body}</div>}
                    {c.hasSub && <div style={s('margin-top:6px;font-size:14px;color:#768692;line-height:1.45;')}>{c.sub}</div>}
                    {c.hasPhone && (
                      <div style={s('margin-top:12px;display:flex;align-items:center;gap:10px;')}>
                        <span style={s('flex:none;width:34px;height:34px;border-radius:50%;background:#e8f1f8;color:#005eb8;display:inline-flex;align-items:center;justify-content:center;')}><Svg w={17}>{Icons.phone}</Svg></span>
                        <span><span style={s('display:block;font-size:12px;color:#768692;')}>{c.phoneLabel}</span><span style={s('display:block;font-size:22px;font-weight:800;letter-spacing:.01em;')}>{c.phone}</span></span>
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
                {st.notKbd && <div style={s('flex:none;width:28px;height:28px;border-radius:50%;background:#005eb8;color:#fff;font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:center;margin-top:1px;')}>{st.badge}</div>}
                {st.isKbd && <div style={s('flex:none;min-width:42px;height:30px;padding:0 10px;border-radius:6px;background:#fff;color:#212b32;border:1px solid #aeb7bd;border-bottom-width:3px;font-weight:700;font-size:15px;font-family:ui-monospace,Menlo,Consolas,monospace;display:flex;align-items:center;justify-content:center;')}>{st.badge}</div>}
                <div style={s('flex:1;min-width:0;')}>
                  <div style={s('font-size:17px;line-height:1.5;')}>{st.text}</div>
                  {st.hasShot && (
                    <div style={s('margin-top:10px;border:1px solid #d8dde0;border-radius:8px;overflow:hidden;background:#fff;')}>
                      <div style={s('font-size:12px;color:#768692;padding:6px 10px;border-bottom:1px solid #d8dde0;background:#f7fbff;display:flex;align-items:center;gap:6px;')}><Svg w={13} stroke="#768692">{Icons.image}</Svg>From the EMIS Web guide</div>
                      {st.shotEl}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          {g.hasTip && <div style={s('margin:0 22px 16px;border-left:4px solid #005eb8;background:#e8f1f8;padding:12px 16px;border-radius:0 8px 8px 0;font-size:16px;line-height:1.5;')}><strong>Tip:</strong> {g.tip}</div>}
          {g.hasWarning && <div style={s('margin:0 22px 16px;border-left:4px solid #ffb81c;background:#fff6cc;padding:12px 16px;border-radius:0 8px 8px 0;font-size:16px;line-height:1.5;')}><strong>Important:</strong> {g.warning}</div>}
          <div style={s('border-top:1px solid #d8dde0;padding:12px 22px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;')}>
            {v.showFeedbackButtons && (
              <>
                <span style={s('font-size:15px;color:#4c6272;')}>Was this helpful?</span>
                <Hover onClick={v.onHelpful} base="background:#fff;border:2px solid #d8dde0;border-radius:8px;padding:6px 16px;font:inherit;font-size:15px;font-weight:600;color:#212b32;cursor:pointer;" hover="border-color:#007f3b;color:#007f3b;">Yes</Hover>
                <Hover onClick={v.onNotHelpful} base="background:#fff;border:2px solid #d8dde0;border-radius:8px;padding:6px 16px;font:inherit;font-size:15px;font-weight:600;color:#212b32;cursor:pointer;" hover="border-color:#d5281b;color:#d5281b;">No</Hover>
              </>
            )}
            {v.feedbackGiven && <span style={s('font-size:15px;color:#007f3b;font-weight:600;')}>{v.thanksText}</span>}
            <Hover onClick={v.onCopy} base="margin-left:auto;background:#fff;border:2px solid #d8dde0;border-radius:8px;padding:6px 14px;font:inherit;font-size:15px;font-weight:600;color:#005eb8;cursor:pointer;display:inline-flex;align-items:center;gap:7px;" hover="border-color:#005eb8;"><Svg w={15}>{Icons.copy}</Svg>{v.copyLabel}</Hover>
          </div>
          {g.hasRelated && (
            <div style={s('border-top:1px solid #d8dde0;padding:12px 22px;background:#f7fbff;')}>
              <div style={s('font-size:13px;color:#768692;margin-bottom:8px;')}>Related</div>
              <div style={s('display:flex;gap:8px;flex-wrap:wrap;')}>
                {g.related.map((r) => <Hover key={r.id} onClick={r.onClick} base="background:#e8f1f8;color:#005eb8;border:1px solid #cfe1f0;border-radius:999px;padding:7px 14px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;" hover="background:#005eb8;color:#fff;border-color:#005eb8;">{r.question}</Hover>)}
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
          <img src="/assets/logo.png" alt="" style={s('width:22px;height:22px;display:block;')} />
        </div>
        <div style={s('flex:1;min-width:0;background:#fff;border:1px solid #d8dde0;border-radius:16px;padding:16px 20px;box-shadow:0 1px 3px rgba(33,43,50,.08);')}>
          <p style={s('margin:0 0 12px;font-size:17px;line-height:1.45;')}>{v.text}</p>
          <div style={s('display:flex;flex-direction:column;gap:8px;')}>
            {(v.suggestions || []).map((sug) => (
              <Hover key={sug.id} onClick={sug.onClick} base="display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:#f0f4f5;border:1px solid #d8dde0;border-radius:10px;padding:12px 14px;cursor:pointer;font:inherit;font-size:16px;font-weight:600;color:#005eb8;" hover="border-color:#005eb8;background:#f7fbff;">
                <span style={s('flex:none;')}><Svg w={17}>{Icons.arrow}</Svg></span><span>{sug.question}</span>
              </Hover>
            ))}
          </div>
        </div>
      </div>
    );
  }

  renderCiteChip(label, onClick) {
    return (
      <Hover onClick={onClick} base="margin-top:8px;display:inline-flex;align-items:center;gap:7px;max-width:100%;background:#fff;border:1px solid #cfe1f0;border-radius:999px;padding:4px 12px 4px 9px;font:inherit;font-size:12.5px;font-weight:600;color:#005eb8;cursor:pointer;" hover="background:#f7fbff;border-color:#005eb8;">
        <Svg w={13} stroke="#007f3b" sw={2.4} style={s('flex:none;')}>{Icons.shield}</Svg>
        <span style={s('min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{label}</span>
      </Hover>
    );
  }

  renderAi(v) {
    return (
      <div style={s('display:flex;gap:12px;align-items:flex-start;animation:rivaUp .25s ease;')}>
        <div style={s('flex:none;width:36px;height:36px;border-radius:50%;background:#fff;border:1px solid #d8dde0;display:flex;align-items:center;justify-content:center;margin-top:2px;')}>
          <img src="/assets/logo.png" alt="" style={s('width:22px;height:22px;display:block;')} />
        </div>
        <div style={s('flex:1;min-width:0;background:#fff;border:1px solid #d8dde0;border-radius:16px;box-shadow:0 1px 3px rgba(33,43,50,.08);overflow:hidden;')}>
          <div style={s('background:#e8f1f8;color:#003087;padding:9px 22px;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;border-bottom:1px solid #cfe1f0;')}>
            <span style={s('flex:none;')}><Svg w={16}>{Icons.fileLines}</Svg></span>Based on the practice&rsquo;s documents &mdash; open the sources below to check
          </div>

          {v.aiLoading && (
            <div style={s('padding:20px 22px;display:flex;align-items:center;gap:12px;color:#4c6272;font-size:17px;')}>
              <span style={s('display:inline-flex;gap:5px;align-items:center;')}>
                <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite;')} />
                <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite .2s;')} />
                <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite .4s;')} />
              </span>
              <span>Checking the documents&hellip;</span>
            </div>
          )}

          {v.aiError && (
            <div style={s('padding:18px 22px;font-size:17px;line-height:1.5;color:#212b32;')}>
              <p style={s('margin:0 0 14px;')}>Sorry, something went wrong reaching the documents. Please try again.</p>
              <Hover onClick={v.onRetry} base="background:#005eb8;color:#fff;border:none;border-radius:8px;padding:9px 16px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:8px;box-shadow:0 4px 0 #002a52;" active="transform:translateY(4px);box-shadow:none;"><Svg w={16} sw={2.2}>{Icons.refresh}</Svg>Try again</Hover>
            </div>
          )}

          {v.aiDeclined && (
            <div style={s('padding:18px 22px;display:flex;gap:13px;align-items:flex-start;')}>
              <span style={s('flex:none;width:30px;height:30px;border-radius:50%;background:#f0f4f5;color:#4c6272;display:inline-flex;align-items:center;justify-content:center;margin-top:1px;')}><Svg w={17}>{Icons.infoCircle}</Svg></span>
              <div style={s('flex:1;min-width:0;')}>
                <p style={s('margin:0;font-size:17px;line-height:1.5;color:#212b32;')}>{v.intro}</p>
                <p style={s('margin:8px 0 0;font-size:15px;line-height:1.5;color:#768692;')}>Please check with the relevant lead, or a clinician if it is a clinical question.</p>
              </div>
            </div>
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
                  <div style={s('padding:14px 16px;background:#f0f4f5;border:1px solid #d8dde0;border-left:4px solid #005eb8;border-radius:0 8px 8px 0;font-size:16px;line-height:1.55;white-space:pre-wrap;')}>{v.message}</div>
                  {v.hasMessageCite && this.renderCiteChip(v.messageCiteLabel, v.onMessageCite)}
                </div>
              )}
              {v.hasSteps && (
                <div style={s('padding:18px 22px;display:flex;flex-direction:column;gap:18px;')}>
                  {v.steps.map((st) => (
                    <div key={st.num} style={s('display:flex;gap:14px;align-items:flex-start;')}>
                      <div style={s('flex:none;width:28px;height:28px;border-radius:50%;background:#005eb8;color:#fff;font-weight:700;font-size:15px;display:flex;align-items:center;justify-content:center;margin-top:1px;')}>{st.num}</div>
                      <div style={s('flex:1;min-width:0;')}>
                        <div style={s('font-size:17px;line-height:1.5;')}>{st.text}</div>
                        {st.hasCite && this.renderCiteChip(st.citeLabel, st.onCite)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {v.hasTip && <div style={s('margin:0 22px 16px;border-left:4px solid #005eb8;background:#e8f1f8;padding:12px 16px;border-radius:0 8px 8px 0;font-size:16px;line-height:1.5;')}><strong>Tip:</strong> {v.tip}</div>}
              <div style={s('border-top:1px solid #d8dde0;padding:12px 22px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;')}>
                <span style={s('display:inline-flex;align-items:center;gap:6px;font-size:14px;color:#4c6272;')}><Svg w={14} stroke="#007f3b" sw={2.4} style={s('flex:none;')}>{Icons.shield}</Svg>Each step is backed by a practice document</span>
                <div style={s('margin-left:auto;display:flex;gap:10px;')}>
                  <Hover onClick={v.onCopy} base="background:#fff;border:2px solid #d8dde0;border-radius:8px;padding:6px 14px;font:inherit;font-size:15px;font-weight:600;color:#005eb8;cursor:pointer;display:inline-flex;align-items:center;gap:7px;" hover="border-color:#005eb8;"><Svg w={15}>{Icons.copy}</Svg>{v.copyLabel}</Hover>
                  <Hover onClick={v.onSave} base="background:#005eb8;color:#fff;border:none;border-radius:8px;padding:7px 14px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;" hover="background:#003087;">Save to knowledge base</Hover>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  renderViewer(v) {
    const vm = v.viewer;
    return (
      <div onClick={v.onCloseViewer} style={s('position:fixed;inset:0;background:rgba(33,43,50,.5);display:flex;align-items:stretch;justify-content:flex-end;z-index:60;')}>
        <div onClick={(e) => e.stopPropagation()} style={s('width:100%;max-width:680px;background:#fff;height:100%;display:flex;flex-direction:column;box-shadow:-8px 0 32px rgba(33,43,50,.2);')}>
          <div style={s('flex:none;display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid #d8dde0;')}>
            <span style={s('flex:none;width:34px;height:34px;border-radius:8px;background:#e8f1f8;color:#005eb8;display:inline-flex;align-items:center;justify-content:center;')}><Svg w={18}>{Icons.file}</Svg></span>
            <div style={s('flex:1;min-width:0;')}>
              <div style={s('font-size:17px;font-weight:700;line-height:1.25;text-wrap:pretty;')}>{vm.docTitle}</div>
              <div style={s('font-size:13px;color:#768692;')}>{vm.location}</div>
            </div>
            <Hover tag="button" onClick={v.onCloseViewer} aria-label="Close" base="flex:none;background:none;border:none;cursor:pointer;color:#4c6272;padding:4px;display:flex;" hover="color:#212b32;"><Svg w={24}>{Icons.close}</Svg></Hover>
          </div>
          <div style={s('flex:1;min-height:0;overflow-y:auto;background:#f0f4f5;padding:20px;')}>
            {vm.isImage && <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:8px;padding:12px;')}>{vm.imageEl}</div>}
            {vm.isPdf && <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:8px;overflow:hidden;')}>{vm.pdfEl}</div>}
            {vm.isHtml && <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:8px;overflow:hidden;')}>{vm.htmlEl}</div>}
            {vm.isText && <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:8px;padding:20px 22px;font-size:16px;line-height:1.6;color:#212b32;text-wrap:pretty;')}>{vm.text}</div>}
          </div>
        </div>
      </div>
    );
  }

  renderKbCard(d) {
    return (
      <div style={s('background:#fff;border:1px solid #d8dde0;border-radius:14px;box-shadow:0 1px 3px rgba(33,43,50,.08);overflow:hidden;')}>
        <div style={s('display:flex;align-items:center;gap:14px;padding:16px 20px;')}>
          <span style={s('flex:none;width:38px;height:38px;border-radius:9px;background:#e8f1f8;color:#005eb8;display:inline-flex;align-items:center;justify-content:center;')}><Svg w={20}>{Icons.file}</Svg></span>
          <div style={s('flex:1;min-width:0;')}>
            <div style={s('font-size:17px;font-weight:700;line-height:1.25;text-wrap:pretty;')}>{d.title}</div>
            <div style={s('font-size:13.5px;color:#768692;margin-top:2px;')}>{d.subtitle}</div>
          </div>
          {d.canOpen && (
            <Hover tag="button" onClick={d.onOpen} base="flex:none;display:inline-flex;align-items:center;gap:6px;background:none;border:none;font:inherit;font-size:15px;font-weight:600;color:#005eb8;cursor:pointer;padding:6px 4px;" hover="color:#003087;">
              View <Svg w={16} sw={2.2}>{Icons.chevronRight}</Svg>
            </Hover>
          )}
        </div>
        {d.hasThumbs && (
          <div style={s('display:flex;gap:8px;overflow-x:auto;padding:0 20px 16px;')}>
            {d.thumbs.map((src, i) => (
              <Hover key={i} tag="button" onClick={d.onOpen} base="flex:none;width:88px;height:62px;border:1px solid #d8dde0;border-radius:6px;overflow:hidden;background:#f7fbff;cursor:pointer;padding:0;" hover="border-color:#005eb8;">
                <img src={src} alt="" loading="lazy" style={s('width:100%;height:100%;object-fit:cover;object-position:top;display:block;')} />
              </Hover>
            ))}
          </div>
        )}
      </div>
    );
  }

  renderKb(v) {
    return (
      <div style={s('max-width:820px;margin:0 auto;padding:32px 24px 48px;display:flex;flex-direction:column;gap:22px;')}>
        <div style={s('text-align:center;padding:20px 0 4px;')}>
          <div style={s('width:72px;height:72px;border-radius:18px;background:#fff;border:1px solid #d8dde0;box-shadow:0 1px 3px rgba(33,43,50,.08);display:inline-flex;align-items:center;justify-content:center;')}>
            <img src="/assets/logo.png" alt="The Riverside Practice" style={s('width:44px;height:44px;display:block;')} />
          </div>
          <h1 style={s('font-size:34px;margin:18px 0 8px;letter-spacing:-0.01em;')}>Knowledge base</h1>
          <p style={s('font-size:19px;color:#4c6272;max-width:560px;margin:0 auto;text-wrap:pretty;')}>Every answer I give comes from these practice documents. I never use outside information.</p>
          {v.kbTotal > 0 && <p style={s('font-size:14px;color:#768692;margin:12px 0 0;')}>{v.kbTotal} documents indexed</p>}
        </div>

        {v.kbStatus === 'done' && v.kbTotal > 0 && (
          <div style={s('max-width:520px;width:100%;margin:0 auto;')}>
            <div style={s('display:flex;align-items:center;gap:10px;background:#fff;border:2px solid #d8dde0;border-radius:999px;padding:11px 18px;')}>
              <Svg w={18} stroke="#768692" sw={2.2}><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></Svg>
              <input value={v.kbQuery} onChange={v.onKbSearch} placeholder="Search documents…" aria-label="Search the knowledge base" style={s('flex:1;min-width:0;border:none;outline:none;font:inherit;font-size:16px;background:none;')} />
            </div>
            {v.kbHasQuery && <div style={s('text-align:center;font-size:13.5px;color:#768692;margin-top:10px;')}>{v.kbMatchCount} matching document{v.kbMatchCount === 1 ? '' : 's'}</div>}
          </div>
        )}

        {v.kbStatus === 'loading' && (
          <div style={s('display:flex;align-items:center;justify-content:center;gap:12px;color:#4c6272;font-size:17px;padding:30px 0;')}>
            <span style={s('display:inline-flex;gap:5px;align-items:center;')}>
              <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite;')} />
              <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite .2s;')} />
              <span style={s('width:8px;height:8px;border-radius:50%;background:#005eb8;animation:rivaBlink 1.2s infinite .4s;')} />
            </span>
            Loading the document library&hellip;
          </div>
        )}

        {v.kbStatus === 'error' && (
          <div style={s('text-align:center;color:#4c6272;font-size:17px;padding:24px 0;')}>
            <p style={s('margin:0 0 14px;')}>Could not load the document library.</p>
            <Hover tag="button" onClick={() => v.onSetView('kb')} base="background:#005eb8;color:#fff;border:none;border-radius:8px;padding:9px 16px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;" hover="background:#003087;">Try again</Hover>
          </div>
        )}

        {v.kbStatus === 'done' && v.kbGroups.map((g) => (
          <div key={g.key}>
            <div style={s('font-size:13px;font-weight:700;color:#768692;text-transform:uppercase;letter-spacing:.05em;margin:0 0 12px;')}>{g.label}</div>
            <div style={s('display:flex;flex-direction:column;gap:12px;')}>
              {g.docs.map((d) => <React.Fragment key={d.docId}>{this.renderKbCard(d)}</React.Fragment>)}
            </div>
          </div>
        ))}

        {v.kbStatus === 'done' && v.kbGroups.length === 0 && (
          <div style={s('text-align:center;color:#768692;font-size:16px;padding:24px 0;')}>{v.kbHasQuery ? 'No documents match your search.' : 'No documents have been added to the knowledge base yet.'}</div>
        )}
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
          <div style={s('margin-left:auto;display:flex;gap:12px;align-items:center;')}>
            <div style={s('display:inline-flex;align-items:center;gap:3px;background:#f0f4f5;border:1px solid #d8dde0;border-radius:999px;padding:3px;')}>
              <Hover tag="button" onClick={() => v.onSetView('assistant')}
                base={'display:inline-flex;align-items:center;gap:7px;border:none;border-radius:999px;padding:7px 15px;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;' + (v.isKb ? 'background:none;color:#4c6272;' : 'background:#fff;color:#005eb8;box-shadow:0 1px 2px rgba(33,43,50,.14);')}
                hover={v.isKb ? 'color:#212b32;' : ''}>
                <Svg w={16} sw={2}>{Icons.chat}</Svg>Assistant
              </Hover>
              <Hover tag="button" onClick={() => v.onSetView('kb')}
                base={'display:inline-flex;align-items:center;gap:7px;border:none;border-radius:999px;padding:7px 15px;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;' + (v.isKb ? 'background:#fff;color:#005eb8;box-shadow:0 1px 2px rgba(33,43,50,.14);' : 'background:none;color:#4c6272;')}
                hover={v.isKb ? '' : 'color:#212b32;'}>
                <Svg w={16} sw={2}>{Icons.book}</Svg>Knowledge base
              </Hover>
            </div>
          </div>
        </header>

        {v.notEmpty && !v.isKb && (
          <div style={s('flex:none;background:#fff;border-bottom:1px solid #d8dde0;padding:10px 24px;display:flex;')}>
            <Hover tag="button" onClick={v.onNewChat} base="display:inline-flex;align-items:center;gap:9px;background:#fff;border:2px solid #005eb8;border-radius:999px;padding:8px 16px;font:inherit;font-size:15px;font-weight:600;color:#005eb8;cursor:pointer;" hover="background:#005eb8;color:#fff;"><Svg w={18} sw={2.2}>{Icons.arrowLeft}</Svg>Back to all topics</Hover>
          </div>
        )}

        <div id="riva-scroll" style={s('flex:1;overflow-y:auto;')}>
          {v.isKb ? this.renderKb(v) : (
          <div style={s('max-width:820px;margin:0 auto;padding:32px 24px 28px;display:flex;flex-direction:column;gap:20px;')}>

            {v.isEmpty && (
              <>
                <div style={s('text-align:center;padding:20px 0 4px;')}>
                  <div style={s('width:72px;height:72px;border-radius:18px;background:#fff;border:1px solid #d8dde0;box-shadow:0 1px 3px rgba(33,43,50,.08);display:inline-flex;align-items:center;justify-content:center;')}>
                    <img src="/assets/logo.png" alt="The Riverside Practice" style={s('width:44px;height:44px;display:block;')} />
                  </div>
                  <h1 style={s('font-size:34px;margin:18px 0 8px;letter-spacing:-0.01em;')}>{v.botName}</h1>
                  <p style={s('font-size:19px;color:#4c6272;max-width:540px;margin:0 auto;text-wrap:pretty;')}>{v.welcome}</p>
                  <p style={s('font-size:15px;color:#768692;max-width:540px;margin:14px auto 0;text-wrap:pretty;font-weight:600;')}>Never enter patient information. Ask about the process only.</p>
                </div>

                <div>
                  <div style={s('font-size:14px;font-weight:600;color:#768692;text-transform:uppercase;letter-spacing:.04em;margin-bottom:16px;')}>Browse by area</div>
                  <div style={s('display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:26px 32px;')}>
                    {v.linkAreas.map((a) => (
                      <div key={a.id}>
                        <div style={s('font-size:15px;font-weight:700;color:#212b32;margin-bottom:10px;')}>{a.label}</div>
                        <ul style={s('list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:9px;')}>
                          {a.questions.map((q, i) => (
                            <li key={i}>
                              <Hover tag="a" href="#" onClick={(e) => { e.preventDefault(); q.onClick(); }} base="color:#005eb8;text-decoration:underline;text-underline-offset:.12em;text-decoration-thickness:1px;font-size:16px;line-height:1.4;cursor:pointer;" hover="color:#003087;text-decoration-thickness:3px;">{q.question}</Hover>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={s('font-size:14px;font-weight:600;color:#768692;text-transform:uppercase;letter-spacing:.04em;margin:8px 0 12px;')}>Popular questions</div>
                  <div style={s('display:flex;flex-direction:column;gap:8px;')}>
                    {v.popular.map((p, i) => (
                      <Hover key={i} tag="button" onClick={p.onClick} base="display:flex;align-items:center;gap:12px;width:100%;text-align:left;background:#fff;border:1px solid #d8dde0;border-radius:10px;padding:13px 16px;cursor:pointer;font:inherit;font-size:16px;font-weight:600;color:#005eb8;" hover="border-color:#005eb8;background:#f7fbff;">
                        <span style={s('flex:none;')}><Svg w={18}>{Icons.arrow}</Svg></span><span>{p.question}</span>
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
          )}
        </div>

        {!v.isKb && (
        <div style={s('flex:none;background:#fff;border-top:1px solid #d8dde0;')}>
          <div style={s('max-width:820px;margin:0 auto;padding:14px 24px 18px;')}>
            <form onSubmit={v.onSubmit} style={s('display:flex;gap:10px;align-items:center;')}>
              <input className="riva-input" value={v.input} onChange={v.onInput} placeholder="Ask a question, or describe the situation…" style={s('flex:1;min-width:0;font:inherit;font-size:17px;padding:14px 18px;border:2px solid #d8dde0;border-radius:999px;background:#f0f4f5;outline:none;')} />
              <Hover tag="button" type="submit" aria-label="Send" base="flex:none;width:48px;height:48px;border-radius:50%;background:#005eb8;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;" hover="background:#003087;"><Svg w={22} stroke="#fff" sw={2.2}>{Icons.up}</Svg></Hover>
            </form>
          </div>
        </div>
        )}

        {v.viewerOpen && this.renderViewer(v)}

        {v.showAdd && (
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
        )}
      </div>
    );
  }
}

export default function Page() {
  return <RiversidePracticeQA />;
}
