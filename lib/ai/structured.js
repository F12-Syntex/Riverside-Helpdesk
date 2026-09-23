// Structured output, with a way round a provider that refuses it.
//
// generateObject asks the provider for JSON that fits the schema, and not
// every endpoint honours that. When it fails, the same request is made again
// as plain text asking for the JSON by hand, the first {...} in the reply is
// parsed and checked against the schema, and only if THAT fails does the
// caller see an error. Every call names its output cap, because an uncapped
// call reserves the model's whole window and is refused when the balance
// cannot cover it. Same shape as readValues in app/api/agent/route.js, shared
// so the defragmenter's two calls behave like the assistant's.
import { generateObject, generateText, zodSchema } from 'ai';
import { recordUsage } from './usage.js';

// Either `prompt`, or `system` + `messages` for a call that carries a
// conversation (the assistant's turn does).
export async function readStructured({ openrouter, model, schema, prompt, system, messages, maxOutputTokens = 2000, role = 'fast', phase = '', turnId = '' }) {
  const input = messages ? { system, messages } : { prompt };
  try {
    const out = await generateObject({ model: openrouter(model), schema, temperature: 0, maxOutputTokens, ...input });
    recordUsage({ turnId, role, phase, model, usage: out.usage });
    return out.object;
  } catch (first) {
    console.warn(`[structured] ${phase} failed on ${model}, retrying as text:`, String(first).slice(0, 200));
    const ask = '\n\nReply with ONE JSON object and nothing else — no prose, no code fence — matching this JSON Schema:\n' + JSON.stringify(zodSchema(schema).jsonSchema);
    const loose = await generateText({
      model: openrouter(model),
      temperature: 0,
      maxOutputTokens,
      ...(messages
        ? { system, messages: [...messages, { role: 'user', content: ask.trim() }] }
        : { prompt: prompt + ask }),
    });
    recordUsage({ turnId, role, phase: phase + 'Text', model, usage: loose.usage });
    const raw = String(loose.text || '');
    const a = raw.indexOf('{');
    const b = raw.lastIndexOf('}');
    if (a === -1 || b === -1) throw first;
    return schema.parse(JSON.parse(raw.slice(a, b + 1)));
  }
}
