// Convert RTF to plain text with no external dependency. RTF is a flat,
// control-word format; this walks it the same way the well-known `striprtf`
// algorithm does — honouring groups, ignorable destinations (font/colour/style
// tables, pictures, metadata), unicode escapes (\uN with \ucN skip counts) and
// \'hh hex bytes (decoded as Windows-1252) — and emits only the visible text.
// Shared by the .rtf parser and the .doc parser's fallback for RTF mislabelled
// as .doc, which is common in document collections exported from the web.

// Control words whose entire group is non-visible and should be skipped.
const DESTINATIONS = new Set([
  'aftncn', 'aftnsep', 'aftnsepc', 'annotation', 'atnauthor', 'atndate', 'atnicn',
  'atnid', 'atnparent', 'atnref', 'atntime', 'atrfend', 'atrfstart', 'author',
  'background', 'bkmkend', 'bkmkstart', 'blipuid', 'buptim', 'category',
  'colorschememapping', 'colortbl', 'comment', 'company', 'creatim', 'datafield',
  'datastore', 'defchp', 'defpap', 'do', 'doccomm', 'docvar', 'dptxbxtext',
  'ebcend', 'ebcstart', 'factoidname', 'falt', 'fchars', 'ffdeftext', 'ffentrymcr',
  'ffexitmcr', 'ffformat', 'ffhelptext', 'ffl', 'ffname', 'ffstattext', 'field',
  'file', 'filetbl', 'fldinst', 'fldtype', 'fname', 'fontemb', 'fontfile',
  'fonttbl', 'footnote', 'formfield',
  'ftncn', 'ftnsep', 'ftnsepc', 'g', 'generator', 'gridtbl',
  'hl', 'hlfr', 'hlinkbase', 'hlloc', 'hlsrc', 'hsv',
  'htmltag', 'info', 'keycode', 'keywords', 'latentstyles', 'lchars',
  'levelnumbers', 'leveltext', 'lfolevel', 'linkval', 'list', 'listlevel',
  'listname', 'listoverride', 'listoverridetable', 'listpicture', 'liststylename',
  'listtable', 'listtext', 'lsdlockedexcept', 'macc', 'maccPr', 'mailmerge',
  'maln', 'malnScr', 'manager', 'margPr', 'mbar', 'mbarPr', 'mbaseJc', 'mbegChr',
  'mborderBox', 'mborderBoxPr', 'mbox', 'mboxPr', 'mchr', 'mcount', 'mctrlPr',
  'md', 'mdeg', 'mdegHide', 'mden', 'mdiff', 'mdPr', 'me', 'mendChr', 'meqArr',
  'meqArrPr', 'mf', 'mfName', 'mfPr', 'mfunc', 'mfuncPr', 'mgroupChr',
  'mgroupChrPr', 'mgrow', 'mhideBot', 'mhideLeft', 'mhideRight', 'mhideTop',
  'mhtmltag', 'mlim', 'mlimloc', 'mlimlow', 'mlimlowPr', 'mlimupp', 'mlimuppPr',
  'mm', 'mmaddfieldname', 'mmath', 'mmathPict', 'mmathPr', 'mmaxdist', 'mmc',
  'mmcJc', 'mmconnectstr', 'mmconnectstrdata', 'mmcPr', 'mmcs', 'mmdatasource',
  'mmheadersource', 'mmmailsubject', 'mmodso', 'mmodsofilter', 'mmodsofldmpdata',
  'mmodsomappedname', 'mmodsoname', 'mmodsorecipdata', 'mmodsosort', 'mmodsosrc',
  'mmodsotable', 'mmodsoudl', 'mmodsoudldata', 'mmodsouniquetag', 'mmPr', 'mmquery',
  'mmr', 'mnary', 'mnaryPr', 'mnoBreak', 'mnum', 'mobjDist', 'moMath',
  'moMathPara', 'moMathParaPr', 'mopEmu', 'mphant', 'mphantPr', 'mplcHide', 'mpos',
  'mr', 'mrad', 'mradPr', 'mrPr', 'msepChr', 'mshow', 'mshp', 'msPre', 'msPrePr',
  'msSub', 'msSubPr', 'msSubSup', 'msSubSupPr', 'msSup', 'msSupPr', 'mstrikeBLTR',
  'mstrikeH', 'mstrikeTLBR', 'mstrikeV', 'msub', 'msubHide', 'msup', 'msupHide',
  'mtransp', 'mtype', 'mvertJc', 'mvfmf', 'mvfml', 'mvtof', 'mvtol', 'mzeroAsc',
  'mzeroDesc', 'mzeroWid', 'nesttableprops', 'nextfile', 'nonesttables', 'objalias',
  'objclass', 'objdata', 'object', 'objname', 'objsect', 'objtime', 'oldcprops',
  'oldpprops', 'oldsprops', 'oldtprops', 'oleclsid', 'operator', 'panose',
  'password', 'passwordhash', 'pgp', 'pgptbl', 'picprop', 'pict', 'pn', 'pnseclvl',
  'pntext', 'pntxta', 'pntxtb', 'printim', 'private', 'propname', 'protend',
  'protstart', 'protusertbl', 'pxe', 'result', 'revtbl', 'revtim', 'rsidtbl', 'rxe',
  'shp', 'shpgrp', 'shpinst', 'shppict', 'shprslt', 'shptxt', 'sn', 'sp',
  'staticval', 'stylesheet', 'subject', 'sv', 'svb', 'tc', 'template', 'themedata',
  'title', 'txe', 'ud', 'upr', 'userprops', 'wgrffmtfilter', 'windowcaption',
  'writereservation', 'writereservhash', 'xe', 'xform', 'xmlattrname',
  'xmlattrvalue', 'xmlclose', 'xmlname', 'xmlnstbl', 'xmlopen',
]);

// Control words that map to a literal character / whitespace.
const SPECIAL = {
  par: '\n', sect: '\n\n', page: '\n\n', line: '\n', tab: '\t', cell: ' ',
  row: '\n', emdash: '—', endash: '–', emspace: ' ',
  enspace: ' ', qmspace: ' ', bullet: '•', lquote: '‘',
  rquote: '’', ldblquote: '“', rdblquote: '”', nbsp: ' ',
};

// The 0x80–0x9F range where Windows-1252 differs from Latin-1; everything else
// maps straight through. Covers the smart quotes/dashes that dominate UK policy
// documents authored in Word.
const CP1252 = {
  0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„', 0x85: '…',
  0x86: '†', 0x87: '‡', 0x88: 'ˆ', 0x89: '‰', 0x8a: 'Š',
  0x8b: '‹', 0x8c: 'Œ', 0x8e: 'Ž', 0x91: '‘', 0x92: '’',
  0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
  0x98: '˜', 0x99: '™', 0x9a: 'š', 0x9b: '›', 0x9c: 'œ',
  0x9e: 'ž', 0x9f: 'Ÿ',
};

function fromCp1252(byte) {
  return CP1252[byte] || String.fromCharCode(byte);
}

export function looksLikeRtf(buffer) {
  // RTF always starts with "{\rtf", optionally after a UTF-8 BOM (EF BB BF).
  if (Buffer.isBuffer(buffer)) {
    const start = (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) ? 3 : 0;
    return buffer.slice(start, start + 5).toString('latin1') === '{\\rtf';
  }
  return /^﻿?\{\\rtf/.test(String(buffer).slice(0, 8));
}

// Emit a code point only if it is representable — guards against malformed RTF
// (\u with no/huge argument, or unpaired surrogates) crashing the whole run.
function pushCodePoint(out, code) {
  if (!Number.isFinite(code)) return;
  if (code < 0 || code > 0x10ffff) return;
  if (code >= 0xd800 && code <= 0xdfff) return; // lone surrogate
  out.push(String.fromCodePoint(code));
}

export function rtfToText(input) {
  const rtf = Buffer.isBuffer(input) ? input.toString('latin1') : String(input);
  // Branches: \word(arg)?  |  \'hh  |  \<symbol>  |  { or }  |  newline  |  any char
  const token = /\\([a-z]{1,32})(-?\d{1,10})?[ ]?|\\'([0-9a-fA-F]{2})|\\([^a-z])|([{}])|[\r\n]+|(.)/gis;

  const out = [];
  const stack = [];
  let ignorable = false; // inside a non-visible destination
  let ucskip = 1;        // chars to skip after a \u unicode escape
  let curskip = 0;       // remaining skips for the current \u

  let m;
  while ((m = token.exec(rtf)) !== null) {
    const [whole, word, arg, hex, symbol, brace, anyChar] = m;

    if (brace) {
      if (brace === '{') stack.push([ucskip, ignorable, curskip]);
      else { const s = stack.pop(); if (s) { ucskip = s[0]; ignorable = s[1]; curskip = s[2]; } }
    } else if (whole[0] === '\n' || whole[0] === '\r') {
      // Literal newlines in the RTF source are layout, not content — ignore.
    } else if (word) {
      if (DESTINATIONS.has(word)) ignorable = true;
      else if (ignorable) { /* swallow control words inside skipped groups */ }
      // \ucN is 0..3 in practice; clamp so a crafted huge value can't make the
      // next \u silently swallow the rest of the document.
      else if (word === 'uc') ucskip = Math.max(0, Math.min(parseInt(arg, 10) || 0, 100));
      else if (word === 'u') {
        let code = parseInt(arg, 10);
        if (code < 0) code += 0x10000; // RTF signs values above 32767
        pushCodePoint(out, code);
        curskip = ucskip;
      } else if (Object.prototype.hasOwnProperty.call(SPECIAL, word)) {
        out.push(SPECIAL[word]);
      }
    } else if (hex !== undefined) {
      if (curskip > 0) curskip--;
      else if (!ignorable) out.push(fromCp1252(parseInt(hex, 16)));
    } else if (symbol !== undefined) {
      // Control symbols: \\ \{ \} are literals; \* marks an ignorable group.
      if (symbol === '*') ignorable = true;
      else if (symbol === '~') out.push(' ');
      else if (symbol === '_') out.push('-');
      else if (symbol === '-') { /* optional hyphen — drop */ }
      else if (symbol === '\\' || symbol === '{' || symbol === '}') {
        if (curskip > 0) curskip--;
        else if (!ignorable) out.push(symbol);
      }
    } else if (anyChar !== undefined) {
      if (curskip > 0) curskip--;
      else if (!ignorable) out.push(anyChar);
    }
  }

  // Tidy: collapse runs of blank lines and trailing spaces the markup leaves.
  return out.join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
