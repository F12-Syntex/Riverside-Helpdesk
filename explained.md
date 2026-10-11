# How the bot answers — explained simply

The bot never knows anything on its own. Every answer is built fresh from what
the practice has written down: the Notebook, and the practice documents.

## A question — the whole Notebook, read every time

- When someone asks a question, the bot is given **every Notebook page, in
  full**, with the question. Nothing is searched for and nothing is cut short:
  the model reads the Notebook the way a colleague would, and answers from it.
- It answers in plain prose, with **a link to each Notebook page it used**, so
  the reader can open the page and check.
- Before the answer is shown, a second model **checks it against the
  Notebook** (not when a picture or a file is attached to the question). If the Notebook does not say, the bot says it does not know, offers
  the closest pages, and files the question for somebody to write down.
- A question about a contact the practice directory holds is answered straight
  from the directory, with no model at all.

The Notebook is read live: a page written or edited a moment ago is in the
next answer. There is no training and no index to rebuild.

## /practice — the practice documents

The documents in `rag/sources/` (policies, forms, guidance) are searched by
their **words** — Postgres full-text search, with the document's title weighted
above its text. The best passages go to the model with the question, and it
answers in prose. Every part of that answer must **quote the passage it stands
on**, and the server checks the quote is really there; a part whose quote is not
found is deleted before anyone sees it.

## The Referrals page — finding the right card

The front page lists every referral in the Notebook's Referrals section. Type
it the way you would say it — "skin", "cancer skin", "nurse to visit at home" —
and it is matched by **name**: each everyday word stands for the words the cards
use ("skin" for Dermatology and Teledermatology, "heart tracing" for the ECG),
from a list kept in `lib/search/referral-aliases.mjs`, with typos allowed.
Nothing opens until you choose a result.

## Commands — one job each

A message starting with a slash asks for one particular card: `/accurx` routes a
pasted online-consultation request by the practice's own rules, `/form` and
`/template` find a form or a letter, `/consultation` and `/medication` read
pasted text, and `/practice` searches the documents (above).

## What is never done

- **No embeddings.** No question or page is turned into numbers and sent to an
  embeddings service; search is by words.
- **No training.** Nothing the practice writes is used to train a model. Every
  call goes only to providers set not to keep or train on what they are sent.
