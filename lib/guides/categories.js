// Static taxonomy for the practice guides. Plain data, importable from both
// the client (UI) and the server (API route), so neither owns the source of truth.

// The areas a guide can belong to. Order is the display order. `desc` is shown
// on the "Browse by area" cards on the welcome screen.
export const CATEGORIES = [
  { id: 'started', label: 'Getting started', desc: 'Logging on, finding your way around and finding a patient.' },
  { id: 'appointments', label: 'Appointments', desc: 'Booking, changing and cancelling appointments on the front desk.' },
  { id: 'prescriptions', label: 'Prescriptions', desc: 'Repeat prescriptions and prescription queries.' },
  { id: 'consultations', label: 'Consultations and coding', desc: 'Adding consultations, codes and notes to a record.' },
  { id: 'documents', label: 'Documents', desc: 'Scanning, attaching and finding letters and documents.' },
  { id: 'registrations', label: 'Registrations', desc: 'Registering new patients and updating their details.' },
  { id: 'tasks', label: 'Tasks and messages', desc: 'Sending and managing tasks and workflow messages.' },
  { id: 'shortcuts', label: 'Shortcuts and templates', desc: 'Handy shortcuts and templates to save time.' },
  { id: 'urgent', label: 'Urgent and emergency', desc: 'What to do at the desk when something cannot wait.' },
];

// "Browse by area" cards on the welcome screen (icon + colour scheme per area).
export const BROWSE_AREAS = [
  { id: 'urgent', label: 'Urgent and emergency', icon: 'triangle', bg: '#1c1c1f', color: '#ff7b72', border: '#252528', hoverBorder: '#ff7b72' },
  { id: 'started', label: 'Getting started', icon: 'play', bg: '#221a1a', color: '#e0554f' },
  { id: 'appointments', label: 'Appointments', icon: 'calendar', bg: '#221a1a', color: '#e0554f' },
  { id: 'prescriptions', label: 'Prescriptions', icon: 'pill', bg: '#1c1c1f', color: '#56c98a' },
  { id: 'consultations', label: 'Consultations', icon: 'pen', bg: '#1b1b1e', color: '#4fd1c5' },
  { id: 'documents', label: 'Documents', icon: 'file', bg: '#1a1a1d', color: '#ecb851' },
  { id: 'registrations', label: 'Registrations', icon: 'userplus', bg: '#1a1a1d', color: '#a881eb' },
  { id: 'tasks', label: 'Tasks and messages', icon: 'send', bg: '#1b1b1d', color: '#9a9aa3' },
  { id: 'shortcuts', label: 'Shortcuts and templates', icon: 'keyboard', bg: '#1a1a1d', color: '#a881eb' },
];

// Curated entry points for the welcome screen / quick-try chips.
export const POPULAR_IDS = ['find-patient', 'book-appt', 'repeat-rx', 'function-keys'];
export const QUICK_IDS = ['log-on', 'find-patient', 'function-keys'];
