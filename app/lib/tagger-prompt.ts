/**
 * Tagger Prompt Builder - Generates LLM prompts from tagger-prompt config
 */

export type TaggerPromptConfig = {
  system: string[];
  task: string;
  outputSchema: Record<string, unknown>;
  rules: string[];
  enums: {
    subjectType: string[];
    shot: string[];
    angle: string[];
    styleVisibleOnly: string[];
  };
};

export type TaggerPromptInput = {
  pageNumber: number;
  assetId: string;
  pageText: string;
  knownEntities?: Array<{ canonical: string; aliases: string[] }>;
  leadCharacters?: string[];
  // Detection metadata from Gemini detection phase
  detectionTitle?: string;
  detectionDescription?: string;
  detectionCategory?: string;
};

export const DEFAULT_TAGGER_PROMPT_CONFIG: TaggerPromptConfig = {
  system: [
    "You are a strict JSON generator.",
    "Output ONLY valid JSON. No markdown. No extra keys.",
    "You will receive THREE CONTEXT SOURCES - combine all of them:",
    "1. DETECTION INFO (title/description/category) - what the asset visually IS",
    "2. PAGE TEXT - narrative context, character names and roles",
    "3. IMAGE - visual confirmation and details",
    "All three sources work TOGETHER to inform tagging. No single source is primary.",
    "CRITICAL: Match trigger to what the IMAGE ACTUALLY SHOWS, not who owns it.",
    "Do not invent conceptual style labels unless clearly visible."
  ],
  task: "Tag ONE cropped image asset. Combine detection info + page text + visual analysis together.",
  outputSchema: {
    triggerCandidate: "string | null - name of WHAT IS SHOWN (object name for props, character name only if face/body visible)",
    triggerEvidence: "string | null (quote the source: detection title or page text phrase)",
    ownerRelationship: "string | null - if prop/weapon, whose is it? (e.g., 'nel', 'aria') - goes in tags, not trigger",
    roles: ["zeroOrMoreRoleStrings"],
    textConstraints: ["zeroOrMoreConstraintStrings"],
    visual: {
      subjectType: "character|prop|weapon|object|logo|diagram|environment|other",
      shot: "extreme-close-up|close-up|medium-shot|three-quarter-shot|full-body|wide-shot|establishing-shot|two-shot|group-shot|insert-shot|other",
      angle: "eye-level|high-angle|low-angle|birdseye-view|dutch-angle|over-the-shoulder|front-view|three-quarter-view|profile-view|back-view|other",
      pose: ["zeroOrMorePoseStrings - only for characters"],
      attributes: ["simple descriptive words: color, material, condition - NO PREFIXES like attr-"],
      objects: ["simple object names - NO PREFIXES like obj-"],
      environment: ["simple location/setting descriptors"],
      styleVisibleOnly: ["zeroOrMoreStyleStrings"]
    },
    semanticTags: ["high-level concepts from detection description: mood, theme, action"],
    negativeSuggestions: ["must match asset category - anatomical tags only for characters"],
    rationale: "string"
  },
  rules: [
    "TRIGGER RULES - CRITICAL:",
    "  - trigger = name of WHAT THE IMAGE SHOWS, not who owns it",
    "  - Character (face/body visible): trigger = character_name",
    "  - Prop/weapon (object focus, maybe hand visible): trigger = object_name (e.g., 'revolver', 'coffee_cup', 'sword')",
    "  - If prop belongs to a character, put character name in ownerRelationship, NOT trigger",
    "  - Example: hand holding Nel's gun → trigger='revolver', ownerRelationship='nel', tags include 'nel-weapon'",
    "NEVER use attr-, obj-, env- prefixes. Use SIMPLE words only.",
    "subjectType: 'character' ONLY if face or majority of body visible. Hands+object = 'prop' or 'weapon'.",
    "ownerRelationship: if the prop/weapon belongs to a known character, specify their name here.",
    "roles: only if explicit in detection description or page text (hero, antagonist, mentor, lead, etc.).",
    "attributes: use SIMPLE words (red, metallic, worn, glowing) NOT technical terms.",
    "negativeSuggestions: MUST be appropriate for the category:",
    "  - character: anatomical issues (deformed-hands, extra-limbs, bad-anatomy)",
    "  - prop/weapon/object: quality issues (blurry, pixelated, distorted)",
    "  - location/environment: structural issues (floating-objects, impossible-geometry)",
    "styleVisibleOnly: only if unambiguously visible.",
    "No plural variations; prefer singular forms. Keep tags SIMPLE and CLEAR."
  ],
  enums: {
    subjectType: ["character", "prop", "weapon", "object", "logo", "diagram", "environment", "other"],
    shot: [
      "extreme-close-up", "close-up", "medium-shot", "three-quarter-shot",
      "full-body", "wide-shot", "establishing-shot", "two-shot", "group-shot",
      "insert-shot", "other"
    ],
    angle: [
      "eye-level", "high-angle", "low-angle", "birdseye-view", "dutch-angle",
      "over-the-shoulder", "front-view", "three-quarter-view", "profile-view",
      "back-view", "other"
    ],
    styleVisibleOnly: [
      "flat-color", "vector-art", "cel-shaded", "painterly", "realistic",
      "high-contrast", "warm-tones", "dark-palette"
    ]
  }
};

/**
 * Build the system prompt from config
 */
export function buildSystemPrompt(config: TaggerPromptConfig): string {
  return config.system.join("\n");
}

/**
 * Build the user prompt from config and input
 */
export function buildUserPrompt(config: TaggerPromptConfig, input: TaggerPromptInput): string {
  const { 
    pageNumber, 
    assetId, 
    pageText, 
    knownEntities = [], 
    leadCharacters = [],
    detectionTitle,
    detectionDescription,
    detectionCategory
  } = input;

  const lines: string[] = [
    `TASK: ${config.task}`,
    "",
    "CONTEXT:",
    `- pageNumber: ${pageNumber}`,
    `- assetId: ${assetId}`,
    ""
  ];

  // Add detection metadata if available
  if (detectionTitle || detectionDescription || detectionCategory) {
    lines.push("DETECTION INFO (what this asset visually IS):");
    if (detectionTitle) lines.push(`- Title: ${detectionTitle}`);
    if (detectionDescription) lines.push(`- Description: ${detectionDescription}`);
    if (detectionCategory) lines.push(`- Category: ${detectionCategory}`);
    lines.push("");
  }

  lines.push(
    "PAGE TEXT (narrative context and character roles):",
    pageText?.trim() ? pageText.trim() : "(none)",
    "",
    `KNOWN ENTITIES (optional hints): ${JSON.stringify(knownEntities)}`,
    `LEAD CHARACTERS (optional hints): ${JSON.stringify(leadCharacters)}`,
    "",
    "Return JSON with exactly this schema:",
    JSON.stringify(config.outputSchema, null, 2),
    "",
    "Rules:",
    ...config.rules.map(r => `- ${r}`)
  );

  return lines.join("\n");
}

/**
 * Parse tagger prompt config from JSON string, falling back to defaults
 */
export function parseTaggerPromptConfig(jsonStr: string): TaggerPromptConfig {
  try {
    const parsed = JSON.parse(jsonStr);
    return {
      ...DEFAULT_TAGGER_PROMPT_CONFIG,
      ...parsed,
      enums: {
        ...DEFAULT_TAGGER_PROMPT_CONFIG.enums,
        ...(parsed.enums || {})
      }
    };
  } catch {
    return DEFAULT_TAGGER_PROMPT_CONFIG;
  }
}
