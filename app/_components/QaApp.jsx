'use client';

import React from 'react';
import { SEED_GUIDES, CATEGORIES } from '../../lib/guides';
import { askAgent } from '../../lib/ai/agent-client';
import { VERDICTS } from '../../lib/feedback.mjs';
import { commandByName, matchCommands, modePlaceholder, parseCommand } from '../../lib/commands.mjs';
import { identifierNote, identifierWarning, redactIdentifiers } from '../../lib/safety/identifiers.mjs';
import { kindLabel, patientDataMessage } from '../../lib/safety/patient-data.mjs';
import { machineId } from '../../lib/audit/client';
import {
  isTestQuery, isGeneralTestQuery,
  TEST_STEPS, TEST_STATUS, TEST_ANSWER,
  TEST_GENERAL_STEPS, TEST_GENERAL_STATUS, TEST_GENERAL_ANSWER,
} from '../../lib/test-answer';

import { s, Hover, Svg, Icons, assetSrc } from './ui';
import AppHeader from './AppHeader';
import ChatView from './ChatView';
import SourcesView from './SourcesView';
import DirectoryPanel from './DirectoryPanel';
import GradientBackground from './GradientBackground';
import CommandMenu from './CommandMenu';
import ModeSwitch from './ModeSwitch';
import DocumentViewer from './DocumentViewer';
import AddGuideModal from './AddGuideModal';
import PatientDataModal from './PatientDataModal';
import ContactsSheet from './ContactsSheet';
import { plainText } from './chat/Rich';
import { mdPlain } from './chat/Md';
import { notify } from './notify';

// Attached images are downscaled in the browser before sending: big photos
// waste tokens and upload time, and localStorage (where the chat persists)
// holds only a few MB. Anything over MAX_DIM px is resized and re-encoded as
// JPEG on a white background; small files are sent as-is.
const MAX_IMAGES = 4;

// Documents dropped onto one question. Reception attaches a letter, sometimes a
// letter and the form that came with it; more than this is a knowledge-base job.
const MAX_DOCUMENTS = 4;

// Whether what is being dragged is a file at all. Dragging selected text or a
// link over the page must not put the whole window into "drop a document here".
function hasFiles(e) {
  const dt = e && e.dataTransfer;
  if (!dt) return false;
  if (dt.types && typeof dt.types.includes === 'function') return dt.types.includes('Files');
  return Array.from(dt.types || []).indexOf('Files') !== -1;
}

// A file size in the words a person uses, for the row in the dock.
function docSize(chars) {
  if (!chars) return '';
  if (chars < 1000) return chars + ' characters';
  return Math.round(chars / 1000) + 'k characters';
}

// A directory entry's numbers, whatever shape they arrive in. The bundled
// telephone list writes {display, tel}; rows stored in Postgres have been seen
// carrying {number} or a bare string, and a number search that only knew about
// `tel` quietly matched nothing at all against those.
function phoneParts(entry) {
  return ((entry && entry.phones) || []).map((p) => {
    if (typeof p === 'string') return { display: p, tel: p };
    const display = p.display || p.number || p.value || p.tel || '';
    const tel = p.tel || p.number || p.value || p.display || '';
    return { display, tel };
  }).filter((p) => p.display || p.tel);
}

// Every number on an entry as digits alone, for matching a typed number
// against a directory that formats its own however it likes.
function phoneDigits(entry) {
  return phoneParts(entry).map((p) => String(p.tel || p.display)).join(' ').replace(/\D/g, '');
}

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
      // Documents dropped onto the page and read into text, waiting to go up
      // with the next question: [{ key, name, status, text, chars, truncated }]
      pendingDocs: [],
      dragging: false,     // a file is being dragged over the window
      messages: [],
      // Which question is on screen. null means the latest one; a number
      // means an earlier question was opened from the minimised history.
      activeTurn: null,
      // True for the moment after asking, while the bar above the dock
      // carries the question up out of the field.
      emitting: false,
      // The practice's own telephone list, matched against what is being
      // typed and offered above the dock. dirSel is -1 until someone moves
      // into the list with the arrow keys, so Enter still asks the question.
      directory: [],
      notes: [],          // the notebook's notes, listed under Sources
      // The query the directory is matched against settles behind the box:
      // it is only updated once typing pauses, so the panel does not flicker
      // in and out on the way through a sentence.
      dirQuery: '',
      // The CQC register — every service registered in England — searched on
      // the server for the same settled query. Far too large to hold here, so
      // the browser asks for the top matches and shows them under the
      // practice's own numbers.
      cqc: [],
      dirSel: -1,
      dirClosed: false,
      // The slash commands, offered while a command name is being typed. -1
      // until the arrow keys move into the list, so Enter on "/accurx some
      // text" asks it rather than re-picking the command.
      cmdSel: -1,
      // The kind of answer chosen from the disc in the field, as a command
      // name — '' is Q&A, which is what almost every message is. It lasts ONE
      // message: see app/_components/ModeSwitch.jsx for why a switch that
      // stayed put would be a hazard rather than a convenience.
      mode: '',
      copiedNumber: '',
      // The Super speed screen: `screening` while a message is being checked
      // (the send is held, so the dock says so rather than looking dead), and
      // `blocked` holding what was found once a message has been refused. Both
      // are cleared the moment the reader touches the field again.
      screening: false,
      blocked: null,
      customGuides: [],
      // The practice directory, opened from the pill under the box.
      contactsOpen: false,
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
    // The field itself, so choosing a command with the mouse can hand the
    // cursor straight back to it.
    this.inputRef = React.createRef();
    // Timers belonging to the stored "test" answer, cleared on unmount.
    this.mockTimers = [];
    // How many nested elements the dragged file is currently over (see
    // onDragLeave): a counter, because enter/leave fire per element.
    this.dragDepth = 0;
  }

  blankDraft() {
    return { question: '', category: 'appointments', intro: '', steps: ['', ''], tip: '' };
  }

  componentDidMount() {
    try {
      const g = JSON.parse(localStorage.getItem('riva-guides-v1') || '[]');
      this.setState({ customGuides: Array.isArray(g) ? g : [] });
    } catch (e) {}
    // Arrived with a question already chosen in ?ask=. It is asked here,
    // through the ordinary path, so a link is a way in rather than a page
    // about the assistant. The parameter is dropped from the URL afterwards,
    // so a refresh does not ask it again.
    try {
      const ask = new URLSearchParams(window.location.search).get('ask');
      if (ask && ask.trim()) {
        window.history.replaceState({}, '', window.location.pathname);
        setTimeout(() => this.ask(ask.trim()), 0);
      }
    } catch (e) {}
    // A reload starts a fresh page: questions are not carried over, and any
    // transcript an earlier version of this page stored is cleared out — it
    // is practice questions typed at a shared reception machine, and it has
    // no business surviving the session.
    try { localStorage.removeItem('riva-chat-v1'); } catch (e) {}
    // The telephone list is small and read-only, so it is fetched once and
    // matched in the browser as someone types.
    fetch('/api/directory')
      .then((r) => r.json())
      .then((d) => { if (d && Array.isArray(d.entries)) this.setState({ directory: d.entries }); })
      .catch(() => {});
    // The notebook's own notes are part of what an answer can be built from,
    // so they are listed under Sources alongside the documents.
    fetch('/api/notebook')
      .then((r) => r.json())
      .then((d) => { if (d && Array.isArray(d.notes)) this.setState({ notes: d.notes }); })
      .catch(() => {});
    // Load the document library up front so "Browse by area" can surface the
    // full knowledge base, not just the curated guides.
    this.loadKb();
  }

  componentWillUnmount() {
    clearTimeout(this.emitTimer);
    clearTimeout(this.copyTimer);
    clearTimeout(this.dirTimer);
    this.mockTimers.forEach(clearTimeout);
  }

  /* --------------------------- Directory --------------------------- *
   * Reception's most common question is "what's the number for…", and
   * it should not need a second page. The practice's own list is
   * matched against whatever is in the box and offered above the dock.
   * Numbers are shown verbatim from the directory — nothing here is
   * written by a model.
   * ----------------------------------------------------------------- */

  // Someone writing a sentence is not looking for a number, and the panel
  // appearing under every third word is worse than not having it. A query
  // only reaches the directory once it stops looking like a question.
  looksLikeLookup(text) {
    const t = (text || '').trim();
    if (t.length < 3) return false;
    if (t.includes('?')) return false;
    if (t.split(/\s+/).length > 4) return false;
    return !/^(how|what|where|when|why|who|which|can|could|do|does|did|is|are|was|should|would|will|shall|may|might|please|tell|explain|i|we|my)\b/i.test(t);
  }

  matchDirectory() {
    const q = (this.state.dirQuery || '').trim().toLowerCase();
    if (this.state.dirClosed || !this.looksLikeLookup(q)) return [];
    const digits = q.replace(/\D/g, '');
    const scored = [];
    for (const e of this.state.directory) {
      const hay = [e.label, e.category, e.note, (e.aliases || []).join(' ')].join(' ').toLowerCase();
      // Digits only, from whatever the entry calls its number. Searching
      // against the formatted text would fail the moment someone typed a
      // number without the spaces the directory happens to have used.
      const tels = phoneDigits(e);
      let score = 0;
      if (hay.startsWith(q)) score = 3;
      else if (hay.includes(q)) score = 2;
      else if (digits.length >= 3 && tels.includes(digits)) score = 1;
      if (score) scored.push({ e, score });
    }
    scored.sort((a, b) => b.score - a.score || String(a.e.label).localeCompare(String(b.e.label)));
    return scored.slice(0, 10).map((x) => x.e);
  }

  // The practice's own list is matched on the keystroke itself. It is a few
  // dozen rows already in memory, so waiting for typing to stop bought
  // nothing but a quarter-second of the panel not being there yet — and the
  // person typing "podiatry" wants the number before they finish the word.
  // Only the register waits, and only long enough to not send a request per
  // keystroke; looksLikeLookup() already keeps the panel shut for anything
  // that reads as a sentence, which is what stops it flickering.
  onInput(value) {
    this.setState({ input: value, dirQuery: value, dirSel: -1, dirClosed: false, cmdSel: -1 });
    clearTimeout(this.dirTimer);
    this.dirTimer = setTimeout(() => this.searchCqc(value), 110);
  }

  // The register is ~57k services, so it is searched on the server. Replies
  // are stamped with the query they answer: a slow one for an earlier query
  // can arrive after a fast one for the current query, and must not replace it.
  searchCqc(value) {
    const q = String(value || '').trim();
    if (!this.looksLikeLookup(q)) { this.setState({ cqc: [] }); return; }
    this.cqcToken = q;
    fetch('/api/cqc?q=' + encodeURIComponent(q), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (this.cqcToken !== q) return;
        this.setState({ cqc: Array.isArray(d.entries) ? d.entries.slice(0, 12) : [] });
      })
      .catch(() => { if (this.cqcToken === q) this.setState({ cqc: [] }); });
  }

  // The practice's own list first — it is what the practice actually uses —
  // and the register beneath it, marked as what it is. A service already in
  // the practice's list is not repeated from the register. Built here rather
  // than in the view model so the keyboard and the panel walk the same rows.
  directoryRows() {
    // A command line is not a name. Once the field starts with "/" the reader is
    // choosing a command or writing its message, and telephone numbers matched
    // against that text are noise — two panels over one field, and the arrow
    // keys owned by whichever opened last.
    if (/^\s*\//.test(this.state.input)) return [];
    const practice = this.matchDirectory();
    const seen = new Set(practice.map((e) => phoneDigits(e)).filter(Boolean));
    const register = (this.state.dirClosed || !this.looksLikeLookup(this.state.dirQuery) ? [] : this.state.cqc)
      .filter((e) => phoneParts(e).length && !seen.has(phoneDigits(e)));
    return practice.slice(0, 8)
      .map((e) => ({ entry: e, group: 'Practice directory' }))
      .concat(register.map((e) => ({ entry: e, group: 'CQC register' })));
  }

  copyContact(entry) {
    const phone = phoneParts(entry)[0] || null;
    const shown = phone ? (phone.display || phone.tel) : '';
    if (!shown) return;
    try { navigator.clipboard.writeText(phone.tel || shown); } catch (e) {}
    this.setState({ copiedNumber: shown, dirSel: -1 });
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.setState({ copiedNumber: '' }), 2400);
  }

  // Choosing a command puts it in the field with the space already typed, so
  // the next keystroke is the message. Focus goes back to the field: the list
  // is usually walked with the keyboard, and a click should not end there.
  pickCommand(name) {
    this.setState({ input: '/' + name + ' ', cmdSel: -1, dirQuery: '', dirSel: -1 }, () => {
      const field = this.inputRef && this.inputRef.current;
      if (field) field.focus();
    });
  }

  // The same choice, made with the button in the field rather than by typing.
  // It sets a mode rather than writing "/form " into the box, so the reader
  // types their question and nothing else — and the box stays readable.
  pickMode(name) {
    this.setState({ mode: name || '' }, () => {
      const field = this.inputRef && this.inputRef.current;
      if (field) field.focus();
    });
  }

  // Arrow keys move into the list; Enter only takes a number once someone
  // has, so typing a question and pressing Enter still asks it. The command
  // list has the keys first while it is open — it is directly under the
  // cursor, and nothing else can be meant by an arrow key at that moment.
  onInputKey(e) {
    // Escape backs out of the mode, one step at a time: the open list first,
    // then the mode itself. Somebody who chose the wrong one gets out of it
    // without reaching for the mouse.
    // Escape backs out of a mode without reaching for the mouse.
    if (e.key === 'Escape' && this.state.mode) {
      e.preventDefault();
      this.setState({ mode: '' });
      return;
    }
    const commands = matchCommands(this.state.input);
    if (commands.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.setState((st) => ({ cmdSel: (st.cmdSel + 1) % commands.length }));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.setState((st) => ({ cmdSel: (st.cmdSel <= 0 ? commands.length : st.cmdSel) - 1 }));
        return;
      }
      // Tab takes the highlighted command, or the first one when nothing has
      // been highlighted — "/tri" and Tab is the whole interaction.
      if (e.key === 'Tab' || (e.key === 'Enter' && this.state.cmdSel >= 0)) {
        e.preventDefault();
        this.pickCommand(commands[Math.max(0, this.state.cmdSel)].name);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this.setState({ input: '', cmdSel: -1 });
        return;
      }
    }

    const matches = this.directoryRows();
    if (!matches.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.setState((st) => ({ dirSel: (st.dirSel + 1) % matches.length }));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.setState((st) => ({ dirSel: (st.dirSel <= 0 ? matches.length : st.dirSel) - 1 }));
    } else if (e.key === 'Escape') {
      this.setState({ dirClosed: true, dirSel: -1 });
    } else if (e.key === 'Enter' && this.state.dirSel >= 0) {
      e.preventDefault();
      this.copyContact(matches[Math.min(this.state.dirSel, matches.length - 1)].entry);
    }
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

  /* ----------------------- Document attachments ----------------------- *
   * A letter, a referral form, an email saved out of Outlook: dropped
   * onto the page and read into text by /api/attach, then sent up with
   * the question it was dropped with.
   *
   * There is no attach button on purpose. The dock is one field and
   * nothing else, and a button beside it would be pressed once a week;
   * dropping a file on the page is what people already try first. A
   * picture dropped the same way takes the image path instead, since the
   * model can simply look at those.
   *
   * Nothing dropped here is stored. It lives in this component until the
   * question is answered, and goes no further than that one turn.
   * -------------------------------------------------------------------- */

  async addDocuments(files) {
    const room = MAX_DOCUMENTS - this.state.pendingDocs.length;
    const queue = Array.from(files || []).slice(0, Math.max(0, room));
    if (!queue.length) return;

    // Each file gets its row in the dock immediately, reading, so a slow PDF
    // shows as work in progress rather than as nothing having happened.
    const pending = queue.map((f) => ({
      key: 'doc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      name: f.name || 'Document',
      status: 'reading',
      text: '',
      chars: 0,
      truncated: false,
      error: '',
    }));
    this.setState((state) => ({ pendingDocs: state.pendingDocs.concat(pending).slice(0, MAX_DOCUMENTS) }));

    await Promise.all(queue.map(async (file, i) => {
      const key = pending[i].key;
      // Always a functional update: several files land at once, and each
      // finishes whenever its own parse finishes.
      const settle = (patch) => this.setState((state) => ({
        pendingDocs: state.pendingDocs.map((d) => (d.key === key ? { ...d, ...patch } : d)),
      }));
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/attach', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data && data.error ? data.error : 'That file could not be read.');
        settle({ status: 'ready', text: data.text || '', chars: data.chars || 0, truncated: data.truncated === true, name: data.name || pending[i].name });
      } catch (e) {
        settle({ status: 'error', error: String(e.message || e).slice(0, 200) });
      }
    }));
  }

  removePendingDoc(key) {
    this.setState((state) => ({ pendingDocs: state.pendingDocs.filter((d) => d.key !== key) }));
  }

  // A drop anywhere on the page counts. Dragging a file over a page whose drop
  // target is one small strip is how people conclude a feature does not exist.
  onDragEnter(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    this.dragDepth += 1;
    if (!this.state.dragging) this.setState({ dragging: true });
  }

  onDragOver(e) {
    if (!hasFiles(e)) return;
    // Without this the browser opens the file instead, which loses the page.
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'copy'; } catch (err) { /* not all browsers allow setting it */ }
  }

  // Dragging over a child element fires leave on the parent, so the count is
  // what decides — a plain boolean flickers the overlay on every border crossed.
  onDragLeave(e) {
    if (!this.state.dragging) return;
    this.dragDepth = Math.max(0, this.dragDepth - 1);
    if (!this.dragDepth) this.setState({ dragging: false });
  }

  onDrop(e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    this.dragDepth = 0;
    this.setState({ dragging: false });
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (!files.length) return;
    // A picture is something the model can look at; everything else has to be
    // read into text first. Both arrive by the same drop.
    const images = files.filter((f) => /^image\//.test(f.type || ''));
    const docs = files.filter((f) => !/^image\//.test(f.type || ''));
    if (images.length) this.addImages(images);
    if (docs.length) this.addDocuments(docs);
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

  /**
   * THE SCREEN THAT HOLDS THE SEND. See lib/safety/patient-data.mjs.
   *
   * The redactor above this takes out what it can recognise AND remove — a name
   * behind a title, a postcode, a street address. What it cannot do anything
   * about is what it cannot tell apart from ordinary text: an NHS number is ten
   * digits and so is an order number, a date of birth is a date. Those are put
   * to the Super speed model, and a message that has one does not go at all.
   *
   * The text handed over is the REDACTED text — what was about to be posted to
   * /api/agent anyway — so screening a message costs nothing in exposure.
   *
   * Never throws and never blocks on its own account. A network that is away, a
   * screen that is slow, an answer in a shape nobody expected: all of them come
   * back "not blocked", and the message goes exactly as it did before this
   * existed. A guard that fails closed is a guard that shuts the desk down.
   */
  async screen(text) {
    const nothing = { blocked: false, kinds: [], message: '' };
    if (!String(text || '').trim()) return nothing;
    try {
      const res = await fetch('/api/screen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return nothing;
      const data = await res.json();
      if (!data || data.blocked !== true) return nothing;
      // EVERY WORD ON THE BOX IS BUILT HERE, from the fixed list in
      // lib/safety/patient-data.mjs, out of ids the server already validated
      // against that same list. Nothing that arrived over the wire is rendered
      // — which is what makes it impossible for the thing being refused to end
      // up displayed in the refusal.
      const ids = (Array.isArray(data.kinds) ? data.kinds : [])
        .map((id) => String(id || ''))
        .filter((id) => kindLabel(id));
      return {
        blocked: true,
        kinds: ids.map((id) => ({ id, label: kindLabel(id) })),
        message: patientDataMessage(ids),
      };
    } catch (e) {
      return nothing;
    }
  }

  async ask(text) {
    // A second Enter while the first message is still being screened would send
    // the same words twice — once past the screen and once around it.
    if (this.state.screening || this.state.blocked) return;

    // NAMES AND ADDRESSES DO NOT LEAVE THIS MACHINE. The check is local and
    // deterministic (lib/safety/identifiers.mjs) and it runs here, before the
    // request is built, before the message is written to the transcript and
    // before anything is saved: the redacted wording is the only wording that
    // exists from this line on.
    //
    // It redacts rather than refusing to send. Making somebody retype a
    // sentence under time pressure does not get the identifier out of the
    // world, it just gets it typed again somewhere with no check on it. So the
    // message goes, minus the name, with the reader told what was taken.
    //
    // The directory goes in as the allow list: "what is the number for Alison
    // Wade" is a lookup of a colleague the practice has written down, and a
    // check that eats that question is a check that gets ignored.
    const guard = redactIdentifiers((text || '').trim(), { allow: this.state.directory });
    if (guard.changed) {
      notify(identifierWarning(guard.findings), { type: 'warn', duration: 11000 });
    }
    const typed = guard.text;
    // A slash command says which card to render, so the message goes up without
    // it and the template goes up beside it. "/accurx" with nothing after it is
    // a command still being written, not a question — the field keeps it.
    const parsed = parseCommand(typed);
    if (parsed && !parsed.rest) {
      this.setState({ input: '/' + parsed.command.name + ' ', cmdSel: -1 });
      return;
    }
    // A TYPED COMMAND BEATS THE BUTTON. It is the more specific thing the
    // reader just did, and it is what the muscle memory of anyone already
    // using the commands reaches for. The button only decides the kind of
    // answer when nothing was typed to decide it.
    const command = parsed ? parsed.command : (commandByName(this.state.mode) || null);
    const t = parsed ? parsed.rest : typed;
    const images = this.state.pendingImages.map((im) => im.dataUrl);
    // Only documents that finished reading go up. One still being read, or one
    // that could not be read, keeps its row in the dock and is not sent.
    const attachments = this.state.pendingDocs
      .filter((d) => d.status === 'ready' && d.text)
      .map((d) => ({ name: d.name, text: d.text, truncated: d.truncated }));
    if (!t && !images.length && !attachments.length) return;

    // THE SEND IS HELD HERE, and this is the only place in the app where a
    // reader waits on a model with nothing on the screen yet. It runs after the
    // redaction (so it screens what was going to be sent, not what was typed),
    // after the "command still being written" return above (there is nothing to
    // screen in "/triage " on its own), and before a single word reaches the
    // transcript — a message that is refused was never asked, so it must not
    // appear to have been.
    //
    // Only the TYPED message is screened. A dropped document is the reader's
    // own material and is very often a letter about a patient by definition;
    // screening it would refuse /document the one thing /document is for.
    const question = t || (attachments.length
      ? 'Please read the attached ' + (attachments.length === 1 ? 'document' : 'documents') + ' and tell me what to do with it.'
      : 'Please look at the attached image.');
    // Shown as it was typed, command and all: the reader chose the command and
    // the transcript should not quietly drop it.
    // `redacted` is a count, not a copy — see lib/safety/identifiers.mjs. It
    // rides along on the message so the transcript says why the question has a
    // hole in it long after the toast has gone.
    // `askedAs` is the kind of answer this question was sent as, and it is
    // recorded because the button erased the only trace there used to be.
    // "/form knee" typed into the box stays in the reader's own message for
    // ever; choosing Form and typing "knee" leaves "knee", so the one artefact
    // that would explain a confidently wrong answer had been deleted by moving
    // from typing to a button. Empty for an ordinary question, and for a typed
    // command, which still says so itself.
    const askedAs = !parsed && command ? command.label : '';
    const userMsg = { role: 'user', text: typed, images, docNames: attachments.map((a) => a.name), redacted: identifierNote(guard.findings), askedAs };
    // answerKind is filled in from the reply — the server decides whether this
    // message is a how-to answer or a triage of an incoming patient request.
    // The images ride along on the bot message too, so a retry can resend them.
    // The attached documents ride along for the same reason: a retry has to send
    // the letter the question was asked about, or it asks a different question.
    // `steps` and `statusText` are filled in live from the agent's stream: each
    // search it runs appears in the card while it is still working.
    // `commandTemplate` rides along so a retry asks the same way: retrying a
    // /accurx as an ordinary question would answer a different thing.
    const aiMsg = { role: 'bot', kind: 'ai', answerKind: 'answer', question, commandTemplate: command ? command.template : '', images, attachments, status: 'loading', steps: [], statusText: '', intro: '', sections: null, tip: '', message: '', messageCite: null, gaps: '', validation: null, citations: [], contacts: [], cache: null, clarify: null, alerts: [], panel: null };
    const messages = this.state.messages.concat([userMsg, aiMsg]);
    const aiIdx = messages.length - 1;
    // Asking always brings the reader back to the newest question, even if
    // they were reading an earlier one when they asked it.
    // ON SCREEN FIRST, SENT SECOND.
    //
    // The patient-data screen used to be awaited HERE, before this line, so
    // Enter did nothing at all for as long as that call took: the reader watched
    // their own message not appear. The screen is still the last thing before
    // anything leaves the browser — it is the request that waits, not the
    // interface. What they typed is on screen the moment they press Enter, with
    // the loading card under it, and a message the screen refuses is taken back
    // off again below.
    // `mode: ''` is the important one. The kind of answer lasts exactly one
    // message, so the box cannot be left set to the referral-form list by
    // somebody who walked away mid-call.
    this.setState({ messages, input: '', pendingImages: [], pendingDocs: [], activeTurn: null, emitting: true, dirQuery: '', dirSel: -1, cmdSel: -1, mode: '' }, async () => {
      this.save();

      // Only the TYPED message is screened. A dropped document is the reader's
      // own material and is very often a letter about a patient by definition;
      // screening it would refuse /document the one thing /document is for.
      if (t) {
        this.setState({ screening: true });
        const verdict = await this.screen(t);
        this.setState({ screening: false });
        if (verdict.blocked) {
          // Nothing was sent and nothing is kept. The two messages come back
          // off the transcript — a message that was refused was never asked, so
          // it must not be left looking as though it was — and `input` is put
          // back holding what they typed, because the next thing they do is
          // edit it.
          this.setState((state) => ({
            messages: state.messages.slice(0, aiIdx - 1),
            input: typed,
            blocked: verdict,
            emitting: false,
          }), () => this.save());
          return;
        }
      }

      this.fetchAI(question, aiIdx);
    });
    // The emit plays once, then the strip above the dock goes quiet again.
    clearTimeout(this.emitTimer);
    this.emitTimer = setTimeout(() => this.setState({ emitting: false }), 640);
  }

  /* --------------------------- Test answer -------------------------- *
   * "test" plays a stored answer instead of calling the model: the same
   * stream of tool steps, then one answer using every part of the
   * layout. The interface can be worked on all day without a single
   * token being spent. See lib/test-answer.js.
   * ------------------------------------------------------------------ */
  mockAI(idx, general = false) {
    const at = (ms, fn) => { this.mockTimers.push(setTimeout(fn, ms)); };
    let clock = 0;
    // "test general" plays the other kind of turn: a request carried out
    // directly, with nothing looked up and nothing cited.
    const status = general ? TEST_GENERAL_STATUS : TEST_STATUS;
    const steps = general ? TEST_GENERAL_STEPS : TEST_STEPS;
    const answer = general ? TEST_GENERAL_ANSWER : TEST_ANSWER;

    for (const st of status) {
      at(st.at, () => this.onAgentEvent(idx, { type: 'status', text: st.text }));
    }

    for (const step of steps) {
      const startedAt = clock;
      at(startedAt, () => this.onAgentEvent(idx, {
        type: 'tool-start', id: step.id, tool: step.tool, label: step.label, detail: step.detail,
      }));
      clock += step.after;
      at(clock, () => this.onAgentEvent(idx, {
        type: 'tool-result', id: step.id, ok: true, summary: step.summary, items: [],
      }));
    }

    // `kind` stays 'ai' — it decides which card renders this message, and the
    // fixture must not be able to change it.
    at(clock + 700, () => {
      const patch = Object.assign({ status: 'done', answerKind: 'answer', statusText: '' }, answer);
      delete patch.kind;
      this.updateAi(idx, patch);
    });
  }

  // `refresh` is set by Reload on a cached answer: research the question again
  // rather than serving what the server already has stored for it.
  async fetchAI(question, idx, { refresh = false } = {}) {
    if (isTestQuery(question)) { this.mockAI(idx, isGeneralTestQuery(question)); return; }
    // History is the conversation BEFORE this question (idx-1 = the user message
    // we're answering). On the first question this is empty, so the server skips
    // the follow-up query-condensing step — no point enriching a standalone query.
    const history = this.buildHistory(idx - 1);
    const m = this.state.messages[idx];
    const images = (m && m.images) || [];
    const attachments = (m && m.attachments) || [];
    try {
      const data = await askAgent(
        { question, history, customGuides: this.state.customGuides, images, attachments, refresh, template: (m && m.commandTemplate) || '' },
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
      // A question back: the question as asked has more than one documented
      // answer, so the assistant asks which was meant rather than choosing.
      if (data.clarify && data.clarify.question && (data.clarify.options || []).length >= 2) {
        this.updateAi(idx, {
          status: 'done', answerKind: 'answer', statusText: '',
          intro: data.intro || '', keyPoints: [], sections: data.sections || [],
          message: '', messageCite: null, tip: '', gaps: data.gaps || '',
          followUps: [], referralRoute: null, validation: null,
          citations: data.citations || [], contacts: data.contacts || [],
          clarify: data.clarify,
          // A red flag does not wait for the reader to say which of two
          // things they meant, so the bands go out with the question back.
          turnId: data.turnId || '', alerts: data.alerts || [], panel: data.panel || null,
        });
        return;
      }
      // A templated answer carries its content in `template`, not in sections
      // or a message, so it must not be read as an empty one. Without this a
      // perfectly good ECG referral card was declined as needing a clinician.
      if (!data.answerable || (!data.template && !data.sections.length && !data.message)) {
        this.updateAi(idx, { status: 'declined', answerKind: 'answer', intro: data.intro || 'This needs a clinician’s judgement, so I cannot answer it here.', sections: [], message: '', messageCite: null, tip: '', citations: [], contacts: data.contacts || [], turnId: data.turnId || '', alerts: data.alerts || [], panel: data.panel || null });
        return;
      }
      // turnId identifies this answer to the server, so a verdict pressed under
      // it is stored against the answer it was actually about.
      this.updateAi(idx, { status: 'done', answerKind: 'answer', statusText: '', turnId: data.turnId || '', cache: data.cache || null, general: data.general === true, template: data.template || null, intro: data.intro, keyPoints: data.keyPoints || [], sections: data.sections, message: data.message, messageCite: data.messageCite, messageWeb: data.messageWeb || null, tip: data.tip, gaps: data.gaps || '', followUps: data.followUps || [], referralRoute: data.referralRoute || null, validation: data.validation || null, citations: data.citations, contacts: data.contacts || [], alerts: data.alerts || [], panel: data.panel || null });
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

  // One button press, sent and forgotten. The row is replaced by a thank-you
  // immediately rather than waiting for the request: the reader has told us
  // what they think and should not be made to watch a spinner for it, and a
  // failed write costs one row (see /api/feedback).
  sendFeedback(idx, verdict) {
    const m = this.state.messages[idx];
    if (!m || m.feedbackSent) return;
    this.updateAi(idx, { feedbackSent: verdict });
    try {
      fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verdict,
          question: m.question || '',
          turnId: m.turnId || '',
          machineId: machineId(),
          template: m.template ? m.template.title : '',
          answerKind: m.template ? 'template' : 'prose',
        }),
      }).catch(() => {});
    } catch (e) { /* feedback is never worth an error in front of the reader */ }
  }

  // Closing one item on the unresolved items panel.
  //
  // Sent and forgotten, exactly like a verdict, and for a stronger reason: this
  // must not GATE anything. A receptionist who cannot close a panel learns to
  // ignore panels, and an ignored panel is worse than no panel at all — so the
  // row goes off, the item goes green immediately, and nothing waits for it.
  // Recorded per item rather than per panel because the real action is "I have
  // sorted the ramipril", not "I clicked once".
  dismissItem(m, item) {
    if (!m || !item || !m.turnId) return;
    try {
      fetch('/api/questions/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ turnId: m.turnId, itemId: item.id, label: item.label || '' }),
      }).catch(() => {});
    } catch (e) { /* never worth an error in front of somebody at the desk */ }
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
  // The body of an answer. `m.steps` is NOT a fallback for it: this used to
  // rebuild sections out of steps, from a payload shape the server stopped
  // sending long ago, and `steps` now holds the agent's tool activity instead.
  // So an answer with no sections — a templated one, whose content lives in
  // `template` — rendered one section per tool that had run, each of them the
  // string "[object Object]".
  answerSections(m) {
    return m.sections || [];
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
    lines.push('', m.general
      ? 'Written by the assistant for this request; no practice document was used.'
      : 'From the practice’s documents; AI judgement marked where used.');
    try { navigator.clipboard.writeText(lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()); } catch (e) {}
    this.flagCopied(idx);
  }

  // Just the drafted wording, exactly as it stands. A reformatted email or a
  // message to a patient is written to be pasted somewhere else, and pasting it
  // with the rest of the answer wrapped around it is not what anyone wants.
  copyMessage(m, idx) {
    try { navigator.clipboard.writeText(m.message || ''); } catch (e) {}
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
            isCritical: !!sec.critical && sec.basis !== 'judgement' && sec.basis !== 'reasoned',
            isJudgement: sec.basis === 'judgement',
            // The assistant's own working: the practice's material settles this
            // but does not say it outright, so the answer applies what it does
            // say. Shown as reasoning, with the sources it was built on, and
            // never as something the practice wrote down.
            isReasoned: sec.basis === 'reasoned',
            premises: (sec.premises || []).map((p, n) => ({
              key: n,
              label: p.docTitle + (p.location ? ', ' + p.location : ''),
              onOpen: () => self.openViewer(p),
            })),
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
        // Both kinds share the amber block, so the provenance note at the foot
        // of the card covers both: the reader is told once that amber is not
        // the practice's own words.
        const usedJudgement = sections.some((sec) => sec.isJudgement);
        const usedReasoning = sections.some((sec) => sec.isReasoned);
        // This answer was not researched just now — it was given earlier, to
        // this question or to one worded differently, and served from the
        // practice's own cache. Said on the card rather than left to be
        // guessed, with Reload next to it for anyone who wants it done again.
        const cache = m.cache && m.cache.hit ? m.cache : null;
        return {
          isAi: true,
          // A request the assistant carried out itself — formatting, rewriting,
          // drafting — rather than an answer researched from the practice's
          // material. Said once, at the top of the card, because not one line of
          // it is backed by a document.
          isGeneral: !!m.general,
          // Five one-click verdicts under every answer. No typing: someone with
          // a patient at the desk will press a button and will not write a
          // sentence, so the sentence is not asked for.
          feedback: VERDICTS.map((fb) => ({ ...fb, onClick: () => self.sendFeedback(idx, fb.id) })),
          feedbackSent: m.feedbackSent || '',
          feedbackLabel: (VERDICTS.find((fb) => fb.id === m.feedbackSent) || {}).label || '',
          // A templated answer: built from the practice's recorded material by
          // a template rather than written by the model, so the card renders
          // the blocks it produced instead of markdown sections.
          template: m.template || null,
          hasTemplate: !!m.template,
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
          usedReasoning,
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
          hasProvenanceNote: usedJudgement || usedReasoning || usedWeb || dropped > 0 || !!m.general,
          message: m.message || '',
          hasMessage: !!(m.message && m.message.length),
          onCopyMessage: () => self.copyMessage(m, idx),
          copyMessageLabel: this.state.copiedIdx === idx ? 'Copied' : 'Copy',
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
          // A question back to the reader. Tapping an answer asks the original
          // question again with the ambiguity settled, so the history keeps
          // both the question that was too vague and the one that was not.
          clarifyQuestion: m.clarify ? m.clarify.question : '',
          clarifyOptions: (m.clarify ? m.clarify.options : []).map((opt, i) => ({
            key: i,
            label: opt,
            onPick: () => self.ask(m.question + ' — ' + opt),
          })),
          hasClarify: !!(m.clarify && m.clarify.question && m.clarify.options.length),
          // The deterministic bands, above the card. Cards in their own right,
          // rendered by the same view — they are not decoration on the answer,
          // they are statements the answer does not make.
          alerts: (m.alerts || []).map((answer, i) => ({ key: i, answer })),
          hasAlerts: !!(m.alerts && m.alerts.length),
          // Every request the message contained. Tapping an unanswered one
          // asks it on its own, through the same re-ask the clarify options
          // use, so the transcript keeps both the message that asked for five
          // things and the answer to the fifth.
          panel: m.panel || null,
          hasPanel: !!(m.panel && (m.panel.items || []).length > 1),
          onAskItem: (item) => self.ask(item.text || item.label),
          onDismissItem: (item) => self.dismissItem(m, item),
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
        const docs = m.docNames || [];
        groups.push({
          question: m.text || (docs.length ? 'About the attached ' + (docs.length === 1 ? 'document' : 'documents') : 'About the attached image'),
          images: imgs,
          // Image data was stripped to fit localStorage — say so instead.
          imageNote: (!imgs.length && m.imageCount)
            ? m.imageCount + ' image' + (m.imageCount === 1 ? '' : 's') + ' attached'
            : '',
          // The documents this question was asked about, named under it: an
          // answer about a letter has to say which letter.
          docNames: docs,
          // What the local identifier check took out of this question before
          // it was sent, if anything.
          redactedNote: m.redacted || '',
          askedAs: m.askedAs || '',
          idxs: [],
        });
      } else {
        // A reply with no question before it (an older saved chat, say).
        if (!groups.length) groups.push({ question: '', images: [], imageNote: '', docNames: [], idxs: [] });
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

    const dirMatches = this.directoryRows();

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
      // Nothing under the name by default. A line describing what can be asked
      // is read once and then sits there for ever; the field says it better.
      welcome: this.props.welcome != null ? this.props.welcome : '',
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
      // Documents dropped onto the page, listed above the field until the
      // question they belong to is asked.
      pendingDocs: this.state.pendingDocs.map((d) => ({
        key: d.key,
        name: d.name,
        isReading: d.status === 'reading',
        isReady: d.status === 'ready',
        isError: d.status === 'error',
        // "Read, 4k characters" — enough to see it worked, and that a long one
        // was cut short before it was sent.
        note: d.status === 'reading' ? 'Reading…'
          : d.status === 'error' ? d.error
            : docSize(d.chars) + (d.truncated ? ' — only the first part will be used' : ''),
        onRemove: () => self.removePendingDoc(d.key),
      })),
      hasPendingDocs: this.state.pendingDocs.length > 0,
      // How far the dock has grown upward for what is attached, in pixels: a
      // document row is a fixed 62px (its two lines never wrap — see the note's
      // white-space), the image thumbnails are one 74px strip however many
      // there are. The page above the dock uses this to keep out of their way.
      dockAttached: (this.state.pendingDocs.length * 62 + (this.state.pendingImages.length ? 74 : 0)) + 'px',
      isDragging: this.state.dragging,
      onPaste: (e) => self.onPaste(e),
      // The strip above the dock: what is being typed, then the bar that
      // carries it away; and the dock's own light while an answer is worked
      // out, so the wait is visible without a spinner in the reading area.
      emitting: this.state.emitting,
      isGenerating: this.state.messages.some((m) => m.status === 'loading'),
      copiedNumber: this.state.copiedNumber,
      hasCopied: !!this.state.copiedNumber,
      // The practice directory, matched live against the box above the dock.
      directory: dirMatches.map((row, i) => ({
        key: (row.entry.id || row.entry.label) + ':' + i,
        group: row.group,
        // The register's rows carry an address, which is what tells one branch
        // from another; the practice's own carry the area they sit under.
        label: row.entry.label,
        detail: row.group === 'CQC register'
          ? (row.entry.note || '')
          : [row.entry.category, row.entry.note].filter(Boolean).join(' · '),
        number: (phoneParts(row.entry)[0] || {}).display || '',
        isSelected: i === self.state.dirSel,
        onPick: () => self.copyContact(row.entry),
      })).filter((r) => r.number),
      hasDirectory: dirMatches.length > 0,
      directoryCount: dirMatches.length + (dirMatches.length === 1 ? ' match' : ' matches'),
      onInputKey: (e) => self.onInputKey(e),
      // The commands, while a command name is being typed and no longer.
      commands: matchCommands(this.state.input).map((c, i) => ({
        name: c.name,
        summary: c.summary,
        isSelected: i === self.state.cmdSel,
        onPick: () => self.pickCommand(c.name),
      })),
      // The kind of answer, chosen with the button in the field rather than by
      // typing a slash. See app/_components/ModeSwitch.jsx.
      mode: this.state.mode,
      onPickMode: (name) => self.pickMode(name),
      // Anything on screen other than the opening question can be left, and
      // this is how: back to an empty page with nothing asked.
      canReset: this.state.messages.length > 0,
      onReset: () => self.setState({ messages: [], activeTurn: null, view: 'assistant' }, () => self.save()),
      // Sources: the same material, listed rather than searched.
      sourceNotes: this.state.notes,
      sourceContacts: this.state.directory
        .filter((e) => phoneParts(e).length)
        .map((e) => ({
          key: e.id || e.label,
          label: e.label,
          number: (phoneParts(e)[0] || {}).display || '',
          onPick: () => self.copyContact(e),
        })),
      sourceGuides: this.allGuides().map((g) => ({
        key: g.id,
        question: g.question,
        onAsk: () => { self.setView('assistant'); self.askGuide(g); },
      })),
      messages,
      turn: active ? {
        key: activeTurn,
        num: String(activeTurn + 1).padStart(2, '0'),
        question: active.question,
        images: active.images,
        hasImages: active.images.length > 0,
        imageNote: active.imageNote,
        docNames: active.docNames || [],
        hasDocs: !!(active.docNames && active.docNames.length),
        redactedNote: active.redactedNote || '',
        askedAs: active.askedAs || '',
        items: active.idxs.map((i) => messages[i]),
      } : null,
      history: earlier,
      hasHistory: groups.length > 1,
      isViewingHistory: activeTurn !== lastTurn,
      onLatest: () => self.setState({ activeTurn: null }),
      cats: this.cats(),
      // The directory, opened from under the box and closed back onto it.
      contactsOpen: this.state.contactsOpen,
      onOpenContacts: () => self.setState({ contactsOpen: true }),
      onCloseContacts: () => self.setState({ contactsOpen: false }),
      showAdd: this.state.showAdd,
      draft: this.state.draft,
      draftSteps,
      draftError: this.state.draftError,
      // The message that did not go, and the wait while one is being checked.
      // `blocked` carries only kind ids turned into labels — never the words
      // that caused it. See PatientDataModal.
      blocked: this.state.blocked,
      isScreening: this.state.screening,
      onCloseBlocked: () => self.setState({ blocked: null }, () => {
        // Straight back to the field with the message still in it: the whole
        // point of the box is that the next thing to happen is an edit.
        if (self.inputRef.current) self.inputRef.current.focus();
      }),
      viewerOpen: !!this.state.viewer,
      viewer: this.buildViewerVM(),
      onCloseViewer: () => self.closeViewer(),
      onInput: (e) => self.onInput(e.target.value),
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
      // A document is attached by dropping it anywhere on this page. There is
      // no attach button: the dock is one field, and a control beside it would
      // be used once a week. Dropping is what people try first anyway.
      <div className="riva-app-shell"
        onDragEnter={(e) => this.onDragEnter(e)}
        onDragOver={(e) => this.onDragOver(e)}
        onDragLeave={(e) => this.onDragLeave(e)}
        onDrop={(e) => this.onDrop(e)}
        // How far the dock has grown upwards for what is attached to the next
        // question. The dock is fixed to the foot of the screen, so nothing
        // above it can see those rows; this is how the opening screen's
        // heading and the foot of a long answer keep out from under them.
        // Set through the style object rather than s(), which would camel-case
        // the custom property out of existence.
        style={{ ...s('position:relative;display:flex;flex-direction:column;height:100vh;min-height:100vh;background:#f0f4f5;'), '--riva-dock-attached': v.dockAttached }}>

        {/* The opening screen is mostly empty by design, so it is the one
            place a background earns its keep. It goes the moment there is
            an answer to read — nothing decorative sits behind text. */}
        {v.isEmpty && !v.isKb && (
          <div style={s('position:absolute;inset:0;z-index:0;pointer-events:none;animation:rivaHeaderIn .6s ease both;')}>
            <GradientBackground />
          </div>
        )}


        {/* Keyed on the state so the header fades through a change rather
            than being swapped under the reader. */}
        <div key={v.isKb ? 'sources' : (v.isEmpty ? 'empty' : 'answers')} style={s('position:relative;z-index:1;flex:none;animation:rivaHeaderIn .45s ease both;')}>
          <AppHeader v={v} onContacts={v.onOpenContacts} />
        </div>

        {/* The way back to an empty page, at the top left where a back
            control belongs. Shown only when there is something to leave,
            so the opening screen stays clean. */}
        {v.canReset && (
          <div style={s('position:relative;z-index:1;flex:none;padding:0 24px 10px;')}>
            <Hover tag="button" type="button" onClick={v.onReset} className="riva-lift"
              base="display:inline-flex;align-items:center;background:#fff;border:1px solid #d5dee2;border-radius:999px;padding:9px 20px;font:inherit;font-size:14.5px;font-weight:700;color:#005eb8;cursor:pointer;box-shadow:0 1px 2px rgba(33,43,50,.06);"
              hover="border-color:#005eb8;background:#f0f6fb;">
              Back
            </Hover>
          </div>
        )}

        {/* The composer floats over this region, so leave room at the foot of
            the conversation for it (the knowledge base has no composer). */}
        {/* The conversation fades where it meets the header and the dock. */}
        <div id="riva-scroll" className={v.isKb ? 'riva-scroll-fade-top' : 'riva-scroll-fade'}
          style={s('position:relative;z-index:1;flex:1;overflow-y:auto;' + (v.isKb ? '' : 'padding-bottom:calc(var(--riva-dock-h) + 50px + var(--riva-dock-attached));'))}>
          {/* Keyed on the view so switching fades the new one in rather than
              swapping it under the reader. */}
          <div key={v.isKb ? 'sources' : 'chat'} style={s('animation:rivaViewIn .3s cubic-bezier(.2,.7,.3,1) both;')}>
            {v.isKb ? <SourcesView v={v} /> : <ChatView v={v} />}
          </div>
        </div>

        {/* Nothing asked yet: the dock is the page, so it sits in the middle
            of it and drops to the foot once there is an answer to read. */}
        {!v.isKb && (
        <div className={'riva-dock' + (v.isEmpty ? ' riva-dock-center' : '')}>
          <div className="riva-dock-inner">
            {/* The question leaves the field as a bar travelling up to where
                the heading is landing. A copied number takes the same line,
                so nothing else has to move. */}
            {/* The strip carries the bar and the "Copied" line only. The mode
                switch used to sit here too, as a small pill at its own height
                over a dock made of one large one; it is on the dock's own row
                now, beside the field. */}
            <div className="riva-dock-strip" aria-live="polite">
              {v.emitting ? <span className="riva-dock-emit" />
                : v.hasCopied ? <span style={s('font-size:14px;font-weight:600;color:#007f3b;')}>Copied {v.copiedNumber}</span>
                  : null}
            </div>
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
            {/* Documents dropped onto the page, waiting for the question they
                belong to. A row rather than a thumbnail: the name is the only
                part of a letter anybody recognises at a glance, and the note
                beside it says whether it has been read yet. */}
            {v.hasPendingDocs && (
              <div style={s('display:flex;flex-direction:column;gap:8px;margin-bottom:10px;')}>
                {v.pendingDocs.map((d) => (
                  <div key={d.key} style={s('display:flex;align-items:center;gap:11px;background:#fff;border:1px solid ' + (d.isError ? '#f0c2bd' : '#d8dde0') + ';border-radius:12px;padding:10px 12px;box-shadow:0 2px 8px rgba(33,43,50,.08);animation:rivaUp .18s ease;')}>
                    <span style={s('flex:none;display:flex;color:' + (d.isError ? '#d5281b' : '#005eb8') + ';')}>
                      <Svg w={18} sw={2}>{d.isError ? Icons.alertCircle : Icons.file}</Svg>
                    </span>
                    <span style={s('flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;')}>
                      <span style={s('font-size:14.5px;font-weight:600;color:#212b32;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{d.name}</span>
                      {/* One line, always: the row's height is reserved above
                          the dock in pixels, so a note that wrapped would put
                          the dock through whatever is above it. */}
                      <span style={s('font-size:12.5px;color:' + (d.isError ? '#d5281b' : '#4c6272') + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{d.note}</span>
                    </span>
                    {d.isReading && <span style={s('flex:none;width:15px;height:15px;border:2px solid #d8dde0;border-top-color:#005eb8;border-radius:50%;animation:rivaSpin .7s linear infinite;')} />}
                    <Hover tag="button" type="button" onClick={d.onRemove} aria-label={'Remove ' + d.name}
                      base="flex:none;width:26px;height:26px;border-radius:50%;background:#f0f4f5;color:#4c6272;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;"
                      hover="background:#d5281b;color:#fff;">
                      <Svg w={11} sw={2.6}>{Icons.close}</Svg>
                    </Hover>
                  </div>
                ))}
              </div>
            )}

            {/* The field is the whole dock: no send button, no attach
                control. Enter asks; an image can still be pasted into the
                box, which is how it is actually done. */}
            <form className="riva-dock-form" onSubmit={v.onSubmit} style={s('position:relative;display:flex;')}>
              {/* The telephone list hangs off the field — under it on the
                  opening screen, where anything above would cover the
                  heading, and over it once the page has an answer on it.
                  Either way it is out of the flow, so the dock stays put
                  and nothing on the page moves to make room. */}
              <DirectoryPanel v={v} place={v.isEmpty ? 'below' : 'above'} />

              {/* The commands take the same place as the telephone list; only
                  one of the two can be open, because "/" is not a name. */}
              <CommandMenu rows={v.commands} place={v.isEmpty ? 'below' : 'above'} />

              {/* The disc at the left of the field: the search glass, on a
                  background that says it can be pressed, opening the list of
                  modes over the box. It also carries the one moment the field
                  is busy on its own account — the message typed, Enter
                  pressed, and the text being checked for patient details
                  before it goes anywhere (lib/safety/patient-data.mjs) — as a
                  spinner in the glass's place, because a field that looked
                  dead for even half a second would have somebody pressing
                  Enter again. See app/_components/ModeSwitch.jsx. */}
              <ModeSwitch mode={v.mode} onPick={v.onPickMode} busy={v.isScreening} />
              <input ref={this.inputRef} className={'riva-input riva-dock-field riva-dock-field-search' + (v.isGenerating ? ' riva-dock-live' : '')} value={v.input} onChange={v.onInput} onKeyDown={v.onInputKey} onPaste={v.onPaste} aria-busy={v.isScreening ? 'true' : 'false'} placeholder={v.isScreening ? 'Checking for patient details…' : modePlaceholder(v.mode)} aria-label="Ask a question" style={s('flex:1;min-width:0;font:inherit;border:2px solid #d8dde0;border-radius:999px;background:#f0f4f5;outline:none;')} />
              <Hover tag="button" type="submit" className="riva-dock-send" aria-label="Ask" base="position:absolute;right:9px;top:50%;transform:translateY(-50%);width:48px;height:48px;border-radius:50%;background:#005eb8;border:none;display:flex;align-items:center;justify-content:center;cursor:pointer;" hover="background:#003087;">
                <Svg w={21} stroke="#fff" sw={2.4}>{Icons.arrow}</Svg>
              </Hover>
            </form>

            {/* Nothing hangs under the box: the modes live on the disc inside
                the field now, and the directory is reached by typing a name or
                from the header. The room it would take (--riva-dock-extras) is
                zero again. */}

          </div>
        </div>
        )}

        {/* Something is being dragged over the window. The whole page says so,
            because the whole page is the target. */}
        {v.isDragging && (
          <div style={s('position:fixed;inset:0;z-index:70;pointer-events:none;background:rgba(240,244,245,.82);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:24px;animation:rivaHeaderIn .12s ease both;')}>
            <div style={s('display:flex;flex-direction:column;align-items:center;gap:14px;border:2px dashed #005eb8;border-radius:20px;background:#fff;padding:34px 46px;box-shadow:0 18px 50px rgba(33,43,50,.18);text-align:center;')}>
              <span style={s('display:flex;color:#005eb8;')}><Svg w={34} sw={1.8}>{Icons.paperclip}</Svg></span>
              <span style={s('font-size:21px;font-weight:700;letter-spacing:-0.01em;')}>Drop to attach</span>
              <span style={s('font-size:14.5px;color:#4c6272;max-width:34ch;')}>
                PDF, Word, text or a picture. It is read for this question only and is not saved anywhere.
              </span>
            </div>
          </div>
        )}

        {v.viewerOpen && <DocumentViewer v={v} />}

        {v.showAdd && <AddGuideModal v={v} />}
        {v.contactsOpen && <ContactsSheet onClose={v.onCloseContacts} />}
        {/* Above everything, including the guide modal: a message that was
            refused is the only thing on this page that has to be dealt with
            before anything else can happen. */}
        <PatientDataModal v={v} />
      </div>
    );
  }
}

export default function QaApp() {
  return <RiversidePracticeQA />;
}
