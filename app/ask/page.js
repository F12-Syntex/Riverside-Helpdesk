'use client';

import QaApp from '../_components/QaApp';

/* ------------------------------------------------------------------ *
 * The practice Q&A. It was the front door until referrals — half of
 * everything typed into it — got a page of their own at "/", which
 * hands over here, with what was typed, when a referral is not what
 * the reader needs: /ask?q=… fills the box and leaves sending to them.
 * /helpbot still answers as the old address.
 * ------------------------------------------------------------------ */

export default function AskPage() {
  return <QaApp />;
}
