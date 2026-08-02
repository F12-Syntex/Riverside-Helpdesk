'use client';

import React from 'react';
import { SEED_GUIDES, CATEGORIES } from '../../lib/guides';
import { askAgent } from '../../lib/ai/agent-client';

import { s, Hover, Svg, Icons, assetSrc } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import ChatView from '../_components/ChatView';
import KbView from '../_components/KbView';
import DocumentViewer from '../_components/DocumentViewer';
import AddGuideModal from '../_components/AddGuideModal';
import { plainText } from '../_components/chat/Rich';
import { mdPlain } from '../_components/chat/Md';

// Attached images are downscaled in the browser before sending: big photos
// waste tokens and upload time, and localStorage (where the chat persists)
// holds only a few MB. Anything over MAX_DIM px is resized and re-encoded as
// JPEG on a white background; small files are sent as-is.
const MAX_IMAGES = 4;

// How long ago a cached answer was written, in the words someone would use.
// The reader is deciding whether to trust it or press Reload, and "3 hours ago"
// answers that in a way a timestamp does not.
function timeAgo(iso) {
  const then = Date.parse(iso || '');
  if (!Number.isFinite(then)) return 'earlier';
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 2) return 'just now';
  if (mins < 60) return mins + ' minutes ago';
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? 'an hour ago' : hours + ' hours ago';
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : days + ' days ago';
}

// How long one lookup took, for the timeline. Tenths up to a minute — the
// interesting difference is between a lookup that was instant and one the
// reader actually waited on, and neither needs milliseconds.
function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
  const mins = Math.floor(ms / 60000);
  return mins + 'm ' + Math.round((ms % 60000) / 1000) + 's';
}

function prepareImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1400;
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height, 1));
        if (scale === 1 && dataUrl.length < 900000) { resolve(dataUrl); return; }
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff'; // JPEG has no alpha — transparent PNGs go black otherwise
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch (e) {
          resolve(dataUrl);
        }
      };
      img.onerror = () => reject(new Error('Not a readable image.'));
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

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
      pendingImages: [],   // images attached to the next message: [{ name, dataUrl }]
      messages: [],
      // Which question is on screen. null means the latest one; a number
      // means an earlier question was opened from the minimised history.
      activeTurn: null,
      // True for the moment after asking, while the bar above the dock
      // carries the question up out of the field.
      emitting: false,
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
      this.setState({ customGuides: Array.isArray(g) ? g : [] });
    } catch (e) {}
    // A reload starts a fresh page: questions are not carried over, and any
    // transcript an earlier version of this page stored is cleared out — it
    // is practice questions typed at a shared reception machine, and it has
    // no business surviving the session.
    try { localStorage.removeItem('riva-chat-v1'); } catch (e) {}
    // Load the document library up front so "Browse by area" can surface the
    // full knowledge base, not just the curated guides.
    this.loadKb();
  }

  componentWillUnmount() {
    clearTimeout(this.emitTimer);
  }

  componentDidUpdate(prevProps, prevState) {
    if (!prevState) return;
    // A question owns the page, so opening one puts the reader at the top of
    // it rather than chasing the foot of a transcript. Answers arriving into
    // the question already on screen don't move it.
    const asked = (ms) => ms.filter((m) => m.role === 'user').length;
    const changed = prevState.activeTurn !== this.state.activeTurn
      || asked(this.state.messages) !== asked(prevState.messages);
    if (changed) {
      const el = document.getElementById('riva-scroll');
      if (el) el.scrollTop = 0;
    }
  }

  // Only the guides someone wrote are kept. The conversation itself lives for
  // as long as the page is open and no longer.
  save() {
    try {
      localStorage.setItem('riva-guides-v1', JSON.stringify(this.state.customGuides));
    } catch (e) {}
  }

  /* ------------------------- Image attachments ------------------------- */

  async addImages(files) {
    const prepared = [];
    for (const f of Array.from(files || [])) {
      if (!f || !/^image\//.test(f.type)) continue;
      if (prepared.length >= MAX_IMAGES) break;
      try {
        prepared.push({ name: f.name || 'Pasted image', dataUrl: await prepareImage(f) });
      } catch (e) { /* unreadable file — skip it */ }
    }
    if (!prepared.length) return;
    // Append to the LATEST pending list via a functional update. A paste and a
    // file-pick can overlap, and both await the async re-encode; a snapshot taken
    // at entry would let the slower call clobber the faster one and lose an image.
    this.setState((state) => ({ pendingImages: state.pendingImages.concat(prepared).slice(0, MAX_IMAGES) }));
  }

  removePendingImage(i) {
    const imgs = this.state.pendingImages.slice();
    imgs.splice(i, 1);
    this.setState({ pendingImages: imgs });
  }

  onPaste(e) {
    const files = [];
    for (const it of Array.from((e.clipboardData && e.clipboardData.items) || [])) {
      if (it.kind === 'file' && /^image\//.test(it.type)) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) { e.preventDefault(); this.addImages(files); }
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
        if (m.answerKind === 'docfile') {
          lines.push('The assistant gave the document filing title “' + (m.title || '') + '”.');
        } else if (m.answerKind === 'triage') {
          const bits = 'The assistant triaged the request as ' + (m.urgency || 'unclear')
            + (m.route ? ', routing to ' + plainText(m.route) : '') + '.';
          lines.push(bits);
        } else {
          // New answers carry markdown sections; older saved chats carry steps.
          const body = (m.sections && m.sections.length)
            ? m.sections.map((sec) => mdPlain(sec.markdown)).join(' ')
            : (m.steps || []).map((t, i) => (i + 1) + ') ' + plainText(t && t.text ? t.text : t)).join('  ');
          const txt = (body || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
          if (txt) lines.push('The assistant answered: ' + txt);
        }
      } else if (m.kind === 'suggest') {
        lines.push('The assistant: ' + m.text);
      }
    }
    return lines.join('\n');
  }

  ask(text) {
    const t = (text || '').trim();
    const images = this.state.pendingImages.map((im) => im.dataUrl);
    if (!t && !images.length) return;
    const question = t || 'Please look at the attached image.';
    const userMsg = { role: 'user', text: t, images };
    // answerKind is filled in from the reply — the server decides whether this
    // message is a how-to answer or a triage of an incoming patient request.
    // The images ride along on the bot message too, so a retry can resend them.
    // `steps` and `statusText` are filled in live from the agent's stream: each
    // search it runs appears in the card while it is still working.
    const aiMsg = { role: 'bot', kind: 'ai', answerKind: 'answer', question, images, status: 'loading', steps: [], statusText: '', intro: '', sections: null, tip: '', message: '', messageCite: null, gaps: '', validation: null, citations: [], contacts: [], cache: null };
    const messages = this.state.messages.concat([userMsg, aiMsg]);
    const aiIdx = messages.length - 1;
    // Asking always brings the reader back to the newest question, even if
    // they were reading an earlier one when they asked it.
    this.setState({ messages, input: '', pendingImages: [], activeTurn: null, emitting: true }, () => { this.save(); this.fetchAI(question, aiIdx); });
    // The emit plays once, then the strip above the dock goes quiet again.
    clearTimeout(this.emitTimer);
    this.emitTimer = setTimeout(() => this.setState({ emitting: false }), 640);
  }

  // `refresh` is set by Reload on a cached answer: research the question again
  // rather than serving what the server already has stored for it.
  async fetchAI(question, idx, { refresh = false } = {}) {
    // History is the conversation BEFORE this question (idx-1 = the user message
    // we're answering). On the first question this is empty, so the server skips
    // the follow-up query-condensing step — no point enriching a standalone query.
    const history = this.buildHistory(idx - 1);
    const m = this.state.messages[idx];
    const images = (m && m.images) || [];
    try {
      const data = await askAgent(
        { question, history, customGuides: this.state.customGuides, images, refresh },
        (ev) => this.onAgentEvent(idx, ev),
      );
      if (data.kind === 'docfile') {
        this.updateAi(idx, {
          status: 'done',
          answerKind: 'docfile',
          title: data.title,
          date: data.date,
          source: data.source,
          department: data.department,
          actions: data.actions,
          note: data.note,
        });
        return;
      }
      if (data.kind === 'triage') {
        this.updateAi(idx, {
          status: 'done',
          answerKind: 'triage',
          urgency: data.urgency,
          urgencyReason: data.urgencyReason,
          summary: data.summary,
          actions: data.actions,
          redFlags: data.redFlags,
          route: data.route,
          patientMessage: data.patientMessage,
          patientMessageCite: data.patientMessageCite,
          citations: data.citations,
          contacts: data.contacts || [],
        });
        return;
      }
      if (!data.answerable || (!data.sections.length && !data.message)) {
        this.updateAi(idx, { status: 'declined', answerKind: 'answer', intro: data.intro || 'This needs a clinician’s judgement, so I cannot answer it here.', sections: [], message: '', messageCite: null, tip: '', citations: [], contacts: data.contacts || [] });
        return;
      }
      this.updateAi(idx, { status: 'done', answerKind: 'answer', statusText: '', cache: data.cache || null, intro: data.intro, keyPoints: data.keyPoints || [], sections: data.sections, message: data.message, messageCite: data.messageCite, messageWeb: data.messageWeb || null, tip: data.tip, gaps: data.gaps || '', followUps: data.followUps || [], referralRoute: data.referralRoute || null, validation: data.validation || null, citations: data.citations, contacts: data.contacts || [] });
    } catch (e) {
      this.updateAi(idx, { status: 'error', statusText: '' });
    }
  }

  // One event from the agent's stream. Tool activity is appended as it starts
  // and completed in place when the tool returns, so the card shows the work in
  // the order it actually happened.
  onAgentEvent(idx, ev) {
    if (!ev || !ev.type) return;
    if (ev.type === 'status') { this.updateAi(idx, { statusText: ev.text || '' }); return; }
    if (ev.type === 'tool-start') {
      this.updateAi(idx, (msg) => ({
        statusText: '',
        steps: (msg.steps || []).concat([{
          id: ev.id, tool: ev.tool, label: ev.label || 'Working', detail: ev.detail || '',
          // Started-at is kept so the finished step can say how long it took.
          // The agent does not time itself; the clock that matters is the one
          // the reader waited on, which is this one.
          status: 'running', summary: '', items: [], startedAt: Date.now(),
        }]),
      }));
      return;
    }
    if (ev.type === 'tool-result') {
      this.updateAi(idx, (msg) => ({
        steps: (msg.steps || []).map((st) => (st.id === ev.id
          ? Object.assign({}, st, {
            status: 'done',
            // A lookup that could not run reports ok:false, and reads as a
            // failure rather than as a search that simply found nothing.
            ok: ev.ok !== false,
            summary: ev.summary || '',
            items: ev.items || [],
            duration: st.startedAt ? formatDuration(Date.now() - st.startedAt) : '',
          })
          : st)),
      }));
    }
  }

  retryAi(idx) {
    const m = this.state.messages[idx];
    if (!m || m.kind !== 'ai') return;
    this.updateAi(idx, { status: 'loading', steps: [], statusText: '', cache: null });
    this.fetchAI(m.question, idx);
  }

  // Reload on a cached answer: ask the question again for real, and replace the
  // stored answer with what comes back. The card returns to its working state
  // meanwhile, so nobody reads the old answer thinking it is the new one.
  reloadAi(idx) {
    const m = this.state.messages[idx];
    if (!m || m.kind !== 'ai') return;
    this.updateAi(idx, { status: 'loading', steps: [], statusText: '', cache: null });
    this.fetchAI(m.question, idx, { refresh: true });
  }

  // Format the exact contacts for copying. Each line carries where its number
  // came from, so a number pasted into a task still says how far to trust it.
  contactLines(m) {
    if (!m.contacts || !m.contacts.length) return [];
    const lines = ['', 'Contacts:'];
    for (const c of m.contacts) {
      const vals = (c.phones || []).map((p) => p.display).concat(c.emails || []);
      lines.push('- ' + c.label + ': ' + vals.join(', ') + (c.source ? ' (' + c.source + ')' : ''));
    }
    return lines;
  }

  copyTriage(m, idx) {
    const label = { emergency: 'EMERGENCY', urgent: 'Urgent: duty doctor', routine: 'Routine', 'self-care': 'Self-care / signpost', unclear: 'Unclear: escalate' }[m.urgency] || 'Unclear';
    const lines = ['Triage notes', 'Urgency: ' + label + (m.urgencyReason ? ' (' + plainText(m.urgencyReason) + ')' : '')];
    if (m.summary) lines.push('Request: ' + plainText(m.summary));
    if (m.actions && m.actions.length) {
      lines.push('', 'Actions:');
      m.actions.forEach((a, i) => {
        const src = a && a.cite ? '  [' + a.cite.docTitle + ', ' + a.cite.location + ']'
          : (a && a.basis === 'judgement' ? '  [AI judgement]' : '');
        lines.push((i + 1) + '. ' + plainText(a && a.text ? a.text : a) + src);
      });
    }
    if (m.route) lines.push('', 'Route to: ' + m.route);
    if (m.redFlags && m.redFlags.length) {
      lines.push('', 'Escalate if:');
      m.redFlags.forEach((r) => {
        const src = r && !r.cite && r.basis === 'judgement' ? '  [AI judgement]' : '';
        lines.push('- ' + plainText(r && r.text ? r.text : r) + src);
      });
    }
    if (m.patientMessage) lines.push('', 'Draft reply to patient:', m.patientMessage);
    lines.push(...this.contactLines(m));
    lines.push('', 'Routing suggestion from the practice’s documents. Not clinical advice.');
    try { navigator.clipboard.writeText(lines.join('\n')); } catch (e) {}
    this.flagCopied(idx);
  }

  // Copy just the filing title — that is what gets pasted into the document
  // title field in EMIS; everything else on the card is context.
  copyDocFile(m, idx) {
    try { navigator.clipboard.writeText(m.title || ''); } catch (e) {}
    this.flagCopied(idx);
  }

  // `patch` may be a function of the current message. Streamed tool events can
  // land several to a tick, so a snapshot-based update would drop steps; the
  // functional form always builds on the newest message.
  updateAi(idx, patch) {
    this.setState((state) => {
      const messages = state.messages.slice();
      const current = messages[idx];
      if (!current) return null;
      messages[idx] = Object.assign({}, current, typeof patch === 'function' ? patch(current) : patch);
      return { messages };
    }, () => this.save());
  }

  flagCopied(idx) {
    this.setState({ copiedIdx: idx });
    clearTimeout(this._ct);
    this._ct = setTimeout(() => this.setState({ copiedIdx: null }), 1800);
  }

  // Answers as sections (new) or steps (older saved chats), normalised for
  // copying and the save-to-guide prefill.
  answerSections(m) {
    if (m.sections && m.sections.length) return m.sections;
    return (m.steps || []).map((t, i) => ({
      markdown: (i + 1) + '. ' + ((t && t.text != null) ? t.text : t),
      basis: 'documents',
      cite: (t && t.cite) ? t.cite : null,
    }));
  }

  copyAi(m, idx) {
    // An answer can carry BOTH a procedure (sections) and a suggested message —
    // copy everything, never just one part. Copying only the message here used
    // to silently drop the whole procedure the reader meant to paste.
    const hasSections = this.answerSections(m).some((sec) => (sec.markdown || '').trim());
    const lines = [m.question, ''];
    if (m.intro) lines.push(plainText(m.intro), '');
    if (m.keyPoints && m.keyPoints.length) {
      lines.push('In brief:');
      m.keyPoints.forEach((p) => lines.push('- ' + (p.critical ? 'CRITICAL: ' : '') + plainText(p.text)));
      lines.push('');
    }
    this.answerSections(m).forEach((sec) => {
      if (!(sec.markdown || '').trim()) return;
      if (sec.heading) lines.push((sec.critical ? 'CRITICAL — ' : '') + sec.heading);
      else if (sec.critical) lines.push('CRITICAL');
      if (sec.basis === 'judgement') lines.push('[AI judgement, not from the practice’s documents]');
      if (sec.basis === 'web' && sec.web) lines.push('[From the web, not practice policy]');
      lines.push(mdPlain(sec.markdown));
      if (sec.cite) lines.push('[Source: ' + sec.cite.docTitle + ', ' + sec.cite.location + ']');
      if (sec.basis === 'web' && sec.web) lines.push('[' + sec.web.title + ' — ' + sec.web.url + ']');
      lines.push('');
    });
    if (m.gaps) lines.push('Not in the practice’s own material: ' + plainText(m.gaps), '');
    if (m.message) {
      lines.push(hasSections ? 'Suggested message:' : '', m.message, '');
      if (m.messageCite) lines.push('[Source: ' + m.messageCite.docTitle + ', ' + m.messageCite.location + ']', '');
    }
    if (m.tip) lines.push('Tip: ' + plainText(m.tip));
    lines.push(...this.contactLines(m));
    lines.push('', 'From the practice’s documents; AI judgement marked where used.');
    try { navigator.clipboard.writeText(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()); } catch (e) {}
    this.flagCopied(idx);
  }

  prefillFromAi(m) {
    // Guide steps are short plain lines — flatten the answer's markdown into
    // one line per list item / paragraph, dropping list markers and headings.
    const steps = this.answerSections(m)
      .flatMap((sec) => mdPlain(sec.markdown).split('\n'))
      .map((l) => l.replace(/^\s*(?:\d+[.)]|-)\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 10);
    this.setState({
      showAdd: true,
      draftError: false,
      draft: {
        question: m.question || '',
        category: 'appointments',
        intro: plainText(m.intro || ''),
        steps: steps.length ? steps : ['', ''],
        tip: plainText(m.tip || ''),
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

  // Turn a citation's source images (a notebook note's attachments, or a cited
  // PDF page render) into clickable thumbnails. Shared by the answer sections and
  // the suggested-message block so a picture is shown wherever its source lands.
  citeThumbs(cite) {
    if (!cite || !Array.isArray(cite.images) || !cite.images.length) return [];
    return cite.images.map((u) => ({
      src: assetSrc(u),
      onOpen: () => this.openViewer({
        docTitle: cite.docTitle,
        location: cite.location,
        quote: cite.quote,
        text: cite.text,
        view: { kind: 'image', url: u },
      }),
    }));
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
      if (m.role === 'user') {
        return {
          isUser: true,
          text: m.text,
          images: m.images || [],
          hasImages: !!(m.images && m.images.length),
          // Image data was stripped to fit localStorage — say so instead.
          imageNote: (!m.images || !m.images.length) && m.imageCount
            ? m.imageCount + ' image' + (m.imageCount === 1 ? '' : 's') + ' attached'
            : '',
        };
      }
      if (m.kind === 'ai') {
        // The server tells us whether this turned out to be a how-to answer, a
        // triage of an incoming patient request, or a pasted medical document
        // to file; render the matching card.
        if (m.answerKind === 'docfile') {
          return {
            isDocFile: true,
            aiLoading: m.status === 'loading',
            aiError: m.status === 'error',
            aiDone: m.status === 'done',
            title: m.title || '',
            // The title's parts, labelled, so a wrong date or department is
            // easy to spot against the document before filing.
            parts: [
              { label: 'Date', value: m.date || '' },
              { label: 'From', value: m.source || '' },
              { label: 'Department', value: m.department || '' },
              { label: 'Note', value: (!m.actions || !m.actions.length) ? (m.note || 'no action') : '' },
            ].filter((p) => p.value),
            actions: m.actions || [],
            hasActions: !!(m.actions && m.actions.length),
            onRetry: () => self.retryAi(idx),
            onCopy: () => self.copyDocFile(m, idx),
            copyLabel: this.state.copiedIdx === idx ? 'Copied' : 'Copy title',
          };
        }
        if (m.answerKind === 'triage') {
          const cite = (c) => ({
            hasCite: !!c,
            citeLabel: c ? (c.docTitle + ', ' + c.location) : '',
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
            actions: (m.actions || []).map((a, i) => Object.assign({ num: i + 1, text: (a && a.text != null) ? a.text : a, isJudgement: !!(a && a.basis === 'judgement' && !a.cite) }, cite(a && a.cite))),
            hasActions: !!(m.actions && m.actions.length),
            redFlags: (m.redFlags || []).map((r) => Object.assign({ text: (r && r.text != null) ? r.text : r, isJudgement: !!(r && r.basis === 'judgement' && !r.cite) }, cite(r && r.cite))),
            hasRedFlags: !!(m.redFlags && m.redFlags.length),
            route: m.route || '',
            hasRoute: !!(m.route && m.route.length),
            patientMessage: m.patientMessage || '',
            hasPatientMessage: !!(m.patientMessage && m.patientMessage.length),
            patientMessageCiteLabel: m.patientMessageCite ? (m.patientMessageCite.docTitle + ', ' + m.patientMessageCite.location) : '',
            hasPatientMessageCite: !!m.patientMessageCite,
            onPatientMessageCite: m.patientMessageCite ? (() => self.openViewer(m.patientMessageCite)) : (() => {}),
            onRetry: () => self.retryAi(idx),
            onCopy: () => self.copyTriage(m, idx),
            copyLabel: this.state.copiedIdx === idx ? 'Copied' : 'Copy notes',
            contacts: m.contacts || [],
            hasContacts: !!(m.contacts && m.contacts.length),
          };
        }
        const sections = this.answerSections(m).map((sec, i) => {
          const cite = sec.cite || null;
          const web = sec.basis === 'web' ? (sec.web || null) : null;
          // Pictures that live in the cited source (a notebook note's attached
          // images, or the cited PDF page) — shown as thumbnails under the
          // section; clicking opens the image full-size in the source panel.
          const images = self.citeThumbs(cite);
          return {
            key: i,
            markdown: sec.markdown || '',
            heading: sec.heading || '',
            hasHeading: !!(sec.heading && sec.heading.trim()),
            // Safety-critical, breach-risk or deadline sections are shown as a
            // red callout instead of ordinary body text, so they cannot be
            // skimmed past.
            isCritical: !!sec.critical && sec.basis !== 'judgement',
            isJudgement: sec.basis === 'judgement',
            // Written from a web page, not the practice's own material — shown
            // with its own marker and a link out, never as practice policy.
            isWeb: !!web,
            webLabel: web ? web.title : '',
            webUrl: web ? web.url : '',
            hasCite: !!cite,
            citeLabel: cite ? (cite.docTitle + ', ' + cite.location) : '',
            onCite: cite ? (() => self.openViewer(cite)) : (() => {}),
            images,
            hasImages: images.length > 0,
          };
        });
        // Pictures on the suggested-message citation (each source image is shown
        // once, against the first cite it belongs to — which can be the message).
        const messageImages = self.citeThumbs(m.messageCite);
        const steps = m.steps || [];
        const validation = m.validation || null;
        const dropped = validation ? validation.dropped : 0;
        const usedWeb = sections.some((sec) => sec.isWeb);
        const usedJudgement = sections.some((sec) => sec.isJudgement);
        // This answer was not researched just now — it was given earlier, to
        // this question or to one worded differently, and served from the
        // practice's own cache. Said on the card rather than left to be
        // guessed, with Reload next to it for anyone who wants it done again.
        const cache = m.cache && m.cache.hit ? m.cache : null;
        return {
          isAi: true,
          isCached: !!cache,
          cachedLabel: cache ? 'Answered from cache — saved ' + timeAgo(cache.cachedAt) : '',
          // Only worth saying when the wording differed: the reader is entitled
          // to see the question this answer was actually written for.
          cachedQuestion: cache && cache.match === 'similar' ? cache.question : '',
          hasCachedQuestion: !!(cache && cache.match === 'similar' && cache.question),
          onReload: () => self.reloadAi(idx),
          aiLoading: m.status === 'loading',
          aiError: m.status === 'error',
          aiDeclined: m.status === 'declined',
          aiDone: m.status === 'done',
          question: m.question,
          intro: m.intro || '',
          hasIntro: !!(m.intro && m.intro.length),
          // The answer in brief: two to four lines, each one already verified
          // against the section it summarises. Read first, acted on first.
          keyPoints: (m.keyPoints || []).map((point, i) => ({
            key: i,
            text: point.text || '',
            isCritical: !!point.critical,
          })),
          hasKeyPoints: !!(m.keyPoints && m.keyPoints.length),
          sections,
          hasSections: sections.length > 0,
          // The agent's own working — which searches it ran and what they
          // returned — shown live while it works and collapsible afterwards.
          steps,
          hasSteps: steps.length > 0,
          statusText: m.statusText || '',
          usedJudgement,
          usedWeb,
          // What the practice's material does not cover, and anything the model
          // wrote that could not be verified against a source and was dropped.
          gaps: m.gaps || '',
          hasGaps: !!(m.gaps && m.gaps.length),
          // A step with its own procedure behind it — creating the referral
          // letter, say — is offered as a question rather than inlined. Tapping
          // it asks it here, in the same conversation, so the context is kept.
          followUps: (m.followUps || []).map((q, i) => ({ key: i, question: q, onClick: () => self.ask(q) })),
          hasFollowUps: !!(m.followUps && m.followUps.length),
          // The four e-RS fields, lifted out of the steps so they are the first
          // thing seen — getting the speciality or clinic type wrong sends the
          // referral to the wrong place.
          referralRoute: m.referralRoute || null,
          hasReferralRoute: !!(m.referralRoute && (m.referralRoute.specialty || m.referralRoute.clinicType || m.referralRoute.priority || (m.referralRoute.clinicTypeOptions || []).length)),
          hasDropped: dropped > 0,
          droppedNote: dropped > 0
            ? dropped + ' unverifiable ' + (dropped === 1 ? 'claim was' : 'claims were') + ' removed before this answer was shown'
            : '',
          hasProvenanceNote: usedJudgement || usedWeb || dropped > 0,
          message: m.message || '',
          hasMessage: !!(m.message && m.message.length),
          hasMessageCite: !!m.messageCite,
          messageCiteLabel: m.messageCite ? (m.messageCite.docTitle + ', ' + m.messageCite.location) : '',
          onMessageCite: m.messageCite ? (() => self.openViewer(m.messageCite)) : (() => {}),
          messageImages,
          hasMessageImages: messageImages.length > 0,
          hasTip: !!(m.tip && m.tip.length),
          tip: m.tip || '',
          onRetry: () => self.retryAi(idx),
          onCopy: () => self.copyAi(m, idx),
          copyLabel: this.state.copiedIdx === idx ? 'Copied' : 'Copy steps',
          onSave: () => self.prefillFromAi(m),
          contacts: m.contacts || [],
          hasContacts: !!(m.contacts && m.contacts.length),
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
          thanksText: m.feedback === 'down' ? 'Thanks, we’ll review this guide.' : 'Thanks for your feedback.',
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

    /* --------------------------- Turns ---------------------------- *
     * The transcript is grouped into turns — a question and everything
     * the assistant said in reply to it. One turn is on screen at a
     * time; the rest are minimised into the history line above it.
     * -------------------------------------------------------------- */
    const groups = [];
    this.state.messages.forEach((m, i) => {
      if (m.role === 'user') {
        const imgs = m.images || [];
        groups.push({
          question: m.text || 'About the attached image',
          images: imgs,
          // Image data was stripped to fit localStorage — say so instead.
          imageNote: (!imgs.length && m.imageCount)
            ? m.imageCount + ' image' + (m.imageCount === 1 ? '' : 's') + ' attached'
            : '',
          idxs: [],
        });
      } else {
        // A reply with no question before it (an older saved chat, say).
        if (!groups.length) groups.push({ question: '', images: [], imageNote: '', idxs: [] });
        groups[groups.length - 1].idxs.push(i);
      }
    });
    const lastTurn = groups.length - 1;
    const activeTurn = Math.min(this.state.activeTurn == null ? lastTurn : this.state.activeTurn, lastTurn);
    const active = groups[activeTurn] || null;
    // Questions are numbered in the order they were asked — 01, 02 — and the
    // ones not on screen are listed in that order above the one that is.
    const earlier = groups
      .map((g, i) => ({
        key: i,
        num: String(i + 1).padStart(2, '0'),
        question: g.question,
        onOpen: () => self.setState({ activeTurn: i }),
      }))
      .filter((t) => t.key !== activeTurn);

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
      welcome: this.props.welcome != null ? this.props.welcome : 'Ask how the practice works. Answers come only from the practice’s own documents.',
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
      pendingImages: this.state.pendingImages.map((im, i) => ({
        name: im.name,
        dataUrl: im.dataUrl,
        onRemove: () => self.removePendingImage(i),
      })),
      hasPendingImages: this.state.pendingImages.length > 0,
      onPaste: (e) => self.onPaste(e),
      // The strip above the dock: what is being typed, then the bar that
      // carries it away; and the dock's own light while an answer is worked
      // out, so the wait is visible without a spinner in the reading area.
      emitting: this.state.emitting,
      ghost: this.state.input.trim(),
      hasGhost: !!this.state.input.trim() && !this.state.emitting,
      isGenerating: this.state.messages.some((m) => m.status === 'loading'),
      messages,
      turn: active ? {
        key: activeTurn,
        num: String(activeTurn + 1).padStart(2, '0'),
        question: active.question,
        images: active.images,
        hasImages: active.images.length > 0,
        imageNote: active.imageNote,
        items: active.idxs.map((i) => messages[i]),
      } : null,
      history: earlier,
      hasHistory: groups.length > 1,
      isViewingHistory: activeTurn !== lastTurn,
      onLatest: () => self.setState({ activeTurn: null }),
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

        {/* The composer floats over this region, so leave room at the foot of
            the conversation for it (the knowledge base has no composer). */}
        <div id="riva-scroll" style={s('flex:1;overflow-y:auto;' + (v.isKb ? '' : 'padding-bottom:184px;'))}>
          {v.isKb ? <KbView v={v} /> : <ChatView v={v} />}
        </div>

        {!v.isKb && (
        <div className="riva-dock">
          <div className="riva-dock-inner">
            {/* What is being typed shows faintly above the field, and leaves
                as a bar when it is asked — the question is going up to the
                heading, and the strip says so. */}
            <div className="riva-dock-strip" aria-hidden="true">
              {v.emitting && <span className="riva-dock-emit" />}
              {v.hasGhost && <span className="riva-dock-ghost">{v.ghost}</span>}
            </div>
            <p className="riva-dock-note">Don&rsquo;t type patient related data.</p>
            {v.hasPendingImages && (
              <div style={s('display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;')}>
                {v.pendingImages.map((im, i) => (
                  <div key={i} style={s('position:relative;')}>
                    <img src={im.dataUrl} alt={im.name} title={im.name} style={s('display:block;height:64px;max-width:120px;object-fit:cover;border-radius:10px;border:1px solid #d8dde0;')} />
                    <Hover tag="button" type="button" onClick={im.onRemove} aria-label={'Remove ' + im.name}
                      base="position:absolute;top:-7px;right:-7px;width:22px;height:22px;border-radius:50%;background:#212b32;color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;"
                      hover="background:#d5281b;">
                      <Svg w={10} stroke="#fff" sw={3}>{Icons.close}</Svg>
                    </Hover>
                  </div>
                ))}
              </div>
            )}
            {/* One field and one send button. There is no attach control:
                an image can still be pasted into the box, which is how it
                is actually done, and the button was one more thing to read
                past on every visit. */}
            <form onSubmit={v.onSubmit} style={s('display:flex;gap:10px;align-items:center;')}>
              <input className={'riva-input riva-dock-field' + (v.isGenerating ? ' riva-dock-live' : '')} value={v.input} onChange={v.onInput} onPaste={v.onPaste} placeholder="Type your question…" style={s('flex:1;min-width:0;font:inherit;border:2px solid #d8dde0;border-radius:999px;background:#f0f4f5;outline:none;')} />
              <Hover tag="button" type="submit" className="riva-dock-btn" aria-label="Send" base="flex:none;width:62px;height:62px;border-radius:50%;background:#005eb8;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;" hover="background:#003087;"><Svg w={26} stroke="#fff" sw={2.2}>{Icons.up}</Svg></Hover>
            </form>
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
