import { nelReferralFormAnswer } from './lib/templates/referrals.mjs';
import { renderSelection } from './lib/templates/route.mjs';
for (const q of ['dermotology','dermatology']) {
  const card = nelReferralFormAnswer(q);
  console.log('===', q, '===');
  console.log(JSON.stringify(card, null, 2).slice(0, 3000));
}
