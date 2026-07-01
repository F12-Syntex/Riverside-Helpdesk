'use client';

import React from 'react';
import { SEED_GUIDES, CATEGORIES } from '../../lib/guides';
import { askQuestion, triageRequest } from '../../lib/ai/client';

// A worked example staff can drop into the triage box to see how it works —
// an Accurx-style online consultation submission.
const TRIAGE_EXAMPLE = [
  'Describe the problem: I have had a sore throat for longer than a week. My cold symptoms are gone. The pain is worse on the right side and it feels strange when I swallow. Small red spots on the roof of my mouth are slowly going away.',
  'How long has it been going on for? Two weeks',
  'Have you tried anything to help? Throat sprays, gargling saltwater, paracetamol',
  'Is there anything you are particularly worried about? Throat infection',
  'Expectations: Examine my throat',
  'Best time to contact: Anytime',
].join('\n');

// Suggested starter questions on the empty state — organisation-wide topics
// answered from the practice's own policy/procedure documents.
const POPULAR_QUESTIONS = [
  'How do I report a significant event?',
  'What is the complaints procedure?',
  'What should I do if a patient is aggressive or abusive?',
  'How do I report a data breach?',
  'How are repeat prescription requests handled?',
];
import { s, Hover, Svg, Icons, assetSrc } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import ChatView from '../_components/ChatView';
import KbView from '../_components/KbView';
import DocumentViewer from '../_components/DocumentViewer';
import AddGuideModal from '../_components/AddGuideModal';

/* ------------------------------------------------------------------ *
 * The Riverside Practice Q&A component.
 *
 * This component owns all state and logic. The presentational pieces
 * live in ../_components and are driven by the view-model built in
 * renderVals(); the chat/guide/AI cards and the document viewer also
 * consume the small element fragments pre-built in buildGuideVM() /
 * buildViewerVM().
 * ------------------------------------------------------------------ */

class RiversidePracticeQA extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      input: '',
      composerMode: 'ask',   // 'ask' (how-to question) | 'triage' (route a patient request)
      messages: [],
      customGuides: [],
      showAdd: false,
      draft: this.blankDraft(),
      copiedIdx: null,
      draftError: false,
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
    // History is the conversation BEFORE this question (idx-1 = the user message
    // we're answering). On the first question this is empty, so the server skips
    // the follow-up query-condensing step — no point enriching a standalone query.
    const history = this.buildHistory(idx - 1);
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

  // Triage an incoming patient request (Accurx-style submission). Mirrors ask():
  // pushes the pasted request as a user message plus a loading triage card, then
  // fetches grounded action notes for it.
  triage(text) {
    const t = (text || '').trim();
    if (!t) return;
    const userMsg = { role: 'user', text: t };
    const triageMsg = { role: 'bot', kind: 'triage', submission: t, status: 'loading', urgency: 'unclear', urgencyReason: '', summary: '', actions: [], redFlags: [], route: '', patientMessage: '', patientMessageCite: null, citations: [] };
    const messages = this.state.messages.concat([userMsg, triageMsg]);
    const idx = messages.length - 1;
    this.setState({ messages, input: '' }, () => { this.save(); this.fetchTriage(t, idx); });
  }

  async fetchTriage(submission, idx) {
    try {
      const data = await triageRequest({ submission, customGuides: this.state.customGuides });
      this.updateAi(idx, {
        status: 'done',
        urgency: data.urgency,
        urgencyReason: data.urgencyReason,
        summary: data.summary,
        actions: data.actions,
        redFlags: data.redFlags,
        route: data.route,
        patientMessage: data.patientMessage,
        patientMessageCite: data.patientMessageCite,
        citations: data.citations,
      });
    } catch (e) {
      this.updateAi(idx, { status: 'error' });
    }
  }

  retryTriage(idx) {
    const m = this.state.messages[idx];
    if (!m || m.kind !== 'triage') return;
    this.updateAi(idx, { status: 'loading' });
    this.fetchTriage(m.submission, idx);
  }

  copyTriage(m, idx) {
    const label = { emergency: 'EMERGENCY', urgent: 'Urgent — duty doctor', routine: 'Routine', 'self-care': 'Self-care / signpost', unclear: 'Unclear — escalate' }[m.urgency] || 'Unclear';
    const lines = ['Triage notes', 'Urgency: ' + label + (m.urgencyReason ? ' — ' + m.urgencyReason : '')];
    if (m.summary) lines.push('Request: ' + m.summary);
    if (m.actions && m.actions.length) {
      lines.push('', 'Actions:');
      m.actions.forEach((a, i) => {
        const src = a && a.cite ? '  [' + a.cite.docTitle + ' — ' + a.cite.location + ']' : '';
        lines.push((i + 1) + '. ' + (a && a.text ? a.text : a) + src);
      });
    }
    if (m.route) lines.push('', 'Route to: ' + m.route);
    if (m.redFlags && m.redFlags.length) {
      lines.push('', 'Escalate if:');
      m.redFlags.forEach((r) => lines.push('- ' + (r && r.text ? r.text : r)));
    }
    if (m.patientMessage) lines.push('', 'Draft reply to patient:', m.patientMessage);
    lines.push('', 'Routing suggestion from the practice’s documents — not clinical advice.');
    try { navigator.clipboard.writeText(lines.join('\n')); } catch (e) {}
    this.flagCopied(idx);
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

  openViewer(citation) { this.setState({ viewer: citation }); }
  closeViewer() { this.setState({ viewer: null }); }

  buildViewerVM() {
    const c = this.state.viewer;
    if (!c) return { docTitle: '', location: '', isImage: false, isPdf: false, isHtml: false, isText: false, hasFile: false, fileUrl: '', pdfSrc: '', text: '' };
    const v = c.view || {};
    const url = v.url ? assetSrc(v.url) : '';
    const isImage = v.kind === 'image' && !!url;
    const isPdf = v.kind === 'pdf' && !!url;
    const isFrame = (v.kind === 'html' || v.kind === 'markdown' || v.kind === 'text') && !!url;
    const isText = !url; // no openable file — the extract is all there is to show
    const pdfSrc = isPdf ? (url + (v.page ? '#page=' + v.page : '')) : '';
    return {
      docTitle: c.docTitle || 'Document',
      location: c.location || '',
      // The PDF page this citation sits on — drives the in-browser PDF renderer,
      // which opens at this page and highlights the verbatim quote there.
      page: v.page || null,
      isImage,
      isPdf,
      isHtml: isFrame,
      isText,
      // Whether a full document file exists to embed/download, and its URL.
      hasFile: !!url,
      fileUrl: url,
      // Prefer the verified verbatim quote (the precise words the step is based
      // on) for finding and tightly highlighting the passage and for the mobile
      // text; fall back to the full extract when there is no verified quote.
      text: (c.quote && c.quote.length ? c.quote : (v.text || c.text || c.snippet)) || 'This source has no preview.',
      // The document URL to open/download; pdfSrc also jumps to the right page.
      pdfSrc,
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
      if (m.kind === 'triage') {
        const cite = (c) => ({
          hasCite: !!c,
          citeLabel: c ? (c.docTitle + ' — ' + c.location) : '',
          onCite: c ? (() => self.openViewer(c)) : (() => {}),
        });
        return {
          isTriage: true,
          aiLoading: m.status === 'loading',
          aiError: m.status === 'error',
          aiDone: m.status === 'done',
          urgency: m.urgency || 'unclear',
          urgencyReason: m.urgencyReason || '',
          hasUrgencyReason: !!(m.urgencyReason && m.urgencyReason.length),
          summary: m.summary || '',
          hasSummary: !!(m.summary && m.summary.length),
          actions: (m.actions || []).map((a, i) => Object.assign({ num: i + 1, text: (a && a.text != null) ? a.text : a }, cite(a && a.cite))),
          hasActions: !!(m.actions && m.actions.length),
          redFlags: (m.redFlags || []).map((r) => Object.assign({ text: (r && r.text != null) ? r.text : r }, cite(r && r.cite))),
          hasRedFlags: !!(m.redFlags && m.redFlags.length),
          route: m.route || '',
          hasRoute: !!(m.route && m.route.length),
          patientMessage: m.patientMessage || '',
          hasPatientMessage: !!(m.patientMessage && m.patientMessage.length),
          patientMessageCiteLabel: m.patientMessageCite ? (m.patientMessageCite.docTitle + ' — ' + m.patientMessageCite.location) : '',
          hasPatientMessageCite: !!m.patientMessageCite,
          onPatientMessageCite: m.patientMessageCite ? (() => self.openViewer(m.patientMessageCite)) : (() => {}),
          onRetry: () => self.retryTriage(idx),
          onCopy: () => self.copyTriage(m, idx),
          copyLabel: this.state.copiedIdx === idx ? 'Copied' : 'Copy notes',
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

    const popular = POPULAR_QUESTIONS.map((q) => ({ question: q, onClick: () => self.ask(q) }));

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
      botName: this.props.botName != null ? this.props.botName : 'The Riverside Practice Q&A',
      welcome: this.props.welcome != null ? this.props.welcome : 'Ask anything about how the practice works. Answers come only from the organisation’s own documents — helpful for all staff.',
      view: this.state.view,
      isKb: this.state.view === 'kb',
      kbStatus: this.state.kbStatus,
      kbGroups,
      kbTotal: kb.total || 0,
      kbQuery,
      kbHasQuery: !!q,
      kbMatchCount,
      onKbSearch: (e) => self.setState({ kbQuery: e.target.value }),
      onSetView: (vw) => self.setView(vw),
      isEmpty: this.state.messages.length === 0,
      notEmpty: this.state.messages.length > 0,
      input: this.state.input,
      composerMode: this.state.composerMode,
      isTriageMode: this.state.composerMode === 'triage',
      onSetComposerMode: (mode) => self.setState({ composerMode: mode }),
      onLoadTriageExample: () => self.setState({ composerMode: 'triage', input: TRIAGE_EXAMPLE }),
      messages, popular,
      cats: this.cats(),
      showAdd: this.state.showAdd,
      draft: this.state.draft,
      draftSteps,
      draftError: this.state.draftError,
      viewerOpen: !!this.state.viewer,
      viewer: this.buildViewerVM(),
      onCloseViewer: () => self.closeViewer(),
      onInput: (e) => self.setState({ input: e.target.value }),
      onSubmit: (e) => {
        e.preventDefault();
        if (self.state.composerMode === 'triage') self.triage(self.state.input);
        else self.ask(self.state.input);
      },
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

  render() {
    const v = this.renderVals();
    return (
      <div style={s('display:flex;flex-direction:column;height:100vh;min-height:100vh;background:#f0f4f5;')}>

        <AppHeader v={v} />

        {v.notEmpty && !v.isKb && (
          <div style={s('flex:none;background:#fff;border-bottom:1px solid #d8dde0;padding:10px 24px;display:flex;')}>
            <Hover tag="button" onClick={v.onNewChat} base="display:inline-flex;align-items:center;gap:9px;background:#fff;border:2px solid #005eb8;border-radius:999px;padding:8px 16px;font:inherit;font-size:15px;font-weight:600;color:#005eb8;cursor:pointer;" hover="background:#005eb8;color:#fff;"><Svg w={18} sw={2.2}>{Icons.arrowLeft}</Svg>Back to all topics</Hover>
          </div>
        )}

        <div id="riva-scroll" style={s('flex:1;overflow-y:auto;')}>
          {v.isKb ? <KbView v={v} /> : <ChatView v={v} />}
        </div>

        {!v.isKb && (
        <div style={s('flex:none;background:#fff;border-top:1px solid #d8dde0;')}>
          <div style={s('max-width:820px;margin:0 auto;padding:12px 24px 18px;')}>
            <div style={s('display:flex;gap:6px;margin-bottom:10px;')}>
              <Hover tag="button" onClick={() => v.onSetComposerMode('ask')}
                base={'display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:6px 14px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;border:2px solid ' + (v.isTriageMode ? '#d8dde0' : '#005eb8') + ';background:' + (v.isTriageMode ? '#fff' : '#005eb8') + ';color:' + (v.isTriageMode ? '#4c6272' : '#fff') + ';'}
                hover="border-color:#005eb8;">
                <Svg w={15} sw={2.2}>{Icons.chat}</Svg>Ask a question
              </Hover>
              <Hover tag="button" onClick={() => v.onSetComposerMode('triage')}
                base={'display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:6px 14px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;border:2px solid ' + (v.isTriageMode ? '#005eb8' : '#d8dde0') + ';background:' + (v.isTriageMode ? '#005eb8' : '#fff') + ';color:' + (v.isTriageMode ? '#fff' : '#4c6272') + ';'}
                hover="border-color:#005eb8;">
                <Svg w={15} sw={2.2}>{Icons.fileLines}</Svg>Triage a request
              </Hover>
              {v.isTriageMode && (
                <Hover tag="button" onClick={v.onLoadTriageExample}
                  base="margin-left:auto;background:none;border:none;font:inherit;font-size:13px;font-weight:600;color:#005eb8;cursor:pointer;text-decoration:underline;text-underline-offset:.14em;"
                  hover="color:#003087;">Load example</Hover>
              )}
            </div>
            {v.isTriageMode ? (
              <form onSubmit={v.onSubmit} style={s('display:flex;gap:10px;align-items:flex-end;')}>
                <textarea className="riva-input" value={v.input} onChange={v.onInput} rows={4}
                  onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') v.onSubmit(e); }}
                  placeholder="Paste the patient's request (for example an Accurx online consultation) here…"
                  style={s('flex:1;min-width:0;font:inherit;font-size:16px;line-height:1.5;padding:12px 16px;border:2px solid #d8dde0;border-radius:16px;background:#f0f4f5;outline:none;resize:vertical;')} />
                <Hover tag="button" type="submit" aria-label="Triage" base="flex:none;width:48px;height:48px;border-radius:50%;background:#005eb8;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;" hover="background:#003087;"><Svg w={22} stroke="#fff" sw={2.2}>{Icons.up}</Svg></Hover>
              </form>
            ) : (
              <form onSubmit={v.onSubmit} style={s('display:flex;gap:10px;align-items:center;')}>
                <input className="riva-input" value={v.input} onChange={v.onInput} placeholder="Ask a question, or describe the situation…" style={s('flex:1;min-width:0;font:inherit;font-size:17px;padding:14px 18px;border:2px solid #d8dde0;border-radius:999px;background:#f0f4f5;outline:none;')} />
                <Hover tag="button" type="submit" aria-label="Send" base="flex:none;width:48px;height:48px;border-radius:50%;background:#005eb8;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;" hover="background:#003087;"><Svg w={22} stroke="#fff" sw={2.2}>{Icons.up}</Svg></Hover>
              </form>
            )}
            {v.isTriageMode && (
              <p style={s('margin:8px 2px 0;font-size:13px;color:#768692;line-height:1.4;')}>Routing help only, from the practice&rsquo;s documents &mdash; not clinical advice. Do not enter more patient detail than you need to.</p>
            )}
          </div>
        </div>
        )}

        {v.viewerOpen && <DocumentViewer v={v} />}

        {v.showAdd && <AddGuideModal v={v} />}
      </div>
    );
  }
}

export default function HelpBotPage() {
  return <RiversidePracticeQA />;
}
