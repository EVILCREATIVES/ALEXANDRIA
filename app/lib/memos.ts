/**
 * Memos — Evolving Narrative Engine
 * 
 * Architecture follows "Everything is Context" (arxiv 2512.05470v1):
 * 
 *  /history/   — Immutable notes (text, audio transcripts, images). Source of truth.
 *  /memory/    — Structured AI-derived context (character profiles, plot points, themes).
 *  /scratchpad/— Transient working state during generation.
 *
 * Context Engineering Pipeline:
 *  Constructor  — Selects relevant history + memory for the token window
 *  Updater      — Streams incremental context into the model
 *  Evaluator    — Validates output, updates memory, archives scratchpad
 */

import { put } from "@vercel/blob";

// ─── Work Type & Settings ───────────────────────────────────────────

export type WorkType = "diary" | "novel" | "nonfiction";
export type PointOfView = "first" | "third";

export interface MemoSettings {
  workType: WorkType;
  pointOfView: PointOfView;
  title: string;
  authorName?: string;
  genre?: string;
  tone?: string;          // e.g. "dark", "whimsical", "literary"
  customInstructions?: string; // additional creator direction
  model?: string;         // default: "claude-sonnet-4-6"

  language?: string;               // Output language (e.g. "English", "French", "Spanish")

  // AI Instruction layers (editable by user in Settings)
  writerPersona?: string;          // Who the AI "is" as a writer
  creativeDirectives?: string;     // How the AI should approach storytelling
  sourceInterpretation?: string;   // How to interpret different source types
  narrativeStyle?: string;         // Prose style guidance
  evaluatorInstructions?: string;  // How memory extraction should work
}

// ─── Notes (History layer — immutable source of truth) ──────────────

export type NoteType = "text" | "audio" | "image";

export interface MemoNote {
  noteId: string;           // UUID
  createdAt: string;        // ISO timestamp
  date: string;             // YYYY-MM-DD (the calendar day)
  type: NoteType;
  
  // Text content (always present — original text or transcription)
  content: string;
  
  // Audio-specific
  audioUrl?: string;        // Vercel Blob URL of the recording
  audioDuration?: number;   // seconds
  
  // Image-specific
  imageUrl?: string;        // Vercel Blob URL
  imageCaption?: string;    // AI-generated description of the image
}

// ─── Memory Layer — structured, AI-derived context ──────────────────

export interface MemoryEntry {
  entryId: string;
  type: "character" | "plotPoint" | "theme" | "setting" | "relationship" | "fact" | "summary";
  label: string;
  content: string;
  sourceNoteIds: string[];  // provenance — which notes contributed
  createdAt: string;
  updatedAt: string;
  confidence: number;       // 0-1, from context evaluator
}

// ─── Story State ────────────────────────────────────────────────────

export interface StoryVersion {
  versionId: string;
  createdAt: string;
  storyUrl: string;          // Vercel Blob URL to full story text
  wordCount: number;
  notesIncorporated: string[]; // noteIds that were part of generation
  changelog: string;          // AI-generated summary of what changed
}

// ─── Memo Manifest (the root document) ──────────────────────────────

export interface MemoManifest {
  memoId: string;
  createdAt: string;
  updatedAt: string;
  
  settings: MemoSettings;
  
  // History layer (immutable notes, chronological)
  notes: MemoNote[];
  
  // Memory layer (AI-derived structured context)
  memory: MemoryEntry[];
  
  // Story versions (each generation produces a new version)
  storyVersions: StoryVersion[];
  
  // Current story text (cached for quick display)
  currentStory?: string;
  currentStoryUrl?: string;
  
  // Generation status
  lastGeneratedAt?: string;
  pendingNoteIds?: string[]; // notes added since last generation
}

// ─── Factory ────────────────────────────────────────────────────────

export function newMemoManifest(memoId: string, settings: MemoSettings): MemoManifest {
  return {
    memoId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    settings,
    notes: [],
    memory: [],
    storyVersions: [],
  };
}

// ─── Blob Storage Helpers ───────────────────────────────────────────

export function memoManifestPath(memoId: string) {
  return `memos/${memoId}/manifest.json`;
}

export async function saveMemoManifest(manifest: MemoManifest): Promise<string> {
  manifest.updatedAt = new Date().toISOString();
  const blob = await put(memoManifestPath(manifest.memoId), JSON.stringify(manifest, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });
  return blob.url;
}

export async function fetchMemoManifest(url: string): Promise<MemoManifest> {
  const u = new URL(url);
  const cleanUrl = `${u.origin}${u.pathname}`;
  const res = await fetch(`${cleanUrl}?v=${Date.now()}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!res.ok) throw new Error(`Failed to fetch memo manifest: ${res.statusText}`);
  return (await res.json()) as MemoManifest;
}

// ─── Context Constructor (paper §V-B1) ─────────────────────────────
// Selects and compresses context from history + memory to fit token window

export interface ConstructedContext {
  systemPrompt: string;
  recentNotes: MemoNote[];
  relevantMemory: MemoryEntry[];
  currentStory: string;
  tokenEstimate: number;
}

/**
 * Build the context window for story generation.
 * Follows the paper's Context Constructor pattern:
 * 1. Select relevant notes (most recent + important)
 * 2. Include structured memory (character/plot summaries)
 * 3. Include current story state
 * 4. Compress to fit token budget
 */
export function constructContext(
  manifest: MemoManifest,
  tokenBudget: number = 180000 // Sonnet 4.6 has ~200K context, leave room for output
): ConstructedContext {
  const { settings, notes, memory, currentStory } = manifest;
  
  // System prompt based on work type and POV
  const povLabel = settings.pointOfView === "first" ? "first person" : "third person";
  const workLabel = settings.workType === "diary" 
    ? "personal diary/journal" 
    : settings.workType === "novel" 
      ? "novel/fiction" 
      : "non-fiction work";
  
  // ── Writer Persona ──
  const writerPersona = settings.writerPersona || 
`You are an accomplished author and creative writing partner. You don't just transcribe or organize — you CREATE. You bring your own literary craft: vivid scenes, compelling dialogue, emotional depth, narrative tension, and artful pacing. You are a co-author who elevates raw material into polished storytelling.`;

  // ── Creative Directives ──
  const creativeDirectives = settings.creativeDirectives ||
`CREATIVE MANDATE:
- The user's notes are RAW MATERIAL and INSPIRATION — not a transcript to copy. Transform them into narrative.
- ADD your own scenes, transitions, sensory details, inner monologue, and dialogue where they serve the story.
- CREATE dramatic tension, foreshadowing, and payoffs. Don't wait for the user to spell everything out.
- DEVELOP characters beyond what the notes say — give them gestures, habits, contradictions, voices.
- STRUCTURE scenes with proper pacing: beats, rising action, moments of stillness, climaxes.
- MAINTAIN a consistent narrative voice throughout — the story should read like a real ${workLabel}.
- If the notes are fragmentary or sparse, that's an invitation to fill the gaps with your craft.
- Every generation should feel like reading a chapter of a published book, not a summary of someone's notes.`;

  // ── Source Interpretation ──
  const sourceInterpretation = settings.sourceInterpretation ||
`HOW TO INTERPRET DIFFERENT SOURCES:
- TEXT NOTES: These are the creator's ideas, scenes, or direction. Use them as story beats but write them as proper narrative prose.
- AUDIO TRANSCRIPTS: These capture the creator thinking out loud — often rambling, disjointed, stream-of-consciousness. Extract the INTENT and EMOTION, not the literal words. A mumbled "maybe she goes to the house and finds something weird" should become a fully realized scene.
- IMAGE DESCRIPTIONS: These are mood boards and visual references. Let them inspire atmosphere, setting, color palette, and tone — don't just describe what's in the image. A photo of a foggy dock should infuse the next scene with that atmosphere.`;

  // ── Narrative Style ──
  const narrativeStyle = settings.narrativeStyle ||
`PROSE STYLE:
- Write in ${povLabel} point of view, maintaining it consistently.
- Use vivid, specific sensory details — not generic descriptions.
- Vary sentence length and rhythm for natural prose flow.
- Show, don't tell — render emotions through action, dialogue, and physical detail.
- Let subtext do work — not everything needs to be stated explicitly.
${settings.tone ? `- Overall tone: ${settings.tone}` : ""}
${settings.genre ? `- Genre conventions to honor: ${settings.genre}` : ""}`;

  const systemPrompt = `${writerPersona}

---
PROJECT: "${settings.title}" — a ${workLabel} in ${povLabel}
${settings.authorName ? `Author: ${settings.authorName}` : ""}
${settings.genre ? `Genre: ${settings.genre}` : ""}
${settings.tone ? `Tone: ${settings.tone}` : ""}
${settings.language ? `\n*** OUTPUT LANGUAGE: ${settings.language} ***\nYou MUST write the ENTIRE story in ${settings.language}. Every sentence, every line of dialogue, every description — all in ${settings.language}. The source notes may be in any language — that does not matter. Your output language is ${settings.language}. This is non-negotiable.` : ""}
---

${creativeDirectives}

${sourceInterpretation}

${narrativeStyle}
${settings.customInstructions ? `\nADDITIONAL CREATOR DIRECTIONS:\n${settings.customInstructions}` : ""}

IMPORTANT: Output ONLY the full updated story text. No commentary, no meta-discussion, no "here's what I changed" notes.`;

  // Estimate tokens roughly (1 token ≈ 4 chars)
  const estimateTokens = (s: string) => Math.ceil(s.length / 4);
  
  let usedTokens = estimateTokens(systemPrompt);
  
  // ── Relevance-filtered memory (not blind dump) ──
  // Score memory entries: high-confidence + recently updated + type importance
  const pendingIds = new Set(manifest.pendingNoteIds || []);
  const pendingNoteTexts = notes
    .filter(n => pendingIds.has(n.noteId))
    .map(n => (n.content + " " + (n.imageCaption || "")).toLowerCase());
  
  const scoredMemory = memory.map((m) => {
    let score = m.confidence; // base: confidence from evaluator
    
    // Recency bonus: entries updated recently get a boost
    const ageMs = Date.now() - new Date(m.updatedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < 1) score += 0.3;
    else if (ageDays < 7) score += 0.15;
    
    // Type priority: characters and relationships are always important
    if (m.type === "character" || m.type === "relationship") score += 0.2;
    else if (m.type === "plotPoint" || m.type === "setting") score += 0.1;
    
    // Keyword overlap with pending notes (simple text matching)
    if (pendingNoteTexts.length > 0) {
      const labelLower = m.label.toLowerCase();
      const contentLower = m.content.toLowerCase();
      for (const noteText of pendingNoteTexts) {
        // Check if the memory label appears in any pending note
        if (noteText.includes(labelLower)) score += 0.25;
        // Check for shared significant words (>4 chars to skip articles)
        const noteWords = noteText.split(/\s+/).filter(w => w.length > 4);
        const matchCount = noteWords.filter(w => contentLower.includes(w)).length;
        score += Math.min(0.2, matchCount * 0.05);
      }
    }
    
    return { entry: m, score };
  });
  
  // Sort by score descending, include top entries within token budget
  scoredMemory.sort((a, b) => b.score - a.score);
  
  const relevantMemory: MemoryEntry[] = [];
  const memoryTokenBudget = Math.min(tokenBudget * 0.15, 30000); // cap memory at 15% of budget
  let memoryTokens = 0;
  
  for (const { entry } of scoredMemory) {
    const entryTokens = estimateTokens(`[${entry.type}] ${entry.label}: ${entry.content}`);
    if (memoryTokens + entryTokens > memoryTokenBudget) break;
    relevantMemory.push(entry);
    memoryTokens += entryTokens;
  }
  
  usedTokens += memoryTokens;
  
  // Include current story
  const storyText = currentStory || "";
  usedTokens += estimateTokens(storyText);
  
  // Include notes, most recent first, until budget
  const sortedNotes = [...notes].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  // Always include pending notes first
  const pendingNotes = sortedNotes.filter(n => pendingIds.has(n.noteId));
  const olderNotes = sortedNotes.filter(n => !pendingIds.has(n.noteId));
  
  const recentNotes: MemoNote[] = [];
  
  for (const note of [...pendingNotes, ...olderNotes]) {
    const noteTokens = estimateTokens(
      `[${note.date}] ${note.type}: ${note.content}` +
      (note.imageCaption ? ` (Image: ${note.imageCaption})` : "")
    );
    if (usedTokens + noteTokens > tokenBudget) break;
    recentNotes.push(note);
    usedTokens += noteTokens;
  }
  
  return {
    systemPrompt,
    recentNotes,
    relevantMemory,
    currentStory: storyText,
    tokenEstimate: usedTokens,
  };
}

/**
 * Format the constructed context into the final prompt for Claude.
 */
export function formatPrompt(ctx: ConstructedContext): string {
  const parts: string[] = [];
  
  // Memory section
  if (ctx.relevantMemory.length > 0) {
    parts.push("=== ESTABLISHED CONTEXT ===");
    for (const m of ctx.relevantMemory) {
      parts.push(`[${m.type.toUpperCase()}] ${m.label}: ${m.content}`);
    }
    parts.push("");
  }
  
  // Current story
  if (ctx.currentStory) {
    parts.push("=== CURRENT STORY ===");
    parts.push(ctx.currentStory);
    parts.push("");
  }
  
  // New notes — labeled by source type so AI can interpret them differently
  if (ctx.recentNotes.length > 0) {
    parts.push("=== RAW SOURCE MATERIAL (new notes to weave into the narrative) ===");
    // Show in chronological order
    const chronological = [...ctx.recentNotes].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    for (const note of chronological) {
      let label = "TEXT NOTE";
      if (note.type === "audio") label = "VOICE MEMO (transcript — interpret intent, not literal words)";
      if (note.type === "image") label = `VISUAL REFERENCE (image: ${note.imageCaption || "no caption"} — use for atmosphere/mood)`;
      parts.push(`[${note.date}] [${label}]`);
      parts.push(note.content);
      parts.push("");
    }
  }
  
  // Creative instruction — not "incorporate" but "create from"
  const langReminder = ctx.systemPrompt.includes("OUTPUT LANGUAGE")
    ? ` Remember: write EVERYTHING in the specified output language, regardless of what language the notes are in.`
    : "";
  if (ctx.currentStory) {
    parts.push(`Using the source material above as inspiration and creative direction, write the next evolution of this story. You may restructure, expand scenes, add new transitions, develop characters, and bring your own creative judgment. Output the COMPLETE updated story — from the beginning, incorporating everything.${langReminder}`);
  } else {
    parts.push(`Using the source material above as your creative foundation, write a compelling opening for this story. Don't just restate the notes — transform them into vivid, engaging narrative prose. Create scenes, develop atmosphere, bring characters to life. Output the story text.${langReminder}`);
  }
  
  return parts.join("\n");
}

// ─── Context Evaluator (paper §V-B3) ───────────────────────────────
// Post-generation: extracts structured entities, updates memory, scores confidence

const EVALUATOR_SYSTEM_PROMPT = `You are a precise literary analyst. Given a story text and the notes that were just incorporated, extract structured narrative entities.

Return a JSON object with a single key "entities" containing an array. Each entity must have:
- "type": one of "character", "plotPoint", "theme", "setting", "relationship", "fact"
- "label": a short unique identifier (e.g. character name, place name, theme phrase)
- "content": 2-4 sentence description of what is established about this entity so far
- "confidence": 0.0-1.0 how confidently this entity is established (0.3 = hinted, 0.7 = clearly present, 1.0 = central/definitive)

Guidelines:
- CHARACTERS: name, role, key traits, motivations, arc so far
- PLOT POINTS: what happened, who was involved, consequences
- THEMES: recurring ideas, motifs, symbolic elements
- SETTINGS: locations, time periods, atmospheres
- RELATIONSHIPS: between characters — nature, dynamics, evolution
- FACTS: world rules, backstory, established lore

If an entity from the existing memory has changed or evolved, include it again with updated content — use the EXACT same label so it can be merged.
Do NOT include trivial or speculative entities. Focus on narratively important elements.
If the story is very short or just starting, extract what you can — even 1-2 entities is fine.

Output ONLY valid JSON. No markdown fencing, no commentary.`;

/**
 * Extracted entity from the evaluator's JSON response.
 */
interface ExtractedEntity {
  type: MemoryEntry["type"];
  label: string;
  content: string;
  confidence: number;
}

/**
 * Build the evaluator prompt from the story + notes context.
 */
export function buildEvaluatorPrompt(
  storyText: string,
  notes: MemoNote[],
  existingMemory: MemoryEntry[]
): string {
  const parts: string[] = [];

  if (existingMemory.length > 0) {
    parts.push("=== EXISTING MEMORY (update/merge these if they evolved) ===");
    for (const m of existingMemory) {
      parts.push(`[${m.type.toUpperCase()}] ${m.label} (confidence: ${m.confidence}): ${m.content}`);
    }
    parts.push("");
  }

  parts.push("=== CURRENT STORY TEXT ===");
  parts.push(storyText.slice(0, 60000)); // cap to ~15K tokens for the evaluator
  parts.push("");

  if (notes.length > 0) {
    parts.push("=== NOTES JUST INCORPORATED ===");
    const chronological = [...notes].sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    for (const note of chronological) {
      parts.push(`[${note.date}] ${note.content}`);
    }
    parts.push("");
  }

  parts.push("Extract all narratively important entities from the story. Return JSON only.");
  return parts.join("\n");
}

/**
 * Call Claude to extract structured memory entities from the generated story.
 * This is the real Context Evaluator (§V-B3).
 */
export async function runContextEvaluator(
  apiKey: string,
  storyText: string,
  notes: MemoNote[],
  existingMemory: MemoryEntry[],
  model: string = "claude-sonnet-4-6"
): Promise<ExtractedEntity[]> {
  const prompt = buildEvaluatorPrompt(storyText, notes, existingMemory);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model.includes("opus") ? model : "claude-sonnet-4-6", // evaluator always uses Sonnet for speed
      max_tokens: 8192,
      temperature: 0.2, // low temperature for precise extraction
      system: EVALUATOR_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    console.error(`[context-evaluator] Claude API error ${res.status}`);
    return [];
  }

  const body = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const text = body.content?.find((c) => c.type === "text")?.text || "";

  try {
    // Strip markdown fencing if present
    const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```$/m, "").trim();
    const parsed = JSON.parse(cleaned) as { entities?: ExtractedEntity[] };
    if (!Array.isArray(parsed.entities)) return [];

    // Validate each entity
    const validTypes = new Set(["character", "plotPoint", "theme", "setting", "relationship", "fact"]);
    return parsed.entities.filter(
      (e) =>
        validTypes.has(e.type) &&
        typeof e.label === "string" &&
        e.label.length > 0 &&
        typeof e.content === "string" &&
        e.content.length > 0 &&
        typeof e.confidence === "number" &&
        e.confidence >= 0 &&
        e.confidence <= 1
    );
  } catch (err) {
    console.error("[context-evaluator] Failed to parse entities:", err, text.slice(0, 500));
    return [];
  }
}

// ─── Memory Merge (paper §V-B3 — update, don't just append) ────────

/**
 * Merge newly extracted entities into existing memory.
 * - If an entity with the same type+label exists → update content, bump confidence, add provenance
 * - If new → insert
 * - Prune entries whose confidence has dropped below threshold over time
 */
export function mergeMemory(
  existingMemory: MemoryEntry[],
  extracted: ExtractedEntity[],
  sourceNoteIds: string[]
): MemoryEntry[] {
  const now = new Date().toISOString();

  // Index existing by type+label (case-insensitive)
  const index = new Map<string, number>();
  for (let i = 0; i < existingMemory.length; i++) {
    const key = `${existingMemory[i].type}::${existingMemory[i].label.toLowerCase()}`;
    index.set(key, i);
  }

  const updated = [...existingMemory];

  for (const entity of extracted) {
    const key = `${entity.type}::${entity.label.toLowerCase()}`;
    const existingIdx = index.get(key);

    if (existingIdx !== undefined) {
      // Update existing entry
      const existing = updated[existingIdx];
      existing.content = entity.content;
      existing.confidence = Math.min(1, (existing.confidence + entity.confidence) / 2 + 0.1); // trend upward for recurring entities
      existing.updatedAt = now;
      // Merge provenance (deduplicate)
      const allSources = new Set([...existing.sourceNoteIds, ...sourceNoteIds]);
      existing.sourceNoteIds = [...allSources];
    } else {
      // New entry
      const newEntry: MemoryEntry = {
        entryId: crypto.randomUUID(),
        type: entity.type,
        label: entity.label,
        content: entity.content,
        sourceNoteIds: [...sourceNoteIds],
        createdAt: now,
        updatedAt: now,
        confidence: entity.confidence,
      };
      updated.push(newEntry);
      index.set(key, updated.length - 1);
    }
  }

  // Decay: entries not updated in this cycle lose a small amount of confidence
  // (entities that keep appearing stay strong; forgotten ones fade)
  for (const entry of updated) {
    if (entry.updatedAt !== now) {
      entry.confidence = Math.max(0, entry.confidence - 0.05);
    }
  }

  // Prune entries below threshold (effectively forgotten by the narrative)
  return updated.filter((e) => e.confidence > 0.1);
}
