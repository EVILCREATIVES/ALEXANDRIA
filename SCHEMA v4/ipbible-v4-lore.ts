/**
 * IP Bible V4 — LORE Domain
 *
 * Structure:
 *   Page 1 — LORE (INTRO): Summary + preview of up to 4 Lore Entries
 *   Page 2 — LORE SUMMARY: Themed breakdown (WhoRunsThings, HowTheWorldWorks,
 *            WhatPeopleBelieve, WhereItsBreaking, History + Timeline)
 *   Page 3+ — LORE ENTRIES: One page per entry (full detail)
 *
 * Factions split into separate ipbible-v4-factions.ts in V4.
 * L1 covers live in ipbible-v4-metadata.ts
 */

import type { FieldMetadataMap } from "./ipbible-v4-metadata"

export const LORE_FIELDS: FieldMetadataMap = {
  // ==========================================================================
  // LORE (INTRO) — L2
  // Triggered: Show only if at least one LORE ENTRY exists.
  // Always include the LORE SUMMARY, then preview up to 4 LORE ENTRIES
  // (most story-driving or recurring; exclude background flavour first).
  // ==========================================================================

  // --- Lore Summary (intro header) ---
  "LORE.Summary.OverviewThemes": {
    level: 2,
    required: true,
    trigger: "Show only if at least one LORE ENTRY exists.",
    constraint: "3–5 words",
    targetOutput: "The dominant pressures or ideas running through the lore.",
    aiInstruction: "Write 3 to 5 words: the dominant pressures or ideas running through the lore.",
    definition: "The dominant pressures or ideas running through the lore.",
  },
  "LORE.Summary.HeroImage": {
    level: 2,
    definition: "Optional: 1 defining image for the lore domain. Leave blank if unknown.",
  },
  "LORE.Summary.Themes": {
    level: 2,
    required: true,
    constraint: "1–3 concepts, 1–3 words each, comma-separated",
    targetOutput: "Concepts that capture various ingredients of the lore of the IP as a whole.",
    aiInstruction: "List 1–3 concepts (1–3 words each, comma-separated) that capture various ingredients of the lore of the IP as a whole. Example: 'MAFIA POLICE STATE, MEMORY ALTERING TECH, TECHNOLOGY AS MAGIC.'",
    definition: "Key lore ingredients as short concept tags.",
  },
  "LORE.Summary.LoreOverview": {
    level: 2,
    required: true,
    constraint: "1 paragraph, max 50 words",
    targetOutput: "Who runs things, how the world works day to day, what people believe, and where pressure is building.",
    aiInstruction: "Write 1 short paragraph (max 50 words): describe who runs things, how the world works day to day, what people believe, and where pressure is building. Focus on control, systems, beliefs, and breaking points that actively shape the story. Do not list lore entries.",
    ingredientChecklist: [
      "Who controls things and how",
      "How the world works day to day",
      "What people believe",
      "Where pressure is building",
    ],
    definition: "Overview of control, systems, beliefs, and breaking points that shape the story.",
  },

  // ==========================================================================
  // LORE SUMMARY (detailed) — L2
  // Triggered: ALWAYS
  // ==========================================================================

  // --- WHO RUNS THINGS ---
  "LORE.WhoRunsThings.Themes": {
    level: 2,
    required: true,
    trigger: "ALWAYS",
    constraint: "3–4 words",
    targetOutput: "The feel of power here.",
    aiInstruction: "Write 3 to 4 words: the feel of power here.",
    definition: "The feel of power here.",
    notes: "Focus/title text: WHO RUNS THINGS.",
  },
  "LORE.WhoRunsThings.Summary": {
    level: 2,
    required: true,
    constraint: "1 paragraph, max 30 words",
    targetOutput: "Who holds control, how it's enforced, who it protects, and what it costs.",
    aiInstruction: "Write 1 short paragraph (max 30 words): who holds control, how it's enforced, who it protects, and what it costs.",
    definition: "Who holds control, how it's enforced, who it protects, and what it costs.",
  },
  "LORE.WhoRunsThings.Images": {
    level: 2,
    constraint: "Max 1 image",
    definition: "Optional: up to 1 image that captures the power structure or authority vibe.",
  },

  // --- HOW THE WORLD WORKS ---
  "LORE.HowTheWorldWorks.Themes": {
    level: 2,
    required: true,
    constraint: "3–4 words",
    targetOutput: "The lived reality of daily life.",
    aiInstruction: "Write 3 to 4 words: the lived reality of daily life.",
    definition: "The lived reality of daily life.",
    notes: "Focus/title text: HOW THE WORLD WORKS.",
  },
  "LORE.HowTheWorldWorks.Summary": {
    level: 2,
    required: true,
    constraint: "1 paragraph, max 30 words",
    targetOutput: "How daily systems function, who they serve, and what they cost.",
    aiInstruction: "Write 1 short paragraph (max 30 words): who holds control, how it's enforced, who it protects, and what it costs. Consider authority types like government, corporate, criminal, cultural, or religious power, supernatural forces.",
    definition: "How daily systems function — authority types, enforcement, protection, and cost.",
  },
  "LORE.HowTheWorldWorks.Images": {
    level: 2,
    constraint: "Max 1 image",
    definition: "Optional: up to 1 image showing systems in action.",
  },

  // --- WHAT PEOPLE BELIEVE ---
  "LORE.WhatPeopleBelieve.Themes": {
    level: 2,
    required: true,
    constraint: "3–4 words",
    targetOutput: "What people live by.",
    aiInstruction: "Write 3 to 4 words: what people live by.",
    definition: "What people live by.",
    notes: "Focus/title text: WHAT PEOPLE BELIEVE.",
  },
  "LORE.WhatPeopleBelieve.Summary": {
    level: 2,
    required: true,
    constraint: "1 paragraph, max 30 words",
    targetOutput: "The shared beliefs, values, myths, taboos, or slogans people repeat, and what those beliefs justify or forbid.",
    aiInstruction: "Write 1 short paragraph (max 30 words): the shared beliefs, values, myths, taboos, or slogans people repeat, and what those beliefs justify or forbid. Consider propaganda, ritual, status symbols, or superstition if relevant.",
    definition: "Shared beliefs, values, myths, taboos — and what they justify or forbid.",
  },
  "LORE.WhatPeopleBelieve.Images": {
    level: 2,
    constraint: "Max 1 image",
    definition: "Optional: up to 1 image reflecting belief, ritual, symbols, or propaganda.",
  },

  // --- WHERE IT'S BREAKING ---
  "LORE.WhereItsBreaking.Themes": {
    level: 2,
    required: true,
    constraint: "3–4 words",
    targetOutput: "Where pressure is rising.",
    aiInstruction: "Write 3 to 4 words: where pressure is rising.",
    definition: "Where pressure is rising.",
    notes: "Focus/title text: WHERE IT'S BREAKING.",
  },
  "LORE.WhereItsBreaking.Summary": {
    level: 2,
    required: true,
    constraint: "1 paragraph, max 30 words",
    targetOutput: "What's unstable, who is pushing, who is resisting, and what could tip.",
    aiInstruction: "Write 1 short paragraph (max 30 words): what's unstable, who is pushing, who is resisting, and what could tip.",
    definition: "What's unstable, who is pushing, who is resisting, and what could tip.",
  },
  "LORE.WhereItsBreaking.Images": {
    level: 2,
    constraint: "Max 1 image",
    definition: "Optional: up to 1 image capturing instability, unrest, or fault lines.",
  },

  // --- HISTORY ---
  "LORE.History.HowWeGotHere": {
    level: 2,
    required: true,
    constraint: "1 paragraph, max 30 words",
    targetOutput: "The past events that shaped life now and the consequences people still live with.",
    aiInstruction: "Write 1 short paragraph (max 30 words): the past events that shaped life now and the consequences people still live with.",
    definition: "The past events that shaped life now and the consequences people still live with.",
    notes: "Focus/title text: HISTORY.",
  },
  "LORE.History.Timeline": {
    level: 2,
    required: true,
    constraint: "Each entry max 10 words. Format: TIME MARKER + EVENT + WHY IT MATTERS NOW",
    targetOutput: "Key past events in chronological order.",
    aiInstruction: "List key past events in chronological order. Each entry max 10 words. Format: TIME MARKER + EVENT + WHY IT MATTERS NOW. Avoid series or episode plot.",
    definition: "Key past events in chronological order — time marker, event, why it matters now.",
  },
  "LORE.History.TimelineImages": {
    level: 2,
    constraint: "5–10 images",
    definition: "Optional: 5–10 images aligning to the key past events.",
  },

  // ==========================================================================
  // LORE ENTRIES — L2 (mostly) + L3
  // Triggered: Create a LORE ENTRY only if the element is recurring,
  // story-driving, or explains a major pressure in the world. Otherwise keep
  // it as a mention in the main LORE card. Lore Entries should not be primarily
  // character-centred, location-centred, or faction-centred — those belong in
  // CHARACTERS, WORLD, or FACTIONS respectively.
  // ==========================================================================

  "LORE.Entries[].Name": {
    level: 2,
    required: true,
    trigger: "Create a LORE ENTRY only if the element is recurring, story-driving, or explains a major pressure in the world. Lore Entries should not be primarily character-centred, location-centred, or faction-centred.",
    constraint: "Max 6 words",
    definition: "The commonly used name of this lore element.",
    aiInstruction: "Write the commonly used name (max 6 words).",
  },
  "LORE.Entries[].Type": {
    level: 2,
    required: true,
    constraint: "1 tag: SYSTEM, EVENT, PLACE, OBJECT, or BELIEF",
    definition: "The lore element category.",
    aiInstruction: "Choose one: SYSTEM, EVENT, PLACE, OBJECT, BELIEF.",
  },
  "LORE.Entries[].Role": {
    level: 2,
    constraint: "1–3 single-word functions, comma-separated",
    targetOutput: "Functional role tags for this lore element.",
    aiInstruction: "List 1 to 3 single-word functions (comma-separated). Example: 'CONTROL, THREAT, MYTH.'",
    definition: "Functional role tags — e.g., CONTROL, THREAT, MYTH.",
  },
  "LORE.Entries[].OneLine": {
    level: 2,
    required: true,
    constraint: "1 sentence, max 25 words",
    targetOutput: "What this is and why it matters now.",
    aiInstruction: "Write 1 sentence (max 25 words): what this is and why it matters now.",
    definition: "What this is and why it matters now.",
  },
  "LORE.Entries[].HeroImage": {
    level: 2,
    definition: "Optional: 1 defining image for this lore entry. Leave blank if unknown.",
  },
  "LORE.Entries[].WhatItIs": {
    level: 2,
    required: true,
    constraint: "2–3 sentences, max 50 words",
    targetOutput: "The plain explanation — no lore-dump.",
    aiInstruction: "Write 2 to 3 sentences (max 50 words): the plain explanation, no lore-dump.",
    definition: "The plain explanation of this lore element.",
  },
  "LORE.Entries[].HowItWorks": {
    level: 2,
    constraint: "3–5 bullets, max 12 words each",
    targetOutput: "The rules, limits, or operating logic.",
    aiInstruction: "Write 3 to 5 bullets (max 12 words each): the rules, limits, or operating logic.",
    definition: "The rules, limits, or operating logic.",
  },
  "LORE.Entries[].WhoBenefitsWhoPays": {
    level: 2,
    constraint: "2 bullets, max 12 words each",
    targetOutput: "Who gains from this, and who gets hurt.",
    aiInstruction: "Write 2 bullets (max 12 words each): who gains from this, and who gets hurt.",
    definition: "Who gains from this, and who gets hurt.",
  },
  "LORE.Entries[].PressurePoints": {
    level: 2,
    constraint: "2–3 bullets, max 12 words each",
    targetOutput: "How this creates conflict or instability.",
    aiInstruction: "Write 2 to 3 bullets (max 12 words each): how this creates conflict or instability.",
    definition: "How this creates conflict or instability.",
  },

  // --- Look and Feel ---
  "LORE.Entries[].LookAndFeel.Images": {
    level: 2,
    constraint: "Max 8 images",
    definition: "Optional: up to 8 images that capture the feel and logic of this element.",
  },
  "LORE.Entries[].LookAndFeel.PreProductionImages": {
    level: 3,
    definition: "Preview of Canvas assets linked to this entry. If none exist, invites creation of pre-production materials (character sheets, environment art, design tests, maps, and other prep assets).",
  },
  "LORE.Entries[].LookAndFeel.WhereYouSeeIt": {
    level: 2,
    constraint: "2 bullets, max 10 words each",
    targetOutput: "How it shows up in scenes or daily life.",
    aiInstruction: "Write 2 bullets (max 10 words each): how it shows up in scenes or daily life.",
    definition: "How this element shows up in scenes or daily life.",
  },

  // --- Relationships ---
  "LORE.Entries[].Relationships.ConnectedCharacters": {
    level: 2,
    constraint: "3–8 bullets, max 10 words each",
    targetOutput: "Character names plus why connected.",
    aiInstruction: "List 3 to 8 bullets (max 10 words each): names plus why connected.",
    definition: "Connected characters — names plus why connected.",
  },
  "LORE.Entries[].Relationships.ConnectedLocations": {
    level: 2,
    constraint: "3–8 bullets, max 10 words each",
    targetOutput: "Place names plus why connected.",
    aiInstruction: "List 3 to 8 bullets (max 10 words each): places plus why connected.",
    definition: "Connected locations — places plus why connected.",
  },

  // ==========================================================================
  // L3 — Production (Lore Entries)
  // ==========================================================================
  "LORE.Entries[].Gen.Trigger": {
    level: 3,
    definition: "Unique identifier for this lore element in prompts",
    aiInstruction: "Create a unique, generation-friendly identifier (e.g., 'the-harvest-protocol', 'void-sickness')",
  },
  "LORE.Entries[].Gen.Tags": {
    level: 3,
    required: true,
    constraint: "Min 3, Max 10 tags",
    definition: "Generation tags deeply tied to how this lore element manifests visually — its physical presence, associated imagery, and sensory markers",
    aiInstruction: "Provide 3–10 positive generation tags. Each tag MUST be deeply connected to how this lore element looks, feels, or manifests in the world — its visual presence, associated objects, environmental effects, and sensory signatures. NO generic filler (e.g., 'mysterious', 'important', 'ancient'). Every tag must pass: 'Would removing this tag change the generated image of this lore element in a meaningful way?'",
    ingredientChecklist: [
      "At least 1 tag describing physical manifestation or visual presence (e.g., 'glowing amber veins in stone', 'rusted quarantine fencing')",
      "At least 1 tag capturing associated mood or sensory quality (e.g., 'low electrical hum', 'acrid chemical smell')",
      "At least 1 tag tied to world-specific or narrative-specific markers (e.g., 'compliance bracelets', 'harvest-season banners')",
    ],
  },
  "LORE.Entries[].Gen.NegativeTags": {
    level: 3,
    required: true,
    constraint: "Min 2, Max 5 tags",
    definition: "Specific things to actively avoid when generating visuals of this lore element — wrong portrayal, anachronisms, contradictions",
    aiInstruction: "Provide 2–5 negative generation tags. Each tag MUST target a concrete, likely mistake — wrong visual portrayal, anachronistic elements, mood-breaking details that contradict how this lore element actually works or appears. NO vague negatives. Every tag must answer: 'What specific wrong thing would an AI generate without this warning?'",
    ingredientChecklist: [
      "At least 1 tag preventing visual misrepresentation (e.g., 'not magical glowing', 'no clean laboratory aesthetic')",
      "At least 1 tag preventing narrative contradictions (e.g., 'not celebrated or festive', 'no voluntary participation imagery')",
    ],
  },
  "LORE.Entries[].Gen.Notes": {
    level: 3,
    limitKey: "L3_MED",
    definition: "Additional generation notes for this lore element",
  },
}
