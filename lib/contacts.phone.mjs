// A phone number as somebody wrote it, and the number its Call link dials.
//
// The contact form (app/_components/contacts/validate.mjs) takes a number the
// way the practice's sheet writes them: an extension after it ("ext 214",
// "x214", "#214"), a second number or extension after a "/" ("0207 683 4040/
// 4000"), and the "(0)" of "+44 (0)20". The display keeps every bit of that,
// verbatim — it is what a person reads out. The tel: link cannot: joining
// every digit of "0207 683 4040/4000" dials 020768340404000, which is nobody.
// So the link is the first number alone, without its extension or its "(0)",
// which is how the bundled sheet's own tel values were always written.
//
// Pure, so it is tested on its own (test/contacts-phone.test.mjs).

// An extension at the end, however it is written: "ext 214", "ext. 214",
// "extension 214", "x214", "#214". The form's check strips the same thing.
export const EXTENSION = /\s*[,;]?\s*(?:ext(?:ension)?\.?|x|#)\s*\d{1,6}\s*$/i;

/**
 * The digits a tel: link dials for a number as displayed: the first number,
 * a leading "+" kept, everything else that is not a digit dropped.
 */
export function telOf(display) {
  const first = String(display || '')
    .replace(EXTENSION, '')
    .split('/')[0]
    // "+44 (0)20" is +4420: the "(0)" is only ever dialled from inside the UK,
    // where the +44 is not. A "(0)" that opens a UK number is its own 0.
    .replace(/^(\s*(?:\+|00)\s*44)\s*\(0\)/, '$1');
  return first.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
}
