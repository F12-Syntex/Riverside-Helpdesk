// Line-level diff (LCS): ' ' unchanged, '-' removed, '+' added. Notes are
// small, so the quadratic table is fine. Lifted out of app/notebook/page.js
// so the side-by-side review can use the same one.

export function lineDiff(a, b) {
  const A = String(a ?? '').split('\n'), B = String(b ?? '').split('\n');
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: ' ', s: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ t: '-', s: A[i] }); i++; }
    else { out.push({ t: '+', s: B[j] }); j++; }
  }
  while (i < n) out.push({ t: '-', s: A[i++] });
  while (j < m) out.push({ t: '+', s: B[j++] });
  return out;
}

/**
 * The unified diff zipped into side-by-side rows: a run of removed lines is
 * paired with the run of added lines that follows it, so the reader sees the
 * old sentence beside the new one rather than above it.
 * @returns {Array<{left:string|null, right:string|null, kind:'same'|'changed'|'removed'|'added'}>}
 */
export function splitRows(diff) {
  const rows = [];
  let i = 0;
  while (i < diff.length) {
    if (diff[i].t === ' ') { rows.push({ left: diff[i].s, right: diff[i].s, kind: 'same' }); i++; continue; }
    const minus = [];
    const plus = [];
    while (i < diff.length && diff[i].t === '-') minus.push(diff[i++].s);
    while (i < diff.length && diff[i].t === '+') plus.push(diff[i++].s);
    const n = Math.max(minus.length, plus.length);
    for (let k = 0; k < n; k++) {
      const left = k < minus.length ? minus[k] : null;
      const right = k < plus.length ? plus[k] : null;
      rows.push({ left, right, kind: left != null && right != null ? 'changed' : left != null ? 'removed' : 'added' });
    }
  }
  return rows;
}
