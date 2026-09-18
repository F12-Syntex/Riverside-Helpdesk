# Page routing — the golden set

Staff questions and the Notebook page each one should reach. This is what
`evals/routing/bench-pages.mjs` marks the router against, and it is the only
thing that lets a reliability claim be made about the router at all.

**Nobody who changes `lib/routing/` writes cases here.** `judge.md` explains
why: an agent that can see the cases will pass them by remembering them, and
the router will get worse at everything that is not on this list. The judging
agent labels; the routing agent measures.

## Where the cases come from

1. Pull real questions from `question_log` (and `audit_events` for the older
   ones) — both store the staff question verbatim. Prefer the ones whose
   outcome was `prose`: those are the wording that fell through.
2. Label each with the Notebook page it should have reached, by the page's
   `docId` (`note:<id>`, as `fullNotebookContext()` reports it) or by the
   page's exact path (`Referrals / Dermatology`). Around fifty is enough to
   see a rate; a dozen is not.
3. A question the Notebook genuinely does not cover is a case too: its
   expected page is `none`, and the router must fall through on it.

## Format

One case per heading. The heading is the question, exactly as typed. The
line after it names the page. Anything else under the heading is a note for
the reader and is ignored by the bench.

```
## 1. how do i do a smear

**Expected page:** Screening / Cervical screening
The word on the page is "cervical screening"; nobody at the desk says it.
```

Run:

```
node evals/routing/bench-pages.mjs report.json --repeats 5
node evals/routing/bench-pages.mjs report.json --repeats 5 --hit 0.85 --ask 0.7 --margin 0.2
```

---

<!-- Cases go below this line. None yet: labelling belongs to the judging
     session, not to the one that built the router. -->

## 1. physio referral

**Expected page:** Referrals / Pathway cards (A to Z) / ERS referrals / Physiotherapy (standard)
"Physio" with nothing else said is standard physiotherapy, not Extended Scope; the standard card is what a bare request should reach.

## 2. locomotor referral

**Expected page:** Referrals / Pathway cards (A to Z) / ERS referrals / Physiotherapy (standard)
"Locomotor" is the desk word for physiotherapy — the standard physio card carries the term and there is no locomotor page.

## 3. dermatology referral

**Expected page:** Referrals / Pathway cards (A to Z) / ERS referrals / Dermatology and Telederm
One card covers normal dermatology and Telederm, and the hospital-selection rule is the thing being asked for.

## 4. delederm referral

**Expected page:** Referrals / Pathway cards (A to Z) / ERS referrals / Dermatology and Telederm
A typo for "telederm", which is a section of the dermatology card rather than a page of its own.

## 5. minmax referral

**Expected page:** Referrals / Pathway cards (A to Z) / ERS referrals / Maxfax (oral and maxillofacial surgery)
"Minmax" is how the desk says maxfax; the card is titled with the formal name nobody types.

## 6. refer maxfax pls

**Expected page:** Referrals / Pathway cards (A to Z) / ERS referrals / Maxfax (oral and maxillofacial surgery)
Same page reached from the abbreviation the card itself uses, with a please attached.

## 7. how to do a ecg referral

**Expected page:** Referrals / Pathway cards (A to Z) / Email referrals / ECG and 48-hour tape
The ECG card names the form and the 24-hour/48-hour quirk. It is an email referral, not e-RS.

## 8. how to do echo referral?

**Expected page:** Referrals / Pathway cards (A to Z) / Email referrals / Echo (RP Echo)
Echo has its own card and its own form (RP Echo). The near-miss is the ECG card, which shares the email address.

## 9. hearing referrarl

**Expected page:** Referrals / Pathway cards (A to Z) / ERS referrals / Audiology / hearing test
Misspelt, and the page is filed under "Audiology" — "hearing" appears only in the title suffix.

## 10. Hi dr can you please ref pt [name removed] to in health hoxton for hearing aaid test fitting. kind regards dalston specsavers cansu store manager

**Expected page:** Referrals / Pathway cards (A to Z) / ERS referrals / Audiology / hearing test
A message from an optician asking for a hearing aid fitting; the audiology card is the route, buried in third-party wording.

## 11. How do I  refer via ERS?

**Expected page:** Referrals / Core referral process / Step 2a: Send via e-RS (default)
The default e-RS send is Step 2a. The neighbour is the e-RS queries page, which is about problems rather than the process.

## 12. how do I book a diabetes blood test

**Expected page:** Blood tests / Booking a blood test
Booking is on the blood test page (book a nurse appointment, reason "diabetes blood test"). The diabetes BT-items page lists what to order, which is a different question.

## 13. mental health blood test

**Expected page:** Blood tests / BT items by check / Mental health review — BT items
This asks which items go on a mental health review blood test, so it is the BT-items page, not the general booking page.

## 14. can we do pead bt

**Expected page:** Nurse and HCA clinics / Blood taking: age restrictions
"Pead bt" is a paediatric blood test: the age-restrictions page is the one that says under-16s cannot be bled here.

## 15. can i send health check message to patient thats 16?

**Expected page:** Appointments and booking / NHS health check eligibility
Health checks are over-40s only, so a 16-year-old is not eligible. The new-patient health check pages are the trap.

## 16. Universal Credit health assessment documents

**Expected page:** Incoming documents / Universal Credit health assessment documents
Typed straight from the page title, so it should be the easy end of the set.

## 17. 2 WW Skin cancer

**Expected page:** Referrals / Core referral process / Cancer referrals (2WW)
Cancer is always a 2WW referral, and this page sets priority and speciality. The dermatology card is the confident wrong answer here.

## 18. no how to make routine upper GI endoscopy referral

**Expected page:** Referrals / Pathway cards (A to Z) / ERS referrals / Endoscopy (gastroscopy)
Routine upper GI endoscopy is the gastroscopy card. "Upper GI" also appears on the 2WW list, which is the wrong route for a routine request.

## 19. falls clinic referral

**Expected page:** Referrals / Pathway cards (A to Z) / Email referrals / Falls Clinic
The falls clinic card carries the speciality, clinic type and the 65-and-over population.

## 20. asthma referral done

**Expected page:** Referrals / Pathway cards (A to Z) / Email referrals / Asthma referral
Asthma referrals are ACER referrals by email and explicitly not e-RS; that single line is the whole answer.

## 21. BCG referral

**Expected page:** Referrals / Pathway cards (A to Z) / Email referrals / BCG (TB vaccine)
BCG is the TB vaccine, and it has an eligibility gate to check before referring.

## 22. gym referral

**Expected page:** Referrals / Pathway cards (A to Z) / Email referrals / Gym
A one-line email-referral card. Easy, but it proves the router reaches the thin cards at all.

## 23. foot referral

**Expected page:** Referrals / Pathway cards (A to Z) / ERS referrals / Podiatry: at-risk foot (foot clinic)
"Foot referral" is the podiatry at-risk foot clinic; the card says everyone at foot clinic counts as at-risk foot.

## 24. chest pain referral

**Expected page:** Referrals / Pathway cards (A to Z) / ERS referrals / Cardiology: Rapid Access Chest Pain Clinic (RACPC)
Chest pain is the Rapid Access Chest Pain Clinic card, always urgent. The generic cardiology list is the near-miss and would lose the urgency.

## 25. cardiology referral ers

**Expected page:** Referrals / Referral reference / All specialities and clinic types
A bare cardiology referral has no pathway card, so it falls to the speciality list. The RACPC card must not win this one.

## 26. allergy clinic referral

**Expected page:** Referrals / Referral reference / All specialities and clinic types
Allergy has its own heading on the speciality list and no pathway card.

## 27. gynea a+g

**Expected page:** Referrals / Pathway cards (A to Z) / ERS referrals / Community gynaecology
"A+G" is Advice and Guidance, which is exactly the route the community gynaecology card describes.

## 28. How do I register a new patient?

**Expected page:** Registration and records / Registering a patient on EMIS
The registration page, plainly worded, and the only page about registering.

## 29. new baby registration steps,

**Expected page:** Registration and records / Registering a patient on EMIS
Same page, but the answer is a scenario near the end (no NHS number because they were not born in the UK). Nothing in the notebook is titled for babies.

## 30. What do I do with a sick note request?

**Expected page:** Reports, letters and payments / Sick notes and self-certification
Sick notes and self-certification: the 7-day rule and the self-certification form.

## 31. new pregnancy steps

**Expected page:** Appointments and booking / New pregnancy
The new pregnancy page has the steps, including the two questions to ask. Postnatal clinic and maternity contacts are the neighbours.

## 32. do we offer travel vacc

**Expected page:** Nurse and HCA clinics / Nurse and HCA appointment types
The appointment-types page lists travel vaccinations and the 6-week notice rule. The booking matrix says who gives them, which is a different question.

## 33. How do I book an interpreter?

**Expected page:** Contacts / Contact directory
The word "interpreter" is nowhere in the notebook; the answer is Language Line in the contact directory, with an access code.

## 34. sex clinic

**Expected page:** Contacts / Self-referral links and booking websites
Sexual health is a self-referral link, not a referral we make.

## 35. pharmacy first seeing under 5

**Expected page:** Prescriptions and pharmacy / Pharmacy First and CPSAS / Pharmacy First: the seven conditions
The age gateway is the point of this page: sore throat is 5-and-over, earache is 1 to 17. The minor illness page is the neighbour and has no age gates.

## 36. notifiable  disease

**Expected page:** none
Nothing in the notebook covers notifiable diseases or how to notify one. The router must fall through.

## 37. I  need  to  nitfy  a  disease

**Expected page:** none
The same gap, typed badly. Still not covered anywhere.

## 38. UKHSA North London HPT

**Expected page:** none
The health protection team is not in the contact directory or anywhere else.

## 39. access to add child on nhs app

**Expected page:** none
Proxy access to the NHS App for a child is not covered. The registration pages are about registering patients, not app access.

## 40. provide details regarding a general health check, including the procedure, and the specifics on what the health check covers, as well as how long it takes

**Expected page:** none
The notebook gives eligibility (over 40) and the blood panel, but nowhere says what the appointment covers or how long it takes. A page here would be answering a question it does not hold.

## 41. Please look at the attached image.

**Expected page:** none
No question at all — an attachment prompt. Nothing to route.

## 42. summarise Mild but consistent pain in mu left testicle , been to the sexual disease dep. results are negative to all sexual diseases . They give me antibiotics after 2 weeks pain it’s still there

**Expected page:** none
A request to summarise a patient message, not a question about practice procedure.

## 43. he said he'll live

**Expected page:** none
A fragment of conversation with no question in it.

## 44. esp physio referral

**Expected page:** Referrals / Pathway cards (A to Z) / ERS referrals / Physiotherapy: Extended Scope (ESP)
Extended Scope is a separate card with a different speciality and a default site. The standard physio card is the confident wrong answer.

## 45. whats the blood test items for an nhs health check

**Expected page:** Blood tests / BT items by check / NHS health check — BT items
The BT-items page lists the panel. The eligibility page and the new-patient panel are both one word away.

## 46. can iqra do a smear

**Expected page:** Nurse and HCA clinics / Booking matrix: Mishalu and Iqra
The booking matrix is the only page that splits work between Mishalu and Iqra; the appointment-types page says smears happen but not who does them.

## 47. letter came for someone not our patient

**Expected page:** Incoming documents / Rejecting a document that is not ours
Reject it and give a reason. The neighbour is the inactive/unregistered page, which is about our own former patients.

## 48. how much for proof of registration

**Expected page:** Reports, letters and payments / Proof of registration
A fee and a form. Private letters, priced from the same figure, is the neighbour.

## 49. word referral form wont let me type in it

**Expected page:** Referrals / Core referral process / Unprotecting a Word form
Unprotecting a Word form. The question never uses the words "protected" or "restrict editing".

## 50. minor surgery referral

**Expected page:** Referrals / Pathway cards (A to Z) / Email referrals / Minor surgery (Nightingale Practice)
Minor surgery goes to the Nightingale Practice by email. The card says in as many words that it is not General Surgery, which is the neighbour.

## 51. stye referral

**Expected page:** Referrals / Pathway cards (A to Z) / Email referrals / Minor eye service: styes (Rose Opticians)
Styes are the Rose Opticians minor eye service card. The MECS reference page is the neighbour and points at this card rather than covering styes.

## 52. can we book a 14 year old with the fcp

**Expected page:** Appointments and booking / FCP (First Contact Practitioner) booking and follow-ups
The FCP page says do not book under-16s. Nothing else in the notebook carries that rule.
