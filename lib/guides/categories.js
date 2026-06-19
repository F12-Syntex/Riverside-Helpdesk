// Static taxonomy for the practice guides. Plain data, importable from both
// the client (UI) and the server (API route), so neither owns the source of truth.

// The areas a guide can belong to. Order is the display order.
export const CATEGORIES = [
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

// "Browse by area" cards on the welcome screen (icon + colour scheme per area).
export const BROWSE_AREAS = [
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

// Curated entry points for the welcome screen / quick-try chips.
export const POPULAR_IDS = ['find-patient', 'book-appt', 'repeat-rx', 'function-keys'];
export const QUICK_IDS = ['log-on', 'find-patient', 'function-keys'];
