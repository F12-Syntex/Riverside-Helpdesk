// /notebook/<title>-<id> — one page of the Notebook, by address.
//
// The same notebook, opened on the page the address names; the page reads its
// own pathname (lib/notebook/links.mjs) and keeps it in step as pages are
// opened. /notebook/saves is a static route and still wins over this one.
export { default } from '../page';
