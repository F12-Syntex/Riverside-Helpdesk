// Names and addresses, stopped at the keyboard.
//
// A receptionist asks this assistant how to do things: how to code a letter,
// who to send a two-week-wait to, what the number for colposcopy is. None of
// those questions need a patient's name, and none of them need an address. But
// the message is typed in a hurry, next to the record that is open on the other
// screen, and what comes out is "Mrs Doreen Whitfield at 12 Acacia Road wants
// her results" — because that is how the job is described out loud.
//
// SO THE IDENTIFIER IS REMOVED BEFORE THE MESSAGE GOES ANYWHERE, AND THE READER
// IS TOLD IT HAPPENED. Not blocked: blocking the send makes somebody retype a
// sentence under time pressure, and the second attempt is the one that gets
// pasted somewhere worse. The words come out, the message goes on, the warning
// says what was taken and why.
//
// EVERYTHING HERE IS LOCAL. Regex, a word list and a token scan — no model, no
// network, nothing awaited. It runs in the browser before the request is made,
// so an identifier that fires these rules never leaves the machine it was typed
// on; it runs again on the server so an API call made any other way is held to
// the same rule. It is the mitigation the DPIA lists against "identifiers left
// in text pasted into the reception helpers" (lib/dpia.js).
//
// FINDINGS NEVER CARRY THE IDENTIFIER. A finding is a rule id, a kind and a
// pair of offsets. There is deliberately no `match` or `span` field of the sort
// the other scanners in this folder return, because a finding is the thing that
// gets counted, logged and passed around — and a redaction whose own report
// quotes what it redacted has not redacted anything.
//
// IT ERRS TOWARD LEAVING TEXT ALONE, WHICH IS THE OPPOSITE OF ./confidentiality.
// That module refuses a request; the cost of it firing wrongly is one
// conversation. This one edits the reader's words, and the cost of it firing
// wrongly is that "Dr Ahmed" or "Alison Wade in the community matron team"
// comes out as a hole and the answer is about nothing. A redactor that mangles
// ordinary questions gets switched off — or worse, gets worked around — and
// then it protects nobody. So:
//
//   • clinician titles are not patient titles. "Dr", "Nurse", "Matron" and the
//     rest name a colleague, and a name behind one of them is left alone;
//   • a name from the practice directory is a contact, not a patient;
//   • a bare first name is never redacted. Half the directory is on first-name
//     terms and "Kay is on leave" is a rota question;
//   • a forename has to be capitalised as typed before it is read as a name.
//     "mrs smith" is still caught — the title is the evidence there, not the
//     casing.

/** What replaces what, and the only strings this module ever writes. */
export const REDACTIONS = {
  name: '[name removed]',
  address: '[address removed]',
};

/* ------------------------------------------------------------ word lists */

// Titles that belong to a patient. Dr, Professor, Nurse and Matron are NOT on
// this list and must not be added to it: they precede a colleague's name, and
// "which days is Dr Ahmed in" is the ordinary business of this application.
//
// "Miss" and "Master" are ordinary English words as well as titles — a miss is
// what a pattern does to a paraphrase, and a master copy is a document — so
// those two are read as titles only when they are capitalised. The rest have no
// other meaning and are taken however they were typed.
const PATIENT_TITLE = '(?:[Mm]r|[Mm]rs|[Mm]s|[Mm]x|Miss|Master)';

// A name sitting behind one of these is somebody's colleague. Written out in
// full rather than matched loosely, because it is the whole reason a rota
// question still works.
const ROLE = '(?:dr|doctor|prof|professor|nurse|sister|matron|midwife|hca'
  + '|pharmacist|physio(?:therapist)?|consultant|surgeon|registrar|locum'
  + '|secretary|receptionist|manager|gp|paramedic|health visitor|social worker'
  + '|therapist|counsellor|optician|dentist|podiatrist|dietitian|phlebotomist'
  + '|practitioner|safeguarding|admin(?:istrator)?)';

// A capitalised word that is not a surname. Sentence openers, the days and
// months, and the nouns this practice writes with a capital every day — a
// surname rule without this list turns "Patient Access" and "Kind Regards"
// into redactions within the first afternoon.
const NOT_A_NAME = new Set([
  'the', 'this', 'that', 'these', 'those', 'there', 'here', 'she', 'he', 'they',
  'her', 'him', 'his', 'their', 'my', 'our', 'your', 'we', 'you', 'it', 'its',
  'and', 'but', 'if', 'when', 'then', 'also', 'so', 'because', 'while', 'about',
  'please', 'thanks', 'thank', 'dear', 'hi', 'hello', 'regards', 'kind', 'best',
  'can', 'could', 'would', 'should', 'will', 'shall', 'may', 'might', 'must',
  'does', 'did', 'do', 'has', 'have', 'had', 'is', 'are', 'was', 'were', 'been',
  'not', 'no', 'yes', 'sorry', 'just', 'only', 'both', 'all', 'any', 'some',
  'each', 'every', 'from', 'with', 'for', 'into', 'onto', 'over', 'under',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'nhs', 'gp', 'gps', 'practice', 'surgery', 'hospital', 'clinic', 'ward',
  'doctor', 'doctors', 'nurse', 'nurses', 'reception', 'receptionist', 'staff',
  'patient', 'patients', 'access', 'online', 'record', 'records', 'referral',
  'referrals', 'appointment', 'appointments', 'prescription', 'prescriptions',
  'repeat', 'letter', 'letters', 'form', 'forms', 'note', 'notes', 'result',
  'results', 'test', 'tests', 'scan', 'blood', 'bloods', 'pharmacy', 'chemist',
  'emis', 'docman', 'accurx', 'econsult', 'word', 'excel', 'outlook', 'teams',
  'office', 'windows', 'helpdesk', 'assistant', 'app', 'application', 'system',
  'london', 'riverside', 'health', 'care', 'centre',
  'center', 'trust', 'team', 'service', 'services', 'department', 'number',
  'phone', 'telephone', 'email', 'address', 'triage', 'urgent', 'routine',
  'road', 'street', 'avenue', 'lane', 'close', 'drive', 'court', 'way', 'place',
  'terrace', 'gardens', 'grove', 'hill', 'park', 'row', 'square', 'walk',
  'rise', 'view', 'mews', 'green', 'house', 'flat',
]);

// Common British forenames, as a first token only. Deliberately WITHOUT the
// homographs — may, june, april, august, bill, will, mark, grace, frank, rose,
// hope, faith, joy, dawn, art, guy, don, sue, pat, ray, rich, summer, angel,
// sky, drew, chase — because each of those is an ordinary word first and a
// forename second, and a rule that eats "will call", "mark as urgent" or "may
// need a review" is a rule that gets turned off. Somebody genuinely called
// Grace Fielding is caught by the titled and labelled rules instead.
const FORENAMES = new Set([
  'aaron', 'abdul', 'abigail', 'adam', 'adele', 'adrian', 'agnes', 'ahmed',
  'aidan', 'aisha', 'alan', 'albert', 'alex', 'alexander', 'alexandra', 'alfie',
  'alfred', 'ali', 'alice', 'alison', 'alistair', 'amanda', 'amber', 'amelia',
  'amy', 'andrea', 'andrew', 'angela', 'anita', 'ann', 'anna', 'anne',
  'annette', 'annie', 'anthony', 'antonia', 'antony', 'archie', 'arnold',
  'arthur', 'ashley', 'audrey', 'barbara', 'barry', 'beatrice', 'belinda',
  'ben', 'benjamin', 'bernard', 'bethany', 'beverley', 'bradley', 'brandon',
  'brian', 'bridget', 'bryan', 'callum', 'calum', 'cameron', 'camilla', 'carl',
  'carol', 'caroline', 'carolyn', 'catherine', 'cathy', 'charles', 'charlie',
  'charlotte', 'chelsea', 'cheryl', 'chloe', 'chris', 'christian', 'christina',
  'christine', 'christopher', 'claire', 'clara', 'clare', 'claudia', 'clive',
  'colin', 'colette', 'connor', 'conor', 'constance', 'craig', 'curtis',
  'cynthia', 'cyril', 'daisy', 'daniel', 'danielle', 'danny', 'daphne',
  'darren', 'dave', 'david', 'dean', 'debbie', 'deborah', 'debra', 'declan',
  'deirdre', 'denise', 'dennis', 'derek', 'desmond', 'diana', 'diane',
  'dominic', 'donna', 'doreen', 'doris', 'dorothy', 'douglas', 'duncan',
  'dylan', 'eddie', 'edith', 'edward', 'edwin', 'eileen', 'elaine', 'eleanor',
  'elena', 'elizabeth', 'ella', 'ellen', 'ellie', 'elliot', 'elliott', 'elsie',
  'emily', 'emma', 'eric', 'erica', 'ernest', 'esther', 'ethan', 'ethel',
  'eugene', 'eva', 'evelyn', 'ewan', 'fatima', 'felicity', 'felix', 'fergus',
  'finlay', 'finley', 'fiona', 'florence', 'frances', 'francesca', 'francis',
  'freda', 'freddie', 'frederick', 'gabriel', 'gareth', 'garry', 'gary',
  'gavin', 'gemma', 'geoffrey', 'george', 'georgia', 'georgina', 'gerald',
  'geraldine', 'gerard', 'gilbert', 'gillian', 'gina', 'gladys', 'glenys',
  'gloria', 'godfrey', 'gordon', 'graeme', 'graham', 'grant', 'gregory',
  'gwen', 'gwendoline', 'hannah', 'harold', 'harriet', 'harrison', 'harry',
  'harvey', 'hayley', 'hazel', 'heather', 'hector', 'heidi', 'helen', 'helena',
  'henrietta', 'henry', 'herbert', 'hilary', 'hilda', 'holly', 'howard',
  'hugh', 'hugo', 'ian', 'ida', 'imogen', 'ingrid', 'irene', 'iris', 'isaac',
  'isabel', 'isabella', 'isla', 'ivan', 'ivy', 'jack', 'jacob', 'jacqueline',
  'jade', 'jake', 'james', 'jamie', 'jane', 'janet', 'janice', 'janine',
  'jared', 'jasmine', 'jason', 'jasper', 'jayden', 'jean', 'jeanette', 'jenna',
  'jennifer', 'jenny', 'jeremy', 'jerome', 'jesse', 'jessica', 'jill', 'jim',
  'jimmy', 'joan', 'joanna', 'joanne', 'jocelyn', 'jodie', 'joe', 'joel',
  'john', 'johnny', 'jonathan', 'jordan', 'joseph', 'josephine', 'joshua',
  'judith', 'judy', 'julia', 'julian', 'julie', 'juliet', 'justin', 'justine',
  'karen', 'karl', 'kate', 'katherine', 'kathleen', 'kathryn', 'katie',
  'katrina', 'kayleigh', 'keira', 'keith', 'kelly', 'kenneth', 'kerry',
  'kevin', 'kieran', 'kim', 'kimberley', 'kirsten', 'kirsty', 'kyle', 'lance',
  'laura', 'lauren', 'laurence', 'lawrence', 'leah', 'leanne', 'lee', 'leo',
  'leonard', 'lesley', 'leslie', 'lewis', 'liam', 'lilian', 'lillian', 'lily',
  'linda', 'lindsay', 'lindsey', 'lionel', 'lisa', 'logan', 'lois', 'lorna',
  'lorraine', 'louis', 'louisa', 'louise', 'lucas', 'lucy', 'luke', 'lydia',
  'lynda', 'lynn', 'lynne', 'mabel', 'madeleine', 'maggie', 'malcolm', 'mandy',
  'marcus', 'margaret', 'maria', 'marian', 'marie', 'marilyn', 'marion',
  'marjorie', 'martha', 'martin', 'mary', 'mason', 'matthew', 'maureen',
  'maurice', 'mavis', 'max', 'maxwell', 'megan', 'melanie', 'melissa',
  'michael', 'michelle', 'mildred', 'miles', 'millie', 'miranda', 'miriam',
  'mitchell', 'mohammad', 'mohammed', 'molly', 'mona', 'monica', 'muhammad',
  'muriel', 'mustafa', 'nadia', 'nancy', 'naomi', 'natalie', 'natasha',
  'nathan', 'neil', 'nelson', 'nicholas', 'nicola', 'nicole', 'nigel', 'nina',
  'noah', 'noel', 'nora', 'norah', 'norman', 'olive', 'oliver', 'olivia',
  'ollie', 'omar', 'oscar', 'osman', 'owen', 'pamela', 'patricia', 'patrick',
  'paul', 'paula', 'pauline', 'penelope', 'percy', 'peter', 'philip',
  'philippa', 'phillip', 'phoebe', 'phyllis', 'piers', 'poppy', 'priscilla',
  'quentin', 'rachael', 'rachel', 'ralph', 'raymond', 'rebecca', 'reece',
  'reginald', 'rhona', 'rhys', 'richard', 'rita', 'robert', 'roberta', 'robin',
  'robyn', 'roger', 'roland', 'ronald', 'rory', 'rosalind', 'rosemary', 'ross',
  'rowena', 'ruben', 'ruby', 'rupert', 'russell', 'ruth', 'ryan', 'sally',
  'sam', 'samantha', 'samuel', 'sandra', 'sara', 'sarah', 'scott', 'sean',
  'sebastian', 'selina', 'shane', 'shannon', 'sharon', 'shaun', 'sheila',
  'shirley', 'sian', 'sidney', 'sienna', 'simon', 'simone', 'sinead', 'sofia',
  'solomon', 'sonia', 'sophia', 'sophie', 'spencer', 'stacey', 'stanley',
  'stella', 'stephanie', 'stephen', 'steve', 'steven', 'stewart', 'stuart',
  'susan', 'susanna', 'suzanne', 'sylvia', 'tamara', 'tania', 'tanya', 'tara',
  'terence', 'teresa', 'terry', 'theo', 'theodore', 'theresa', 'thomas',
  'timothy', 'tina', 'tobias', 'toby', 'tom', 'tommy', 'tony', 'tracey',
  'tracy', 'trevor', 'tristan', 'trudy', 'tyler', 'ursula', 'valerie',
  'vanessa', 'vera', 'vernon', 'veronica', 'vicky', 'victor', 'victoria',
  'vincent', 'violet', 'virginia', 'vivien', 'vivienne', 'wayne', 'wendy',
  'wesley', 'wilfred', 'william', 'wilma', 'yasmin', 'yusuf', 'yvonne',
  'zachary', 'zara', 'zoe',
]);

// What the last word of a street address is. "St" is here and "Dr" is not:
// both are ambiguous, but the rule already requires a house number and a street
// name in front, and "Dr" in that position loses to the doctor it usually is.
const STREET_TYPE = '(?:road|rd|street|st|avenue|ave|lane|ln|close|drive|way'
  + '|court|crescent|place|terrace|gardens|grove|hill|park|row|square|walk'
  + '|rise|view|mews|croft|green|parade|wharf|quay|boulevard|esplanade'
  + '|villas|buildings|estate)';

// A dwelling in front of the house number: "Flat 4, 12 Acacia Road".
const SUB_DWELLING = '(?:(?:flat|apartment|apt|unit|room)\\s*\\d+[a-z]?\\s*[,\\s]\\s*)?';

/* ---------------------------------------------------------------- rules */

// A name rule matches a word or two more than the name, because where a name
// stops is not something a regex can see: "Mrs Smith wants a fit note" and
// "Mrs Smith Whitfield" begin identically. So the match is walked back word by
// word, dropping any that cannot be part of a name.
//
// SHRINKING RATHER THAN DISCARDING IS THE WHOLE POINT. Throwing the match away
// because one word in it was ordinary would leave the name itself in the
// message — a redactor's worst failure, and a silent one.
//
// `firstWord` is the index of the first word that has to be a name: 1 where a
// title opens the match and is kept, 0 where the match is the name alone.
function trimToName(firstWord) {
  const ordinary = (w) => NOT_A_NAME.has(w.replace(/['’]/g, '').toLowerCase());
  return (source, start, end) => {
    const words = [...source.slice(start, end).matchAll(/[A-Za-z][A-Za-z'’-]*/g)];
    let last = words.length - 1;
    let first = firstWord;
    while (last >= firstWord && ordinary(words[last][0])) last -= 1;
    // Only where the match IS the name. Where a title opens it, the title is
    // an ordinary word by this test and must not be trimmed off the front.
    if (!firstWord) while (first <= last && ordinary(words[first][0])) first += 1;
    if (last < first || last < firstWord) return null;
    // A title stays inside the redaction with the name it belongs to.
    const from = firstWord ? start : start + words[first].index;
    return [from, start + words[last].index + words[last][0].length];
  };
}

export const IDENTIFIER_RULES = [
  {
    id: 'identifier.titledName',
    kind: 'name',
    label: 'A name behind a title',
    // "Mrs Smith", "Mr J Patel", "Miss Doreen Whitfield". The title is the
    // evidence, so the first name word does not have to be capitalised — "mrs
    // smith" is exactly how it gets typed at four o'clock. A second word is
    // taken only when it is capitalised, which is what separates "Mrs Doreen
    // Whitfield" from "Mrs Smith wants".
    pattern: new RegExp('\\b' + PATIENT_TITLE + '\\.?\\s+[A-Za-z][A-Za-z\'’-]*(?:\\s+[A-Z][A-Za-z\'’-]*)?', ''),
    refine: trimToName(1),
  },
  {
    id: 'identifier.labelledName',
    kind: 'name',
    label: 'A name written under a label',
    // The shape a pasted record has: "Name: John Smith", "patient's name is
    // Doreen Whitfield", "surname - Okafor". The comma is allowed between the
    // words because a record header writes it surname first — "NAME: SMITH,
    // JOHN" — and taking only half of that is not a redaction.
    pattern: /\b(?:(?:patient|caller|client|resident)(?:'s|’s)?\s+)?(?:full |first |last |second |sur|fore)?name\s*(?:is|:|=|-)\s*([A-Za-z][A-Za-z'’-]*(?:,?\s+[A-Za-z][A-Za-z'’-]*){0,2})/i,
    group: 1,
    refine: trimToName(0),
  },
  {
    id: 'identifier.namedPatient',
    kind: 'name',
    // "the patient John Smith", "pt Doreen Whitfield", "caller Mary Okafor".
    // A capitalised pair only — "the patient is waiting" must not fire, and
    // "Patient Access" is held off by the stop list.
    label: 'A patient named beside the word patient',
    pattern: /\b(?:patient|pt|caller|client)\s+([A-Z][A-Za-z'’-]+\s+[A-Z][A-Za-z'’-]+)/,
    group: 1,
    refine: trimToName(0),
  },
  {
    id: 'identifier.calledNamed',
    kind: 'name',
    label: 'A name introduced by called or named',
    // Two capitalised words, so "a form called Med3" and "a service called
    // Talking Therapy" (stop list) are left where they are.
    pattern: /\b(?:called|named|goes by|by the name of)\s+([A-Z][A-Za-z'’-]+\s+[A-Z][A-Za-z'’-]+)/,
    group: 1,
    refine: trimToName(0),
  },
  {
    id: 'identifier.postcode',
    kind: 'address',
    label: 'A postcode',
    // The standard UK form, including the letters that cannot appear in the
    // last two positions. That exclusion is not pedantry: it is the only thing
    // between this rule and "B12 2mg", which is a dose and not an address.
    pattern: /\b[A-PR-UWYZ][A-HK-Y]?\d[A-Z\d]?\s?\d[ABD-HJLNP-UW-Z]{2}\b/i,
  },
  {
    id: 'identifier.streetAddress',
    kind: 'address',
    label: 'A street address',
    // House number, at least one word of street name, then the street type.
    // The middle part is what keeps "in 1 place" and "the 2 way split" out:
    // an address has a name in it, not just a number and a noun.
    pattern: new RegExp('\\b' + SUB_DWELLING + '\\d+[a-z]?\\s+'
      + '[A-Za-z][A-Za-z\'’-]+(?:\\s+[A-Za-z][A-Za-z\'’-]+){0,2}\\s+'
      + STREET_TYPE + '\\b\\.?', 'i'),
  },
  {
    id: 'identifier.labelledAddress',
    kind: 'address',
    label: 'An address written under a label',
    // "Address: 12 Acacia Road, London" — taken to the end of the line or the
    // sentence, because half an address is still an address.
    pattern: /\b(?:home |postal |correspondence )?address\s*(?:is|=|:)\s*([^\n]{3,90}?)(?=\s*(?:$|\n|\.(?:\s|$)))/i,
    group: 1,
    // An address has a number in it somewhere. Without this, "the address is
    // on the letter" comes out as a redaction, which is the kind of nonsense
    // that gets the whole check ignored.
    keep: ({ text }) => /\d/.test(text),
    // "email address is …" is a different thing, and redacting the practice's
    // own inbox helps nobody. Checked here rather than with a lookbehind,
    // which older Safari does not have.
    skipAfter: /\b(?:e-?mail|web|url|website|ip|postal code)\s*$/i,
  },
];

/* ------------------------------------------------------------- scanning */

function isRoleName(source, start) {
  return new RegExp('\\b' + ROLE + '\\.?\\s+$', 'i').test(source.slice(Math.max(0, start - 40), start));
}

// Where a capture group sits in the subject. `d` gives it directly; the
// fallback covers a runtime without indices, where the group is found by where
// its text lies inside the whole match.
function rangeOf(match, group) {
  if (match.indices && match.indices[group]) return match.indices[group];
  if (!group) return [match.index, match.index + match[0].length];
  const inner = match[group];
  if (inner == null) return null;
  const at = match[0].indexOf(inner);
  if (at < 0) return null;
  return [match.index + at, match.index + at + inner.length];
}

// Trailing punctuation and spaces are the sentence's, not the identifier's.
function tighten(source, start, end) {
  let a = start;
  let b = end;
  while (a < b && /\s/.test(source[a])) a += 1;
  while (b > a && /[\s,;:.]/.test(source[b - 1])) b -= 1;
  return [a, b];
}

function regexHits(source, rule) {
  const flags = rule.pattern.flags.replace(/[gd]/g, '') + 'gd';
  const re = new RegExp(rule.pattern.source, flags);
  const hits = [];
  let m = re.exec(source);
  while (m) {
    if (m[0] === '') { re.lastIndex += 1; m = re.exec(source); continue; }
    const range = rangeOf(m, rule.group || 0);
    const tightened = range ? tighten(source, range[0], range[1]) : null;
    const refined = tightened && rule.refine ? rule.refine(source, tightened[0], tightened[1]) : tightened;
    if (refined) {
      const [start, end] = refined;
      const text = source.slice(start, end);
      const skipped = rule.skipAfter && rule.skipAfter.test(source.slice(Math.max(0, m.index - 30), m.index));
      if (end > start && !skipped && (!rule.keep || rule.keep({ text, source, start }))) {
        hits.push({ ruleId: rule.id, kind: rule.kind, label: rule.label, start, end, text });
      }
    }
    m = re.exec(source);
  }
  return hits;
}

// A forename followed by a surname, found by walking the words rather than by
// a five-hundred-branch alternation. The forename must be capitalised as typed
// and the surname must be capitalised too: "Sarah Wilkinson" is a person,
// "sarah in reception" is a colleague, and "amber alert" is neither.
function forenamePairs(source) {
  const token = /[A-Za-z][A-Za-z'’-]*/g;
  const words = [];
  let m = token.exec(source);
  while (m) { words.push({ text: m[0], start: m.index, end: m.index + m[0].length }); m = token.exec(source); }

  const hits = [];
  for (let i = 0; i < words.length - 1; i += 1) {
    const first = words[i];
    const second = words[i + 1];
    // Only ever one plain space between them — a line break or a comma means
    // these are two words that happen to be adjacent, not a full name.
    if (source.slice(first.end, second.start) !== ' ') continue;
    if (!/^[A-Z]/.test(first.text) || !/^[A-Z]/.test(second.text)) continue;
    if (!FORENAMES.has(first.text.toLowerCase())) continue;
    if (second.text.length < 2) continue;
    if (NOT_A_NAME.has(second.text.replace(/[.']/g, '').toLowerCase())) continue;
    hits.push({
      ruleId: 'identifier.forenameSurname',
      kind: 'name',
      label: 'A first name and a surname',
      start: first.start,
      end: second.end,
      text: source.slice(first.start, second.end),
    });
    i += 1; // "Sarah Jane Wilkinson" is one name, not two overlapping ones.
  }
  return hits;
}

/* ------------------------------------------------------------ allow list */

// Names the practice has written down itself. The directory carries entries
// like "Community Matron (Alison Wade)", and looking that number up is the job
// — so a candidate whose every word appears in the directory is a contact, not
// a patient. Deliberately word-wise rather than exact-phrase: the directory
// writes "(Alison Wade)" and the reader types "Alison Wade".
function allowedWords(allow) {
  const words = new Set();
  for (const entry of allow || []) {
    const label = typeof entry === 'string' ? entry : (entry && entry.label) || '';
    for (const w of String(label).toLowerCase().match(/[a-z][a-z'’-]+/g) || []) words.add(w);
  }
  return words;
}

function isAllowed(text, words) {
  if (!words.size) return false;
  const parts = String(text).toLowerCase().match(/[a-z][a-z'’-]+/g) || [];
  if (!parts.length) return false;
  return parts.every((w) => words.has(w));
}

/* ---------------------------------------------------------------- public */

/**
 * Every name and address in the text, as offsets.
 *
 * `allow` is the practice's own directory (entries or labels); anything spelt
 * entirely out of words that appear in it is left alone. Findings are sorted,
 * de-overlapped, and carry NO copy of what they found — see the head of this
 * file.
 */
export function scanIdentifiers(text, { allow = [] } = {}) {
  const source = String(text || '');
  if (!source.trim()) return [];
  const words = allowedWords(allow);

  const raw = [];
  for (const rule of IDENTIFIER_RULES) raw.push(...regexHits(source, rule));
  raw.push(...forenamePairs(source));

  const kept = raw.filter((hit) => {
    if (hit.kind !== 'name') return true;
    // A colleague's name, either because a role introduces it or because the
    // practice already has it written down.
    if (isRoleName(source, hit.start)) return false;
    return !isAllowed(hit.text, words);
  });

  // Overlaps are the normal case, not the exception: "Mrs Sarah Wilkinson"
  // fires the title rule and the forename rule over the same words. One hole
  // is one hole.
  kept.sort((a, b) => a.start - b.start || b.end - a.end);
  const merged = [];
  for (const hit of kept) {
    const last = merged[merged.length - 1];
    if (last && hit.start < last.end) {
      last.end = Math.max(last.end, hit.end);
      continue;
    }
    merged.push({ ...hit });
  }

  return merged.map((hit) => ({
    ruleId: hit.ruleId,
    kind: hit.kind,
    label: hit.label,
    start: hit.start,
    end: hit.end,
    length: hit.end - hit.start,
  }));
}

/**
 * The text with every name and address replaced.
 *
 * Returns the new text, the findings behind it and whether anything moved, so
 * a caller can warn on `changed` without re-running the scan.
 */
export function redactIdentifiers(text, { allow = [] } = {}) {
  const source = String(text || '');
  const findings = scanIdentifiers(source, { allow });
  if (!findings.length) return { text: source, findings, changed: false };

  let out = '';
  let at = 0;
  for (const f of findings) {
    out += source.slice(at, f.start) + REDACTIONS[f.kind];
    at = f.end;
  }
  out += source.slice(at);
  return { text: out, findings, changed: true };
}

/**
 * What to tell the reader.
 *
 * Counts, never quotes. The warning says what kind of thing was taken out and
 * why the assistant did not need it — a warning that repeats the name back
 * would put it on the screen it was being kept off.
 */
export function identifierWarning(findings) {
  const list = findings || [];
  if (!list.length) return '';
  const names = list.filter((f) => f.kind === 'name').length;
  const addresses = list.filter((f) => f.kind === 'address').length;
  const parts = [];
  if (names) parts.push(names + (names === 1 ? ' name' : ' names'));
  if (addresses) parts.push(addresses + (addresses === 1 ? ' address' : ' addresses'));
  return parts.join(' and ')
    + (names + addresses === 1 ? ' was' : ' were')
    + ' removed before this was sent. The assistant does not need patient identifiers —'
    + ' ask about the process, not the person.';
}

/** The short form, for a line that sits under the question in the transcript. */
export function identifierNote(findings) {
  const list = findings || [];
  if (!list.length) return '';
  const names = list.filter((f) => f.kind === 'name').length;
  const addresses = list.filter((f) => f.kind === 'address').length;
  const parts = [];
  if (names) parts.push(names === 1 ? '1 name' : names + ' names');
  if (addresses) parts.push(addresses === 1 ? '1 address' : addresses + ' addresses');
  return 'Patient details removed before sending — ' + parts.join(', ') + '.';
}
