# Triage Routing — Hard Cases

Twelve AccurX messages written to break the `/accurx` reader rather than to exercise it.
Every one of them contains a phrase that points at the wrong service and a clause somewhere
else that decides the answer. `evals/routing/cases.md` holds the regression guards; these are
the ones where a keyword matcher and a careless reader give the same wrong answer.

Each case N is the file `evals/routing/messages/hard-NN.txt`, holding that message and nothing else:

```
node evals/routing/run.mjs evals/routing/messages/hard-01.txt --read
```

The expected route is a `destination` id from `lib/triage/destinations.mjs`. Where it is a
nurse clinic (`nurse`, `diabeticNurse`), the reader reaches it through `nurseClinics` as well —
see `signpostsFrom` — and a case is not failed for naming it in both places.

A case passes only if **all** of: correct route, the deciding clause quoted rather than the
loud one, no dropped requests, no exclusion invented that the message does not support.

---

## 1. New flashes and floaters, no curtain

```
Hello, I'm 58. Since Saturday morning I've noticed some new floaters in my right eye, little threads that swim about when I move my eye, there's definitely more of them than there were. Once or twice out the corner of that eye I've seen a flash like someone taking a photo with the flash on, usually in the evening. It isn't sore at all and I can read the paper fine with my glasses, there's no curtain or shadow or dark bit across anything, my sight is the same as it's always been. I did google it which was probably a mistake. I don't want to waste an appointment if it's nothing but my sister said get it looked at. I'm not working at the moment so I can get to anywhere in Hackney any day.
```

**Expected route:** `minorEyeService`
**Because:** the guide's Eye emergency page puts this on the optician's list by name — "The minor eye service covers ... **recent flashes and floaters**, recent double vision, and significant discharge or watering" — and the message denies every feature that would move it: no pain, no "curtain or shadow", sight unchanged. Local detail: Rose Opticians, and "If the patient cannot be seen within 24 hours, tell the GP."
**Trap:** `eyeEmergency`. Flashes and floaters read as retinal detachment to anyone reasoning from general knowledge rather than from the ladder, and the reader is told to escalate when unsure. It is wrong because the guide's own eye emergency list is *"Sudden onset of a curtain or shadow across the vision"* — the one thing this patient explicitly says is absent — and escalating here takes a patient who needs an examined eye and sends her to a hospital for one she is not having. `dutyDoctor` is the softer version of the same error: a GP cannot look inside an eye, which is why "an eye problem comes here rather than to a pharmacy or a physiotherapist".

---

## 2. Five-month shoulder, and a scare that was investigated

```
My right shoulder has been playing up since about March so that's 5 months now. It hurts when I reach up to the top shelf or put my coat on and I can't lie on that side at night. There was no accident or anything, it just crept up on me. Ibuprofen takes the edge off it. I'm 44.

The only other thing to mention is back in February I had a scare where my right hand went numb and pins and needles for about an hour and my husband made me go to A&E, they kept me in overnight and did a scan of my head and loads of bloods and it all came back normal, they said it was a trapped nerve in my neck and it settled down within the week and hasn't happened since. Nobody has said I need anything for it.

Could I be referred to the physio for the shoulder please, I had physio for my knee years ago and it did the trick.
```

**Expected route:** `fcp`
**Because:** "Shoulder pain, frozen shoulder, rotator cuff problems, pain on lifting overhead" is the FCP's first-listed territory, she is 44 so the under-16 gate is nowhere near, and the guide answers her request directly: "Patients asking for a physiotherapy referral for a new MSK problem — **the FCP is the assessment, not a step before it**." The February episode is the message telling you its own outcome — A&E, scan, "it all came back normal", settled in a week, not since.
**Trap:** `dutyInterrupt` or `emergency`. "Numb", "pins and needles", "A&E", "scan of my head" is the exact word-set the old keyword net fired on, and the header of `lib/templates/accurx-route.mjs` records what that cost. It is wrong because the guide escalates *new* neurology, and this is a resolved, investigated episode six months old. A second trap is `doctorTask`: the FCP page does refuse "A hospital has already told the patient they need physiotherapy", but no hospital told her anything of the kind — she says "Nobody has said I need anything for it" — and reading the hospital visit as a physio instruction converts a same-week FCP slot into a task queue.

---

## 3. Impetigo, third time, and the cream already failed

```
My little boy is 4 and he's got the impetigo again round his nose and mouth, this is the third go of it since May. Last time you did the pharmacy referral thing and the chemist gave us the hydrogen peroxide cream, we did it for the full week exactly like they said and it went crusty and then came straight back worse, it's now down onto his chin and there's a patch on the back of his hand as well. His big sister has got one spot coming by her lip now too. He is eating and running about as normal, no temperature, he's not poorly in himself at all. Can we just have the antibiotic cream this time instead of going back to the chemist, they were lovely but it didnt work.
```

**Expected route:** `dutyDoctor`
**Because:** Pharmacy First refuses "**Recurrent presentations of the same problem that has already failed pharmacy treatment**" — third episode since May, the pathway's own treatment completed and "it didnt work". That leaves it with us, and a spreading skin infection needing to be looked at is the duty list: "Suspected infection needing examination — chest, abdomen, urine, skin", booked face-to-face because "the doctor will need to look at ... something". The sister is a second patient and a second request.
**Trap:** `pharmacy`. Everything a matcher checks says yes — "impetigo" is on the list, the pathway is "Impetigo — 1 year and over" and he is 4, so the age gate that catches most of these passes cleanly, and the parent names the pathway herself. It is wrong because the gate is not the only exclusion on that page: the treatment this route offers is the treatment that has already been completed and failed, so referring transfers responsibility to a pharmacist with nothing left to give. Note this is the mirror of `R3` in `cases.md` — there the earlier course *worked*, and taking the pathway away would have been the error.

---

## 4. Three days, no weight-bearing, asking for the physio

```
I tripped over the kerb outside the shops on Saturday and went right over on my left ankle. I've been keeping it up on a cushion and taking paracetamol and my neighbour lent me a walking stick, but it's Tuesday now and I still can't put any weight on it at all, if I try to stand on it it just gives way underneath me. It's swollen up like a balloon and gone a horrible purple colour down to my toes. I'm 68.

I don't want to make a fuss and I know A&E is rammed. Could I just see the physiotherapist please, my friend saw one at the surgery for her hip and said she was very good and she got a scan out of it. My son is off work this week and can drive me anywhere I need to go.
```

**Expected route:** `ae`
**Because:** the FCP page refuses it twice over — "Suspected fracture or dislocation, or significant recent trauma — A&E" and "**Inability to weight-bear at all after an injury — A&E**" — and the A&E page takes it: "Suspected fracture or dislocation after a fall or injury", for a patient "stable enough to travel themselves or with a family member", which the son driving settles. The guide's own closing line on the FCP page is this case: "If the MSK problem started with an accident in the last few days, ask about the mechanism before booking."
**Trap:** `fcp`. She asks for the physiotherapist by name, an ankle is on the FCP's list, "weakness, giving way, or loss of function after a minor injury" is on it too, and three days of self-management reads as something that has settled into an ordinary MSK problem. It is wrong because the elapsed days do not retire the mechanism: she has never borne weight on it since the injury, which is the FCP's stated A&E exclusion, and booking the physio slot she asked for delays an X-ray by however long that slot is away. Do not over-correct to `emergency` either — the A&E page's own refusal is "those patients must not drive or be driven", and she has a driver.

---

## 5. "Nothing urgent", 82, and a lump he is not bothered about

```
Morning. No rush with this one at all, whenever there's a free slot in the next few weeks is absolutely fine, I know you're busy.

I'm 82. I've lost a fair bit of weight since Easter, my belt's gone in three holes, I haven't been trying to, I've just gone off my food a bit which the wife keeps on at me about. I get a bit puffed carrying the shopping up from the car now which I never used to do, though I am 82 so I expect that's just age. There's also a lump in my left armpit, firm, about the size of a grape, been there 6 weeks or so, doesn't hurt at all so I'm not bothered about it, I'm only mentioning it because the wife told me to put it down.

Anything but a Monday if that's alright, that's my bowls morning. Nothing urgent.
```

**Expected route:** `dutyDoctor`
**Because:** unintentional weight loss, new exertional breathlessness and a firm lump, none of them explained, in a frail-aged patient. GP routine refuses exactly this shape — "Anything the patient describes as **getting worse, or that has changed since it started** — reassess for the duty list" — and the duty page takes "Any presentation that worries you with no clear alternative destination", under the rule on the guide's front page: "When you are not sure, route upward." The reader's own instruction covers the tone: a symptom the writer dismisses "is still a symptom".
**Trap:** `gp`. He asks for a routine slot, gives a booking preference, says "nothing urgent" twice, and every symptom is weeks old rather than hours — so the message matches the routine page's "Ongoing symptoms the patient wants reviewed" almost word for word. It is wrong because the patient's own framing is not the clinical picture, and the guide anticipates the inverse of it: the words to listen for are "today, worse, and can't wait", none of which a patient who is minimising will ever write. Booking him three weeks out on his own say-so is the failure this case exists for. `doctorTask` is the other wrong answer — nothing here is administrative and tasks "are not read in real time".

---

## 6. Two prescriptions, a smear, and food sticking

```
Hi, three things if that's ok.

1. My omeprazole and my atorvastatin need doing again, the chemist said there's nothing left on the repeat. It's the same chemist as always, no change there.

2. I got a letter about my smear being overdue, I keep meaning to ring about it. I'm 51. Can I be booked in for that, afternoons are much easier for me.

3. Probably nothing this one but the heartburn has been worse since about April and the last three weeks or so I've been getting food catching in my chest when I swallow, bread and meat mostly, last night a bit of toast stuck and I had to bring it back up. I've been having soup instead which is fine. I've lost about half a stone but I have been eating less so that's probably why. I don't need an appointment for that, I just wondered whether I should double up the omeprazole to two a day?
```

**Expected route:** `dutyDoctor`
**Because:** the third item is progressive difficulty swallowing with weight loss, and the patient has wrapped it in a dose question. The pharmacy team refuses precisely that wrapping: "**New symptoms that happen to involve medication** — if the patient is asking to be seen about a problem, that is a clinical route." Nothing else on the ladder can assess it, so it is the duty list's under "Any presentation that worries you with no clear alternative destination". The other two requests survive as requests: the repeats to `pharmacyTeam` ("Repeat prescription requests and queries about them"), the smear to `nurse` ("Cervical screening, swabs, ear checks").
**Trap:** `pharmacyTeam`. Two of the three numbered items are medication, the third is *phrased* as a medication question, and the patient explicitly disclaims needing an appointment for it — so the message's own arithmetic says pharmacy. It is wrong because where the whole person goes is not where the loudest or most numerous request goes; sending this to a queue with a three-working-day turnaround answers the dose question and loses the symptom. `nurse` is the same error with a different item: the smear is real, it is a signpost, and it is not the route.

---

## 7. "Send the district nurse" — for a man they got to the hospital in March

```
I'm writing on behalf of my dad, he's 79 and registered with you, I have his permission.

He had his stroke in 2023 and he's had a catheter since, the district nurses did it when he first came out of hospital but that stopped after a few months and nobody has been since. It's due changing again and my mum can't be doing it. He hasn't really been out of the flat since Christmas, he's on the second floor and the lift is out half the time. We did get him down to his eye appointment at the hospital in March, that took three of us and a taxi but we managed it, and I suppose we could do the same to get him to you if we had to, it's just a lot. Could you send the district nurse out instead.

Also, my mum is 76 and she does absolutely everything for him. She's not sleeping, she's stopped going to her Thursday group, she says she's fine but she isn't. Is there anything for her? She's not ill as such, just worn out with it all.
```

**Expected route:** `doctorTask`
**Because:** the district nurse page makes housebound the gate and then says what to do when the gate is ambiguous: "Being housebound is the gateway. Ask directly whether the patient can get to the surgery at all" — and "**If it is unclear whether the patient is genuinely housebound, raise it as a doctor task rather than sending the referral.**" The message answers the question itself, both ways, in one sentence. The page also requires that "The doctor confirms the clinical need before the referral goes". Mum is a second request and her own route: "Carers needing support in their own right" — `socialPrescriber`.
**Trap:** `districtNurse`. The daughter names the service, the words "hasn't really been out of the flat since Christmas" are in the message, catheter care is on the district nurse's covers list, and there is a history of the service having attended. It is wrong because the same page refuses "Patients who can physically attend the surgery, even with difficulty — practice nurse", and this family says in writing that they can, with difficulty. Sending the RP ACN 2022 form on that basis commits the practice to a home visit the referral criteria may not support; a task lets the doctor decide, which is what the page asks for. The mirror-image trap is `nurse` — booking him into a clinic he may not reach.

---

## 8. Diabetes review due, and "book my eye screening too"

```
Hello, two things.

I'm type 2, diagnosed about 8 years ago, on metformin. I had a text saying my annual review is overdue, I think I missed the one in the spring because I was away. Can I get that booked in please, I know I need the blood test first, last time they did the bloods and then I saw the nurse a couple of weeks after.

The other thing is the eye screening. I got a letter for it back in June and I've mislaid it and I don't know who to ring now. Can you book that in on the same day as the review so I only have to come the once? My eyes are fine by the way, no change in my vision at all, I just want it done and off the list. My sugars have been ok, mostly 7 to 9 on the monitor.
```

**Expected route:** `diabeticNurse`
**Because:** he is on the register, the review is overdue and his readings are unremarkable — "Annual or interval diabetes review for a patient on the diabetes register" — with the sequencing the page insists on: "Book the blood test first, then the review." The second request cannot be granted at all, and the guide says so in as many words: "**Diabetic eye screening is a separate national programme and is not booked as a practice appointment.**" That is a "no" somebody has to say out loud, not a request to forward — and the reader is told a stated rule that is not applied "reads as though the request is being handled".
**Trap:** two of them, both hanging on the word *eye*. A matcher sees "no change in my vision" and fires the diabetic eye guard — the negation is what fires it, exactly as in `R2` — sending the whole message to `dutyDoctor` for symptoms the patient explicitly denies. A reader that avoids that can still land on `doctorTask` or `minorEyeService` for the screening, which invents a route for something no route here performs. The wrongness is the same in both directions: the actionable half of this message is a bloods-then-review booking, and the other half needs explaining rather than routing.

---

## 9. Turkish only, no internet, and a smear that is due

```
Hello I am writing for my mother, she is 62 and registered at the practice, I am her son.

She has had a letter saying her smear test is due, it is three years since the last one. She does not speak English, only Turkish. At her last appointment there was no interpreter booked and she and the nurse could not understand each other so nothing was done in the end and she was very upset about it, she will not come on her own again.

She has no internet and no smartphone so please do not send her a link or a text with a form on it, she cannot open them, everything comes through me. I work shifts so the only days I can bring her are a Tuesday or a Thursday. Please can somebody ring me to arrange it, my number is 07700 900184.
```

**Expected route:** `nurse`
**Because:** "Cervical screening, swabs, ear checks" is the practice nurse's, and everything else in the message is a flag, not a destination: "These **do not change where the request goes**. They change what else happens alongside it." Named ones here are "Interpreter needed — book Language Line and note the language on the appointment so the clinician knows before the call", "Digital exclusion — do not signpost a self-referral link to a patient who cannot use it. Arrange the route for them instead", and a son writing on her behalf. The collision is real and belongs on the card: he can only manage Tuesday or Thursday, and "Nurse clinics: Mondays, Wednesdays and Fridays only."
**Trap:** `socialPrescriber` — language, isolation, a family member doing the paperwork and a previous appointment that went wrong all read as "this person needs support", and the social prescriber page mentions "help filling in forms". It is wrong because nothing being asked for is practical or social: a smear is a clinical procedure, the nurse does it, and the flags travel *with* it. `doctorTask` is the other version — routing a routine screening to a doctor because the handling looks complicated, which is how a two-line Language Line booking becomes a fortnight. The failed previous appointment is a reason to book the interpreter, not a reason to move the patient up the ladder.

---

## 10. Lagos in twelve days, Tuesdays only

```
Hi, we are flying out to Lagos on the 28th for my cousin's wedding so that's 12 days time. There's me (39), my husband (41) and the two kids, they're 9 and 6.

We need the yellow fever certificate because they ask for it at the airport, and I think typhoid and hepatitis as well, and someone at work said something about malaria tablets. Can we all get booked in together this week?

I can only do a Tuesday, I'm at work the rest of the week and my husband is on nights. There's a travel clinic in your building isn't there, would that be quicker for us?
```

**Expected route:** `nurse`
**Because:** "Travel vaccinations and childhood immunisations" is on the practice nurse's list, and the notice period is a booking conversation rather than a different destination: "**Travel vaccinations need six weeks' notice — patients asking with less time should be told at the point of booking.**" Two collisions have to reach the card, because nobody else will notice them: twelve days against six weeks, and "I can only do a Tuesday" against "Nurse clinics: Mondays, Wednesdays and Fridays only." The malaria tablets are a medicine and a separate request — "Every medication-related request goes here, without exception" — `pharmacyTeam`.
**Trap:** `pharmacy`. The patient asks about the travel clinic in the building and the guide names it on the Pharmacy First page — "Hackney Pharmacy and Travel Clinic, 15a Urban Hive, Theydon Road, E5 9BQ ... In the same building as the surgery" — so both the message and the guide put the words *pharmacy* and *travel clinic* side by side. It is wrong because `pharmacy` on this ladder is the Pharmacy First referral, a list of minor illness pathways with age ranges, and travel vaccination is not one of them; referring there sends a family of four to a service that cannot action it. The second trap is treating the six-week rule as a refusal and routing away from the nurse entirely — it is a hard gate on the *booking*, and the guide's instruction is to say so at the point of booking, not to send them somewhere else.

---

## 11. A bite, a well child, and a frightened mother

```
My son is 6 and he got bitten by something on his forearm at the park on Sunday, probably a mosquito. It's come up red and puffy and it feels warm around the bite, about the size of a 50p, and it's obviously itchy because he keeps picking at it. It's been the same since yesterday, no bigger. He is completely fine in himself, running round the flat, ate a full dinner, no temperature, sleeping normally. I've been putting the antihistamine cream from the cupboard on it.

My friend's little boy had a bite that turned into cellulitis and he ended up in hospital on a drip so I'm a bit twitchy about it, sorry. Do we need to see anybody or can the chemist sort it out?
```

**Expected route:** `pharmacy`
**Because:** "**Infected insect bites — 1 year and over**" is a Pharmacy First pathway and he is 6, inside the gate. Every exclusion on that page is checked and absent: he is not "systemically unwell, not just locally unwell" (well in himself, eating, no temperature), it is not spreading ("the same since yesterday, no bigger"), and no pharmacy treatment has been tried and failed — a cream from the cupboard is not the pathway. The duty page refuses it in turn: "Minor illness that falls squarely inside a Pharmacy First pathway with no complicating features."
**Trap:** `dutyDoctor`, on the mother's anxiety and the word "cellulitis" — a message containing *red*, *warm*, *hospital*, *drip* and *infected* reads alarming and the ladder's own rule says to route upward when unsure. It is wrong because the reader would be escalating on a story about a different child; the guide's 999 page names the error — "Anxiety about symptoms without any of the above features" — and the practice's route for this exact presentation exists, transfers clinical responsibility to a pharmacist who assesses and follows up, and is faster. Over-escalating here is not the safe direction: it takes the child off the service the practice actually uses and puts him in the duty queue behind case 5.

---

## 12. Eviction, the food bank, and one sentence in the middle

```
I don't really know who to send this to so sorry if it's the wrong place.

I got the eviction notice on Friday, section 21, so I've got 8 weeks. I'm behind on the council tax and the electric and I've had to use the food bank twice this month which I never thought I'd be doing at my age. I've filled the PIP form in wrong twice now and they keep sending it back. Somebody at the job centre said the surgery has a person who helps with this sort of thing, so that's what I'm asking for really.

I'm alright by the way, I'm not going to do anything daft, it's just some mornings I lie there and think what is the point of any of it, I've thought about how I'd do it, the tablets are all in the drawer, but I wouldn't, I've got the dog to think about. Anyway.

Is there an appointment with the money person? I don't want to see a doctor, I've seen enough doctors.
```

**Expected route:** `dutyInterrupt`
**Because:** the interrupt page lists it without qualification — "**Anyone describing thoughts of ending their life, or a plan to harm themselves or someone else**" — and this message states the thought, the method and the means in one clause. The social prescriber page sends it to the same place from the other side: "Do not route here: Patients in mental health crisis or expressing thoughts of self-harm — **duty doctor, immediately**", and "If they are distressed rather than stuck, involve a clinician first." Housing, debt and the PIP form are a real second request and the social prescriber's, once somebody has spoken to him.
**Trap:** `socialPrescriber`. Four fifths of the words are money and housing, the guide's social prescriber page covers "Money worries, debt, benefits applications, help filling in forms" and "Housing problems and difficulties with council services", he names the service he wants, and he refuses a doctor outright. It is wrong because what a patient asks for is not where the message goes, and the disclaimers around the sentence — "I'm alright", "I'm not going to do anything daft", "but I wouldn't" — are the minimising the reader is told to read past, not a clinical negative. Booking the social prescriber and closing the request is the failure. So, more quietly, is `dutyDoctor`: the interrupt page exists for the patient who "cannot wait for a call-back", and its instruction is "Walk to the duty doctor rather than sending a task."

---

## What each case is for

| # | Route | The failure mode it hunts |
|---|---|---|
| 1 | `minorEyeService` | over-escalation of a condition the guide places below the emergency |
| 2 | `fcp` | an alarming episode the message says was investigated and resolved |
| 3 | `dutyDoctor` | a pathway whose age gate passes but whose treatment has already failed |
| 4 | `ae` | an MSK request whose mechanism, days old, is still an exclusion |
| 5 | `dutyDoctor` | new, unexplained and worsening, written calmly and disclaimed |
| 6 | `dutyDoctor` | several requests where the loudest is not where the person goes |
| 7 | `doctorTask` | a service asked for by name whose gateway the message leaves unclear |
| 8 | `diabeticNurse` | something the practice cannot do at all, plus a negation that fires a guard |
| 9 | `nurse` | handling flags that must change everything except the route |
| 10 | `nurse` | what they need against how the practice books it, twice |
| 11 | `pharmacy` | a simple message that must not be escalated by borrowed fear |
| 12 | `dutyInterrupt` | the deciding clause buried inside the request the patient actually made |
