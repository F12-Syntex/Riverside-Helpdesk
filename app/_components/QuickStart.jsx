'use client';

import React from 'react';
import { motion } from 'motion/react';
import { Svg, Icons } from './ui';
import { MODES } from '../../lib/commands.mjs';
import { EASE } from './chat/motion.mjs';

/* ------------------------------------------------------------------ *
 * The jobs people come to do, under the field on the opening screen.
 *
 * The page was one heading and one box, which is calm and tells a new
 * starter nothing: that a pasted AccurX message can be routed, that a
 * medication screenshot can be formatted, that a number is one word away.
 * Those were all behind the pill in the field, where nobody looks until
 * somebody shows them. These tiles show them.
 *
 * A TILE ARMS A MODE; IT NEVER ASKS. Choosing AccurX puts the field into
 * AccurX and hands the cursor back to it, exactly as the pill does — the
 * message still has to be pasted. Contacts opens the directory sheet, and
 * the Notebook is a link to it.
 *
 * Out of the flow (absolute, under the field), so the opening screen's
 * geometry — worked out from the field and the heading alone — is not
 * moved by them. The first question takes them away with the heading.
 * Not on a phone: the field sits at the foot of the screen there, and the
 * pill and the suggestions are the way in.
 * ------------------------------------------------------------------ */

const TILE_MODES = ['accurx', 'consultation', 'medication', 'form'];

export default function QuickStart({ onPickMode, onOpenContacts }) {
  const tiles = TILE_MODES
    .map((name) => MODES.find((m) => m.name === name))
    .filter(Boolean)
    .map((m) => ({ key: m.name, label: m.label, sub: m.summary, icon: m.icon, onClick: () => onPickMode(m.name) }))
    .concat([
      { key: 'contacts', label: 'Phone numbers', sub: 'Every contact we hold', icon: 'phone', onClick: onOpenContacts },
      { key: 'notebook', label: 'The Notebook', sub: 'What the practice has written down', icon: 'book', href: '/notebook' },
    ]);

  return (
    <motion.nav className="riva-quick" aria-label="Start with a task"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.4, ease: EASE, delay: 0.15 }}>
      <div className="riva-quick__head">Or start with a task</div>
      <div className="riva-quick__grid">
        {tiles.map((t) => {
          const inner = (
            <>
              <span className="riva-quick__ico" aria-hidden="true"><Svg w={17} sw={2.1}>{Icons[t.icon] || Icons.sparkle}</Svg></span>
              <span className="riva-quick__text">
                <span className="riva-quick__label">{t.label}</span>
                <span className="riva-quick__sub">{t.sub}</span>
              </span>
            </>
          );
          return t.href
            ? <a key={t.key} className="riva-quick__tile" href={t.href}>{inner}</a>
            : <button key={t.key} type="button" className="riva-quick__tile" onClick={t.onClick}>{inner}</button>;
        })}
      </div>
      <div className="riva-quick__keys" aria-hidden="true">
        <span><kbd>/</kbd> anywhere to type</span>
        <span><kbd>Esc</kbd> leaves a mode</span>
      </div>
    </motion.nav>
  );
}
