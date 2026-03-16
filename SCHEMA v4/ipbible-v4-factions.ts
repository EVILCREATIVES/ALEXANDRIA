/**
 * IP Bible V4 — FACTIONS Domain
 *
 * Separated from LORE as its own domain in V4.
 * Create a FACTION entry only if the element is recurring, story-driving,
 * or explains a major pressure in the world. Otherwise keep it as a
 * sublevel under LORE (e.g., mentioned in LORE.Entries[] or LORE summary).
 *
 * L1 covers shared with LORE in ipbible-v4-metadata.ts
 */

import type { FieldMetadataMap } from "./ipbible-v4-metadata"

export const FACTIONS_FIELDS: FieldMetadataMap = {
  // ==========================================================================
  // FACTIONS — L2 (Bible-Presentation)
  // Triggered: Create a FACTION only if the element is recurring,
  // story-driving, or explains a major pressure in the world. Otherwise
  // keep it as a sublevel under LORE.
  // ==========================================================================

  "FACTIONS.Faction[].Name": {
    level: 2,
    required: true,
    trigger: "Create a FACTION only if the element is recurring, story-driving, or explains a major pressure in the world. Otherwise keep as sublevel under LORE.",
    constraint: "Max 6 words",
    definition: "The commonly used name of the faction.",
    aiInstruction: "Write the commonly used name of the faction (max 6 words).",
  },
  "FACTIONS.Faction[].FactionType": {
    level: 2,
    required: true,
    constraint: "1 tag: GOVERNMENT, CORPORATION, CRIMINAL, RELIGIOUS, MILITARY, SOCIAL, IDEOLOGICAL, or OTHER",
    definition: "The faction category.",
    aiInstruction: "Choose one: GOVERNMENT, CORPORATION, CRIMINAL, RELIGIOUS, MILITARY, SOCIAL, IDEOLOGICAL, OTHER.",
  },
  "FACTIONS.Faction[].Logline": {
    level: 2,
    required: true,
    constraint: "1 sentence, max 25 words",
    targetOutput: "Who they are, what they control, and why they matter now.",
    aiInstruction: "Write 1 sentence (max 25 words): who they are, what they control, and why they matter now.",
    definition: "Who they are, what they control, and why they matter now.",
  },
  "FACTIONS.Faction[].HeroImage": {
    level: 2,
    definition: "Optional: 1 defining image for this faction. Leave blank if unknown.",
  },
  "FACTIONS.Faction[].WhoTheyAre": {
    level: 2,
    required: true,
    constraint: "2–3 sentences, max 50 words",
    targetOutput: "What this group actually is in practice — no lore-dumping.",
    aiInstruction: "Write 2 to 3 sentences (max 50 words): what this group actually is in practice, without lore-dumping.",
    definition: "What this group actually is in practice.",
  },
  "FACTIONS.Faction[].WhatTheyWant": {
    level: 2,
    required: true,
    constraint: "1 sentence, max 12 words",
    targetOutput: "Their main goal or agenda.",
    aiInstruction: "Write 1 sentence (max 12 words): their main goal or agenda.",
    definition: "Their main goal or agenda.",
  },
  "FACTIONS.Faction[].HowTheyOperate": {
    level: 2,
    constraint: "3–5 bullets, max 12 words each",
    targetOutput: "How they shape culture, maintain influence, or move through their world.",
    aiInstruction: "Write 3 to 5 bullets (max 12 words each): how they shape culture, maintain influence, or move through their world.",
    definition: "How they shape culture, maintain influence, or move through their world.",
  },
  "FACTIONS.Faction[].WhatTheyControl": {
    level: 2,
    constraint: "3 bullets, max 12 words each",
    targetOutput: "Territory, systems, resources, or people they dominate.",
    aiInstruction: "Write 3 bullets (max 12 words each): territory, systems, resources, or people they dominate.",
    definition: "Territory, systems, resources, or people they dominate.",
  },
  "FACTIONS.Faction[].InternalPressure": {
    level: 2,
    constraint: "2–3 bullets, max 12 words each",
    targetOutput: "Cracks, conflicts, or tensions inside the group.",
    aiInstruction: "Write 2 to 3 bullets (max 12 words each): cracks, conflicts, or tensions inside the group.",
    definition: "Cracks, conflicts, or tensions inside the group.",
  },
  "FACTIONS.Faction[].WhoBenefitsWhoPays": {
    level: 2,
    constraint: "2 bullets, max 12 words each",
    targetOutput: "Who gains protection or advantage, and who suffers.",
    aiInstruction: "Write 2 bullets (max 12 words each): who gains protection or advantage, and who suffers.",
    definition: "Who gains protection or advantage, and who suffers.",
  },

  // --- Look and Feel ---
  "FACTIONS.Faction[].LookAndFeel.VisualIdentity": {
    level: 2,
    constraint: "Max 8 images",
    definition: "Optional: up to 8 images that capture symbols, uniforms, spaces, or presence.",
  },
  "FACTIONS.Faction[].LookAndFeel.PreProductionImages": {
    level: 3,
    definition: "Preview of Canvas assets linked to this faction. If none exist, invites creation of pre-production materials (character sheets, environment art, design tests, maps, and other prep assets).",
  },
  "FACTIONS.Faction[].LookAndFeel.TrademarkItems": {
    level: 2,
    constraint: "3–5 bullets, max 10 words each",
    targetOutput: "Distinctive objects, tech, clothing, vehicles, or cultural markers that instantly identify this faction visually.",
    aiInstruction: "Write 3 to 5 bullets (max 10 words each): distinctive objects, tech, clothing, vehicles, or cultural markers that instantly identify this faction visually.",
    definition: "Distinctive visual markers — objects, tech, clothing, vehicles, or cultural items.",
  },
  // --- Relationships ---
  "FACTIONS.Faction[].Relationships.ConnectedCharacters": {
    level: 2,
    constraint: "3–8 bullets, max 8 words each",
    targetOutput: "Key members or opponents, plus why connected.",
    aiInstruction: "List 3 to 8 bullets (max 8 words each): key members or opponents, plus why connected.",
    definition: "Connected characters — key members or opponents, plus why connected.",
  },
  "FACTIONS.Faction[].Relationships.ConnectedLocations": {
    level: 2,
    constraint: "3–8 bullets, max 8 words each",
    targetOutput: "Places they operate from or control.",
    aiInstruction: "List 3 to 8 bullets (max 8 words each): places they operate from or control.",
    definition: "Connected locations — places they operate from or control.",
  },
  "FACTIONS.Faction[].Relationships.ConnectedLoreEntries": {
    level: 2,
    constraint: "3–8 bullets, max 8 words each",
    targetOutput: "Lore entries connected to this faction — how they benefit or suffer.",
    aiInstruction: "List 3 to 8 bullets (max 8 words each): lore entries that are connected to them, how they benefit or suffer from them.",
    definition: "Connected lore entries — how the faction benefits or suffers from them.",
  },

  // ==========================================================================
  // L3 — Production
  // ==========================================================================
  "FACTIONS.Faction[].Gen.Trigger": {
    level: 3,
    definition: "Unique identifier for this faction in prompts",
    aiInstruction: "Create a unique, generation-friendly identifier (e.g., 'the-order', 'iron-syndicate')",
  },
  "FACTIONS.Faction[].Gen.Tags": {
    level: 3,
    required: true,
    constraint: "Min 3, Max 10 tags",
    definition: "Generation tags deeply tied to this faction's visual identity — symbols, colours, clothing, architecture, presence, and cultural markers",
    aiInstruction: "Provide 3–10 positive generation tags. Each tag MUST be deeply connected to how this faction looks, presents, and occupies space — their uniforms, symbols, headquarters aesthetic, cultural markers, and visual energy. NO generic filler (e.g., 'powerful', 'organised', 'dark'). Every tag must pass: 'Would removing this tag change the generated image of this faction in a meaningful way?'",
    ingredientChecklist: [
      "At least 1 tag describing visual signature (e.g., 'red-and-black insignia', 'polished riot armour')",
      "At least 1 tag capturing faction energy or presence (e.g., 'militant discipline', 'chaotic street-level')",
      "At least 1 tag tied to cultural or world-specific markers (e.g., 'propaganda posters', 'ritual scarification')",
    ],
  },
  "FACTIONS.Faction[].Gen.NegativeTags": {
    level: 3,
    required: true,
    constraint: "Min 2, Max 5 tags",
    definition: "Specific things to actively avoid when generating this faction — wrong aesthetic, anachronisms, contradictions",
    aiInstruction: "Provide 2–5 negative generation tags. Each tag MUST target a concrete, likely mistake — wrong colour palette, aesthetic that contradicts their identity, anachronistic gear, visual traits that break their established look. NO vague negatives. Every tag must answer: 'What specific wrong thing would an AI generate without this warning?'",
    ingredientChecklist: [
      "At least 1 tag preventing aesthetic misrepresentation (e.g., 'no casual civilian clothes', 'not high-tech futuristic')",
      "At least 1 tag preventing world-breaking contradictions (e.g., 'no friendly branding', 'not colourful or playful')",
    ],
  },
}
