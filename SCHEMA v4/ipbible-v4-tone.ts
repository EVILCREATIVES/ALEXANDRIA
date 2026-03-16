/**
 * IP Bible V4 — TONE Domain
 * L2 (Bible-Presentation) + L3 (Production) fields
 * L1 covers live in ipbible-v4-metadata.ts
 */

import type { FieldMetadataMap } from "./ipbible-v4-metadata"

export const TONE_FIELDS: FieldMetadataMap = {
  // ==========================================================================
  // L2 — Bible-Presentation
  // ==========================================================================
  "TONE.ToneOverview": {
    level: 2,
    limitKey: "L2_LONG",
    constraint: "2–3 sentences, max 45 words",
    targetOutput: "A vivid description of the emotional experience this story delivers.",
    aiInstruction: "Describe what it feels like to experience this story — the emotional ride, the atmosphere, the promise to the audience. **Do not follow a rigid template.** Write as if pitching the feeling, not the plot.",
    ingredientChecklist: [
      "The dominant emotional register or atmosphere",
      "The kind of ride the audience is signing up for",
      "A sense of pacing or emotional rhythm",
    ],
    definition: "What it feels like to experience this story — the emotional ride we deliver.",
  },
  "TONE.GenreSignals": {
    level: 2,
    constraint: "2–4 items, max 10 words each",
    targetOutput: "Recognisable genre patterns audiences will identify, written as plain descriptions.",
    aiInstruction: "List 2–4 clear genre signals: recognisable patterns audiences will identify. Write as plain descriptions, not labels (e.g., not 'thriller' but 'a ticking clock with lives at stake'). **Do not follow a rigid template.**",
    ingredientChecklist: [
      "Each signal describes a recognisable pattern, not a genre label",
      "Signals an audience member would instinctively understand",
      "No jargon or industry shorthand",
    ],
    definition: "Recognisable genre patterns audiences will identify — plain descriptions, not labels.",
  },
  "TONE.WhatToExpect": {
    level: 2,
    constraint: "3 bullets, max 8 words each",
    targetOutput: "The types of moments and scenes this IP reliably delivers.",
    aiInstruction: "Write 3 bullets describing the types of moments and scenes this IP reliably delivers. **Do not follow a rigid template.** Each bullet max 8 words.",
    ingredientChecklist: [
      "Each bullet describes a recurring type of moment or scene",
      "Specific enough to set expectations, not vague promises",
      "Covers different facets of the experience (e.g., action, emotion, tension)",
    ],
    definition: "The types of moments and scenes this IP reliably delivers.",
  },
  "TONE.AudienceHooks": {
    level: 2,
    constraint: "1–2 hooks, max 15 words each",
    targetOutput: "Why this works for an audience — in natural language, no framework names.",
    aiInstruction: "Write 1–2 audience hooks explaining why this works, in natural language. **Do not follow a rigid template.** No framework names or marketing jargon — just why people will care.",
    ingredientChecklist: [
      "Each hook explains a specific reason audiences will engage",
      "Written in plain, natural language — no framework references",
      "Focused on emotional or experiential payoff",
    ],
    definition: "Why this works for an audience — written in natural language without naming any framework.",
  },
  "TONE.Reality": {
    level: 2,
    constraint: "3–5 bullets, max 12 words each",
    targetOutput: "Realism level plus audience clarity rules — what can't be confusing.",
    aiInstruction: "Write 3–5 bullets covering the realism level and the audience clarity rules — what can't be confusing or ambiguous. **Do not follow a rigid template.** Each bullet max 12 words.",
    ingredientChecklist: [
      "At least one bullet establishing the realism baseline",
      "At least one clarity rule — what the audience must always understand",
      "Rules are specific enough to guide writing decisions",
    ],
    definition: "Realism level plus audience clarity rules — what can't be confusing.",
  },
  "TONE.WhatItIsNot": {
    level: 2,
    constraint: "2–3 bullets, max 10 words each",
    targetOutput: "Common misreads or adjacent tones this IP should avoid.",
    aiInstruction: "Write 2–3 bullets describing the common misreads or adjacent tones this IP should avoid. **Do not follow a rigid template.** Each bullet max 10 words.",
    ingredientChecklist: [
      "Each bullet names a specific adjacent tone or common misread",
      "Clear enough that a writer knows what NOT to do",
      "Addresses likely confusion, not random negatives",
    ],
    definition: "Common misreads or adjacent tones this IP should avoid.",
  },

  // ==========================================================================
  // L3 — Production
  // ==========================================================================
  "TONE.Images.SupportingImages": {
    level: 3,
    constraint: "Max 8 images",
    definition: "Optional images that capture the feel and logic of the tone.",
  },
}
