# Which model each role should run on

Worked out against OpenRouter's live catalogue (338 models, fetched from
`https://openrouter.ai/api/v1/models` — the same endpoint
`app/api/settings/models/route.js` serves to the settings page) and against what
the code actually asks each role to do. Every requirement below is read out of a
file, not assumed.

## What each role has to be able to do

Taken from the call sites, not from the role descriptions in `lib/settings.js`.

### Reasoning — `ai_model`

| Requirement | Where it comes from |
| --- | --- |
| Structured outputs | `lib/agent/compose.mjs:620` — `generateObject` against `AnswerSchema`, a nested zod object. A model without reliable JSON schema support fails the whole turn (attempt 1 throwing rethrows). |
| **Vision** | `app/api/ask/route.js:428` — the docfile/triage path sends `image_url` parts on this model. A photographed letter is answered here. |
| Generous output ceiling | No `max_tokens` is set on either reasoning call (`ask/route.js:222`, `compose.mjs:620`). The provider default is the ceiling, and a truncated response is invalid JSON, not a short answer. |
| Must honour reasoning-off | `app/api/agent/route.js:256` and `ask/route.js:222` send `reasoning: { enabled: false, exclude: true }`. |
| Repair round | `MAX_ATTEMPTS = 2` in `compose.mjs:36` — a failed validation re-sends the whole prompt. Instruction-following buys real money here, not just quality. |

### Fast — `ai_model_fast`

| Requirement | Where it comes from |
| --- | --- |
| Tool calling, reliably | `app/api/agent/route.js:375-391` — the research loop is nothing but tool calls, up to `MAX_RESEARCH_STEPS = 6`. `lib/agent/research-model.mjs:55` exists solely because a model too weak to call a tool fails *silently*; the recovery is a second full pass on the reasoning model. |
| **Vision** | The research loop receives pasted images (`agent/route.js:356`) and the knowledge ingester runs on this role (`lib/knowledge.js:296`). |
| Cheap input, and cheap cache reads | Four to six sequential steps, each re-sending everything so far. Input dominates; output is ~120 tokens a step and nobody reads it. |
| Low per-call latency | The steps are sequential. Time-to-first-token is paid 4–6 times per question; tokens/second barely matters here. |

### Web — `ai_model_web`

| Requirement | Where it comes from |
| --- | --- |
| Search-grounded **or** tool-capable | `lib/agent/web-search.mjs:28` — a `perplexity/*` or `*sonar*` slug takes the native path with no `tools` key; anything else gets `openrouter:web_search` with the exa engine bolted on. |
| Nothing else | `max_tokens: 900`, a one-line prompt, no images. What is kept is the citations, not the prose (`collectResults`). |

## Modelled cost per 1,000 questions

Token profile derived from the code: research loop 22,120 input / 480 output
(4 steps, 3,100-token cacheable prefix); writer 9,000 in / 1,400 out
(`selectSources` caps sources at 24,000 chars = `MAX_CHARS`) with a repair on
25% of turns; web search on 33% of turns. The app already measures the real
figures per phase per model into `ai_usage` — swap them in and these tables
re-rank themselves.

### Fast role

| Model | $/1k q | with prefix caching | in / out | agentic | intel | vision | reasoning |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `google/gemini-3.5-flash-lite` *(today)* | $7.84 | $5.33 | 0.30 / 2.50 | 26.8 | 36.5 | yes | **mandatory** |
| **`openai/gpt-5.6-luna`** | **$2.50** | **$1.66** | 0.10 / 0.60 | **45.6** | **51.2** | yes | off-able |
| `deepseek/deepseek-v4-flash-0731` | $2.08 | $1.41 | 0.09 / 0.18 | 45.7 | 49.9 | **no** | off-able |
| `xiaomi/mimo-v2.5` | $3.23 | $1.96 | 0.14 / 0.28 | 23.7 | 37.2 | yes | off-able |
| `openai/gpt-5.4-nano` | $5.02 | $3.35 | 0.20 / 1.25 | 27.5 | 38.2 | yes | off-able |
| `minimax/minimax-m3` | $7.21 | $4.98 | 0.30 / 1.20 | 35.4 | 44.4 | yes | off-able |

DeepSeek V4 Flash is marginally cheaper and marginally better at tool use, and
it is text-only — which means every question with a pasted image fails the
research loop and pays for a second pass on the reasoning model. It is not a
candidate for this role.

### Reasoning role

| Model | $/1k q | in / out | intel | agentic | max out | vision | reasoning |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `google/gemini-3.5-flash-lite` *(today)* | $7.75 | 0.30 / 2.50 | 36.5 | 26.8 | 65,536 | yes | **mandatory** |
| **`openai/gpt-5.6-luna`** | **$2.18** | 0.10 / 0.60 | 51.2 | 45.6 | 128,000 | yes | off-able |
| **`openai/gpt-5.6-terra`** | **$21.75** | 1.00 / 6.00 | **55.0** | 47.4 | 128,000 | yes | off-able |
| `anthropic/claude-sonnet-5` | $40.00 | 2.00 / 10.00 | 53.4 | 46.7 | 128,000 | yes | off-able |
| `openai/gpt-5.6-sol` | $108.75 | 5.00 / 30.00 | 58.9 | 54.0 | 128,000 | yes | off-able |
| `anthropic/claude-opus-5` | $100.00 | 5.00 / 25.00 | **60.7** | 55.3 | 128,000 | yes | off-able |
| `z-ai/glm-5.2` | $12.79 | 0.76 / 2.42 | 51.1 | 43.1 | 262,144 | **no** | off-able |
| `google/gemini-3.6-flash` | $30.00 | 1.50 / 7.50 | 50.1 | 38.7 | 65,536 | yes | **mandatory** |

GLM 5.2 is the best price-per-point in the table and is text-only, so it cannot
take the docfile/triage path. Kimi K3 (intel 57.1) and Grok 4.5 both report
`max_completion_tokens: null` — no stated output ceiling, on a path that sets no
`max_tokens` of its own.

### Web role

| Model | $/1k q | in / out | `web_search` | path taken |
| --- | --- | --- | --- | --- |
| **`perplexity/sonar`** | $0.36 | 1.00 / 1.00 | $0.005 | native — no `tools` key |
| `perplexity/sonar-pro` | $3.86 | 3.00 / 15.00 | $0.005 | native |
| `openai/gpt-5.6-luna` | $0.15 | 0.10 / 0.60 | $0.005 | exa plugin |
| `google/gemini-3.5-flash-lite` *(today)* | $0.62 | 0.30 / 2.50 | $0.014 | exa plugin |

Token cost is noise at 900 output tokens. What decides this role is which of the
two mechanisms in `web-search.mjs` runs and what the search itself costs — and
the exa plugin's price is set by the plugin, not by the model's `web_search`
field, so it is not in this API.

## The defect in the current configuration

`google/gemini-3.5-flash-lite` — the default in `lib/settings.js:22`, and
therefore what every unset role inherits — carries
`reasoning: { mandatory: true, default_effort: "minimal" }` and a separate
`internal_reasoning` price of **$2.50 per million**, the same as its completion
rate.

Both AI paths explicitly ask for reasoning to be turned off:

```js
// app/api/agent/route.js:250-256
// No extended reasoning. None of the three phases is a puzzle […]
// On a model that thinks first, that deliberation is most of the wait
reasoning: { enabled: false, exclude: true },
```

A mandatory reasoner ignores `enabled: false`. `exclude: true` then hides those
tokens from the response — it does not stop them being generated or billed. So
the practice is currently paying the top output rate for deliberation the code
says it does not want, and waiting for it, on every question, on both roles. The
comment above is right about where the time goes; the model underneath it cannot
comply.

Every model recommended below reports `mandatory: false`, and Luna and Terra
both list `"none"` among their supported reasoning efforts — so
`enabled: false` is actually honoured.

## Recommendation

| Preset | Model | Why |
| --- | --- | --- |
| **Fast** | `openai/gpt-5.6-luna` | Dominates the incumbent on every measured axis: 3× cheaper input, 4.2× cheaper output, 10× cheaper cache reads, agentic 45.6 vs 26.8, and it honours reasoning-off. Tool reliability is what `research-model.mjs` was written to defend against, and it is the best-scoring option that is also cheap and can see. |
| **Reasoning** | `openai/gpt-5.6-terra` | intel 55.0 / agentic 47.4 for $1/$6 — within 5.7 points of Opus 5 at a fifth of the price, with vision, structured outputs, a 128k output ceiling and reasoning that can be switched off. This is the one role whose output a human reads. |
| **Web search** | `perplexity/sonar` | Takes the native path `web-search.mjs` was built for (no `tools` key, no 404 retry), returns `search_results` and `citations` that `collectResults` reads first-class, and bundles search at $0.005/request. Sonar Pro is 10× the token cost for the same search price. |

Three configurations, whole-question cost:

| Configuration | $/1k questions |
| --- | --- |
| Today — flash-lite on everything | $13.69 |
| Luna on everything | **$3.99** |
| Luna fast + Terra writing + Sonar web | $23.78 |
| Luna fast + Sonnet 5 writing + Sonar web | $42.03 |
| Luna fast + Opus 5 writing + Sonar web | $102.03 |

If cost is the binding constraint, Luna on all three roles is a strict
improvement on today in both directions at once — 3.4× cheaper *and* +14.7
intelligence / +18.8 agentic on both roles. If the answers matter more than the
bill, Terra on the writer costs 1.7× today's total and buys +18.5 intelligence
points where a receptionist actually reads them.

## What is not in this analysis

**Speed.** `latency_last_30m` and `throughput_last_30m` come back `null` for
every endpoint of every model checked, so there is no tokens/second or
time-to-first-token figure available from the API. Nothing here ranks models by
observed speed, because there is nothing objective to rank them with.

What *can* be said about latency from the code: mandatory reasoning adds a fixed
pause to every call and the current default has it; the research loop pays
time-to-first-token 4–6 times sequentially, so per-call latency matters there far
more than throughput; and the writer is one long structured generation, where
output rate is what shows.

Two ways to close that gap:

1. `recordUsage` in `lib/ai/usage.js` already writes a row per phase per turn per
   model. Add elapsed milliseconds to `ai_usage` and the settings page can report
   measured seconds per role alongside the measured cost it already reports —
   real numbers for this practice's questions, on whichever models it has run.
2. A smoke test with the live key against the three picks, which also confirms
   the point below.

**Provider retention.** Every AI call sends `provider: { data_collection: 'deny' }`.
That narrows a model to the endpoints whose provider does not retain prompts, and
OpenRouter's public API does not expose per-provider data policy — so it cannot
be checked from the catalogue. Each pick needs one live call to confirm a
qualifying endpoint exists before it is saved at `/settings`.
