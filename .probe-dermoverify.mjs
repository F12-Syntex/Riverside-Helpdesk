import { findReferralForms } from './lib/referrals/nel-tree.mjs';
for (const q of ['dermotology', 'dermatology']) {
  const r = findReferralForms(q);
  console.log('=== QUERY:', JSON.stringify(q));
  console.log('confident:', r.confident);
  console.log('matches:', r.matches.map(m => `${m.score} | ${m.name} | areas=${(m.areas||[]).join(',')} | cat=${m.category}`));
  console.log('elsewhere:', r.elsewhere.map(m => `${m.score} | ${m.name} | areas=${(m.areas||[]).join(',')} | cat=${m.category}`));
  console.log();
}
