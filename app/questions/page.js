'use client';

// /questions — what the assistant can be asked.
//
// This replaced the Notebook shortcut on the home page, and the swap is the
// point: the people on that page are asking questions, not writing them. The
// thing they cannot tell from a search box is what it is any good at, and a
// question they can see is a question they will ask.
//
// Every entry is tappable and asks it for real, so the index is a way in rather
// than a document about the assistant.
import Link from 'next/link';
import { s, Hover, Svg, Icons } from '../_components/ui';
import AppHeader from '../_components/AppHeader';
import { TEMPLATES, TEMPLATE_GROUPS } from '../../lib/templates/library.mjs';
import { REFERRAL_SERVICES } from '../../lib/templates/referrals.mjs';

// Asking from here goes through the ordinary chat, which reads ?ask= on load.
const askHref = (q) => '/?ask=' + encodeURIComponent(q);

function Ask({ question, sub }) {
  return (
    <Hover tag={Link} href={askHref(question)} className="riva-lift"
      base="display:flex;align-items:center;gap:11px;background:#fff;border:1px solid #dde4e7;border-radius:10px;padding:11px 14px;text-decoration:none;color:#212b32;"
      hover="border-color:#005eb8;background:#f7fbff;">
      <Svg w={16} sw={2.2} style={s('flex:none;color:#005eb8;')}>{Icons.arrow}</Svg>
      <span style={s('flex:1;min-width:0;')}>
        <span style={s('display:block;font-size:15.5px;font-weight:600;')}>{question}</span>
        {sub && <span style={s('display:block;margin-top:1px;font-size:13px;color:#768692;')}>{sub}</span>}
      </span>
    </Hover>
  );
}

export default function Page() {
  const emailed = REFERRAL_SERVICES.filter((r) => r.route === 'email');
  const ers = REFERRAL_SERVICES.filter((r) => r.route !== 'email');

  return (
    <div style={s('min-height:100vh;background:#f0f4f5;display:flex;flex-direction:column;')}>
      <AppHeader subtitle="Question index" />

      <main style={s('flex:1;width:100%;max-width:820px;margin:0 auto;padding:36px 24px 64px;')}>
        <Hover tag={Link} href="/" base="display:inline-flex;align-items:center;gap:7px;background:#fff;border:1px solid #d5dee2;border-radius:999px;padding:6px 14px;font-size:14px;font-weight:600;color:#005eb8;text-decoration:none;margin-bottom:20px;" hover="border-color:#005eb8;background:#f7fbff;">
          <Svg w={15} sw={2.4}>{Icons.arrowLeft}</Svg>Back
        </Hover>

        <h1 style={s('font-size:32px;margin:0 0 6px;letter-spacing:-0.02em;')}>What you can ask</h1>
        <p style={s('font-size:17px;line-height:1.55;color:#4c6272;margin:0 0 30px;max-width:60ch;')}>
          Tap any question to ask it. Anything not listed here still works — it is just answered
          from general knowledge rather than from what the practice has written down.
        </p>

        {TEMPLATE_GROUPS.filter((g) => g !== 'Fallback').map((group) => (
          <section key={group} style={s('margin:0 0 30px;')}>
            <h2 style={s('font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4c6272;margin:0 0 11px;')}>{group}</h2>
            <div style={s('display:flex;flex-direction:column;gap:8px;')}>
              {TEMPLATES.filter((t) => t.group === group).map((t) => (
                <Ask key={t.id} question={t.sample} sub={t.label} />
              ))}
            </div>
          </section>
        ))}

        {/* The referrals are listed in full because they are the largest thing
            the assistant knows and the least guessable: nobody can tell from a
            search box that "Hackney ARC" is one of them and "vascular" is not. */}
        <section style={s('margin:0 0 30px;')}>
          <h2 style={s('font-size:13px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#4c6272;margin:0 0 4px;')}>
            Every referral it knows
          </h2>
          <p style={s('font-size:14.5px;color:#768692;margin:0 0 12px;')}>
            {ers.length} sent on e-RS, {emailed.length} sent by email. Ask about any other and it says so rather than guessing.
          </p>
          <div style={s('display:flex;flex-direction:column;gap:8px;')}>
            {REFERRAL_SERVICES.map((r) => (
              <Ask key={r.name} question={`How do I refer for ${r.name}?`} sub={r.route === 'email' ? 'By email' : 'On e-RS'} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
