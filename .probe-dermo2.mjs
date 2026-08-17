import { findReferralForms } from './lib/referrals/nel-tree.mjs';
import { levenshtein, tokenize } from './lib/lookup/fuzzy.js';
const qs = ['dermotology','dermotology referral','dermotology form','dermatologist','dermatolgy','dermatology referral form','skin','teledermotology','dermetology','durmatology'];
for (const q of qs) {
  const r = findReferralForms(q);
  const ch = r.matches.map(m=>m.name);
  const el = r.elsewhere.map(m=>m.name);
  console.log(q.padEnd(28), '| CH:', ch.length ? ch.join(' ; ') : '(none)', '| ELSEWHERE:', el.length? el.length+' forms':'(none)');
}
console.log('\nlev dermotology->dermatology', levenshtein('dermotology','dermatology'));
console.log('lev dermotology->teledermatology', levenshtein('dermotology','teledermatology'));
console.log('tokens of a CH form:', tokenize('Non-ISLA Teledermatology Referral Form (Lesions)'));
