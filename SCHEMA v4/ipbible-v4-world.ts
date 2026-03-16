/**
 * IP Bible V4 — WORLD Domain
 * L2 (Bible-Presentation) + L3 (Production) fields
 * L1 covers live in ipbible-v4-metadata.ts
 */

import type { FieldMetadataMap } from "./ipbible-v4-metadata"

export const WORLD_FIELDS: FieldMetadataMap = {
  // ==========================================================================
  // L2 — Bible-Presentation
  // ==========================================================================
  "WORLD.WorldPremiseTone": {
    level: 2,
    limitKey: "L2_SHORT",
    constraint: "1–2 sentences",
    definition: "What this world is **about** + emotional tone",
  },
  "WORLD.AestheticLanguage.Keywords": {
    canonType: "hard",
    level: 2,
    constraint: "3–5 words",
    definition: "Visual **language** of the world: 'brutalist, cluttered, neon, wet asphalt' or 'warm, analog, overgrown, reclaimed.'",
  },

  // --------------------------------------------------------------------------
  // WORLD STAGE (L2)
  // Triggered: ALWAYS create 1 WORLD SETTING as the primary world stage
  // (planet, city, or main realm).
  // --------------------------------------------------------------------------
  "WORLD.Stage.WorldStage": {
    level: 2,
    required: true,
    trigger: "ALWAYS — create 1 WORLD SETTING as the primary world stage (planet, city, or main realm).",
    constraint: "Max 8 words",
    targetOutput: "The commonly used name plus type.",
    aiInstruction: "Write the commonly used name plus type (max 8 words). Example: 'THE DARKSIDE, SHADOW REALM.'",
    definition: "The primary world stage — planet, city, or main realm.",
  },
  "WORLD.Stage.Setting": {
    level: 2,
    required: true,
    constraint: "Max 12 words",
    targetOutput: "The wider context beyond the story.",
    aiInstruction: "Write the wider context beyond the story (max 12 words). Example: 'A remote corner of Texas' or 'A distant star system with two suns.'",
    definition: "The wider context beyond the story.",
  },
  "WORLD.Stage.Role": {
    level: 2,
    constraint: "2–4 single-word functions, comma-separated",
    targetOutput: "World function tags for this stage.",
    aiInstruction: "List 2 to 4 single-word world functions (comma-separated). Example: 'POWER-CENTRE, FRONTIER, SANCTUARY.'",
    definition: "World function tags — e.g., POWER-CENTRE, FRONTIER, SANCTUARY.",
  },
  "WORLD.Stage.HeroImage": {
    level: 2,
    definition: "Optional: 1 defining image for the world stage. Leave blank if unknown.",
  },
  "WORLD.Stage.SecondaryImages": {
    level: 2,
    constraint: "Max 2 images",
    definition: "Optional: up to 2 supporting images. Leave blank if unknown.",
  },
  "WORLD.Stage.SettingSummary": {
    level: 2,
    required: true,
    constraint: "2 sentences, max 30 words",
    targetOutput: "What life is like here and how it differs from elsewhere.",
    aiInstruction: "Write 2 sentences (max 30 words): what life is like here and how it differs from elsewhere.",
    definition: "What life is like here and how it differs from elsewhere.",
  },
  "WORLD.Stage.Distinctiveness": {
    level: 2,
    constraint: "2 sentences, max 30 words",
    targetOutput: "What makes this setting feel singular and vivid.",
    aiInstruction: "Write 2 sentences (max 30 words): what makes this setting feel singular and vivid.",
    definition: "What makes this setting feel singular and vivid.",
  },

  // World Stage — Narrative Roles
  "WORLD.Stage.LocationRules": {
    level: 2,
    constraint: "1–3 bullets, max 8 words each",
    targetOutput: "Distinctive conditions or rules tied specifically to this location.",
    aiInstruction: "Write 1 to 3 bullets (max 8 words each): any distinctive conditions or rules that are tied specifically to this location.",
    definition: "Distinctive conditions or rules tied to this location.",
  },
  "WORLD.Stage.LocationPressures": {
    level: 2,
    constraint: "1–3 bullets, max 8 words each",
    targetOutput: "The narrative problems or engine this setting naturally creates for characters.",
    aiInstruction: "Write 1 to 3 bullets (max 8 words each): the narrative problems or engine this setting naturally creates for characters.",
    definition: "Narrative problems or engine this setting creates for characters.",
  },
  "WORLD.Stage.ScaleAndStoryFocus": {
    level: 2,
    constraint: "1 line, max 12 words",
    targetOutput: "Story scale and where we spend most time.",
    aiInstruction: "Write 1 line (max 12 words): story scale and where we spend most time.",
    definition: "Story scale and where we spend most time.",
  },
  "WORLD.Stage.Atmosphere": {
    level: 2,
    constraint: "3–5 words only",
    targetOutput: "The baseline atmosphere here.",
    aiInstruction: "Write 3 to 5 words only: the baseline atmosphere here.",
    definition: "The baseline atmosphere here.",
  },

  // --------------------------------------------------------------------------
  // LOCATIONS (L2)
  // --------------------------------------------------------------------------
  "WORLD.Locations[].LocationTier": {
    canonType: "hard",
    level: 2,
    required: true,
    constraint: "1 tag: master or secondary",
    definition: "A location is MASTER if it is recurring, hosts a key event, or groups multiple sub-settings. Everything else is SECONDARY.",
    aiInstruction: "Tag as 'master' if the location is recurring, hosts a key story event, or contains multiple sub-settings. Tag as 'secondary' for everything else.",
  },
  "WORLD.Locations[].Name": {
    canonType: "hard",
    level: 2,
    required: true,
    constraint: "Max 6 words",
    definition: "The location's most commonly used name.",
  },
  "WORLD.Locations[].Type": {
    canonType: "hard",
    level: 2,
    required: true,
    constraint: "Max 4 words",
    definition: "Location type — e.g., 'BAR', 'CITY DISTRICT', 'SPACE STATION'.",
    aiInstruction: "Write a short location type label (max 4 words). Examples: BAR, CITY DISTRICT, SPACE STATION, ABANDONED FACTORY, ROYAL COURT.",
  },
  "WORLD.Locations[].Role": {
    level: 2,
    required: true,
    constraint: "2–4 single-word tags, comma-separated",
    definition: "Story function tags — e.g., 'HIDEOUT, PRESSURE-COOKER, MEETING-POINT'.",
    aiInstruction: "List 2–4 single-word story functions for this location, comma-separated. Examples: HIDEOUT, PRESSURE-COOKER, SANCTUARY, THRESHOLD, ARENA, CAGE, MEETING-POINT.",
  },
  "WORLD.Locations[].SummaryBox": {
    level: 2,
    required: true,
    limitKey: "L2_LONG",
    constraint: "Part 1: 1 sentence, max 25 words. Part 2: 3–4 sentences, max 90 words total.",
    targetOutput: "A two-part location profile — a sharp logline followed by a vivid, sensory portrait.",
    aiInstruction: "Write in two parts. **Part 1 (1 sentence, max 25 words):** what this place looks like, what happens here, and why it matters. **Part 2 (3–4 sentences, max 90 words):** the sensory experience of arriving, the historical or cultural context, how it functions in the narrative, and one signature detail. **Do not follow a rigid template.** Write as if painting a scene for a new writer or director.",
    ingredientChecklist: [
      "Part 1 captures the location's identity, activity, and narrative importance in a single line",
      "Part 2 reads like a scene brief — sensory, contextual, and memorable",
      "At least one period-appropriate or world-specific detail",
      "One signature detail that makes this location irreplaceable",
    ],
    definition: "The location's profile: a one-line logline + a short compelling portrait.",
  },
  "WORLD.Locations[].Distinctiveness": {
    level: 2,
    constraint: "2 sentences, max 40 words",
    targetOutput: "What makes this place feel unlike anywhere else in the story.",
    aiInstruction: "Write 2 sentences (max 40 words): what makes this place feel unlike anywhere else in the story. **Do not follow a rigid template.** Focus on the quality only this location has.",
    ingredientChecklist: [
      "A concrete detail, rule, or atmosphere no other location shares",
      "Why this place is irreplaceable in the narrative",
    ],
    definition: "What makes this place feel unlike anywhere else in the story.",
  },
  "WORLD.Locations[].Setting": {
    canonType: "hard",
    level: 2,
    required: true,
    constraint: "Max 12 words",
    definition: "The real or fictional place in the world. Include city and country if relevant.",
    aiInstruction: "Write the real or fictional place in the world (max 12 words). Include city and country if relevant. For real-world locations, auto-populate with accurate geographical information.",
  },
  "WORLD.Locations[].Images.LeadImage": {
    level: 2,
    definition: "Primary location image (matched from tagged assets). Best reference image for this location.",
    aiInstruction: "Match location name to tagged environment/background assets using assetMatchingRules. Threshold: 0.7.",
  },
  "WORLD.Locations[].Meta.Scale": {
    level: 2,
    definition: "continent/country/region/city/neighborhood/building/room",
    aiInstruction: "Infer from location type",
  },
  "WORLD.Locations[].Meta.Context": {
    level: 2,
    definition: "Historical and cultural context. For real places, use accurate information for the time period.",
    aiInstruction: "For real places + time periods, use world knowledge",
  },
  "WORLD.Locations[].Meta.EnvironmentArchetype": {
    level: 2,
    constraint: "2–4 tags, comma-separated",
    definition: "The tonal/narrative feel of the environment — what energy it radiates. E.g., dystopian, claustrophobic, frontier, decaying-opulence, liminal.",
    aiInstruction: "List 2–4 archetype tags describing the tonal and narrative energy of this location. Not what it looks like — what it feels like to be there. Examples: dystopian, claustrophobic, frontier, liminal, sacred, hostile, transient.",
  },
  "WORLD.Locations[].Meta.Style": {
    level: 2,
    constraint: "1–3 tags, comma-separated",
    definition: "The visual/architectural style of the location — how it was built or designed. E.g., modern, gothic, minimalist, scandinavian, brutalist, art-deco, industrial.",
    aiInstruction: "List 1–3 style tags describing the visual or architectural language of this location. Examples: modern, gothic, minimalist, scandinavian, brutalist, art-deco, industrial, colonial, organic.",
  },
  "WORLD.Locations[].LocationPressures": {
    level: 2,
    constraint: "1–3 bullets, max 8 words each",
    targetOutput: "The narrative problems or engine this setting naturally creates for characters.",
    aiInstruction: "Write 1–3 bullets describing the narrative problems this setting naturally creates for characters. **Do not follow a rigid template.** Each bullet max 8 words.",
    ingredientChecklist: [
      "At least one pressure that forces character decisions",
      "Each pressure is specific to this location, not generic",
    ],
    definition: "The narrative problems or engine this setting naturally creates for characters.",
  },
  "WORLD.Locations[].LocationRules": {
    level: 2,
    constraint: "3–5 bullets, max 10 words each",
    targetOutput: "Access, power, etiquette, and consequences — the rules of this place.",
    aiInstruction: "Write 3–5 bullets covering the rules of this place: access, power, etiquette, consequences. **Do not follow a rigid template.** Each bullet max 10 words.",
    ingredientChecklist: [
      "At least one access or entry rule",
      "At least one power dynamic or social rule",
      "At least one consequence for breaking the rules",
    ],
    definition: "The rules of this place — access, power, etiquette, consequences.",
  },
  "WORLD.Locations[].HowItLooks": {
    level: 2,
    constraint: "3–5 bullets, max 8 words each",
    targetOutput: "The visual signature — the instant read.",
    aiInstruction: "Write 3–5 punchy bullets capturing the visual signature of this location: what you notice in the first 3 seconds. **Do not follow a rigid template.** Each bullet max 8 words.",
    ingredientChecklist: [
      "At least one architectural or spatial detail",
      "At least one lighting, colour, or texture cue",
      "At least one object or detail that anchors the space",
    ],
    definition: "The visual signature — what you notice first.",
  },
  "WORLD.Locations[].ConnectedPeople": {
    level: 2,
    constraint: "3–8 bullets, max 10 words each",
    targetOutput: "A quick-read list of people who matter here and why.",
    aiInstruction: "List 3–8 key people connected to this location. For each, write the name or group plus why they matter here (max 10 words per bullet). **Do not follow a rigid template.**",
    ingredientChecklist: [
      "Each bullet names a specific character or group",
      "Each explains why they matter at this location, not just that they appear",
      "At least one connection that creates conflict or tension",
    ],
    definition: "Key people connected to this location — name or group plus why they matter here.",
    notes: "Writer-facing summary. Detailed Relationships.Link[] sub-fields below provide the granular breakdown.",
  },
  "WORLD.Locations[].ConnectedPlaces": {
    level: 2,
    constraint: "3–8 bullets, max 10 words each",
    targetOutput: "Nearby or linked locations and why the connection matters.",
    aiInstruction: "List 3–8 nearby or linked locations. For each, write the location name plus why the connection matters (max 10 words per bullet). **Do not follow a rigid template.**",
    ingredientChecklist: [
      "Each bullet names a specific location from the story",
      "Each explains the nature of the connection (proximity, contrast, supply line…)",
      "At least one connection that affects narrative flow",
    ],
    definition: "Nearby or linked locations — name plus why the connection matters.",
    notes: "Writer-facing summary. Detailed Relationships.Link[] sub-fields below provide the granular breakdown.",
  },

  // ==========================================================================
  // L3 — Production
  // ==========================================================================
  "WORLD.Locations[].Position": {
    canonType: "hard",
    level: 3,
    definition: "Geographic or narrative position. For real places, use actual location context.",
    notes: "Production detail. Writer-facing geography lives in WORLD.Locations[].Setting (L2).",
  },
  "WORLD.Locations[].ShortDescription": {
    canonType: "hard",
    level: 3,
    limitKey: "L3_MED",
    constraint: "Max 30 words",
    definition: "Production-facing sensory brief — what this place looks, sounds, and feels like on arrival. For production designers, art directors, and environment artists.",
    aiInstruction: "Describe the sensory experience of arriving at this location: what you see, hear, smell. Combine source description with inferred period-appropriate details. **Do not follow a rigid template.** Write as if briefing a production designer — no plot or story function.",
    ingredientChecklist: [
      "What this place looks and feels like on arrival",
      "One period-appropriate or world-specific sensory detail",
      "The atmosphere or environmental mood",
    ],
    notes: "Production guideline. The writer-facing summary lives in WORLD.Locations[].SummaryBox (L2).",
  },
  "WORLD.Locations[].Images.SupportingImages": {
    level: 3,
    constraint: "Max 8 images",
    definition: "Additional location images",
  },
  "WORLD.Locations[].Meta.Function": {
    level: 3,
    definition: "Narrative purpose: protagonist-home/conflict-zone/sanctuary/threshold/etc.",
    aiInstruction: "Describe narrative purpose in the story",
    notes: "Detailed production breakdown. Writer-facing summary lives in WORLD.Locations[].Role (L2).",
  },
  "WORLD.Locations[].Gen.Trigger": {
    level: 3,
    definition: "Unique identifier for this location in prompts",
  },
  "WORLD.Locations[].Gen.Tags": {
    level: 3,
    required: true,
    constraint: "Min 3, Max 10 tags",
    definition: "Generation tags deeply tied to this location's identity — period-appropriate architecture, atmosphere, sensory details, and visual character",
    aiInstruction: "Provide 3–10 positive generation tags. Each tag MUST be deeply connected to what makes this location visually and atmospherically distinct — its architecture, materials, lighting, weather, cultural markers, and emotional energy. Combine source descriptions + asset tags + period-appropriate inferred details. NO generic filler (e.g., 'beautiful', 'interesting', 'old'). Every tag must pass: 'Would removing this tag change the generated environment in a meaningful way?'",
    ingredientChecklist: [
      "At least 1 tag describing architectural or structural character (e.g., 'crumbling brutalist concrete', 'narrow cobblestone alleys')",
      "At least 1 tag capturing atmosphere or sensory quality (e.g., 'haze-choked', 'fluorescent-lit', 'salt-wind')",
      "At least 1 tag tied to period, culture, or world-specific identity (e.g., 'Soviet-era signage', 'prayer flags on wire')",
    ],
  },
  "WORLD.Locations[].Gen.NegativeTags": {
    level: 3,
    required: true,
    constraint: "Min 2, Max 5 tags",
    definition: "Specific things to actively avoid when generating this location — anachronisms, wrong era, contradictory elements",
    aiInstruction: "Provide 2–5 negative generation tags. Each tag MUST target a concrete, likely mistake — wrong architectural era, anachronistic elements, mood-breaking details, visual traits that contradict the source. NO vague negatives (e.g., 'ugly', 'messy'). Every tag must answer: 'What specific wrong thing would an AI generate without this warning?'",
    ingredientChecklist: [
      "At least 1 tag preventing anachronistic or era-wrong elements (e.g., 'no modern glass facades', 'no neon signs')",
      "At least 1 tag preventing atmosphere contradictions (e.g., 'no bright cheerful lighting', 'not tropical vegetation')",
    ],
  },
  "WORLD.Locations[].Name.NameLabel": {
    level: 3,
    definition: "Canon location name label",
  },
  "WORLD.Locations[].Images.Map": {
    level: 3,
    definition: "Map asset for this location",
  },
  "WORLD.Locations[].Images.PreProductionImages": {
    level: 3,
    constraint: "Max 12 images",
    definition: "Pre-production materials — character sheets, environment art, design tests, maps, and other prep assets linked to this location.",
    notes: "Shows a preview of Canvas assets linked to this entry. If none exist, this section invites creation of pre-production materials.",
  },
  "WORLD.Locations[].Relationships.Link[].TargetRef": {
    level: 3,
    definition: "Name of related location or character",
  },
  "WORLD.Locations[].Relationships.Link[].Type": {
    level: 3,
    definition: "contains/adjacent-to/connected-by/contrasts-with/etc.",
  },
  "WORLD.Locations[].Relationships.Link[].Directionality": {
    level: 3,
    definition: "Direction of relationship",
  },
  "WORLD.Locations[].Relationships.Link[].TensionLevel": {
    level: 3,
    definition: "Tension level",
  },
}
