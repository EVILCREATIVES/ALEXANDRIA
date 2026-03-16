/**
 * IP Bible V4 — OVERVIEW Domain
 * L2 (Bible-Presentation) + L3 (Production) fields
 * L1 covers live in ipbible-v4-metadata.ts
 */

import type { FieldMetadataMap } from "./ipbible-v4-metadata"

export const OVERVIEW_FIELDS: FieldMetadataMap = {
  // ==========================================================================
  // L2 — Bible-Presentation
  // ==========================================================================
  "OVERVIEW.IPTitle": {
    canonType: "hard",
    level: 2,
    required: true,
    definition: "IP TITLE",
  },
  "OVERVIEW.Logline": {
    canonType: "hard",
    level: 2,
    required: true,
    limitKey: "L2_SHORT",
    constraint: "Max 12 words. Active voice.",
    targetOutput: "The Studio Logline.",
    aiInstruction: "Write a single-sentence hook that captures the essence of the story.",
    mustContain: [
      "A clear protagonist (who the story is about)",
      "A concrete goal or desire",
      "A central conflict or opposing force",
      "The stakes or value at risk (why it matters)",
    ],
  },
  "OVERVIEW.Concept": {
    level: 2,
    limitKey: "L2_LONG",
    constraint: "Max 40 words, 1 short paragraph",
    aiInstruction: "Write a compelling narrative summary of the IP. **Do not follow a rigid template.** Write in the tone of the source material (e.g., if the script is funny, be funny). Focus on the *Story Engine*—how the plot moves and why it matters.",
    ingredientChecklist: [
      "Who is the Hero and what is their Status Quo?",
      "What breaks their world and what is their specific Goal?",
      "Who or what stops them (Antagonist/Force)?",
      "What is the Internal Need, Ghost, or Theme?",
    ],
  },
  "OVERVIEW.MainCharacter": {
    canonType: "hard",
    level: 2,
    limitKey: "L2_MED",
    constraint: "Max 1 paragraphs, max 30 words",
    aiInstruction: "Write a dynamic profile of the character. **Do not follow a rigid template.** Focus on the tension between what they want and what haunts them.",
    ingredientChecklist: [
      "Who they are",
      "The Drive: The **External Goal** (Want) and the **Core Obstacle** standing in their way.",
      "The Depth: The **Ghost** (Backstory trauma) and the **Internal Need** (The lesson they must learn).",
    ],
  },
  "OVERVIEW.WhatUpAgainst": {
    canonType: "hard",
    level: 2,
    limitKey: "L2_MED",
    constraint: "Max 1 paragraphs, 30 words.",
    aiInstruction: "Write a summary of the conflict. **Do not follow a rigid template.** Focus on the *Threat Level*—how it attacks and why it won't stop.",
    ingredientChecklist: [
      "What pushes back?",
      "What does it want?",
      "How does it apply pressure?",
    ],
  },
  "OVERVIEW.Synopsis": {
    level: 2,
    limitKey: "L2_LONG",
    constraint: "Max 2-3 paragraphs, max 60 words.",
    aiInstruction: "Write a compelling narrative summary of the IP. **Do not follow a rigid template.** Write in the tone of the source material (e.g., if the script is funny, be funny). Focus on the *Story Engine*—how the plot moves and why it matters.",
    ingredientChecklist: [
      "Who the story follows and their starting situation",
      "The external pressure created by the world or system",
      "What the protagonist actively tries to achieve",
      "What force opposes them and escalates conflict",
    ],
  },
  "OVERVIEW.World": {
    level: 2,
    limitKey: "L2_MED",
    constraint: "Max 1 paragraphs, max 30 words.",
    aiInstruction: "Write a functional guide to living in this world. **Do not follow a rigid template.** Focus on the *Rules of Existence*—what it looks like and how it works.",
    ingredientChecklist: [
      "The shared reality everyone lives under",
      "The pressure the world creates",
      "The mechanic that generates story",
    ],
  },
  "OVERVIEW.Tone": {
    level: 2,
    limitKey: "L2_MED",
    constraint: "Max 1 paragraphs, max 30 words",
    aiInstruction: "Write a directive summary of the creative direction and audience premise. **Do not follow a rigid template.** Focus on the *Experience*—how it feels to watch or read this. **Avoid genre labels and technical jargon.**",
    ingredientChecklist: [
      "Emotional stance the work maintains",
      "Pacing or rhythmic behavior of scenes",
      "Sensory or visual imagery guiding execution",
    ],
  },

  // ==========================================================================
  // L3 — Production
  // ==========================================================================
  "OVERVIEW.ImagesList[].Images.SupportingImages": {
    level: 3,
    constraint: "Max 8 images",
    definition: "Additional images",
  },
}
