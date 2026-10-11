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
