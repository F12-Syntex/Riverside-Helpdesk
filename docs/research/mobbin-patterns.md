# Mobbin UX research: Riverside Helpdesk (Ask, Notes, Settings, Contacts)

Sources: Mobbin web screens and flows (iOS only for the phone-layout notes). Each pattern gives the app, the screen and a link. Mobbin captures are still images, so motion is described only where the frames show it (spinners, shimmer text, state changes between frames).

---

## 1. AI assistant Ask flows (web)

### 1a. Empty composer to conversation (first question)

- **ChatGPT, "Starting a chat"** ([flow](https://mobbin.com/flows/96a3ea86-9e59-47a7-97ca-0555fd4b3826), [flow](https://mobbin.com/flows/bbde3b79-0023-4bc3-895e-fbe7e807ad48))
  - Empty state: one H1 centred slightly above the middle ("What can I help with?" / "Ready when you are.").
  - A single rounded composer about 600px wide: "+" on the left, mic and a round black voice/send button on the right. The send arrow only appears once there is text.
  - One row of pill chips under the composer (Create image · Summarize text · Get advice · More).
  - Small grey disclaimer pinned at the bottom: "ChatGPT can make mistakes. Check important info."
  - After the first send, the composer docks to the bottom at the same width. The user's message becomes a right-aligned grey bubble, and the answer is unboxed, full-width, left-aligned text. A "Today" group appears in the sidebar with an auto-generated chat title.
- **Perplexity, "Asking a question"** ([flow](https://mobbin.com/flows/7cd01bf3-88cc-467b-a467-9c7ade7c092e))
  - Empty state: serif heading "Where knowledge begins" over a boxed composer with "Focus" and "Attach" at the bottom left and a "Pro" toggle and arrow at the bottom right. The arrow turns teal once there is text.
  - Example questions sit underneath as small emoji-prefixed chips.
  - On submit, the **question becomes the page H1** at the top left, and the follow-up composer floats as a pill at the bottom ("Ask follow-up").
- **Claude, "Starting a chat with AI" / "Creating a new chat"** ([flow](https://mobbin.com/flows/3a2db97d-f7f8-45dc-a135-ff172d7be183), [flow](https://mobbin.com/flows/09c2b29b-8a3a-4810-ace3-b1adc33c78f6))
  - Personal greeting in serif ("✳ Good afternoon, Alex").
  - Composer: "+" on the left, then the model chip ("Sonnet 4.6 Adaptive ⌄") and an orange send button on the right.
  - Five chips underneath (Write · Learn · Code · Life stuff · Claude's choice).
- **Microsoft Copilot, "Starting a chat"** ([flow](https://mobbin.com/flows/bb3218fc-eb7b-402a-8872-7546299f56a6), [flow](https://mobbin.com/flows/cca40905-eec8-4eb7-a182-b558e5ec440e))
  - "Hey Alex Smith, what's on your mind today?" over a soft-shadowed composer with a mode chip ("Smart ⌄" / "Quick response ⌄").
  - Two centred rows of suggestion chips.
  - The disclaimer sits low on the page.
  - In the conversation, a "Today ——" date divider sits above the first message, and the user bubble is tinted (peach).

### 1b. Thinking / searching state

- **Perplexity**
  - A "Pro Search ⌃" card shows steps that fade in one after another ("Understanding question"). When the answer arrives the card collapses to "3 steps completed ⌄" ([flow](https://mobbin.com/flows/7cd01bf3-88cc-467b-a467-9c7ade7c092e)).
  - Newer version: a single step line ("Reviewing the screenshot to identify… ›") above a teal shimmering "Thinking" label, with an **elapsed timer "5s" right-aligned**. The send button becomes a stop square ([screen](https://mobbin.com/screens/2460ef6c-5f63-45c8-8f73-8e95f3d904b7)).
- **Customer.io Agent**: the steps collapse into quiet one-liners above the answer: "Thought for 2 seconds ⌄", "Searched docs ⌄" ([screen](https://mobbin.com/screens/fafcbfb9-fa85-4b4d-b17f-54df962305b5)).
- **Plane Pi**: a "Thinking ··· ⌃" pill expands to a step list ("Understanding the query…", "Curating the ideal response path…", "Retrieving information…") ([screen](https://mobbin.com/screens/19249595-3bcc-418f-88e5-15d5b60ea3af)).
- **Qatalog**: two grey skeleton bars under the echoed question, plus a bottom pill "⟳ Preparing answer… [Cancel Esc]" ([screen](https://mobbin.com/screens/f53931fd-7ada-492d-877d-118a5de477a9)).
- **Claude**: an animated orange asterisk sits under the streaming text. A banner above the composer reads "Want to be notified when Claude responds? [Notify] ×" ([flow](https://mobbin.com/flows/3a2db97d-f7f8-45dc-a135-ff172d7be183)).
- **ChatGPT / Perplexity / Copilot**: during streaming, the send button turns into a **solid square Stop**.

### 1c. Streaming answer with sources / citations

- **Perplexity answer layout** ([flow](https://mobbin.com/flows/7cd01bf3-88cc-467b-a467-9c7ade7c092e)), in order:
  - "Sources" heading.
  - Three horizontal source cards (truncated title, favicon, "domain · 1") and a fourth card "View 17 more" with a favicon stack.
  - "Answer" heading over prose with **superscript citation numbers**.
  - Newer version: an "N sources" favicon-stack button in the action row opens a **right sheet titled "20 sources"** with cards (publisher, bold title, 2-line snippet) ([flow](https://mobbin.com/flows/abcb8608-801d-4116-a9d4-a242200c10b1)).
- **Notion "Ask AI" Q&A**, the closest analogue to answering from internal pages ([flow](https://mobbin.com/flows/139bc3b4-c3be-4c13-8e89-d3e9323cc919))
  - Intro bubble: "Ask me anything in Jane Smith's Notion. I'll find an answer in the pages you have access to." plus "I'm still in Beta, so please use the 👍 👎 buttons."
  - The answer bubble puts **numbered circle citations inline after each fact**.
  - Under the bubble: "10 pages found", a numbered list of page rows (with "See more ↓"). **Hovering a page shows a preview card**.
  - Then "Copy" and "Try again" buttons, with 👍 👎 to the right of the bubble.
- **Dropbox Dash**: a grey file chip ("Q1 Overview.pdf") after each sentence or bullet. The footer row reads "👍 👎 · PDF 1 source" ([screen](https://mobbin.com/screens/fc54be30-29ff-430c-9554-7858c47373e8)).
- **ChatGPT deep research**: domain-name pills inline at the ends of sentences, and a bottom "Sources" pill with stacked favicons. A right drawer with tabs "Activity | 23 Sources" streams the steps and ends with "Research completed in 5m · 23 sources" ([screen](https://mobbin.com/screens/73833b79-1dd5-4354-8fc4-a2e99c33a75e)).
- **Customer.io**: a "5 references" pill opens a popover with rows (title, URL, external-link icon) ([screen](https://mobbin.com/screens/fafcbfb9-fa85-4b4d-b17f-54df962305b5)).
- **Copilot**: the answer ends with a row of source cards (favicon, domain, title) plus "Show all" ([flow](https://mobbin.com/flows/bb3218fc-eb7b-402a-8872-7546299f56a6)).

### 1d. Answer action row (copy, retry, feedback)

- **ChatGPT**: icon-only row, small and grey, left-aligned under the answer: copy · 👍 · 👎 · share · regenerate ⌄ · ⋯. Older versions add a "‹ 1/2 ›" version pager and read-aloud ([flow](https://mobbin.com/flows/96a3ea86-9e59-47a7-97ca-0555fd4b3826)).
- **Claude**: copy · 👍 · 👎 · retry icons. An older version used text buttons "Copy · Retry" plus thumbs at the bottom right of the bubble ([flow](https://mobbin.com/flows/09c2b29b-8a3a-4810-ace3-b1adc33c78f6)).
- **Perplexity**: "Share" and "Rewrite" (text plus icon) on the left; copy, edit and ⋯ on the right.
- **Copilot**: 👍 · 👎 · share · copy | "✎ Edit this response".
- **Grok** shows the response latency ("590ms") in the row ([screen](https://mobbin.com/screens/f061623a-7466-4dcc-8a5f-e90f7af63007)).
- **Thumbs-down feedback**:
  - ChatGPT modal "Share feedback": chips (Incorrect or incomplete · Not what I asked for · Slow or buggy · Style or tone · Safety or legal concern · Other), an optional "Share details" field, the note "Your conversation will be included with your feedback…" and Submit ([screen](https://mobbin.com/screens/02d17744-3493-4270-b0e2-0285d8087aa5)).
  - Perplexity modal "Help us improve": 2-column checkable tiles with icons (Inaccurate · **Out of date** · Too short · Too long · Harmful or offensive · **Wrong sources**) and an optional "How can the response be improved?" field ([screen](https://mobbin.com/screens/dfb7bbbd-1bd8-4c59-b2cc-4d4c60252f52)).
  - Mistral Le Chat uses an **inline panel under the answer** instead of a modal: "What was wrong?" chips plus "Tell us more (optional)" with a 20/500 counter. The 👎 icon turns red ([screen](https://mobbin.com/screens/4a5c8393-5ae0-47ee-a729-499c3d68256f)).
  - Sana AI uses source-specific reasons: "The correct source is not found / The source is wrong / Incorrect sources are referenced" ([screen](https://mobbin.com/screens/5cfdb6e1-9d3e-4296-b57e-2c166ddb7a18)).
  - Gemini shows a confirmation snackbar after feedback, bottom left: "Selected preferred response. [Close]" ([screen](https://mobbin.com/screens/6ab984a1-0679-432e-ae65-c843422435de)).

### 1e. Follow-up suggestions

- **Perplexity**: a "Related" section under the answer, one question per row with a divider and "+" at the right (newer versions use a "↳" prefix). Clicking a row runs it as the next question ([flow](https://mobbin.com/flows/291675b5-d0d3-4610-bbd7-29e316e55de6)).
- **Copilot**: the suggested follow-up looks like a **right-aligned outlined message bubble** under the action row, so it reads as "something you could say" ([flow](https://mobbin.com/flows/cca40905-eec8-4eb7-a182-b558e5ec440e)).
- **Dropbox Dash**: "Ask a follow-up" label with three stacked outlined pills in blue text ([screen](https://mobbin.com/screens/fc54be30-29ff-430c-9554-7858c47373e8)).
- **Google Gemini**: for clarifying questions, an H3 ("What kind of math are you working on?") over three large tappable cards ("Algebra problem ↪") ([screen](https://mobbin.com/screens/6ab984a1-0679-432e-ae65-c843422435de)).
- **Customer.io**: a chip row docked above the composer with "Hide suggestions" and a ‹ › pager ([screen](https://mobbin.com/screens/17abb842-28d9-4161-8f66-afa8e3603702)).

### 1f. Error / retry

- **Lightfield**: a red-tinted inline row in the answer slot, "ⓘ An error occurred. [Retry]". Earlier tool steps stay visible above it ([screen](https://mobbin.com/screens/99d01dcd-a6c6-4a51-8e61-b202b1fe08af)).
- **Obvious**: a grey banner pinned directly above the composer, "⚠ Something went wrong. Try again. [Retry]". The user's message stays in the thread ([screen](https://mobbin.com/screens/0f5a43f5-12a4-4bab-b79a-2c90f83a7ce8)).
- **Tana**: a yellow banner above the composer, "AI response appears to have stopped. Reset" ([screen](https://mobbin.com/screens/46b7ca98-7f7f-4c1a-b089-1668560b688a)).
- **Zoho CRM**: a pink assistant bubble that **names an escalation path**: "A technical error has occurred. Kindly try again. If the issue continues, please reach out to us by email at …" ([screen](https://mobbin.com/screens/a14af107-a391-4ad4-b84c-c0b55b0adf9d)).
- **X**: red "↻ Failed, Try Again" under the failed outgoing message, plus a toast "Failed to send message" ([screen](https://mobbin.com/screens/744d79ff-4e39-4676-8e2b-058ee762ed01)).

### 1g. Scroll-to-latest

- **ChatGPT** (streaming) and **Copilot**: a round white button with a ↓ chevron and a light shadow, **centred horizontally just above the composer**. It appears only when you are scrolled up from the bottom ([ChatGPT flow](https://mobbin.com/flows/96a3ea86-9e59-47a7-97ca-0555fd4b3826), [Copilot flow](https://mobbin.com/flows/bb3218fc-eb7b-402a-8872-7546299f56a6)). Dropbox Dash places the same button at the right edge of the suggestions.

---

## 2. Notes / knowledge-base editors

### Sidebar page tree and header
- **Notion** ([flow](https://mobbin.com/flows/3c855d1d-cee5-467b-a1a8-1f75930cb637))
  - Sidebar from top to bottom:
    - Workspace switcher.
    - Search · Home · Inbox.
    - Small grey section labels ("Private", "Shared", "Teamspaces").
    - Rows with a disclosure caret, emoji/icon and truncated title. Hovering a row reveals "⋯" and "+".
    - "+ Add new" at the end of each section.
    - Settings · Templates · Trash at the bottom.
  - The current page row has a grey fill.
  - Top bar: breadcrumb "Parent / Page" and a "🔒 Private ⌄" chip on the left. On the right, **"Edited just now"** (save status as relative time) · Share · 💬 · ☆ · ⋯.
- **Confluence**: a "Content" tree with its **own "Search by title" filter input inside the sidebar** and DRAFT badges on rows. "+ Create" sits under the tree ([screen](https://mobbin.com/screens/82ddc5ce-4bcd-44b8-a35a-9e0e8b1182ee)).
- **Craft**: the left rail shows the doc title with status "Just now", tabs (contents / tasks / attachments / search) and an **auto-built Table of Contents from the headings** ([flow](https://mobbin.com/flows/3494747c-f430-49df-bf1b-066f453e32ff)).
- **Evernote**, three panes ([screen](https://mobbin.com/screens/f5df5f1b-94a3-43c9-a33b-ab9dd69cfe02)):
  - Sidebar with a large green "+ Note" button.
  - Middle list "My Notebook 9": cards with a bold title, 2-line snippet and relative time ("Just now", "Yesterday"). The selected card has a brand-colour outline.
  - The editor has a breadcrumb and a fixed toolbar.
- **Obvious**, three panes ([screen](https://mobbin.com/screens/d09552b9-ca39-4666-96e2-5d8dd30b6851)):
  - The middle column has a "Notes · 1" header, a search box and a "Today" group.
  - The editor shows a centred timestamp ("April 28, 2026 at 9:01 PM") above the title.

### Page title / new-page flow
- **Notion new page** ([flow](https://mobbin.com/flows/3c855d1d-cee5-467b-a1a8-1f75930cb637), [flow](https://mobbin.com/flows/e268c8dd-b4ce-4250-a096-a872b25f95ac))
  - A very large grey placeholder title, "New page" / "Untitled" (about 40px bold). Hovering above it reveals "Add icon · Add cover · Add comment".
  - Below the title is a starter menu: "Empty page ↵" (pre-highlighted, so Enter starts typing), "Start writing with AI…", and "Add new": Import · Templates · Table · More. A newer variant has a bottom "Get started with" chip row.
  - The new page appears in the sidebar at once and its title updates live as you type.
  - Body placeholder: "Write, press 'space' for AI, '/' for commands…", with "+" and "⋮⋮" drag handles in the left gutter.
- **Linear "Creating a document"**: an icon placeholder, a grey "New document" title, a "Start writing…" body and "Edited Mar 31" at the top right. The breadcrumb reads "Project › New document ☆ ⋯" ([flow](https://mobbin.com/flows/2408d97c-1095-4b1a-8c14-e9a7f4b88195)).

### Formatting toolbar
- **Linear**: a selection bubble toolbar (Aa ⌄ · B · I · S · link · quote · code · lists ⌄ · comment). The "Aa" menu lists Regular text / Heading 1–4 with shortcuts (⌘⌥0–4) ([flow](https://mobbin.com/flows/fb2fabf5-2480-4fa1-ae87-ae8ca79c763f)).
- **Asana**: a dark floating pill on selection (H1 H2 | B I U S | code | lists | link) ([screen](https://mobbin.com/screens/a5bd4ef5-d4ff-4b4f-bc2d-28ec7875c95b)).
- **Obvious**: a **persistent floating pill at the bottom centre** of the editor (H1 H2 H3 | B I U S link | • 1. ☐) ([screen](https://mobbin.com/screens/d09552b9-ca39-4666-96e2-5d8dd30b6851)).
- **Confluence / Evernote / Substack**: a full fixed toolbar under the header, for heavier editing.

### Save-status indicator
- **Notion**: "Edited just now" / "Edited 2d ago", grey, top right.
- **Asana**: "Saved • Just now" next to a "Done" button ([screen](https://mobbin.com/screens/a5bd4ef5-d4ff-4b4f-bc2d-28ec7875c95b)).
- **Hashnode**: a green cloud-check icon with "Saved" ([screen](https://mobbin.com/screens/6e163843-5c9e-4489-8a18-4f8cd1e6049b)).
- **Substack**: a small "● Saved" pill at the top left ([screen](https://mobbin.com/screens/b17b9c1c-d40d-4d18-93a9-aeb4b89ad5f0)).
- **Confluence**: "Saved" text left of "Publish…" and "Close draft".
- Manual-save variants: **Plain** shows "You have unsaved changes" beside the title with a "Save changes" button ([screen](https://mobbin.com/screens/2cee2f88-360a-41f9-9fcd-b8b69e5e1041)). **Cofounder** shows "Unsaved changes" with [Save] [Discard].

### Empty states
- **Twenty**: illustration, "Add your first Note", one line of help and an outlined "+ Add a Note" ([screen](https://mobbin.com/screens/de2c33e7-9982-4424-973a-c7beccf0c87d)).
- **Attio**: "No note templates found / Create your first template to standardize and streamline your note-taking" and a primary "Create template" ([screen](https://mobbin.com/screens/8ca474a6-56aa-4725-8baf-20c8c1ee98f4)).
- **Linear**: an icon, a 2-sentence explanation of what the object is, a primary "Create new project (N then P)" and a secondary "Documentation" ([screen](https://mobbin.com/screens/5273571d-4f58-410a-97a0-f6018dc8b80f)).
- **Notion Trash** empty state: "No results / Trashed pages appear here".

### Search in notes
- **Notion search modal** ([flow](https://mobbin.com/flows/275b0dca-b153-4787-b649-b720ce4e7911))
  - A centred overlay with the input at the top and a "Best matches" list.
  - Each result shows an icon, the title, the **breadcrumb path in grey**, and a snippet with the matched term in bold. The open page carries a "Current Page" badge.
  - Footer hints: "↑↓ Select · ↵ Open · ⌘↵ Open in new tab".
- **Fabric**: an in-note find bar ("team · 3 of 4 · ⌄ ⌃ ×") with matches highlighted in yellow ([screen](https://mobbin.com/screens/962aac7b-e34d-47e3-b80a-fbe164286d43)).
- **Dovetail**: a results list where each hit shows its container, title and a sentence with the term bolded on a highlight ([screen](https://mobbin.com/screens/3cb62c26-a987-4589-b53e-ccebab50ea08)).

### Delete confirmation
- **Notion**: the page "⋯" menu has "Move to Trash ⌘⌫". The result is a **dark toast at the bottom centre: "Moved to Trash [Restore]"** with no modal ([flow](https://mobbin.com/flows/0cece5d4-bd46-4ec3-add7-7b54c94fcc5a)). The Trash popover has tabs, a search field, and rows with the parent path plus ↶ restore / 🗑 delete-forever icons ([flow](https://mobbin.com/flows/87dd7d53-272f-47ea-b0d2-e760f1f1620a)).
- **Miro**: "Delete this board?" "You are about to delete **Copy of Design Retro**. It will stay in trash for 90 days." [Delete] [Cancel] ([screen](https://mobbin.com/screens/7f113a23-0ba1-4359-809c-7d337eae36ff)).
- **FLORA**: "Are you sure? Deleted items can be restored from the Trash if you change your mind." [Cancel] [Delete] (red text) ([screen](https://mobbin.com/screens/a25794b9-8a96-4951-a29a-ec25419a9efd)).
- **Sketch** (permanent): names the item in bold, says "You can't undo this action", and uses a red "Delete Permanently" ([screen](https://mobbin.com/screens/9a7ef588-1407-46dc-b6d5-949c6305a81c)).
- **Mintlify**: compact, with a trash icon, "Delete credential?", a one-sentence consequence, and Cancel / red Delete as equal-width buttons ([screen](https://mobbin.com/screens/5cc195f3-5987-45ac-844d-9b66ba228cb5)).

### Phone layout (iOS references)
- **Apple Notes list**: large title "Notes" with "2 Notes" count, an inset rounded list (title, then "time · snippet"), and at the bottom a **pill Search field next to a round compose button** in the thumb zone ([screen](https://mobbin.com/screens/1ae408b2-703f-412b-b97b-2172d45f0751)). **Raycast** is the same, with rows reading "Edited 1 day ago · 272 Characters" grouped Yesterday / This Week ([screen](https://mobbin.com/screens/11ad91dd-4adc-4f56-905a-4e4b3bcab2d0)).
- **Apple Notes editor**: top row with back ‹, undo, share, ⋯ and a yellow ✓ Done. A floating pill above the keyboard holds Aa · checklist · table · attach · markup ([screen](https://mobbin.com/screens/55703012-493d-4e9a-9dca-57ccc5e92433)).
- **Obsidian**: a horizontally scrollable bar above the keyboard (undo/redo/[[ ]]/file/tag/attach/H/B) ([screen](https://mobbin.com/screens/2994b4b9-84f2-43d4-9ef7-8680b675c718)).
- **Cosmos**: a segmented row (H1 H2 B I • U) above a full-width black "Add note" button ([screen](https://mobbin.com/screens/08b32ddd-5a66-4b56-8144-3117e3d2bde2)).

---

## 3. Settings: picking an AI model / provider

- **Cursor dashboard, Cloud Agents → Defaults** ([screen](https://mobbin.com/screens/76c329b0-8d07-40d4-9f74-28293e65c173), [screen](https://mobbin.com/screens/d2d6a3ee-dc33-48a2-9ea4-a528a522e563))
  - Two columns: a left nav, and on the right small grey section headings ("Defaults", "Pull Requests") over white cards of rows.
  - Each row has a **label with a grey helper line on the left** ("Default Model — Used when no model is specified") and a compact select on the right ("Select model ⌄" → "GPT-5.4 High ⌄").
  - The dropdown is a plain list of model names.
- **Perplexity settings modal** ([screen](https://mobbin.com/screens/8b187e59-6850-4e8c-a9c2-cba8b08c8847))
  - Left nav groups (Account / Computer / Other). On the right, sections "Preferences" and "Artificial Intelligence" with label, description and right-aligned control rows.
  - The model dropdown items have **two lines: the name, then "GPT Image 2 medium quality by OpenAI"**, with "New" badges and a check on the selected item.
  - Gated rows show "Upgrade to Max" in place of a select.
- **Claude / Perplexity composer model menus**: a name, a one-line purpose ("Most efficient for everyday tasks") and a check. Claude adds "More models ›" ([Claude](https://mobbin.com/flows/3a2db97d-f7f8-45dc-a135-ff172d7be183), [Perplexity](https://mobbin.com/screens/b3abc16b-cfa2-4c98-97a6-3f4979485139)).
- **Twenty, Settings → AI** ([screen](https://mobbin.com/screens/ecb8c8e1-26f5-431e-9360-8839dbf6d48e))
  - "Fast Model — Used for lightweight tasks like title generation [Claude ⌄]".
  - An "Available" section with a "Use best models only" toggle.
  - A **"Search a model…" input directly above a table** (Name | Provider | ☐).
- **Chatbase** ([screen](https://mobbin.com/screens/f68fb0a4-3309-4cc3-b904-dc9cb724943a))
  - A select-looking trigger ("GPT-5 ⇕") opens a combobox popover with "Search Models…" at the top and rows with provider logos.
  - **Hovering a row shows a side card**: "Anthropic / Claude 4.6 Opus · Credits cost: 5" and a description.
- **Cloudflare AI Playground** ([screen](https://mobbin.com/screens/2b0d9a61-bffb-4049-b88a-158b212881ad))
  - The searchable dropdown uses **two-line rows: a small grey provider slug ("workers-ai") above the model name**.
  - The chosen model shows a details box: "Model ID `workers-ai/workers-ai-neurons` [copy]", Input pricing, Output pricing. This matches the OpenRouter `provider/model` id shape.
- **Google AI Studio "Model selection" drawer** ([screen](https://mobbin.com/screens/e269121a-1b10-411e-94d3-b7ce631780a5))
  - Search, filter chips (Starred · All · Featured · Gemini · Live · Images), and cards.
  - Each card has the name, "New"/"Paid" badges, the **monospace model id under the name**, a description, pricing lines and knowledge cutoff, plus ☆ and copy-id icons.
  - Starring a model gives the toast "Starred Gemini 3.1 Pro Preview".
- **Vercel AI Gateway → Model List** ([screen](https://mobbin.com/screens/d477f50e-7a61-4ef4-a79a-e0ca4e5036ab))
  - A table with monospace ids (`anthropic/claude-opus-4.7`) and columns Context · Max Output · Latency · Throughput · Input $/M · Output $/M.
  - Search, type tabs (All/Text/Code/Image…), a provider filter and sort (Release date / Popularity).
- **Relevance AI**: a big modal with a filter rail (sliders for credits and context, Model Provider checkboxes including OpenRouter), a list (name, provider, tokens, cost tier), a right detail panel, and [Cancel] [Select Model] ([screen](https://mobbin.com/screens/94a61b0c-d8b5-4254-8147-426391e60452)).

### Validation of an id / connection
- **Langdock "Configure deployment"** ([screen](https://mobbin.com/screens/f09e1e4d-df91-4773-9505-801a01301180))
  - A "Model Name / ID" input with the helper "The identifier used by your provider to route requests to the correct model deployment (e.g., gpt-4o)".
  - When the test fails, a **red "Test failed" badge appears on the card header** and a red alert shows the provider's error text.
  - Footer: "Skip test →" | primary "Test & continue". A toast reads "Some deployment tests failed. Fix the issues and try again."
- **n8n credential**: a green banner "✓ Connection tested successfully [Retry]", with "Saved" next to the delete icon in the header ([screen](https://mobbin.com/screens/f862fcdd-7fd3-43dc-b203-69e8542a4972)).
- **ElevenLabs integration**: a red alert at the top of the form, "Connection failed — Connection failed: HTTP 401 Unauthorized" ([screen](https://mobbin.com/screens/e37ce067-3ae6-4212-81b0-5d65968f8fa5)).
- **AirOps**: on save failure, a bottom-right toast quotes the low-level error ([screen](https://mobbin.com/screens/96797b59-0f9a-499f-a407-9752fb0888af)).

### Dirty state and save bar
- **Clerk**: a **floating dark pill at the bottom centre**, "ⓘ Unsaved changes [Reset] [Save]", that appears only when something is dirty ([screen](https://mobbin.com/screens/2f75e661-a7a5-4f3d-83bb-e258af1db638)). **Laravel Cloud** (amber ⚠ icon) and **Klaviyo** ("◌ Unsaved changes [Discard] [Save]") are the same ([Laravel](https://mobbin.com/screens/bce31f98-3283-4c47-971c-8a0dda21ca4b), [Klaviyo](https://mobbin.com/screens/e06a4b15-a937-4f72-8096-9d4261b31972)).
- **Discord**: "Careful — you have unsaved changes! Reset · [Save Changes]" (green) ([screen](https://mobbin.com/screens/030909bf-d0ef-49f4-b78c-39bdf415b952)).
- **Etsy**: a full-width sticky footer that **names the change**: "There is 1 unsaved change. You changed: Shop section." [Discard changes] [Save draft] [Publish] ([screen](https://mobbin.com/screens/e5476550-1c37-4475-8b07-b5d3e9c1e070)).
- **Time2book**: after saving, a dark toast "✓ Policies updated — Policies have been successfully updated!" ([screen](https://mobbin.com/screens/18793a39-923c-4a7b-a485-50637eeff0df)).

---

## 4. Add / edit contact forms

- **HubSpot "Creating a contact"** ([flow](https://mobbin.com/flows/1f3ac445-7779-4d76-92a0-a494cea4d38c))
  - A **right slide-over panel** (about 1/3 width) with a teal header "Create Contact ×".
  - Labels sit above full-width inputs: Email · First name · Last name · Contact owner (select) · Job title · Phone number · Lifecycle stage (searchable select).
  - Sticky footer: [Create] (primary) · [Create and add another] · [Cancel].
  - On success, a top toast: "Success — A new contact was created. Go to record ↗ ×".
  - Required fields are marked with "*" in the label (as on "Deal name *" in the sister form).
- **HubSpot email error**: red underline and "Please enter a valid email address." **directly under the field** ([screen](https://mobbin.com/screens/5fa8824c-6555-4d3b-b026-6c78b698ebf6)).
- **Wix "Create a new contact"** modal ([screen](https://mobbin.com/screens/aa137aa9-7962-4560-a1f4-9724338124b9))
  - Labels in a left column, fields on the right.
  - Name (First/Last); Primary email with "+ Add Email"; Primary phone (Type · Code · Phone) with "+ Add Phone"; Address.
  - Footer: "Add New Field ⌄" on the left; "Save & Create Another" and "Save" on the right.
- **Zoom "Add a New Contact"**: only "Name *" is required; Office / Home / Mobile / Fax / Phone fields have placeholders ([screen](https://mobbin.com/screens/3ba61e34-90f4-4e2a-bd00-e2f36237b620)).
- **Skiff**: an avatar initial with a colour picker; First | Last side by side; a phone field with a **format placeholder "XXX-XXX-XXXX"**, a type chip ("Mobile") and "+" to add another ([screen](https://mobbin.com/screens/3d6e1135-e3a5-491a-8bf3-9a177656fc95)).
- **Oyster** and **Fresha**: the phone field has a **country-code prefix segment inside the input** ("+1 ⌄") ([Oyster](https://mobbin.com/screens/f59231b8-fa06-49d2-8a79-a97006c92c46), [Fresha](https://mobbin.com/screens/3cfcd3b4-7f7b-4b21-8f4b-ed196a7a1989)).

### Inline validation and error placement
- **sweetgreen** ([screen](https://mobbin.com/screens/8c9bfb21-ff08-4094-b89c-7860ec154cd7))
  - The phone underline turns red and the error appears **directly under the field with an icon and the rule spelled out**: "ⓘ Please enter a valid phone number (10 digits)".
  - The grey helper text ("In case there's an issue with your order") stays below the error.
  - Each filled field has a clear "×".
- **Loops**: on submit, every invalid field gets a red border and its own message ("Invalid email address", "Name must be at least 1 character long") ([screen](https://mobbin.com/screens/b9afa64a-5724-45bf-83ee-b1d5726823ee)).
- **Claude billing**: a red border, a red error icon inside the field at the right, and the message underneath ("Your card number is invalid.") ([screen](https://mobbin.com/screens/34e3cb61-99c3-4184-a302-74d9b03bdd0e)).
- **Fresha**: "This field is required" under a red-bordered field, **plus a top toast "Please correct all form errors."** ([screen](https://mobbin.com/screens/3cfcd3b4-7f7b-4b21-8f4b-ed196a7a1989)).
- Error summary near the submit button: **Cloudflare** "1 error — please review the highlighted fields above." ([screen](https://mobbin.com/screens/6106b193-582f-4be0-bff6-6a3b44aeaf9f)) and **Oyster** "Oops! We're missing some information — Please fill out the marked fields to continue." ([screen](https://mobbin.com/screens/8bf6a0af-8ba3-48f2-b267-d050b5673ad1)).
- Duplicates:
  - **Squarespace/Biosites**: inline under the email, "An account with this email already exists." ([screen](https://mobbin.com/screens/ed4ea4cf-e652-4434-8e93-f5426acece6e)).
  - **Pipedrive**: search before you create, so the typed email shows a "NEW" badge and "+ Add '…' as new contact" ([screen](https://mobbin.com/screens/64dc0876-ce01-4ea5-8a42-b9712d7b18d8)).

---

## Recommendations

### Ask flow
1. **Centred empty composer that docks on first send** (ChatGPT/Claude/Copilot). Put one plain H1 ("What do you need to check?") over a single rounded composer about 640px wide, with one row of 4–5 reception-specific starter chips underneath. On the first send, move the composer to the bottom at the same width. The question becomes a right-aligned tinted bubble and the answer flows full-width beneath it.
2. **Visible, honest thinking state** (Perplexity/Customer.io). Show a one-line step label ("Searching practice guidance…" → "Writing answer…") with a shimmer and an elapsed-seconds counter on the right. Once the answer arrives, collapse it to a quiet "Searched 4 guides · 3s ⌄". Turn send into a square **Stop** while streaming.
3. **Cited answers from practice sources** (Notion Q&A/Dash/Perplexity). Put numbered inline citation chips after each fact. Under the answer, add a "Sources (n)" list of guide/note titles; hovering a row previews the passage and clicking opens it, or an "n sources" button opens a right sheet. For an NHS context this is the main trust signal.
4. **Compact action row under every finished answer**: Copy · Retry · 👍 · 👎 (icons, grey, left-aligned, with tooltips). 👎 opens an **inline panel** (Mistral), not a modal, with reception-relevant chips: *Incorrect · Out of date · Wrong source · Missing info · Unsafe advice*, plus optional text. Show a "Thanks, sent to the practice team" snackbar afterwards.
5. **Follow-ups as tappable rows** (Perplexity "Related" with ↳). Show 2–3 suggested next questions under the action row; clicking one sends it straight away.
6. **Inline error in the answer slot** (Lightfield/Zoho). Keep the user's question and show a red-tinted row: "Couldn't get an answer. [Retry]", plus an escalation line ("If this keeps happening, check with the duty manager"). Never clear the thread.
7. **Scroll-to-latest button** (ChatGPT/Copilot): a round ↓ button centred just above the composer, shown only when scrolled up during or after streaming.

### Notes page redesign
1. **Three-zone layout** (Evernote/Obvious/Notion). Left: a sidebar tree of notes/folders with a "Filter notes…" input at the top (Confluence) and a primary "+ New note" button. Main: the editor. On wide screens, an optional middle list of cards (bold title, 2-line snippet, relative time).
2. **Header with breadcrumb and save status** (Notion/Asana): "Folder / Note title" on the left; on the right, "Saving…" → "Saved · just now" (grey, with a cloud-check icon), then a "⋯" menu (Duplicate, Move, Delete). If saving fails, the status turns red with "Couldn't save · Retry".
3. **Big inline title** (Notion/Linear). New notes open with the cursor in a large grey placeholder title ("Untitled note") and body placeholder "Start writing…". The sidebar row appears at once and updates live as the title is typed. No modal for naming.
4. **Formatting**. Use a selection bubble (Linear: Aa ⌄ Heading 1–3 / B / I / link / list) or a persistent bottom-centre floating pill (Obvious: H1 H2 H3 | B I U | • 1. ☐). Pick one, don't stack both. Show shortcuts in the Aa menu.
5. **Search**: a ⌘K overlay (Notion) with results showing the title, the folder path in grey and a snippet with the match bolded, plus footer key hints. Inside a note, a find bar with "3 of 4 ⌄ ⌃" and yellow highlights (Fabric).
6. **Empty states** (Twenty/Linear): an icon, "No notes yet", one sentence on what notes are for (e.g. "Keep practice procedures the assistant can cite"), a primary "+ New note" and a secondary help link. Add a "No notes match '…'" state for search.
7. **Delete = soft delete with undo** (Notion). Show a "Moved to Trash · Undo" toast with no modal. Confirm only for permanent delete, naming the note in bold with "This can't be undone" and a red button (Sketch/Miro). If notes feed the assistant, say so: "The assistant will stop citing it."
8. **Phone layout** (Apple Notes/Raycast iOS): a single column with the list first, a large "Notes" title with a count, and a bottom-docked **search pill plus round + button** in the thumb zone. Tapping a note opens it full screen with ‹ back, title and Done. The formatting bar becomes a horizontally scrollable strip pinned above the keyboard.

### Settings page
1. **Row layout** (Cursor/Perplexity): a section heading ("AI model"), then a card with rows: **label and grey helper on the left** ("Answer model — Used for every Ask answer. Changes apply to new questions."), control on the right.
2. **Combobox for the long OpenRouter list** (Chatbase/Cloudflare/Google AI Studio): a select-looking trigger opens a popover with "Search models…" at the top. Rows have two lines: a small grey provider slug above the name, or the name above a **monospace id `google/gemini-3.5-flash-lite`**. Optionally group rows by provider. Mark the current model with ✓ and the default with a "Default" badge. Allow free typing of an id not in the list ("Use '…' as custom id").
3. **Validate the id before saving** (Langdock/n8n/ElevenLabs):
   - Check the format inline as the user types (`provider/model`), with a helper example.
   - Then add a "Test model" button that runs a tiny call. On success, show a green "✓ Model responded in 0.8s". On failure, show a red alert quoting the provider error ("404 — model not found on OpenRouter") and keep Save available only after a pass, or behind an explicit "Save anyway".
4. **Dirty state and save bar** (Clerk/Klaviyo/Etsy): when the value differs from what is stored, show a floating bottom-centre pill: "Unsaved change: model → `x/y`  [Discard] [Save]". After saving, show a toast "Model updated, new answers will use `x/y`". Also offer "Reset to default (google/gemini-3.5-flash-lite)" as a text link under the row.
5. Show a small read-only **"Current model" details box** under the picker (Cloudflare): the id with a copy button, the provider, and pricing/context if OpenRouter returns them.

### Contacts add form
1. **Slide-over panel, not a full page** (HubSpot): a right panel titled "Add contact ×". Labels go above full-width inputs, in this order: Name* · Role/Organisation · Phone · Email · Notes. Sticky footer: **[Save] [Save and add another] [Cancel]**. On success, show a toast "Contact added · View".
2. **Required fields**: mark required fields with "*" in the label and add "* Required" at the top. If only the name is required (Zoom), label the others "(optional)" rather than starring everything.
3. **Validate on blur, re-check as the user types once errored** (sweetgreen/HubSpot). Show the message **directly under the field**, in red with an icon, and give the rule plus an example. For example, "Enter a UK phone number, like 01632 960123 or 07700 900123" (a suggested rule: 10–11 digits starting 0, or +44) and "Enter an email like name@nhs.net". Use a red border on the field. Keep the helper text visible under the error. Format phone numbers with spaces as the user types (Skiff placeholder style).
4. **On submit with errors** (Fresha/Cloudflare): focus the first invalid field and show a short summary next to the Save button: "2 fields need fixing". Never clear entered values.
5. **Duplicate check** (Squarespace/Pipedrive): if the phone or email matches an existing contact, show an inline note under that field: "Already saved as *Dr A. Patel* · Open". Don't block saving, but don't let it pass silently either.
6. **Multi-value phones** (Wix/Skiff): primary phone with a type chip (Main / Direct / Mobile / Fax) and "+ Add another number", so a contact can hold both a bleep and a switchboard number.
