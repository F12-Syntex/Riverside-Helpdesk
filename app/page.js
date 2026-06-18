'use client';

import React from 'react';
import { EMIS_KB } from '../lib/emis-knowledge';

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

// Browse-by-area cards (icon + colour scheme per the design).
const BROWSE = [
  { id: 'urgent', label: 'Urgent & emergency', icon: 'triangle', bg: '#f6dedc', color: '#d5281b', border: '#f1c7c2', hoverBorder: '#d5281b' },
  { id: 'started', label: 'Getting started', icon: 'play', bg: '#e8f1f8', color: '#005eb8' },
  { id: 'appointments', label: 'Appointments', icon: 'calendar', bg: '#e8f1f8', color: '#005eb8' },
  { id: 'prescriptions', label: 'Prescriptions', icon: 'pill', bg: '#e3efe6', color: '#007f3b' },
  { id: 'consultations', label: 'Consultations', icon: 'pen', bg: '#e0f3f1', color: '#00a499' },
  { id: 'documents', label: 'Documents', icon: 'file', bg: '#fcefdb', color: '#ed8b00' },
  { id: 'registrations', label: 'Registrations', icon: 'userplus', bg: '#ebe6f1', color: '#330072' },
  { id: 'tasks', label: 'Tasks & messages', icon: 'send', bg: '#e8edee', color: '#4c6272' },
  { id: 'shortcuts', label: 'Shortcuts & templates', icon: 'keyboard', bg: '#ebe6f1', color: '#330072' },
];

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
    };
    this._kb = EMIS_KB || [];
  }

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

  // Turn the curated guides into searchable passages too, so the AI can cite them.
  guideChunks() {
    return this.allGuides().map((g) => {
      const steps = (g.steps || []).map((st, i) => (st.kbd ? st.kbd + ' = ' + st.text : (i + 1) + ') ' + st.text)).join('  ');
      const cards = (g.cards || []).map((c) => c.title + (c.phone ? ' (' + c.phoneLabel + ': ' + c.phone + ')' : '') + ' — ' + (c.body || '')).join('  ');
      return { s: 'Practice guide: ' + g.question, t: g.question + ' ' + (g.keywords || []).join(' '), x: [g.intro, cards, steps, g.tip, g.warning].filter(Boolean).join('  ') };
    });
  }

  // Pick the most relevant passages from the practice guides and PDFs for a question.
  retrieve(query, n) {
    const kb = (this._kb || []).concat(this.guideChunks());
    if (!kb.length) return [];
    const words = (query || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
    if (!words.length) return [];
    const scored = kb.map((c) => {
      const hay = (c.t + ' ' + c.x).toLowerCase();
      let score = 0;
      for (const w of words) { let i = hay.indexOf(w); while (i !== -1) { score++; i = hay.indexOf(w, i + 1); } }
      return { c, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    return scored.slice(0, n || 3).map((x) => x.c);
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

  cats() {
    return [
      { id: 'started', label: 'Getting started' },
      { id: 'appointments', label: 'Appointments' },
      { id: 'prescriptions', label: 'Prescriptions' },
      { id: 'consultations', label: 'Consultations & coding' },
      { id: 'documents', label: 'Documents' },
      { id: 'registrations', label: 'Registrations' },
      { id: 'tasks', label: 'Tasks & messages' },
      { id: 'shortcuts', label: 'Shortcuts & templates' },
      { id: 'urgent', label: 'Urgent & emergency' },
    ];
  }

  seed() {
    return [
      {
        id: 'log-on', category: 'started',
        question: 'How do I log on to EMIS Web?',
        keywords: ['log on', 'logon', 'log in', 'login', 'sign in', 'smartcard', 'smart card', 'password', 'access', 'open emis'],
        intro: 'Log on with your NHS smartcard, or with a username and password.',
        steps: [
          { text: 'Put your NHS smartcard into the card reader before you open EMIS Web.', image: 'assets/emis/p8_1.png' },
          { text: 'When prompted, associate your smartcard and enter your passcode, then select Associate.', image: 'assets/emis/p9_1.png' },
          { text: 'If you are not using a smartcard, type your username, password and your organisation (CDB) number, then select Log on.', img: false },
          { text: 'EMIS Web opens on your homepage.', img: false },
        ],
        tip: 'Never use the system on someone else’s smartcard — your smartcard records who opened each record.',
        warning: null, related: ['homepage', 'find-patient'],
      },
      {
        id: 'homepage', category: 'started',
        question: 'How do I find my way around the homepage?',
        keywords: ['homepage', 'home page', 'navigate', 'navigation', 'screen', 'layout', 'emis button', 'modules', 'around', 'menu'],
        intro: 'The homepage is the first screen you see. It is split into panes you can configure.',
        steps: [
          { text: 'The homepage shows your Quick Launch Menu, the Organisation Notepad and the latest EMIS news.', image: 'assets/emis/p10_1.png' },
          { text: 'Use the Quick Launch Menu on the left to jump to the areas you use most.', img: false },
          { text: 'Select the EMIS button (top left) to reach any module from anywhere in EMIS Web.', image: 'assets/emis/p12_1.png' },
          { text: 'Select Configure Homepage (top right) to add or remove panes.', img: false },
        ],
        tip: 'Function keys are the fastest way to move around — see the function key shortcuts guide.',
        warning: null, related: ['find-patient', 'function-keys'],
      },
      {
        id: 'find-patient', category: 'started',
        question: 'How do I find a patient?',
        keywords: ['find patient', 'find a patient', 'search patient', 'patient find', 'open record', 'lookup', 'select patient', 'search'],
        intro: 'Search for a patient by name, date of birth or NHS number.',
        steps: [
          { text: 'Select the EMIS button, then Find Patient (or press F4).', image: 'assets/emis/p12_1.png' },
          { text: 'Type the patient’s surname, date of birth or NHS number.', img: false },
          { text: 'Check the matches carefully, then select the correct patient to open their record.', image: 'assets/emis/p16_1.png' },
          { text: 'Recently selected patients are listed so you can reopen them quickly.', img: false },
        ],
        tip: null,
        warning: 'Always check name and date of birth before you open or add to a record.',
        related: ['homepage', 'book-appt'],
      },
      {
        id: 'book-appt', category: 'appointments',
        question: 'How do I book an appointment?',
        keywords: ['book', 'appointment', 'booking', 'slot', 'appt', 'schedule'],
        intro: 'Book a patient into a free slot from the appointment book.',
        steps: [
          { text: 'Select the EMIS button, point to Appointments, then Appointment Book.', img: false },
          { text: 'Use the calendar to choose the date, then find the right session and clinician.', image: 'assets/emis/p32_1.png' },
          { text: 'Double-click a free (green) slot.', img: false },
          { text: 'Search for the patient, select them, choose the slot type, then Save.', img: false },
        ],
        tip: 'Green slots are free, amber are booked and red are blocked. Hover over a slot to see its details.',
        warning: null, related: ['cancel-appt', 'find-patient'],
      },
      {
        id: 'cancel-appt', category: 'appointments',
        question: 'How do I cancel or reschedule an appointment?',
        keywords: ['cancel', 'reschedule', 'move', 'delete', 'appointment', 'dna', 'rebook'],
        intro: 'Cancel a booked slot, or move it to a new time.',
        steps: [
          { text: 'Open the Appointment Book and find the booked slot.', image: 'assets/emis/p32_1.png' },
          { text: 'Right-click the slot and choose Cancel Appointment (or Move to reschedule).', img: false },
          { text: 'Enter the reason for cancelling, choose whether to notify the patient, then select Cancel Appointment.', image: 'assets/emis/p40_1.png' },
          { text: 'To reschedule instead, use Move and pick the new slot.', img: false },
        ],
        tip: null,
        warning: 'Always record the correct cancellation reason — it affects DNA reporting.',
        related: ['book-appt'],
      },
      {
        id: 'repeat-rx', category: 'prescriptions',
        question: 'How do I issue a repeat prescription?',
        keywords: ['repeat', 'prescription', 'medication', 'issue', 'reauthorise', 'script', 'rx', 'eps', 'prescribe'],
        intro: 'Issue one or more repeat items from a patient’s medication record.',
        steps: [
          { text: 'Open the patient record, select the EMIS button, point to Care Record, then Medication (or press F9).', img: false },
          { text: 'Select the repeat item or items you want to issue.', img: false },
          { text: 'On the Medication ribbon, select Issue, then choose to print or send by EPS.', image: 'assets/emis/p23_1.png' },
          { text: 'Check the prescriber and pharmacy, then approve.', img: false },
        ],
        tip: 'Use EPS where the patient has a nominated pharmacy — it is faster and safer than printing.',
        warning: null, related: ['add-consultation', 'add-fit-note'],
      },
      {
        id: 'add-consultation', category: 'consultations',
        question: 'How do I add a consultation note?',
        keywords: ['consultation', 'note', 'clinical', 'record', 'write', 'history', 'add', 'encounter'],
        intro: 'Record a new clinical consultation in the patient record.',
        steps: [
          { text: 'Open the patient record, select Add, then Consultation (or press F6).', img: false },
          { text: 'Check the date, consulter and consultation type, then select OK.', img: false },
          { text: 'Type into the relevant fields — history, examination and plan.', img: false },
          { text: 'Add any codes or medication, then select Save on the ribbon.', img: false },
        ],
        tip: 'Free text is searchable, but always add a SNOMED code for anything reportable.',
        warning: null, related: ['add-code', 'use-template'],
      },
      {
        id: 'add-code', category: 'consultations',
        question: 'How do I add a clinical code?',
        keywords: ['code', 'snomed', 'read', 'qof', 'coding', 'diagnosis', 'add code'],
        intro: 'Add a SNOMED code to a consultation for diagnoses, reviews and QOF.',
        steps: [
          { text: 'Within a consultation, select Add, then Code.', img: false },
          { text: 'Type the term (for example, “asthma review”) and pick the matching SNOMED code.', img: false },
          { text: 'Set the date, value or numeric reading if you are prompted.', img: false },
          { text: 'Save the code into the consultation.', img: false },
        ],
        tip: 'If you are completing QOF, use the relevant template — it prompts every code you need.',
        warning: null, related: ['add-consultation', 'use-template'],
      },
      {
        id: 'use-template', category: 'consultations',
        question: 'How do I run a template?',
        keywords: ['template', 'run template', 'templates', 'igs', 'quick', 'data entry', 'form', 'lightning bolt'],
        intro: 'Templates guide you through recording a set of codes for a condition or task.',
        steps: [
          { text: 'Within a consultation, select Run Template (the lightning bolt) at the top of the screen.', img: false },
          { text: 'Search for the template by name, or browse to it — in-house templates sit under IGS.', img: false },
          { text: 'Choose the template; recently used templates are listed for quick access.', img: false },
          { text: 'Complete the fields, then Save into the consultation.', img: false },
        ],
        tip: 'For example, a blood pressure template is at Run Template > IGS > Cardiovascular > Quick Blood Pressure.',
        warning: null, related: ['add-code', 'find-template'],
      },
      {
        id: 'add-fit-note', category: 'consultations',
        question: 'How do I add a fit note (MED3)?',
        keywords: ['fit note', 'med3', 'sick note', 'sicknote', 'fitness for work', 'statement', 'med 3'],
        intro: 'Record and print a fit note from the patient record.',
        steps: [
          { text: 'Open the patient record and start or open a consultation.', img: false },
          { text: 'Select the Add Fit Note button.', img: false },
          { text: 'Complete the fit note details, including the dates and advice.', img: false },
          { text: 'Save and print the fit note for the patient.', img: false },
        ],
        tip: 'For a private sick note, use Procedure > lightning bolt > Private Sicknote instead.',
        warning: null, related: ['use-template'],
      },
      {
        id: 'blood-test', category: 'consultations',
        question: 'How do I request a blood test?',
        keywords: ['blood test', 'blood tests', 'bloods', 'test request', 'ice', 'pathology', 'phlebotomy', 'blood', 'request a test', 'order bloods'],
        intro: 'Request bloods through the online test request (ICE), or with a pathology form.',
        steps: [
          { text: 'Open the patient record and start a consultation.', img: false },
          { text: 'Select Test request, then Online Test Request for ICE.', img: false },
          { text: 'Or, for a paper form, use Document > Create Letter > Pathology Blood (Derby) form.', img: false },
          { text: 'Choose the tests you need, add the clinical details, then send or print.', img: false },
        ],
        tip: 'For urgent blood results, go to Results > lightning bolt > Blood Results, or use the Blood Results template (IGS > Standard).',
        warning: null, related: ['add-consultation', 'find-template'],
      },
      {
        id: 'file-document', category: 'documents',
        question: 'How do I scan and file a document?',
        keywords: ['document', 'scan', 'file', 'letter', 'attach', 'workflow', 'docman', 'filing', 'upload'],
        intro: 'Bring a document into EMIS, attach it to the right patient and file it.',
        steps: [
          { text: 'Select the EMIS button, point to Care Record, then Documents.', img: false },
          { text: 'Use Add on the ribbon to scan or import the document.', image: 'assets/emis/p30_1.png' },
          { text: 'Select the patient, then code the document type and date.', img: false },
          { text: 'Assign it to the right workflow or person, then file it.', img: false },
        ],
        tip: null,
        warning: 'Match the document to the correct patient carefully — check name and date of birth.',
        related: ['send-task'],
      },
      {
        id: 'register-patient', category: 'registrations',
        question: 'How do I register a new patient?',
        keywords: ['register', 'registration', 'new patient', 'gms', 'add patient', 'register patient', 'join'],
        intro: 'Add a new patient and complete their registration.',
        steps: [
          { text: 'Select the EMIS button, point to Registration, then Add patient.', img: true },
          { text: 'Enter the patient’s details — name, date of birth, NHS number and address.', img: true },
          { text: 'Set the registration type (for example, GMS) and the registered GP.', img: false },
          { text: 'Complete the registration and print any forms needed.', img: false },
        ],
        tip: 'Use the NHS number trace to pull through verified demographics and avoid duplicates.',
        warning: null, related: ['book-appt'],
      },
      {
        id: 'send-task', category: 'tasks',
        question: 'How do I send a task or message to a colleague?',
        keywords: ['task', 'message', 'send', 'colleague', 'workflow', 'tasks', 'mailbox', 'action', 'forward', 'screen message'],
        intro: 'Send a task to a colleague or team, linked to a patient if needed.',
        steps: [
          { text: 'Select the EMIS button, point to Workflow, then Tasks.', img: true },
          { text: 'Select New task and choose the recipient or team.', img: true },
          { text: 'Link the patient if the task is about a record, and set a priority.', img: false },
          { text: 'Write a clear, short message, then send.', img: false },
        ],
        tip: 'Link the patient so the recipient can open the record in one click.',
        warning: null, related: ['file-document'],
      },
      {
        id: 'function-keys', category: 'shortcuts',
        question: 'What are the function key shortcuts?',
        keywords: ['function keys', 'f keys', 'fkeys', 'shortcuts', 'keyboard', 'f1', 'f3', 'f5', 'f9', 'hotkeys', 'shortcut'],
        intro: 'Function keys are the fastest way to move around EMIS Web.',
        steps: [
          { kbd: 'F1', text: 'Help in EMIS Web' },
          { kbd: 'F3', text: 'Summary of the patient' },
          { kbd: 'F4', text: 'Find a patient' },
          { kbd: 'F5', text: 'Swap between open patients' },
          { kbd: 'F6', text: 'Consultations' },
          { kbd: 'F8', text: 'Filed work and documents' },
          { kbd: 'F9', text: 'Medication' },
          { kbd: 'F10', text: 'Appointments quick view' },
          { kbd: 'F11', text: 'Investigations and values' },
          { kbd: 'F12', text: 'Macros' },
        ],
        tip: 'Press F1 at any time to open EMIS Web’s own help.',
        warning: null, related: ['consultation-shortcuts'],
      },
      {
        id: 'consultation-shortcuts', category: 'shortcuts',
        question: 'What are the consultation mode shortcuts?',
        keywords: ['consultation shortcuts', 'tab', 'consultation mode', 'quick keys', 'add data', 'shortcut keys', 'fields'],
        intro: 'In a consultation, press TAB then a letter to jump straight to a field.',
        steps: [
          { kbd: 'P', text: 'Problem title' },
          { kbd: 'E', text: 'Examination' },
          { kbd: 'C', text: 'Comment' },
          { kbd: 'A', text: 'Allergy' },
          { kbd: 'L', text: 'Result' },
          { kbd: 'F', text: 'Family history' },
          { kbd: 'S', text: 'Social' },
          { kbd: 'M', text: 'Medication' },
          { kbd: 'O', text: 'Procedure' },
          { kbd: 'U', text: 'Follow-up' },
          { kbd: 'T', text: 'Test request' },
          { kbd: 'R', text: 'Referral' },
          { kbd: 'D', text: 'Document' },
        ],
        tip: 'Press TAB first, then the key — for example TAB then M to add medication.',
        warning: null, related: ['function-keys'],
      },
      {
        id: 'find-template', category: 'shortcuts',
        question: 'Where do I find the template for a task?',
        keywords: ['where', 'find template', 'location', 'template location', 'igs', 'how to get there', 'which template', 'where do i find', 'blood pressure', 'smoking', 'diabetes'],
        intro: 'Most tasks have an in-house (IGS) template. Open Run Template, then browse to the area.',
        steps: [
          { text: 'Blood pressure — Run Template > IGS > Cardiovascular > Quick Blood Pressure.', img: false },
          { text: 'Smoking — Run Template > IGS > Standard > Quick Smoking.', img: false },
          { text: 'Diabetes review — Run Template > IGS > Diabetes > Quick Diabetes.', img: false },
          { text: 'Respiratory (asthma or COPD) — Run Template > IGS > Respiratory > Quick Respiratory.', img: false },
          { text: 'Mental health — Run Template > IGS > Mental Health & Neurology > Quick Mental Health.', img: false },
          { text: 'Recall code — Run Template > IGS > Admin > Recall System.', img: false },
        ],
        tip: 'Can’t see it? Type the condition into the template search, or ask me and I’ll check.',
        warning: null, related: ['use-template', 'alerts'],
      },
      {
        id: 'alerts', category: 'shortcuts',
        question: 'What do the patient alerts mean?',
        keywords: ['alert', 'alerts', 'pop-up', 'popup', 'warning', 'flags', 'patient safety', 'reminders', 'pop ups'],
        intro: 'Alerts pop up to improve patient safety. A lightning bolt in an alert means you can code the action.',
        steps: [
          { text: 'Named GP — reminds you who the patient’s named GP is.', img: false },
          { text: 'Flu jab status — shows if the patient is eligible, has had it, or declined.', img: false },
          { text: 'DNACPR in place — shows if there is a current DNACPR and its date.', img: false },
          { text: 'Safeguarding risk — shows safeguarding codes and whether the patient is currently at risk.', img: false },
          { text: 'QOF diaries — shows if QOF diaries need updating.', img: false },
        ],
        tip: 'Where an alert shows a lightning bolt, select it to code the action — for example coding a flu jab refusal.',
        warning: null, related: ['find-template'],
      },
      {
        id: 'emergency-overview', category: 'urgent',
        question: 'Where do I send a patient in an emergency?',
        keywords: ['emergency', 'a&e', 'ae', 'a and e', 'accident', 'urgent', '999', '111', 'where to send', 'hospital', 'casualty', 'chest pain', 'chest pains', 'heart attack', 'stroke', 'collapse', 'collapsed', 'unconscious', 'not breathing', 'difficulty breathing', 'breathless', 'choking', 'severe bleeding', 'anaphylaxis', 'seizure', 'fitting', 'overdose'],
        intro: 'As reception, your job is to get help fast — not to assess the patient. If it could be life-threatening, call 999 and alert a duty clinician straight away.',
        cards: [
          { level: 'emergency', title: 'Life-threatening emergency', body: 'Call 999 now and alert a duty clinician. Stay with the patient and do not leave them alone.', sub: 'Chest pain, severe bleeding, difficulty breathing, signs of a stroke, collapse, or loss of consciousness.', phone: '999', phoneLabel: 'Call' },
          { level: 'urgent', title: 'Urgent, but not life-threatening', body: 'Ask a clinician for advice, or signpost the patient to NHS 111 or 111 online.', phone: '111', phoneLabel: 'Call' },
          { level: 'info', title: 'Eye emergency', body: 'Signpost to Moorfields Eye Hospital A&E — 24 hours, eye emergencies only. See the eye emergency guide.', phone: '020 7253 3411', phoneLabel: 'A&E / out of hours' },
          { level: 'info', title: 'Dental emergency', body: 'Royal London Dental Hospital — by referral via a dentist or NHS 111. See the dental emergency guide.', phone: '111', phoneLabel: 'Call' },
        ],
        steps: [
          { text: 'Call 999 immediately — do not try to assess or treat the patient yourself.', img: false },
          { text: 'Alert a duty clinician or the practice’s emergency lead straight away.', img: false },
          { text: 'Stay with the patient, keep them calm, and do not leave them alone.', img: false },
          { text: 'Be ready to direct the ambulance crew and clear the way to the patient.', img: false },
        ],
        tip: 'Follow your practice’s emergency protocol. If you are ever unsure and it could be serious, treat it as a 999 emergency.',
        warning: 'You are not expected to give clinical care — your role is to get help quickly and stay with the patient.',
        related: ['eye-emergency', 'dental-emergency'],
      },
      {
        id: 'eye-emergency', category: 'urgent',
        question: 'Where do I send someone with an eye emergency?',
        keywords: ['eye', 'eyes', 'moorfields', 'ophthalmic', 'vision', 'sight', 'eye emergency', 'eye a&e', 'eye casualty', 'eye injury'],
        intro: 'Moorfields Eye Hospital runs a 24-hour eye A&E for eye emergencies only.',
        cards: [
          { level: 'emergency', title: 'Moorfields eye A&E — 24 hours, eye emergencies only', body: 'Moorfields Eye Hospital, 162 City Road, London, EC1V 2PD.', phone: '020 7253 3411', phoneLabel: 'A&E / out of hours' },
          { level: 'info', title: 'Moorfields Direct nurse helpline', body: 'Speak to an ophthalmic nurse for advice. 9am to 9pm Mon to Fri, 9am to 5pm Sat.', phone: '020 7566 2345', phoneLabel: 'Helpline' },
        ],
        steps: [
          { text: 'It is for eye emergencies only — not dry eyes, hay fever, or routine problems.', img: false },
          { text: 'A video consultation service runs 9am to 9pm every day, with no appointment.', img: false },
          { text: 'If the patient is already under another eye hospital, they should contact that hospital first.', img: false },
        ],
        tip: 'Not sure if it is an emergency? The nurse helpline can advise before you send the patient in.',
        warning: 'For a general (non-eye) emergency, call 999 or use the nearest general A&E instead.',
        related: ['emergency-overview', 'dental-emergency'],
      },
      {
        id: 'dental-emergency', category: 'urgent',
        question: 'Where do I send someone with a dental emergency?',
        keywords: ['dental', 'teeth', 'tooth', 'toothache', 'dentist', 'royal london', 'dental emergency', 'dental a&e', 'oral', 'mouth', 'abscess'],
        intro: 'Most urgent dental problems are handled by a dentist or NHS 111 — not a hospital walk-in.',
        cards: [
          { level: 'urgent', title: 'Urgent dental advice', body: 'Call the patient’s own dentist first. If they are closed or the patient is not registered, call NHS 111.', phone: '111', phoneLabel: 'Call' },
          { level: 'info', title: 'Royal London Dental Hospital', body: 'Whitechapel, east London (New Road entrance). Specialist dental and oral care, by referral via a dentist or NHS 111. Not currently a walk-in service.', phone: '020 7377 7000', phoneLabel: 'Switchboard' },
        ],
        steps: [
          { text: 'A knocked-out adult tooth needs a dentist as soon as possible — hold it by the crown and keep it in milk.', img: false },
          { text: 'Never put a baby tooth back in.', img: false },
        ],
        tip: null,
        warning: 'Call 999 or go to A&E if there is difficulty breathing, significant mouth swelling, or swelling affecting the eye or vision.',
        related: ['emergency-overview', 'eye-emergency'],
      },
    ];
  }

  allGuides() {
    return this.seed().concat(this.state.customGuides || []);
  }

  matchGuide(text) {
    const STOP = { 'what': 1, 'when': 1, 'how': 1, 'the': 1, 'and': 1, 'for': 1, 'with': 1, 'where': 1, 'who': 1, 'can': 1, 'should': 1, 'need': 1, 'want': 1, 'ask': 1, 'asks': 1, 'asked': 1, 'please': 1, 'help': 1, 'patient': 1, 'patients': 1, 'someone': 1, 'they': 1, 'them': 1, 'you': 1, 'your': 1, 'this': 1, 'that': 1, 'are': 1, 'does': 1, 'about': 1, 'from': 1 };
    const q = (text || '').toLowerCase();
    const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP[w]);
    let best = null, bestScore = 0;
    for (const g of this.allGuides()) {
      let kwScore = 0, overlap = 0;
      for (const kw of (g.keywords || [])) {
        if (q.indexOf(kw) !== -1) kwScore += (kw.indexOf(' ') !== -1 ? 4 : 2);
      }
      const ql = g.question.toLowerCase();
      for (const w of words) {
        if (ql.indexOf(w) !== -1) overlap += 1;
      }
      const score = kwScore + (overlap >= 2 ? overlap : 0);
      if (score > bestScore) { bestScore = score; best = g; }
    }
    return bestScore >= 2 ? best : null;
  }

  popularIds() { return ['find-patient', 'book-appt', 'repeat-rx', 'function-keys']; }
  quickIds() { return ['log-on', 'find-patient', 'function-keys']; }

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

  // Call the OpenRouter-backed API route and return the model's text.
  async askLLM(prompt) {
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) throw new Error('AI request failed (' + res.status + ')');
    const data = await res.json();
    if (!data || typeof data.text !== 'string') throw new Error('Bad AI response');
    return data.text;
  }

  async fetchAI(question, idx) {
    const passages = this.retrieve(question, 3);
    const context = passages.length
      ? passages.map((p) => '[' + p.s + ']\n' + p.x).join('\n\n')
      : '';
    // Screenshots that came from the retrieved passages — the model may pick
    // the ones that illustrate its answer (validated against this list below).
    const candidateImages = [];
    passages.forEach((p) => (p.img || []).forEach((im) => { if (!candidateImages.includes(im)) candidateImages.push(im); }));
    const history = this.buildHistory(idx);
    let prompt = 'You are the Riverside Practice Q&A assistant, a help tool for RECEPTION and ADMIN staff at an NHS GP practice. '
      + 'The reader is a receptionist, not a clinician. Help with front-desk and administrative tasks: using EMIS Web, booking and cancelling appointments, registrations, documents and scanning, tasks and messages, repeat prescription requests, and knowing who to pass things to. '
      + 'Answer in plain British English in the NHS style: calm, sentence case, no emoji, no marketing words like "simply" or "easy". Address the reader as "you".\n\n'
      + 'IMPORTANT: Do NOT give clinical or medical advice, diagnoses, symptom assessment, or treatment steps — that is a clinician’s job. If a question needs clinical judgement, tell the receptionist to pass it to a clinician (for example the duty doctor). '
      + 'If the message could be a medical emergency (for example chest pain, difficulty breathing, signs of a stroke, severe bleeding, collapse, anaphylaxis or a seizure), the answer must be: call 999 now, alert a duty clinician immediately, and stay with the patient — do not try to assess or treat them.\n\n';
    if (context) {
      prompt += 'Use the following extracts from the practice’s own guides as your main source. Prefer them over general knowledge, point the reader to the relevant guide where one exists, and do not invent menu paths or contact details that are not supported by them:\n"""\n' + context + '\n"""\n\n';
    }
    if (history) {
      prompt += 'Conversation so far (so you can understand follow-up questions):\n"""\n' + history + '\n"""\n\n';
    }
    const catalogue = this.allGuides().map((g) => '- ' + g.id + ': ' + g.question).join('\n');
    prompt += 'Here are the practice’s existing guides. If ONE of them already answers the question, return its id in "guideId" and leave steps and message empty — the full guide (with screenshots) will be shown to the reader instead:\nGUIDES:\n' + catalogue + '\n\n';
    if (candidateImages.length) {
      prompt += 'Screenshots available from the source guides above. If one of them directly illustrates your answer, include its exact filename in the "images" array (you may include up to 3, most relevant first); otherwise use an empty array. Only use filenames from this list:\n'
        + candidateImages.map((im) => '- ' + im).join('\n') + '\n\n';
    }
    prompt += 'The staff member’s latest message is: "' + question + '"\n'
      + 'If it is a follow-up, answer in the context of what was already shown above rather than repeating a whole guide.\n'
      + 'Decide how to respond and return ONLY valid JSON, no markdown fences, with this exact shape:\n'
      + '{"guideId":"id of a guide above or empty string","intro":"one short sentence","steps":["step one","step two"],"message":"wording to send to a patient or colleague, or empty string","tip":"one short tip or empty string","images":["exact filename from the list above, or leave empty"]}\n'
      + 'Rules: use "guideId" when an existing guide fits. Otherwise use "steps" for a how-to (1 to 6 steps), OR use "message" when the reader asks for wording to give or send to a patient or colleague (you may draft routine administrative messages such as appointment or review invitations, but never clinical or medical advice). '
      + 'If you are unsure or it is outside a receptionist’s role, say so in the intro and advise passing it to a clinician or the practice lead.';
    try {
      const raw = await this.askLLM(prompt);
      const data = this.parseAI(raw);
      if (data.guideId && this.allGuides().some((g) => g.id === data.guideId)) {
        const messages = this.state.messages.slice();
        messages[idx] = { role: 'bot', kind: 'answer', guideId: data.guideId, feedback: null };
        this.setState({ messages }, () => this.save());
        return;
      }
      if (!data.steps.length && !data.message) { this.updateAi(idx, { status: 'error' }); return; }
      // Only keep images the model picked from the offered, retrieved set.
      const images = (data.images || []).filter((im) => candidateImages.includes(im)).slice(0, 3);
      this.updateAi(idx, { status: 'done', intro: data.intro, steps: data.steps, message: data.message, tip: data.tip, images });
    } catch (e) {
      this.updateAi(idx, { status: 'error' });
    }
  }

  parseAI(raw) {
    let str = (raw || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    const a = str.indexOf('{'), b = str.lastIndexOf('}');
    if (a !== -1 && b !== -1) str = str.slice(a, b + 1);
    try {
      const o = JSON.parse(str);
      return {
        guideId: typeof o.guideId === 'string' ? o.guideId.trim() : '',
        intro: typeof o.intro === 'string' ? o.intro : '',
        steps: Array.isArray(o.steps) ? o.steps.map((x) => String(x).trim()).filter(Boolean) : [],
        message: typeof o.message === 'string' ? o.message.trim() : '',
        tip: typeof o.tip === 'string' ? o.tip : '',
        images: Array.isArray(o.images) ? o.images.map((x) => String(x).trim()).filter(Boolean) : [],
      };
    } catch (e) {
      const lines = (raw || '').split(/\n+/).map((x) => x.replace(/^[-*\d.\)\s]+/, '').trim()).filter(Boolean);
      return { guideId: '', intro: '', steps: lines.slice(0, 6), message: '', tip: '', images: [] };
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
