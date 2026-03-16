/**
 * IP Bible V4 — STORY Domain
 * L2 (Bible-Presentation) + L3 (Production) fields
 * L1 covers live in ipbible-v4-metadata.ts
 */

import type { FieldMetadataMap } from "./ipbible-v4-metadata"

export const STORY_FIELDS: FieldMetadataMap = {
  // ==========================================================================
  // L2 — Bible-Presentation
  // ==========================================================================

  // --------------------------------------------------------------------------
  // STORY OVERVIEW (L2)
  // Show only if project contains more than one story page (MASTER STORY + one
  // or more STORY FORMATS). Always list MASTER STORY first, then up to 5 story
  // units total (most important and developed; exclude minor or one-off first).
  // --------------------------------------------------------------------------
  "STORY.StoryOverview[].Name": {
    level: 2,
    required: true,
    trigger: "Show only if project contains more than one story page (MASTER STORY + one or more STORY FORMATS).",
    constraint: "Max 6 words",
    definition: "The story unit name — e.g., 'SEASON 1', 'THE PILOT', 'FILM VERSION', 'MASTER STORY', 'ANIME SERIES', 'TV ANTHOLOGY SERIES'.",
    aiInstruction: "Write the story unit name (max 6 words). Examples: 'SEASON 1', 'THE PILOT', 'FILM VERSION', 'MASTER STORY', 'ANIME SERIES'.",
    notes: "MASTER STORY always listed first. Up to 5 story units total.",
  },
  "STORY.StoryOverview[].HeroImage": {
    level: 2,
    definition: "Optional: 1 defining image for this story unit. Leave blank if unknown.",
  },
  "STORY.StoryOverview[].Summary": {
    level: 2,
    required: true,
    constraint: "1 sentence, max 15 words",
    targetOutput: "The main situation plus what changes if the protagonist fails.",
    aiInstruction: "Write 1 sentence (max 15 words): the main situation plus what changes if the protagonist fails. **Do not follow a rigid template.**",
    ingredientChecklist: [
      "The protagonist's main situation or goal",
      "What changes or is lost if they fail",
    ],
    definition: "The main situation plus what changes if the protagonist fails.",
  },
  "STORY.StoryOverview[].KeyBeats": {
    level: 2,
    required: true,
    constraint: "3 bullets, max 8 words each",
    targetOutput: "The biggest reversals, reveals, or turning points.",
    aiInstruction: "Write 3 bullets (max 8 words each): the biggest reversals, reveals, or turning points. **Do not follow a rigid template.**",
    ingredientChecklist: [
      "Each bullet captures a single major reversal or reveal",
      "Beats are in chronological order",
      "Each changes the direction of the story",
    ],
    definition: "The biggest reversals, reveals, or turning points.",
  },

  // --------------------------------------------------------------------------
  // MASTER STORY (L2)
  // Show IF the project is an IP/world pitch (lookbook, bible, pitch deck) OR
  // includes more than one story unit. Do NOT show if single self-contained
  // script only.
  // --------------------------------------------------------------------------
  "STORY.MasterStory.Story": {
    level: 2,
    required: true,
    constraint: "1 sentence, max 30 words",
    targetOutput: "The main situation plus what changes if the protagonist fails.",
    aiInstruction: "Write 1 sentence (max 30 words): the main situation plus what changes if the protagonist fails. **Do not follow a rigid template.**",
    ingredientChecklist: [
      "The protagonist's situation and goal",
      "The consequence of failure",
    ],
    definition: "The main situation plus what changes if the protagonist fails.",
    trigger: "Show if project is an IP/world pitch OR includes more than one story unit.",
    notes: "Triggered when project is an IP/world pitch OR includes more than one story unit.",
  },
  "STORY.MasterStory.Arc": {
    level: 2,
    required: true,
    constraint: "2 lines (max 12 words each) + 1 sentence (max 20 words)",
    targetOutput: "START/END of protagonist transformation + who forces them to face the truth.",
    aiInstruction: "Write 2 short lines: START (max 12 words): who the protagonist is now. END (max 12 words): who the protagonist becomes or refuses to become. Then write 1 sentence (max 20 words): who most forces the protagonist to face the truth, and how. **Do not follow a rigid template.**",
    ingredientChecklist: [
      "A concrete START state — who they are at the beginning",
      "A concrete END state — who they become or refuse to become",
      "The truth-forcer — who pushes them and how",
    ],
    definition: "The protagonist's arc: start state, end state, and who forces the truth.",
  },
  "STORY.MasterStory.Tension": {
    level: 2,
    required: true,
    constraint: "1 sentence, max 18 words",
    targetOutput: "The central question the story answers by the end.",
    aiInstruction: "Write 1 sentence (max 18 words): the central question the story answers by the end. **Do not follow a rigid template.**",
    ingredientChecklist: [
      "A specific dramatic question, not a theme",
      "The answer is uncertain — genuine tension",
    ],
    definition: "The central question the story answers by the end.",
  },
  "STORY.MasterStory.Stakes": {
    level: 2,
    required: true,
    constraint: "1 sentence, max 20 words",
    targetOutput: "What stands in the way, and what it wants.",
    aiInstruction: "Write 1 sentence (max 20 words): what stands in the way, and what it wants. **Do not follow a rigid template.**",
    ingredientChecklist: [
      "A concrete opposing force or obstacle",
      "What that force actively wants",
    ],
    definition: "What stands in the way, and what it wants.",
  },
  "STORY.MasterStory.KeyTurns": {
    level: 2,
    required: true,
    constraint: "4 bullets, max 8 words each",
    targetOutput: "The biggest reversals or reveals.",
    aiInstruction: "Write 4 bullets (max 8 words each): the biggest reversals or reveals. **Do not follow a rigid template.**",
    ingredientChecklist: [
      "Each bullet captures a single major reversal or reveal",
      "Beats are in chronological order",
      "Each fundamentally changes the story's direction",
    ],
    definition: "The biggest reversals or reveals.",
  },

  // Master Story — Structure
  "STORY.MasterStory.Structure.Arc": {
    level: 2,
    required: true,
    constraint: "4 bullets, max 18 words each",
    targetOutput: "Act 1 setup, Act 2 escalation, Act 3 crisis, Act 4 final test and outcome.",
    aiInstruction: "Write 4 bullets (max 18 words each): Act 1 setup, Act 2 escalation, Act 3 crisis, Act 4 final test and outcome. **Do not follow a rigid template.**",
    ingredientChecklist: [
      "Act 1 establishes the world and the protagonist's status quo",
      "Act 2 escalates conflict and raises stakes",
      "Act 3 reaches a crisis or low point",
      "Act 4 delivers the final test and outcome",
    ],
    definition: "4-act structure: setup, escalation, crisis, final test.",
  },
  "STORY.MasterStory.Structure.HowItStarts": {
    level: 2,
    constraint: "1 sentence, max 15 words",
    targetOutput: "The first image that defines the protagonist's starting self.",
    aiInstruction: "Write 1 sentence (max 15 words): the first image that defines the protagonist's starting self. **Do not follow a rigid template.**",
    definition: "The first image that defines the protagonist's starting self.",
  },
  "STORY.MasterStory.Structure.HowItEnds": {
    level: 2,
    constraint: "1 sentence, max 15 words",
    targetOutput: "The last image that proves the change.",
    aiInstruction: "Write 1 sentence (max 15 words): the last image that proves the change. **Do not follow a rigid template.**",
    definition: "The last image that proves the change.",
  },
  "STORY.MasterStory.Structure.Formats": {
    level: 2,
    constraint: "2 bullet groups: READY + CONCEPT",
    targetOutput: "All formats grouped by readiness level.",
    aiInstruction: "List all formats in two bullet-pointed groups: READY (scripted, with length or episode count) and CONCEPT (discussed at an idea level only). **Do not follow a rigid template.**",
    ingredientChecklist: [
      "READY formats include length or episode count",
      "CONCEPT formats are clearly marked as idea-level only",
    ],
    definition: "All formats grouped as READY (scripted) or CONCEPT (idea-level).",
  },

  // Master Story — Timeline
  "STORY.MasterStory.Timeline.KeyEvents": {
    level: 2,
    constraint: "5–12 events, max 18 words each. Format: TIME MARKER + EVENT + IMPACT ON DAILY LIFE",
    targetOutput: "Key world events in chronological order — what happened, when, and how it changed daily life.",
    aiInstruction: "List 5–12 key world events in chronological order. Each entry max 18 words. Format each as: TIME MARKER + EVENT + IMPACT ON DAILY LIFE. Avoid episode plot. **Do not follow a rigid template.**",
    ingredientChecklist: [
      "Each event has a clear time marker",
      "Each event describes what happened",
      "Each event notes the impact on daily life",
      "Events are world-level, not episode-level plot",
    ],
    definition: "Key world events in chronological order — time marker, event, impact on daily life.",
  },

  // --------------------------------------------------------------------------
  // STORY FORMAT (L2)
  // Show IF the project includes a script, detailed outline, or beat breakdown.
  // Do NOT show if IP/world pitch only with no story detail yet.
  // --------------------------------------------------------------------------
  "STORY.StoryFormats[].Story": {
    level: 2,
    required: true,
    constraint: "1 sentence, max 30 words",
    targetOutput: "The main situation plus what changes if the protagonist fails.",
    aiInstruction: "Write 1 sentence (max 30 words): the main situation plus what changes if the protagonist fails. **Do not follow a rigid template.**",
    ingredientChecklist: [
      "The protagonist's situation and goal",
      "The consequence of failure",
    ],
    definition: "The main situation plus what changes if the protagonist fails.",
    trigger: "Show if project includes a script, detailed outline, or beat breakdown.",
    notes: "Triggered when project includes a script, detailed outline, or beat breakdown.",
  },
  "STORY.StoryFormats[].Arc": {
    level: 2,
    required: true,
    constraint: "2 lines (max 12 words each) + 1 sentence (max 20 words)",
    targetOutput: "START/END of protagonist transformation + who forces them to face the truth.",
    aiInstruction: "Write 2 short lines: START (max 12 words): who they are now. END (max 12 words): who they become or refuse to become. Then write 1 sentence (max 20 words): who most forces them to face the truth, and how. **Do not follow a rigid template.**",
    ingredientChecklist: [
      "A concrete START state",
      "A concrete END state — transformation or refusal",
      "The truth-forcer — who and how",
    ],
    definition: "The protagonist's arc: start state, end state, and who forces the truth.",
  },
  "STORY.StoryFormats[].Tension": {
    level: 2,
    required: true,
    constraint: "1 sentence, max 18 words",
    targetOutput: "The central question the story answers by the end.",
    aiInstruction: "Write 1 sentence (max 18 words): the central question the story answers by the end. **Do not follow a rigid template.**",
    definition: "The central question the story answers by the end.",
  },
  "STORY.StoryFormats[].Stakes": {
    level: 2,
    required: true,
    constraint: "1 sentence, max 20 words",
    targetOutput: "What stands in the way, and what it wants.",
    aiInstruction: "Write 1 sentence (max 20 words): what stands in the way, and what it wants. **Do not follow a rigid template.**",
    definition: "What stands in the way, and what it wants.",
  },
  "STORY.StoryFormats[].KeyTurns": {
    level: 2,
    required: true,
    constraint: "4 bullets, max 10 words each",
    targetOutput: "The biggest reversals or reveals.",
    aiInstruction: "Write 4 bullets (max 10 words each): the biggest reversals or reveals. **Do not follow a rigid template.**",
    definition: "The biggest reversals or reveals.",
  },

  // Story Format — Structure
  "STORY.StoryFormats[].Structure.StoryType": {
    level: 2,
    required: true,
    constraint: "1 tag: SINGLE STORY or SERIES",
    definition: "Whether this story format is a self-contained single story or an ongoing series.",
  },
  "STORY.StoryFormats[].Structure.Arc": {
    level: 2,
    required: true,
    constraint: "4 bullets, max 18 words each",
    targetOutput: "Act 1 setup, Act 2 escalation, Act 3 crisis, Act 4 final test and outcome.",
    aiInstruction: "Write 4 bullets (max 18 words each): Act 1 setup, Act 2 escalation, Act 3 crisis, Act 4 final test and outcome. **Do not follow a rigid template.**",
    definition: "4-act structure: setup, escalation, crisis, final test.",
  },
  "STORY.StoryFormats[].Structure.HowItStarts": {
    level: 2,
    constraint: "1 sentence, max 15 words",
    targetOutput: "The first image that defines the protagonist's starting self.",
    aiInstruction: "Write 1 sentence (max 15 words): the first image that defines the protagonist's starting self. **Do not follow a rigid template.**",
    definition: "The first image that defines the protagonist's starting self.",
  },
  "STORY.StoryFormats[].Structure.HowItEnds": {
    level: 2,
    constraint: "1 sentence, max 15 words",
    targetOutput: "The last image that proves the change.",
    aiInstruction: "Write 1 sentence (max 15 words): the last image that proves the change. **Do not follow a rigid template.**",
    definition: "The last image that proves the change.",
  },
  "STORY.StoryFormats[].Structure.FormatNote": {
    level: 2,
    constraint: "2 sentences, max 45 words",
    targetOutput: "How the creator uses the format — unit length, pacing, and how they lean into or subvert format conventions.",
    aiInstruction: "Write 2 sentences (max 45 words): how the creator uses the format (unit length, pacing, and how they lean into or subvert format conventions). **Do not follow a rigid template.**",
    definition: "How the creator uses the format — unit length, pacing, format conventions.",
  },

  // Story Format — Timeline
  "STORY.StoryFormats[].Timeline.KeyEvents": {
    level: 2,
    constraint: "5–12 events, max 18 words each. Format: TIME MARKER + EVENT + IMPACT ON DAILY LIFE",
    targetOutput: "Key world events in chronological order — what happened, when, and how it changed daily life.",
    aiInstruction: "List 5–12 key world events in chronological order. Each entry max 18 words. Format each as: TIME MARKER + EVENT + IMPACT ON DAILY LIFE. Avoid episode plot. **Do not follow a rigid template.**",
    definition: "Key world events in chronological order — time marker, event, impact on daily life.",
  },

  // Story Format — Beats
  "STORY.StoryFormats[].Beats.MajorBeats": {
    level: 2,
    constraint: "12–16 beats, max 18 words each. Format: BEAT NAME: Event. Consequence.",
    targetOutput: "Major story beats for a single story — each beat with its event and what changes because of it.",
    aiInstruction: "List 12–16 beats. Each beat 1 line (max 18 words). Format each as: BEAT NAME: Event. Consequence (what changes because of it). **Do not follow a rigid template.**",
    ingredientChecklist: [
      "Each beat has a clear name or label",
      "Each beat describes the event",
      "Each beat notes the consequence — what changes",
    ],
    definition: "Major story beats — event + consequence. Use if StoryType = SINGLE STORY.",
    notes: "Show if StoryType = SINGLE STORY.",
  },
  "STORY.StoryFormats[].Beats.EpisodeBeats": {
    level: 2,
    constraint: "1 line per episode, max 22 words each. Format: EP# TITLE: Event. Turn. END IMPACT.",
    targetOutput: "Episode-level beats for a series — each episode with its event, turn, and lasting impact.",
    aiInstruction: "List episodes. Each episode 1 line (max 22 words). Format each as: EP# TITLE: Event. Turn. END IMPACT (the lasting emotional or story punch, quiet or explosive). **Do not follow a rigid template.**",
    ingredientChecklist: [
      "Each episode has a number and title",
      "Each describes the main event and turn",
      "Each ends with the lasting impact — emotional or narrative",
    ],
    definition: "Episode-level beats — event, turn, end impact. Use if StoryType = SERIES.",
    notes: "Show if StoryType = SERIES.",
  },

  // --------------------------------------------------------------------------
  // STORY — Legacy L2 detail fields (kept for backward compatibility)
  // --------------------------------------------------------------------------
  "STORY.CanonTimelineTable.Beat[].TimeMarker": {
    level: 2,
    definition: "When this happens in story time",
    notes: "Granular beat-level timeline. Summary lives in MasterStory.Timeline.KeyEvents / StoryFormats[].Timeline.KeyEvents.",
  },
  "STORY.CanonTimelineTable.Beat[].EventTitle": {
    level: 2,
    definition: "Short label for the event",
  },
  "STORY.CanonTimelineTable.Beat[].Summary": {
    level: 2,
    definition: "Event summary",
  },
  "STORY.CanonTimelineTable.Beat[].KeyCharacters": {
    level: 2,
    definition: "Character names involved in this event",
  },
  "STORY.CanonTimelineTable.Beat[].LoreLinks": {
    level: 2,
    definition: "Relevant world/faction/location names",
  },
  "STORY.ArcMap.Arc[].ArcName": {
    level: 2,
    definition: "Arc name (e.g., 'Monty Tower Attack', 'Dream Parade')",
  },
  "STORY.ArcMap.Arc[].StartState": {
    level: 2,
    definition: "What's true at the beginning of this arc",
  },
  "STORY.ArcMap.Arc[].ArcQuestionTension": {
    level: 2,
    definition: "The main dramatic question",
  },
  "STORY.ArcMap.Arc[].KeyTurns": {
    level: 2,
    constraint: "Max 3 turns",
    definition: "2–3 big reversals or reveals",
  },
  "STORY.ArcMap.Arc[].EndState": {
    level: 2,
    definition: "What's changed by the end of this arc",
  },
  "STORY.POVStructureRules.POVStrategy": {
    level: 2,
    limitKey: "L2_MED",
    definition: "First/third person, single/multiple POV, etc.",
    aiInstruction: "Infer from narrative voice in source text",
  },
  "STORY.POVStructureRules.TimelinePattern": {
    level: 2,
    limitKey: "L2_MED",
    definition: "Linear/non-linear, flashbacks, time jumps",
  },
  "STORY.POVStructureRules.AccessRules": {
    level: 2,
    limitKey: "L2_MED",
    definition: "What we *never* show (e.g., 'no inside view of villain's head until Arc 3')",
  },
  "STORY.POVStructureRules.NarrativeDevices": {
    level: 2,
    constraint: "Max 8 devices",
    definition: "Narrative devices: diaries, news reports, social feeds, etc.",
  },
  "STORY.CharacterArcsGridLeads.Row[].Character": {
    level: 2,
    definition: "Character name",
  },
  "STORY.CharacterArcsGridLeads.Row[].StartState": {
    level: 2,
    definition: "Who they are at the beginning",
  },
  "STORY.CharacterArcsGridLeads.Row[].MidpointShift": {
    level: 2,
    definition: "The main turning point",
  },
  "STORY.CharacterArcsGridLeads.Row[].EndState": {
    level: 2,
    definition: "Who they become",
  },
  "STORY.CharacterArcsGridLeads.Row[].CoreLessonFailure": {
    level: 2,
    definition: "What they learn or refuse to learn",
  },

  // ==========================================================================
  // L3 — Production
  // ==========================================================================
  "STORY.OverallIPNarrative.Text": {
    level: 3,
    limitKey: "L3_LONG",
    definition: "Comprehensive IP narrative",
  },

  // Master Timeline
  "STORY.MasterTimeline.Beat[].TimeMarker": {
    level: 3,
    definition: "When this happens in story time",
  },
  "STORY.MasterTimeline.Beat[].EventTitle": {
    level: 3,
    definition: "Event title",
  },
  "STORY.MasterTimeline.Beat[].Summary": {
    level: 3,
    limitKey: "L3_SHORT",
    definition: "Comprehensive story beats including backstory",
    aiInstruction: "Extract story beats from narrative. Include both explicit and implied events.",
  },
  "STORY.MasterTimeline.Beat[].KeyCharacters": {
    level: 3,
    definition: "Character names involved",
  },
  "STORY.MasterTimeline.Beat[].Locations": {
    level: 3,
    definition: "Location names involved",
  },
  "STORY.MasterTimeline.Beat[].Factions": {
    level: 3,
    definition: "Faction names involved",
  },
  "STORY.MasterTimeline.Beat[].Dependencies": {
    level: 3,
    definition: "What must happen before this beat",
  },

  // Format Narrative
  "STORY.FormatNarrative.FormatType": {
    level: 3,
    definition: "film, series, podcast, webtoon, novel, game, other",
  },
  "STORY.FormatNarrative.EpisodeCountOrLength": {
    level: 3,
    definition: "Episode count or length",
  },
  "STORY.FormatNarrative.RuntimeOrPageCount": {
    level: 3,
    definition: "Runtime or page count",
  },
  "STORY.FormatNarrative.ReleaseCadence": {
    level: 3,
    definition: "Release cadence",
  },
  "STORY.FormatNarrative.StructureRules": {
    level: 3,
    limitKey: "L3_MED",
    definition: "Structure rules",
  },

  // Episode Pack
  "STORY.EpisodePack.Episode[].EpisodeId": {
    level: 3,
    definition: "Episode ID",
  },
  "STORY.EpisodePack.Episode[].EpisodeNumber": {
    level: 3,
    definition: "Episode number",
  },
  "STORY.EpisodePack.Episode[].Title": {
    level: 3,
    definition: "Episode title",
  },
  "STORY.EpisodePack.Episode[].Logline": {
    level: 3,
    limitKey: "L2_MED",
    definition: "Episode logline",
  },
  "STORY.EpisodePack.Episode[].BeatSheet": {
    level: 3,
    definition: "Episode beat sheet",
  },
  "STORY.EpisodePack.Episode[].KeyCharacters": {
    level: 3,
    definition: "Key character names",
  },
  "STORY.EpisodePack.Episode[].KeyLocations": {
    level: 3,
    definition: "Key location names",
  },
  "STORY.EpisodePack.Episode[].LoreDependencies": {
    level: 3,
    definition: "Lore dependencies",
  },
  "STORY.EpisodePack.Episode[].AssetNeeds": {
    level: 3,
    definition: "Asset needs",
  },
  "STORY.EpisodePack.Episode[].Notes": {
    level: 3,
    limitKey: "L3_MED",
    definition: "Episode notes",
  },
}
