'use client';

import React from 'react';
import Link from 'next/link';
import { s, Hover, Svg, Icons } from './ui';

/* ------------------------------------------------------------------ *
 * Sources — everything the assistant reads from, in one tree.
 *
 * Practice documents (the processed RAG corpus), the notebook's own
 * notes, the telephone directory and the written guides. Each branch
 * opens where it can: a document in the source viewer, a note in the
 * notebook, a guide as a question asked here.
 * ------------------------------------------------------------------ */

function Row({ depth = 0, open, hasChildren, icon, label, meta, onClick, tag = 'button', href }) {
  const pad = 12 + depth * 20;
  const extra = tag === Link ? { href } : {};
  return (
    <Hover
      tag={tag}
      {...extra}
      onClick={onClick}
      base={'display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:none;border-radius:8px;padding:8px 12px 8px ' + pad + 'px;font:inherit;color:#212b32;text-decoration:none;cursor:pointer;'}
      hover="background:#e8f1f8;color:#003087;">
      <span style={s('flex:none;width:16px;display:flex;color:#8a99a3;transform:rotate(' + (hasChildren && open ? 90 : 0) + 'deg);transition:transform .15s ease;')}>
        {hasChildren ? <Svg w={14} sw={2.6}>{Icons.chevronRight}</Svg> : null}
      </span>
      {icon && <span style={s('flex:none;display:flex;color:#005eb8;')}><Svg w={15} sw={2}>{icon}</Svg></span>}
      <span style={s('flex:1;min-width:0;font-size:15px;font-weight:' + (depth === 0 ? 700 : 400) + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;')}>{label}</span>
      {meta ? <span style={s('flex:none;font-size:12.5px;color:#8a99a3;')}>{meta}</span> : null}
    </Hover>
  );
}

// The notebook is a real tree, so it is drawn as one.
function NoteBranch({ note, childrenOf, depth, openKeys, toggle }) {
  const kids = childrenOf.get(note.id) || [];
  const key = 'note:' + note.id;
  const open = openKeys.has(key);
  return (
    <div>
      <Row
        depth={depth}
        open={open}
        hasChildren={kids.length > 0}
        icon={kids.length ? Icons.folder : Icons.fileLines}
        label={note.title || 'Untitled note'}
        tag={kids.length ? 'button' : Link}
        href={kids.length ? undefined : '/notebook'}
        onClick={kids.length ? () => toggle(key) : undefined}
      />
      {open && kids.map((k) => (
        <NoteBranch key={k.id} note={k} childrenOf={childrenOf} depth={depth + 1} openKeys={openKeys} toggle={toggle} />
      ))}
    </div>
  );
}

export default function SourcesView({ v }) {
  const [openKeys, setOpenKeys] = React.useState(() => new Set(['docs']));
  const toggle = (key) => setOpenKeys((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const notes = v.sourceNotes || [];
  const childrenOf = new Map();
  for (const n of notes) {
    const parent = n.parentId == null ? null : n.parentId;
    const list = childrenOf.get(parent) || [];
    list.push(n);
    childrenOf.set(parent, list);
  }
  const rootNotes = childrenOf.get(null) || [];

  const section = (key, label, count, children) => (
    <div style={s('background:#fff;border:1px solid #dde4e7;border-radius:14px;padding:6px;')}>
      <Row depth={0} open={openKeys.has(key)} hasChildren label={label} meta={count} onClick={() => toggle(key)} />
      {openKeys.has(key) && <div>{children}</div>}
    </div>
  );

  return (
    <div className="riva-column" style={s('max-width:820px;margin:0 auto;padding:28px 24px 48px;display:flex;flex-direction:column;gap:14px;')}>
      <div>
        <h1 className="riva-hero-h1" style={s('font-size:32px;font-weight:700;letter-spacing:-0.02em;margin:0;')}>Sources</h1>
        <p style={s('font-size:16px;color:#4c6272;margin:10px 0 0;max-width:58ch;text-wrap:pretty;')}>
          Everything an answer can be built from: the practice&rsquo;s own documents, the notebook, the
          telephone directory and the written guides. Nothing else is used.
        </p>
      </div>

      {v.kbStatus === 'loading' && (
        <div style={s('font-size:15px;color:#4c6272;padding:12px 2px;')}>Loading the document index…</div>
      )}

      {section('docs', 'Practice documents', v.kbTotal ? v.kbTotal + ' indexed' : '', (
        (v.kbGroups || []).map((g) => {
          const key = 'doc-group:' + g.key;
          const open = openKeys.has(key);
          return (
            <div key={g.key}>
              <Row depth={1} open={open} hasChildren icon={Icons.folder} label={g.label} meta={g.docs.length} onClick={() => toggle(key)} />
              {open && g.docs.map((d) => (
                <Row key={d.docId} depth={2} icon={Icons.file} label={d.title} meta={d.subtitle}
                  onClick={d.canOpen ? d.onOpen : undefined} />
              ))}
            </div>
          );
        })
      ))}

      {section('notes', 'Notebook notes', notes.length || '', (
        rootNotes.length
          ? rootNotes.map((n) => (
            <NoteBranch key={n.id} note={n} childrenOf={childrenOf} depth={1} openKeys={openKeys} toggle={toggle} />
          ))
          : <div style={s('font-size:14px;color:#8a99a3;padding:8px 12px 8px 32px;')}>No notes written yet.</div>
      ))}

      {section('contacts', 'Telephone directory', (v.sourceContacts || []).length || '', (
        (v.sourceContacts || []).map((c) => (
          <Row key={c.key} depth={1} icon={Icons.phone} label={c.label} meta={c.number} onClick={c.onPick} />
        ))
      ))}

      {section('guides', 'Written guides', (v.sourceGuides || []).length || '', (
        (v.sourceGuides || []).map((g) => (
          <Row key={g.key} depth={1} icon={Icons.book} label={g.question} onClick={g.onAsk} />
        ))
      ))}
    </div>
  );
}
