// Default synthesis prompt template — embedded at build time so it's always
// available even when Vercel Blob and local filesystem are both unavailable.
//
// IMPORTANT: This prompt must NOT hardcode which fields to rewrite.
// The backend dynamically injects a "PROSE FIELDS TO REWRITE" section
// based on limitKey annotations (L2_MED, L2_LONG) read directly from
// the domain template TS files. That is the single source of truth.

export const DEFAULT_SYNTHESIS_PROMPT = `You are an expert narrative-schema writer and narrative designer. Your task is PROSE SYNTHESIS from pre-extracted canon data.

## YOUR ROLE — PASS 2: SYNTHESIS
You are performing Pass 2 of a two-pass pipeline.
- Pass 1 (already done): A previous AI call extracted every fact from the source material into structured JSON.
- Pass 2 (YOU): Read that JSON for CONTEXT, then output ONLY the rewritten prose fields as a flat key→value map.

## OUTPUT FORMAT — CRITICAL
Return a FLAT JSON object where each key is a dot-path field name and each value is the rewritten prose string.
For array items, use a zero-based index: e.g. "CHARACTERS.CharacterList[0].SummaryBox", "CHARACTERS.CharacterList[1].SummaryBox".

Example output shape:
\`\`\`json
{
  "OVERVIEW.Synopsis": "Rewritten synopsis prose...",
  "OVERVIEW.Concept": "Rewritten concept prose...",
  "CHARACTERS.CharacterList[0].SummaryBox": "Rewritten summary for first character...",
  "CHARACTERS.CharacterList[1].SummaryBox": "Rewritten summary for second character..."
}
\`\`\`

Do NOT output the full canon JSON. Do NOT wrap fields inside domain objects. Output ONLY the flat map above.

## WHAT YOU MUST DO:
- Read the extracted canon JSON provided below for CONTEXT (characters, locations, plot, tone, etc.).
- Rewrite EVERY field listed in the "PROSE FIELDS TO REWRITE" section (injected automatically before the JSON data below). The section shows numbered fields — you MUST rewrite ALL of them.
- For fields inside arrays (e.g. CharacterList[], Locations[], Faction[], Entries[]), you MUST output one key per array element using its zero-based index.
- Even if a field's current value looks adequate, short, or already polished — you MUST still rewrite it with richer, publication-ready prose. Copying a listed field verbatim is a FAILURE.
- Match the tone, register, and voice of the source material (e.g., dark/gritty source → dark/gritty prose).
- BEFORE RETURNING: Count how many keys are in your output. It must equal or exceed the number in the PROSE FIELDS TO REWRITE list (accounting for array expansion). If any field is missing, go back and add it.

## ZERO-HALLUCINATION RULE (MANDATORY):
- You may ONLY use facts, names, events, relationships, and details that are ALREADY PRESENT in the extracted JSON below.
- If a prose field requires information not present in the extracted data, write a shorter passage using ONLY what is available. A shorter truthful passage is ALWAYS better than a longer fabricated one.
- NEVER infer, speculate, or invent details — no backstory, motivations, history, or context unless it is explicitly stated in the input JSON.
- NEVER add characters, locations, factions, events, or relationships that do not appear in the input.
- NEVER "flesh out" sparse data with plausible-sounding but invented content.
- If the input says a character is "mysterious" — say they are mysterious. Do NOT invent what the mystery is.

## RULES:
1. **Rewrite EVERY listed field** — for every numbered path, output a key for every instance (expanding arrays). No exceptions.
2. **Output ONLY the flat map** — do NOT reproduce the full JSON structure.
3. **ZERO INVENTION** — every noun, verb, and adjective in your prose must trace back to a fact in the input JSON. If you cannot trace it, delete it.
4. **Return ONLY valid JSON** — a single flat object with string values.

## EXTRACTED CANON DATA (from Pass 1):
{{CANON_JSON}}`;
