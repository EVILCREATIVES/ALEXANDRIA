/**
 * IP Bible V4 — CHARACTERS Domain
 * L2 (Bible-Presentation) + L3 (Production) fields
 * L1 covers live in ipbible-v4-metadata.ts
 */

import type { FieldMetadataMap } from "./ipbible-v4-metadata"

export const CHARACTERS_FIELDS: FieldMetadataMap = {
  // ==========================================================================
  // L2 — Bible-Presentation
  // ==========================================================================
  "CHARACTERS.CharacterList[].RoleType": {
    canonType: "hard",
    level: 2,
    required: true,
    limitKey: "L2_SHORT",
    definition: "lead, antagonist, supporting, or background_recurring",
  },
  "CHARACTERS.CharacterList[].Name": {
    canonType: "hard",
    level: 2,
    required: true,
    limitKey: "L2_SHORT",
    definition: "Full, canon name (legal or main in-world label)",
  },
  "CHARACTERS.CharacterList[].StoryFunctionTags": {
    canonType: "hard",
    level: 2,
    required: true,
    limitKey: "L2_SHORT",
    constraint: "1–2 tags max (1 for background)",
    definition: "Story function tag (e.g., protagonist, mentor, sidekick, bartender)",
    aiInstruction: "Extract narrative roles: mentor, love-interest, rival, comic-relief, threshold-guardian, etc.",
  },
  "CHARACTERS.CharacterList[].Logline": {
    canonType: "hard",
    level: 2,
    required: true,
    limitKey: "L2_MED",
    constraint: "Max 12 words (depending on role)",
    targetOutput: "The Identity / The Role / The Threat / The Support Profile / background character",
    aiInstruction: "Write a short defining phrase that combines the **Role Tier** with the **Archetype**. **Do not follow a rigid template.**",
    ingredientChecklist: [
      "Who they are?",
      "Why do they matter to the IP?",
      "What makes them compelling or distinctive?",
    ],
  },
  "CHARACTERS.CharacterList[].Images.LeadImage": {
    level: 2,
    definition: "Primary character image (matched from tagged assets). Best portrait/reference for this character.",
    aiInstruction: "Match character name to tagged assets by name. Use highest confidence match (threshold: 0.7). Prefer portraits/headshots.",
  },
  "CHARACTERS.CharacterList[].Images.FullBodyImage": {
    level: 2,
    definition: "Optional: 1 full-body reference image. Only populate if a full-body tagged asset exists for this character.",
    aiInstruction: "Search tagged assets for a full-body image of this character. Use tag matching (e.g., 'full-body', 'full body', 'standing', 'model sheet'). If no match found, leave blank. Threshold: 0.7.",
  },
  "CHARACTERS.CharacterList[].HowTheyLook": {
    level: 2,
    limitKey: "L2_SHORT",
    constraint: "3–5 bullets, max 6 words each",
    targetOutput: "Instant-read physical cues and style.",
    aiInstruction: "Write 3–5 punchy bullets capturing what you notice in the first 3 seconds: silhouette, colouring, signature detail, vibe. **Do not follow a rigid template.**",
    ingredientChecklist: [
      "Overall build or silhouette in a few words",
      "One dominant colouring or skin/hair detail",
      "A signature style note — clothing, accessory, or posture",
    ],
  },
  "CHARACTERS.CharacterList[].HowTheySpeak": {
    level: 2,
    limitKey: "L2_SHORT",
    constraint: "3–5 bullets, max 6 words each",
    targetOutput: "A quick-read summary of voice traits, rhythm, tells, and taboo words.",
    definition: "How this character sounds — voice traits, rhythm, tells, taboo words. Summary for writers; the Voice sub-fields below are for audio generative production.",
    aiInstruction: "Write 3–5 punchy bullets capturing how this character speaks: vocal rhythm, signature tics, register shifts, words they always or never use. **Do not follow a rigid template.** Each bullet max 6 words.",
    ingredientChecklist: [
      "At least one rhythmic or tempo trait (terse, rambling, measured…)",
      "At least one signature verbal habit or tell",
      "At least one word, phrase, or topic they avoid",
    ],
  },
  "CHARACTERS.CharacterList[].SummaryBox": {
    level: 2,
    limitKey: "L2_MED",
    constraint: "Part 1: 1 sentence, max 20 words. Part 2: 3–4 sentences, max 90 words total.",
    targetOutput: "A two-part character profile — a sharp identity line followed by a vivid, jargon-free portrait.",
    aiInstruction: "Write in two parts. **Part 1 (1 sentence, max 20 words):** who they are, what they want, what haunts them. **Part 2 (3–4 sentences, max 90 words):** what makes them compelling — without jargon. **Do not follow a rigid template.** Focus on the tension between what they want and what haunts them. For supporting/background characters: shorten to 1–2 sentences total — capture their story function and what makes them memorable.",
    ingredientChecklist: [
      "Part 1 captures identity, desire, and ghost in a single line",
      "Part 2 reads like a pitch, not a character sheet — vivid and human",
      "No screenwriting jargon (no 'inciting incident', 'arc', 'ghost')",
      "The reader should want to know what happens to this person",
    ],
    definition: "The character's profile: a one-line identity hook + a short compelling portrait.",
  },
  "CHARACTERS.CharacterList[].Distinctiveness": {
    level: 2,
    limitKey: "L2_MED",
    constraint: "Max 2 sentences, max 20 words",
    targetOutput: "A sharp, specific statement of what makes this character feel unique in the story.",
    aiInstruction: "Write what makes them feel unlike anyone else in this story. **Do not follow a rigid template.** Focus on the one thing only this character brings. For supporting/background characters: write a brief 1-sentence note on their distinctive quality or story function.",
    ingredientChecklist: [
      "A concrete trait, habit, or contradiction that no other character in the story shares",
      "How they stand apart from similar archetypes",
      "The quality that makes them irreplaceable in the narrative",
    ],
  },
  "CHARACTERS.CharacterList[].TheirQuestion": {
    level: 2,
    required: true,
    limitKey: "L2_SHORT",
    constraint: "Max 1 sentence, max 12 words",
    targetOutput: "A single dramatic question in the form 'Will they be able to…'",
    aiInstruction: "Write a 'Will they be able to…' question linking the want, the need, and the cost. Hint at the likely answer. **Do not follow a rigid template.** For supporting/background characters: write a simpler question about their role or survival — e.g., 'Will they manage to help X before it's too late?' NEVER leave blank.",
    ingredientChecklist: [
      "The character's core want or goal embedded in the question",
      "A hint of the cost, sacrifice, or internal obstacle",
      "Enough tension that the answer feels genuinely uncertain",
    ],
  },
  "CHARACTERS.CharacterList[].InnerPressure": {
    level: 2,
    required: true,
    limitKey: "L2_MED",
    constraint: "1 sentence, max 18 words",
    targetOutput: "A single sentence capturing the private pressure and what it makes them do.",
    aiInstruction: "Write one sentence: the private, internal pressure driving this character and the behaviour it produces. **Do not follow a rigid template.** For supporting/background characters: infer a plausible inner pressure from their role and actions — even minor characters carry private weight. NEVER leave blank.",
    ingredientChecklist: [
      "A specific internal source of pressure (guilt, shame, obsession, fear, unresolved past)",
      "A visible behaviour or pattern the pressure produces",
    ],
    definition: "The private pressure driving them — and what it makes them do.",
  },
  "CHARACTERS.CharacterList[].OuterPressure": {
    level: 2,
    required: true,
    limitKey: "L2_MED",
    constraint: "1 sentence, max 18 words",
    targetOutput: "A single sentence capturing the external problem and what they stand to lose.",
    aiInstruction: "Write one sentence: the external problem forcing this character to act and what they stand to lose if they fail. **Do not follow a rigid template.** For supporting/background characters: infer from the story context — what external force or event pushes them into the scene? NEVER leave blank.",
    ingredientChecklist: [
      "A concrete external threat, deadline, or antagonistic force",
      "Clear stakes — what is lost if they do nothing",
    ],
    definition: "The external problem forcing action — and what they stand to lose.",
  },
  "CHARACTERS.CharacterList[].CoreBelief": {
    level: 2,
    required: true,
    limitKey: "L2_MED",
    constraint: "1 sentence, max 10 words",
    targetOutput: "A short belief statement — true or false — that the story will test.",
    aiInstruction: "Write the one belief this character lives by — it may be true, half-true, or completely wrong. The story will test it. **Do not follow a rigid template.** For supporting/background characters: infer a plausible core belief from their actions and role — e.g., 'loyalty is everything' or 'staying quiet keeps you safe'. NEVER leave blank.",
    ingredientChecklist: [
      "A specific, personal belief (not a generic value like 'family matters')",
      "Feels like it could be challenged or disproven by the narrative",
    ],
    definition: "The belief they live by (true or false) that the story will test.",
  },
  "CHARACTERS.CharacterList[].FactionAffiliation": {
    level: 2,
    limitKey: "L2_SHORT",
    constraint: "Up to 3 entries. Each: FACTION NAME + role/stance (max 8 words)",
    definition: "Which factions this character belongs to, serves, or opposes — and their position within each",
    aiInstruction: "List up to 3 faction affiliations. For each, write the faction name plus a short role or stance (max 8 words) — e.g., 'The Order — reluctant enforcer, questioning orders'. Include past affiliations if narratively important. **Do not follow a rigid template.**",
    ingredientChecklist: [
      "Each entry names a specific faction from LORE.Factions",
      "The role or stance clarifies their position (member, leader, defector, enemy, spy…)",
      "If they have conflicting loyalties, both should appear",
    ],
    notes: "Cross-references FACTIONS.Faction[]. Useful for spin-offs and faction-centric queries.",
  },
  "CHARACTERS.CharacterList[].KeyRelationships": {
    level: 2,
    limitKey: "L2_SHORT",
    constraint: "Up to 5 entries. Each: NAME + 1 sentence, max 18 words",
    targetOutput: "A quick-read list of the character's most important relationships and what each brings out in them.",
    definition: "Top 5 key relationships — who matters most and how each dynamic shapes this character's behaviour",
    aiInstruction: "List up to 5 key relationships. For each, write the character's NAME plus 1 sentence (max 18 words) describing the dynamic and what it brings out in them. **Do not follow a rigid template.**",
    ingredientChecklist: [
      "Each entry names a specific character from the story",
      "Each sentence captures the dynamic, not just the label (not just 'best friend')",
      "At least one relationship that creates conflict or tension",
      "At least one relationship that reveals a softer or hidden side",
    ],
    notes: "Writer-facing summary. The detailed Relationships.Link[] sub-fields below provide the granular breakdown for each connection.",
  },

  // ==========================================================================
  // L3 — Production
  // ==========================================================================
  "CHARACTERS.CharacterList[].Gen.Trigger": {
    level: 3,
    definition: "Unique identifier for this character in prompts",
    aiInstruction: "Create a unique, generation-friendly identifier (e.g., 'alexander-jericho', 'hawa-thief')",
  },
  "CHARACTERS.CharacterList[].Gen.Tags": {
    level: 3,
    required: true,
    constraint: "Min 3, Max 10 tags",
    definition: "Comma-separated, specific, generation-friendly positive tags deeply tied to this character's identity, look, and story role",
    aiInstruction: "Provide 3–10 positive generation tags. Each tag MUST be deeply connected to who this character is — their appearance, emotional energy, narrative role, cultural markers, or signature visual traits. Combine: explicit descriptors from source + asset tags + inferred visual traits. NO generic filler words (e.g., 'interesting', 'cool', 'nice'). Every tag must pass the test: 'Would removing this tag change the generated image in a meaningful way?' If not, replace it with something specific.",
    ingredientChecklist: [
      "At least 1 tag describing signature physical appearance (e.g., 'deep-set hooded eyes', 'ash-grey cropped hair')",
      "At least 1 tag capturing emotional energy or demeanour (e.g., 'coiled tension', 'quiet authority')",
      "At least 1 tag tied to cultural, period, or world-specific markers (e.g., 'patched military surplus', 'dust-caked boots')",
    ],
  },
  "CHARACTERS.CharacterList[].Gen.NegativeTags": {
    level: 3,
    required: true,
    constraint: "Min 2, Max 5 tags",
    definition: "Specific things to actively avoid when generating this character — wrong traits, anachronisms, and contradictions",
    aiInstruction: "Provide 2–5 negative generation tags. Each tag MUST target a concrete, likely mistake — wrong hair colour, incorrect body type, anachronistic clothing, visual traits that contradict the source. Derive from character rules, explicit 'never' statements, and physical description conflicts. NO vague negatives (e.g., 'ugly', 'bad'). Every tag must answer: 'What specific wrong thing would an AI generate without this warning?'",
    ingredientChecklist: [
      "At least 1 tag preventing a specific physical misrepresentation (e.g., 'no blonde hair', 'not muscular')",
      "At least 1 tag preventing anachronistic or world-breaking elements (e.g., 'no modern clothing', 'no visible technology')",
    ],
  },
  "CHARACTERS.CharacterList[].IdentityRole.NameLabel": {
    level: 3,
    definition: "Canon name label",
  },
  "CHARACTERS.CharacterList[].IdentityRole.AliasesNicknames": {
    level: 3,
    constraint: "Max 12 aliases",
    definition: "All aliases and nicknames",
  },
  "CHARACTERS.CharacterList[].IdentityRole.StoryFunctionTag": {
    level: 3,
    definition: "Primary narrative function: protagonist, mentor, love-interest, etc.",
  },
  "CHARACTERS.CharacterList[].IdentityRole.Status": {
    canonType: "hard",
    level: 3,
    definition: "Alive, deceased, unknown, etc.",
  },
  "CHARACTERS.CharacterList[].SupportingImages.SupportingImages": {
    level: 3,
    constraint: "Max 8 images",
    definition: "Additional character images",
  },
  "CHARACTERS.CharacterList[].Visual.AgeRange": {
    level: 3,
    definition: "Age range",
    aiInstruction: "Infer from context if not stated. Extract from asset tags or descriptions.",
  },
  "CHARACTERS.CharacterList[].Visual.BodyType": {
    level: 3,
    constraint: "1 term (ectomorph / mesomorph / endomorph / blend)",
    definition: "Genetic metabolic body type (ectomorph, mesomorph, endomorph) — how the character builds and carries weight",
    aiInstruction: "Extract from asset tags, descriptions, or source text. Only populate if cited or clearly visible. Use standard somatotype terms.",
  },
  "CHARACTERS.CharacterList[].Visual.BodyShape": {
    level: 3,
    constraint: "Max 1 sentence, max 15 words",
    definition: "Visual skeletal proportions — the visible silhouette describing shoulder-to-waist-to-hip ratio (e.g., broad shoulders tapering to a narrow waist; soft and round through the middle; long-limbed and angular)",
    aiInstruction: "Describe the character's visible proportions in plain, descriptive language. Avoid abstract shape labels (no 'hourglass', 'pear', 'rectangle'). Focus on what a costume designer or artist would notice: where the body is wide, narrow, heavy, or lean.",
  },
  "CHARACTERS.CharacterList[].Visual.KeyFacialPhysicalTraits": {
    level: 3,
    constraint: "Max 16 traits",
    definition: "Distinctive features: scars, tattoos, prosthetics, ears, tail, etc.",
    aiInstruction: "Distinctive features from assets and text",
  },
  "CHARACTERS.CharacterList[].Visual.Hairstyle": {
    level: 3,
    definition: "Hairstyle",
    aiInstruction: "From asset tags or descriptions",
  },
  "CHARACTERS.CharacterList[].Visual.ClothingStyle": {
    level: 3,
    definition: "Clothing style (not every outfit, just recurring style)",
    aiInstruction: "Period/character appropriate. Infer from era if not stated.",
  },
  "CHARACTERS.CharacterList[].Visual.KeyPropsSilhouetteHook": {
    level: 3,
    definition: "Distinctive items or visual hooks (katana, umbrella, VR headset, big headphones…)",
  },
  "CHARACTERS.CharacterList[].Images.SupportingImages": {
    level: 3,
    constraint: "Max 12 images",
    definition: "Additional character images",
  },
  "CHARACTERS.CharacterList[].Images.PoseSheet": {
    level: 3,
    required: true,
    constraint: "1 square image (1:1), white background, no text/labels",
    definition: "AI-generated character model sheet — a mandatory multi-angle reference showing the character in consistent style across views. The system MUST generate this for every character.",
    targetOutput: "A clean, professional character design reference sheet with multiple angles preserving the exact art style of the source.",
    aiInstruction: "ALWAYS generate a character model sheet for every character. This is not optional. Use the character's reference image(s) and, if provided, a pose template layout. **If a template is provided:** copy its layout pixel-for-pixel (same number of views, same grid, same poses) but render the character from the references. **If no template:** use a standard 2-row layout — TOP ROW: 4 full-body views (front, left side, right side, back) in neutral pose; BOTTOM ROW: 3 head close-ups (front face, side profile, back of head). When multiple reference images exist, study ALL of them to lock consistent features (face structure, hair, eye colour, body proportions, outfit, marks/accessories). Preserve the exact art style, line work, and colouring from the references.",
    ingredientChecklist: [
      "Exact art style, line work, and colouring preserved from the reference image(s)",
      "Every full-body view shows the COMPLETE character head-to-feet — arms and hands fully visible, nothing cropped",
      "Accurate representation of the character's body (including any disability shown in the reference)",
      "Adequate margin around each figure so nothing is clipped at edges",
      "Clean white background, no text, no labels, no UI elements",
    ],
    notes: "Pose sheet generation is MANDATORY for every character. The system may optionally receive a pose template image (IMAGE 1) that overrides the default layout — when present, the template layout is non-negotiable. When multiple reference images are provided, they are treated as the SAME character from different angles to improve consistency.",
  },
  "CHARACTERS.CharacterList[].Images.ClothesImgs": {
    level: 3,
    constraint: "Max 12 images",
    definition: "Clothing reference images",
  },
  "CHARACTERS.CharacterList[].Images.PropImgs": {
    level: 3,
    constraint: "Max 12 images",
    definition: "Prop reference images",
  },
  "CHARACTERS.CharacterList[].Images.DetailImgs": {
    level: 3,
    constraint: "Max 20 images",
    definition: "Detail reference images",
  },
  "CHARACTERS.CharacterList[].Voice.BaselineVoice": {
    level: 3,
    definition: "Overall vocal quality (calm / hyper / monotone / theatrical / deadpan…)",
    aiInstruction: "Infer from dialogue patterns in source text",
    notes: "Audio generative production guideline",
  },
  "CHARACTERS.CharacterList[].Voice.SyntaxTempo": {
    level: 3,
    definition: "Speech patterns: terse, verbose, formal, casual, etc.",
    aiInstruction: "Infer from dialogue style",
  },
  "CHARACTERS.CharacterList[].Voice.Register": {
    level: 3,
    definition: "Formal/informal, educated/colloquial",
  },
  "CHARACTERS.CharacterList[].Voice.SlangDialect": {
    level: 3,
    definition: "Regional or period-specific speech patterns",
  },
  "CHARACTERS.CharacterList[].Voice.SignaturePhrasesVerbalTics": {
    level: 3,
    constraint: "Max 10 phrases",
    definition: "Catchphrases, verbal habits from dialogue",
  },
  "CHARACTERS.CharacterList[].Voice.AudioSample": {
    level: 3,
    definition: "Audio sample asset",
  },
  "CHARACTERS.CharacterList[].BehaviourRules.CoreMotivations": {
    level: 3,
    required: true,
    constraint: "3–5 bullets, max 6 words each",
    targetOutput: "A short bullet list of what drives them right now.",
    definition: "What drives this character right now",
    aiInstruction: "Write 3–5 punchy bullets capturing the character's current motivations. **Do not follow a rigid template.** Each bullet max 6 words.",
    ingredientChecklist: [
      "At least one motivation tied to the main plot",
      "At least one personal or emotional motivation",
      "Each bullet is specific to this character, not generic",
    ],
  },
  "CHARACTERS.CharacterList[].BehaviourRules.CoreFearsVulnerabilities": {
    level: 3,
    required: true,
    constraint: "3–5 bullets, max 6 words each",
    targetOutput: "A short bullet list of what they avoid, hide from, or dread.",
    definition: "What they avoid, hide from, or dread",
    aiInstruction: "Write 3–5 punchy bullets capturing the character's deepest fears and vulnerabilities. **Do not follow a rigid template.** Each bullet max 6 words.",
    ingredientChecklist: [
      "At least one fear that affects their decisions in the plot",
      "At least one vulnerability others could exploit",
      "Each bullet is specific to this character, not generic",
    ],
  },
  "CHARACTERS.CharacterList[].Relationships.Link[].TargetRef": {
    level: 3,
    definition: "Name of related character",
    aiInstruction: "Infer relationship types from narrative interactions",
  },
  "CHARACTERS.CharacterList[].Relationships.Link[].Type": {
    level: 3,
    definition: "family/friend/rival/romantic/professional/etc.",
    aiInstruction: "Infer Type from context",
  },
  "CHARACTERS.CharacterList[].Relationships.Link[].Directionality": {
    level: 3,
    definition: "mutual/one-way, who drives the dynamic",
  },
  "CHARACTERS.CharacterList[].Relationships.Link[].TensionLevel": {
    level: 3,
    definition: "low/medium/high/volatile",
  },
  "CHARACTERS.CharacterList[].Relationships.Link[].KeyTurningPoints": {
    level: 3,
    constraint: "Max 6 turning points",
    definition: "Moments that changed the relationship",
  },
}
