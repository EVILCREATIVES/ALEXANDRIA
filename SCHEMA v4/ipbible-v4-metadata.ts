/**
 * IP Bible V4 — Core Metadata
 *
 * Modular architecture: this file defines shared types, L1 hero fields
 * for every domain, and re-exports all domain modules into a single map.
 *
 * Domain files:
 *   ipbible-v4-overview.ts
 *   ipbible-v4-characters.ts
 *   ipbible-v4-factions.ts
 *   ipbible-v4-world.ts
 *   ipbible-v4-lore.ts
 *   ipbible-v4-tone.ts
 *   ipbible-v4-style.ts
 *   ipbible-v4-story.ts
 *
 * This metadata drives:
 * - Validation (required fields, constraints)
 * - UI gating (level-based access control)
 * - AI prompt generation
 * - Field display in editing UI
 *
 * Level definitions:
 *   L1 — Hero level (hero prompts, hero images)
 *   L2 — Bible-Presentation level (writer-facing, pitch-ready)
 *   L3 — Production level (generation data, detailed breakdowns)
 *
 * Field paths use dot notation:
 * - Top-level: "OVERVIEW.IPTitle"
 * - Nested: "CHARACTERS.CharacterList[].Name"
 * - Array items: "STORY.CanonTimelineTable.Beat[].EventTitle"
 */

// ============================================================================
// Shared types
// ============================================================================

/**
 * Global writing directives — governs ALL aiInstruction outputs.
 * Every field-level aiInstruction is executed UNDER these rules.
 * Consuming code should prepend these directives to any AI prompt.
 */
export const WRITING_DIRECTIVES = [
  "Write only what the material supports. If information is thin, write less. Never pad, generalise, or invent to fill space.",
  "Produce writing that feels alive, specific, and intentional. Every sentence must earn its place. Read like a confident storyteller, not a writing manual.",
  "Avoid technical writing terms and frameworks. Use natural industry language. Example: 'Steve is haunted by his time in the army,' not 'Steve's ghost is…'.",
  "Prefer concrete details, behaviours, and pressures over themes and labels. Focus on what happens, what it costs, and what people do because of it.",
  "Match the tone and rhythm of the uploaded materials. Do not default to neutral prose if the project has a clear voice. Let genre and attitude shape the language.",
  "Describe things as they are experienced, not as systems. Do not follow a rigid structure when interpreting prompts.",
  "Make smart inferences from what is present, but never see details that are not there. If unsupported, leave open or mark TBD.",
  "Do not add plot, backstory, relationships, or world facts that aren't implied by the materials.",
  "Not everything is important. Spend words on what matters to this story. Keep secondary elements lighter and guide attention deliberately.",
  "Aim for sharp narrative flow — confident, vivid, readable, and intentional. Leave space where the story is still forming.",
  "Avoid over-explaining, formulaic structure, generic description, and writing that sounds like it came from screenwriting textbooks.",
] as const

export type FieldLevel = 1 | 2 | 3
export type CanonType = "hard" | "soft"

export interface FieldMetadata {
  /** Hard Canon (HC) or Soft Canon */
  canonType?: CanonType
  /** Development level: L1 (hero), L2 (bible-presentation), or L3 (production) */
  level?: FieldLevel
  /** Is this field required at its level? */
  required?: boolean
  /** Format constraints (e.g., "Max 50 words", "Max 2-3 paragraphs") */
  constraint?: string
  /** AI instruction for extraction/population */
  aiInstruction?: string
  /** Target output description */
  targetOutput?: string
  /** Must contain checklist items (for validation) */
  mustContain?: string[]
  /** Ingredient checklist items (for validation) */
  ingredientChecklist?: string[]
  /** Definition/clarification for UI display */
  definition?: string
  /** Notes about the field */
  notes?: string
  /** Word/token limits (references field-limits.json keys) */
  limitKey?: string
  /** Sub-section trigger condition — when to show this field group */
  trigger?: string
}

/**
 * Field path to metadata mapping
 * Uses dot notation for nested fields
 */
export type FieldMetadataMap = Record<string, FieldMetadata>

/**
 * Domain-level configuration — trigger rules, dependencies
 */
export interface DomainConfig {
  /** When to show this domain */
  trigger: string
  /** Parent domain if this domain can fall back to a sublevel */
  dependsOn?: string
}

export const DOMAIN_TRIGGERS: Record<string, DomainConfig> = {
  OVERVIEW:    { trigger: "ALWAYS" },
  CHARACTERS: { trigger: "ALWAYS" },
  WORLD:      { trigger: "ALWAYS" },
  LORE:       { trigger: "ALWAYS" },
  FACTIONS:   { trigger: "Create a FACTION only if the element is recurring, story-driving, or explains a major pressure in the world. Otherwise keep as sublevel under LORE.", dependsOn: "LORE" },
  TONE:       { trigger: "ALWAYS" },
  STYLE:      { trigger: "ALWAYS" },
  STORY:      { trigger: "ALWAYS" },
}

// ============================================================================
// Domain imports
// ============================================================================

import { OVERVIEW_FIELDS } from "./ipbible-v4-overview"
import { CHARACTERS_FIELDS } from "./ipbible-v4-characters"
import { FACTIONS_FIELDS } from "./ipbible-v4-factions"
import { WORLD_FIELDS } from "./ipbible-v4-world"
import { LORE_FIELDS } from "./ipbible-v4-lore"
import { TONE_FIELDS } from "./ipbible-v4-tone"
import { STYLE_FIELDS } from "./ipbible-v4-style"
import { STORY_FIELDS } from "./ipbible-v4-story"

// ============================================================================
// L1 — Hero fields (all domains)
// ============================================================================

export const HERO_FIELDS: FieldMetadataMap = {
  // OVERVIEW
  "OVERVIEW.HeroPrompt": {
    level: 1,
    limitKey: "L1_HERO_PROMPT",
    targetOutput: "A 1–2 sentence prompt that captures the overall IP identity for a hero image.",
    aiInstruction: "From source material, write a visual prompt for the IP's hero image. **Do not follow a rigid template.** Do not summarise the plot. Focus on genre, tonal promise, and the core identity of the IP.",
    ingredientChecklist: [
      "A clear sense of genre and tonal promise",
      "The core visual identity or iconic element of the IP",
      "An emotional hook — what feeling should this image evoke?",
    ],
  },
  "OVERVIEW.HeroImage": {
    level: 1,
    definition: "Hero image asset (matched from tagged assets or null)",
  },

  // CHARACTERS
  "CHARACTERS.HeroPrompt": {
    level: 1,
    limitKey: "L1_HERO_PROMPT",
    targetOutput: "A 1–2 sentence prompt for character domain hero image.",
    aiInstruction: "Write a visual prompt for the character domain hero image. **Do not follow a rigid template.** Focus on character archetypes and visual identity.",
    ingredientChecklist: [
      "At least one recognisable character archetype or silhouette",
      "A sense of the character dynamics or ensemble energy",
      "Visual identity cues — costume, posture, or expression",
    ],
  },
  "CHARACTERS.Hero": {
    level: 1,
    definition: "Character domain hero image asset",
  },

  // WORLD
  "WORLD.HeroPrompt": {
    level: 1,
    limitKey: "L1_HERO_PROMPT",
    targetOutput: "A 1–2 sentence prompt for world domain hero image.",
    aiInstruction: "Write a visual prompt for the world domain hero image. **Do not follow a rigid template.** Focus on world atmosphere and setting.",
    ingredientChecklist: [
      "A strong sense of place — where and when this world exists",
      "The dominant atmosphere or environmental mood",
      "At least one visual detail that makes this world distinct",
    ],
  },
  "WORLD.Hero": {
    level: 1,
    definition: "World domain hero image asset",
  },

  // LORE
  // Triggered: Show LORE (INTRO) page only if at least one LORE ENTRY exists.
  // LORE SUMMARY page is always shown.
  "LORE.HeroPrompt": {
    level: 1,
    limitKey: "L1_HERO_PROMPT",
    targetOutput: "A 1–2 sentence prompt for lore domain hero image.",
    aiInstruction: "Write a visual prompt for the lore domain hero image. **Do not follow a rigid template.** Focus on world rules and mythology.",
    ingredientChecklist: [
      "A visual symbol or artefact that represents the world's core rule or myth",
      "A sense of scale — ancient, vast, or mysterious",
      "An emotional undercurrent — awe, dread, wonder, or reverence",
    ],
  },
  "LORE.Hero": {
    level: 1,
    definition: "Lore domain hero image asset",
  },

  // STYLE
  "STYLE.HeroPrompt": {
    level: 1,
    limitKey: "L1_HERO_PROMPT",
    targetOutput: "A 1–2 sentence prompt for style domain hero image.",
    aiInstruction: "Write a visual prompt for the style domain hero image. **Do not follow a rigid template.** Focus on visual identity and aesthetic.",
    ingredientChecklist: [
      "The dominant visual style — art direction, texture, or rendering approach",
      "A representative colour mood or palette feel",
      "At least one composition or framing cue",
    ],
  },
  "STYLE.Hero": {
    level: 1,
    definition: "Style domain hero image asset",
  },

  // TONE
  "TONE.HeroPrompt": {
    level: 1,
    limitKey: "L1_HERO_PROMPT",
    targetOutput: "A 1–2 sentence prompt for tone domain hero image.",
    aiInstruction: "Write a visual prompt for the tone domain hero image. **Do not follow a rigid template.** Focus on the emotional experience and tonal atmosphere of the IP.",
    ingredientChecklist: [
      "The dominant emotional register — what it feels like to be inside this story",
      "A visual metaphor or moment that captures the tonal promise",
      "A sense of the audience experience — thrill, dread, warmth, unease",
    ],
  },
  "TONE.Hero": {
    level: 1,
    definition: "Tone domain hero image asset",
  },

  // STORY
  "STORY.HeroPrompt": {
    level: 1,
    limitKey: "L1_HERO_PROMPT",
    targetOutput: "A 1–2 sentence prompt for story domain hero image.",
    aiInstruction: "Write a visual prompt for the story domain hero image. **Do not follow a rigid template.** Focus on narrative structure and key moments.",
    ingredientChecklist: [
      "A pivotal or iconic narrative moment",
      "Character(s) in action or at a turning point",
      "A visual sense of the story's emotional arc or stakes",
    ],
  },
  "STORY.Hero": {
    level: 1,
    definition: "Story domain hero image asset",
  },

  // FACTIONS
  // Triggered: Create a FACTION only if the element is recurring,
  // story-driving, or explains a major pressure in the world.
  // Otherwise keep it as a sublevel under LORE.
  "FACTIONS.HeroPrompt": {
    level: 1,
    limitKey: "L1_HERO_PROMPT",
    targetOutput: "A 1–2 sentence prompt for a group photo of the main faction.",
    aiInstruction: "Write a visual prompt for the factions domain hero image. **Do not follow a rigid template.** Frame it as a group photo or ensemble shot of the main faction — showing who they are together, how they present, and the energy between them.",
    ingredientChecklist: [
      "A group shot or ensemble composition of the main faction's key members",
      "Visual identity cues — uniforms, symbols, posture, or formation",
      "An emotional undercurrent — unity, threat, loyalty, or power",
    ],
  },
  "FACTIONS.Hero": {
    level: 1,
    definition: "Factions domain hero image — group photo of the main faction, if one exists.",
  },
}

// ============================================================================
// Combined V4 metadata map
// ============================================================================

export const IPBIBLE_V4_FIELD_METADATA: FieldMetadataMap = {
  ...HERO_FIELDS,
  ...OVERVIEW_FIELDS,
  ...CHARACTERS_FIELDS,
  ...FACTIONS_FIELDS,
  ...WORLD_FIELDS,
  ...LORE_FIELDS,
  ...TONE_FIELDS,
  ...STYLE_FIELDS,
  ...STORY_FIELDS,
}

// ============================================================================
// Helper functions
// ============================================================================

/**
 * Get metadata for a field path
 */
export function getFieldMetadata(fieldPath: string): FieldMetadata | undefined {
  return IPBIBLE_V4_FIELD_METADATA[fieldPath]
}

/**
 * Get all required fields for a given level
 */
export function getRequiredFieldsForLevel(level: FieldLevel): string[] {
  return Object.entries(IPBIBLE_V4_FIELD_METADATA)
    .filter(([_, metadata]) => metadata.level === level && metadata.required === true)
    .map(([path]) => path)
}

/**
 * Get all fields for a given level (required and optional)
 */
export function getFieldsForLevel(level: FieldLevel): string[] {
  return Object.entries(IPBIBLE_V4_FIELD_METADATA)
    .filter(([_, metadata]) => metadata.level === level)
    .map(([path]) => path)
}

/**
 * Get all hard canon fields
 */
export function getHardCanonFields(): string[] {
  return Object.entries(IPBIBLE_V4_FIELD_METADATA)
    .filter(([_, metadata]) => metadata.canonType === "hard")
    .map(([path]) => path)
}

/**
 * Get all fields for a specific domain
 */
export function getFieldsForDomain(domain: string): string[] {
  return Object.entries(IPBIBLE_V4_FIELD_METADATA)
    .filter(([path]) => path.startsWith(domain + "."))
    .map(([path]) => path)
}
