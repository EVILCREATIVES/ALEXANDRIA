/**
 * IP Bible V4 — STYLE Domain
 * L2 (Bible-Presentation) + L3 (Production) fields
 * L1 covers live in ipbible-v4-metadata.ts
 */

import type { FieldMetadataMap } from "./ipbible-v4-metadata"

export const STYLE_FIELDS: FieldMetadataMap = {
  // ==========================================================================
  // L2 — Bible-Presentation (Writer-facing)
  // ==========================================================================
  "STYLE.CreativeVision": {
    level: 2,
    required: true,
    constraint: "1–2 sentences, max 40 words",
    targetOutput: "If someone saw one frame, what should they feel and recognise?",
    aiInstruction: "Write 1–2 sentences (max 40 words): if someone saw one frame of this IP, what should they feel and recognise? **Do not follow a rigid template.** Focus on emotional impact and visual identity, not technique.",
    ingredientChecklist: [
      "The dominant feeling or emotional register of the visual",
      "What makes it instantly recognisable",
    ],
    definition: "If someone saw one frame, what should they feel and recognise?",
  },
  "STYLE.StylePackImages": {
    level: 2,
    constraint: "Max 8 images",
    definition: "Optional: images selected from platform style packs that define the look. Leave blank if not using a pack.",
    notes: "Option A — use a platform style pack. Mutually exclusive with STYLE.StyleUploadImages in practice, but both can be populated.",
  },
  "STYLE.StyleUploadImages": {
    level: 2,
    constraint: "Max 8 images",
    definition: "Optional: uploaded reference images that define the look. Leave blank if using a style pack.",
    notes: "Option B — upload custom references. Mutually exclusive with STYLE.StylePackImages in practice, but both can be populated.",
  },
  "STYLE.SignsAndSymbols": {
    level: 2,
    constraint: "5–10 bullets, max 8 words each",
    targetOutput: "Recurring motifs, images, or signature moments that define this IP's visual language.",
    aiInstruction: "List 5–10 recurring motifs, images, or signature visual moments. **Do not follow a rigid template.** Each bullet max 8 words.",
    ingredientChecklist: [
      "At least one recurring visual motif or symbol",
      "At least one signature moment type (how key scenes tend to look)",
      "Each bullet is specific to this IP, not generic",
    ],
    definition: "Recurring motifs, images, or signature moments.",
  },
  "STYLE.Boundaries": {
    level: 2,
    constraint: "3–5 bullets, max 10 words each",
    targetOutput: "What is allowed and what is off-limits — leaning into style, genre, and storyform.",
    aiInstruction: "Write 3–5 bullets covering what is allowed and what is off-limits visually, leaning into style, genre, and storyform. **Do not follow a rigid template.** Each bullet max 10 words.",
    ingredientChecklist: [
      "At least one clear 'always do' visual rule",
      "At least one clear 'never do' visual rule",
      "Rules are grounded in genre, style, or storyform — not arbitrary",
    ],
    definition: "What is allowed and what is off-limits — style, genre, and storyform.",
  },
  "STYLE.Formats": {
    level: 2,
    constraint: "2–4 sentences, max 70 words",
    targetOutput: "How the visual approach changes across formats — if applicable.",
    aiInstruction: "If this IP spans multiple formats, write 2–4 sentences (max 70 words) explaining how that changes the visual approach (e.g., animation vs live-action, webtoon vs film). **Do not follow a rigid template.** Skip if single-format only.",
    ingredientChecklist: [
      "Names the formats involved",
      "Explains what changes visually between them",
      "At least one concrete difference (not just 'it adapts')",
    ],
    definition: "If multi-format, how the visual approach changes across formats.",
  },

  // Style — Comps
  "STYLE.Comps.Images": {
    level: 2,
    constraint: "Max 4 images",
    definition: "Optional: comp images that capture the target vibe or execution.",
  },
  "STYLE.Comps.Text": {
    level: 2,
    constraint: "Max 4 entries, 1 line each, max 12 words",
    targetOutput: "For each comp, what we are borrowing and why.",
    aiInstruction: "For each comp image, write 1 line (max 12 words): what we are borrowing and why. **Do not follow a rigid template.**",
    definition: "For each comp: what we are borrowing and why.",
  },

  // Style — Execution (writer-facing summaries)
  "STYLE.Execution.ReferenceImages": {
    level: 2,
    constraint: "Max 12 images",
    definition: "Optional: loose idea images. No canon implied — a parking lot for visual inspiration.",
  },
  "STYLE.Execution.Texture": {
    level: 2,
    constraint: "3–5 bullets, max 10 words each",
    targetOutput: "Line, texture, shading, detail density.",
    aiInstruction: "Write 3–5 bullets covering line treatment, texture approach, shading style, and detail density. **Do not follow a rigid template.** Each bullet max 10 words.",
    definition: "Line, texture, shading, detail density.",
    notes: "Writer-facing summary. Detailed production breakdown lives in STYLE.TextureMaterialLanguage.* fields.",
  },
  "STYLE.Execution.ColorAndContrast": {
    level: 2,
    constraint: "3–5 bullets, max 10 words each",
    targetOutput: "Saturation, contrast range, temperature bias, accent policy.",
    aiInstruction: "Write 3–5 bullets covering saturation, contrast range, temperature bias, and accent colour policy. **Do not follow a rigid template.** Each bullet max 10 words.",
    definition: "Saturation, contrast range, temperature bias, accent policy.",
    notes: "Writer-facing summary. Detailed production breakdown lives in STYLE.ColorPalette.* fields.",
  },
  "STYLE.Execution.Lighting": {
    level: 2,
    constraint: "3–5 bullets, max 10 words each",
    targetOutput: "Default lighting mood, shadow rules, preferred sources, silhouette policy.",
    aiInstruction: "Write 3–5 bullets covering default lighting mood, shadow rules, preferred light sources, and silhouette policy. **Do not follow a rigid template.** Each bullet max 10 words.",
    definition: "Default lighting mood, shadow rules, preferred sources, silhouette policy.",
    notes: "Writer-facing summary. Detailed production breakdown lives in STYLE.Lighting.* fields.",
  },
  "STYLE.Execution.Shots": {
    level: 2,
    constraint: "3–5 bullets, max 10 words each",
    targetOutput: "Default shot language, hero angles, distance rules, movement tendencies.",
    aiInstruction: "Write 3–5 bullets covering default shot language, hero angles, distance rules, and movement tendencies. **Do not follow a rigid template.** Each bullet max 10 words.",
    definition: "Default shot language, hero angles, distance rules, movement tendencies.",
  },
  "STYLE.Execution.Design": {
    level: 2,
    constraint: "3–5 bullets, max 10 words each",
    targetOutput: "Title treatment, on-screen text rules, SFX style, layout conventions.",
    aiInstruction: "Write 3–5 bullets covering title treatment, on-screen text rules, SFX style, and layout conventions. **Do not follow a rigid template.** Each bullet max 10 words.",
    definition: "Title treatment, on-screen text rules, SFX style, layout conventions.",
  },

  // Style — Visual Style (L2 summary fields)
  "STYLE.VisualStyle.LeadImage": {
    level: 2,
    definition: "Most representative style image from assets",
    aiInstruction: "Select representative style images. Threshold: 0.5.",
  },
  "STYLE.VisualStyle.StyleSummary": {
    level: 2,
    limitKey: "L2_LONG",
    definition: "Overall visual identity extracted from assets and descriptions",
    aiInstruction: "Extract visual patterns from ALL tagged assets. **Do not follow a rigid template.** Build a comprehensive style guide that reads like a creative brief, not a data table.",
    ingredientChecklist: [
      "The dominant rendering style — line, colour, texture approach",
      "Recurring visual motifs or compositional habits",
      "The overall mood the visuals convey",
      "What makes this IP's look distinct from similar work",
    ],
  },
  "STYLE.VisualStyle.ArtStyle": {
    level: 2,
    constraint: "1 tag or short phrase, max 4 words",
    definition: "The primary art style — e.g., 'painterly', 'anime', '3D-rendered', 'comic book', 'photorealistic'.",
    aiInstruction: "Identify the primary art style from the source assets. Be specific: painterly, anime, 3D-rendered, comic book, photorealistic, watercolour, vector, etc.",
  },
  "STYLE.VisualStyle.RenderingTechnique": {
    level: 2,
    constraint: "1 tag or short phrase, max 4 words",
    definition: "How the art is rendered — e.g., 'cell-shaded', 'soft gradients', 'hard edges', 'digital painting'.",
    aiInstruction: "Identify the rendering technique from the source assets: cell-shaded, soft gradients, hard edges, digital painting, impasto, flat colour, etc.",
  },
  "STYLE.VisualStyle.LineWork": {
    level: 2,
    constraint: "1 tag or short phrase, max 4 words",
    definition: "Line characteristics — e.g., 'bold outlines', 'no visible lines', 'sketchy', 'clean vectors'.",
    aiInstruction: "Identify the line work style from the source assets: bold outlines, no visible lines, sketchy, clean vectors, tapered ink, etc.",
  },
  "STYLE.VisualStyle.DetailLevel": {
    level: 2,
    constraint: "1 tag or short phrase, max 4 words",
    definition: "Amount of detail — e.g., 'highly detailed', 'minimalist', 'moderate detail', 'stylised simplicity'.",
    aiInstruction: "Identify the detail level from the source assets: highly detailed, minimalist, moderate detail, stylised simplicity, etc.",
  },

  // Style — Color Palette (L2 summary fields)
  "STYLE.ColorPalette.MainPaletteStrip": {
    level: 2,
    definition: "Main color palette strip asset",
  },
  "STYLE.ColorPalette.AdditionalSwatches": {
    level: 2,
    constraint: "Max 12 swatches",
    definition: "Additional color swatches",
  },
  "STYLE.ColorPalette.PaletteSummary": {
    level: 2,
    limitKey: "L2_LONG",
    definition: "Color mood and palette description from asset analysis",
    aiInstruction: "Extract from tagged asset color descriptions",
  },
  "STYLE.ColorPalette.ColorRules": {
    level: 2,
    constraint: "Max 12 rules",
    definition: "When to use which colors, associations",
  },
  "STYLE.ColorPalette.ContrastLevel": {
    level: 2,
    constraint: "1 tag: low, medium, or high",
    definition: "The overall contrast level across the palette — low, medium, or high.",
    aiInstruction: "Assess the overall contrast level from the source assets: low (flat, muted tonal range), medium (balanced lights and darks), or high (stark, dramatic contrast).",
  },
  "STYLE.ColorPalette.SaturationLevel": {
    level: 2,
    constraint: "1 tag: muted, moderate, or vivid",
    definition: "The overall saturation level across the palette — muted, moderate, or vivid.",
    aiInstruction: "Assess the overall saturation level from the source assets: muted (desaturated, washed), moderate (natural colour intensity), or vivid (rich, saturated, punchy).",
  },

  // Style — Texture/Material (L2 summary fields)
  "STYLE.TextureMaterialLanguage.MaterialTileBoard": {
    level: 2,
    definition: "Material tile board asset",
  },
  "STYLE.TextureMaterialLanguage.MaterialSummary": {
    level: 2,
    limitKey: "L2_MED",
    definition: "Dominant textures and materials from asset descriptions",
    aiInstruction: "Dominant textures and materials from asset descriptions",
  },
  "STYLE.TextureMaterialLanguage.SurfaceRules": {
    level: 2,
    constraint: "Max 12 rules",
    definition: "Surface texture rules",
  },
  "STYLE.TextureMaterialLanguage.TexturePatterns": {
    level: 2,
    constraint: "Max 12 patterns",
    definition: "Recurring texture patterns across assets — e.g., 'crosshatch shading on metal', 'visible brushstrokes on skin', 'grain overlay on backgrounds'.",
    aiInstruction: "Extract recurring texture patterns from the source assets. Be specific about where and how textures appear.",
  },

  // Style — Composition (L2 summary fields)
  "STYLE.Composition.FramingGrid": {
    level: 2,
    definition: "Framing grid asset",
  },
  "STYLE.Composition.DepthStacking": {
    level: 2,
    limitKey: "L2_LONG",
    definition: "Depth stacking strategy",
  },
  "STYLE.Composition.FocusSubjectHierarchy": {
    level: 2,
    limitKey: "L2_LONG",
    definition: "Focus and subject hierarchy",
  },
  "STYLE.Composition.RecurringShapesMotifs": {
    level: 2,
    constraint: "Max 18 shapes",
    definition: "Shape language from asset visual patterns",
  },
  "STYLE.Composition.NegativeSpaceRules": {
    level: 2,
    constraint: "Max 12 rules",
    definition: "Negative space rules",
  },

  // ==========================================================================
  // L3 — Production
  // ==========================================================================

  // Visual Style — Extracted
  "STYLE.VisualStyle.SupportingImages": {
    level: 3,
    constraint: "Max 12 images",
    definition: "Variety of assets showing consistent style",
    aiInstruction: "Select variety of assets showing consistent style. Threshold: 0.3.",
  },
  "STYLE.VisualStyle.KeyCharacteristics": {
    level: 3,
    constraint: "Max 12 characteristics",
    definition: "Dominant visual traits across all assets",
  },
  "STYLE.VisualStyle.StyleElements": {
    level: 3,
    constraint: "Max 24 elements",
    definition: "Specific visual elements: line weight, shading style, detail level, etc.",
  },
  "STYLE.VisualStyle.ExtractedPatterns": {
    level: 3,
    constraint: "Max 30 patterns",
    definition: "Recurring visual patterns found in tagged assets",
  },

  // Color Palette — Extracted
  "STYLE.ColorPalette.UsageExamples": {
    level: 3,
    constraint: "Max 12 examples",
    definition: "Usage examples",
  },
  "STYLE.ColorPalette.ExtractedPalette": {
    level: 3,
    constraint: "Max 24 colors",
    definition: "Color names/hex codes mentioned in asset tags",
  },

  // Composition — Extracted
  "STYLE.Composition.ExtractedCompositionPatterns": {
    level: 3,
    constraint: "Max 24 patterns",
    definition: "Extracted composition patterns",
  },

  // Visual Iconography
  "STYLE.VisualIconography.IconographyOutline": {
    level: 3,
    limitKey: "L3_MED",
    definition: "Recurring symbols and motifs from assets",
    aiInstruction: "Extract patterns from all tagged assets",
  },
  "STYLE.VisualIconography.AdditionalMotifs": {
    level: 3,
    constraint: "Max 24 motifs",
    definition: "Additional motifs",
  },
  "STYLE.VisualIconography.IconSummary": {
    level: 3,
    limitKey: "L3_MED",
    definition: "Icon summary",
  },
  "STYLE.VisualIconography.MotifList": {
    level: 3,
    constraint: "Max 30 motifs",
    definition: "Motif list",
  },
  "STYLE.VisualIconography.MetaSymbolsMeaning": {
    level: 3,
    constraint: "Max 24 symbols",
    definition: "What symbols mean in this world",
  },
  "STYLE.VisualIconography.ShapeLanguage": {
    level: 3,
    limitKey: "L3_MED",
    definition: "Shape language description",
  },
  "STYLE.VisualIconography.ExtractedMotifs": {
    level: 3,
    constraint: "Max 40 motifs",
    definition: "Extracted motifs from assets",
  },

  // Lighting
  "STYLE.Lighting.BaseLightingMood": {
    level: 3,
    limitKey: "L3_MED",
    definition: "Overall feel: high-key / low-key, soft / hard, naturalistic / stylised",
    aiInstruction: "Extract lighting patterns from asset descriptions",
  },
  "STYLE.Lighting.ContrastShadowRules": {
    level: 3,
    constraint: "Max 12 rules",
    definition: "How deep shadows go, when silhouettes are used",
  },
  "STYLE.Lighting.LightSourceLogic": {
    level: 3,
    limitKey: "L3_MED",
    definition: "Preference for diegetic sources vs invisible 'cinema light'",
  },
  "STYLE.Lighting.ColorTemperatureMap": {
    level: 3,
    limitKey: "L3_MED",
    definition: "Typical warm/cool balance",
  },
  "STYLE.Lighting.TimeOfDayBias": {
    level: 3,
    definition: "Preferred times of day and weather",
  },
  "STYLE.Lighting.AccentLightingPatterns": {
    level: 3,
    constraint: "Max 12 patterns",
    definition: "Accent lighting patterns",
  },
  "STYLE.Lighting.ExtractedLightingPatterns": {
    level: 3,
    constraint: "Max 24 patterns",
    definition: "Extracted lighting patterns from assets",
  },
  "STYLE.Lighting.AtmosphericEffects": {
    level: 3,
    constraint: "Max 8 effects",
    definition: "Atmospheric visual effects — e.g., fog, glow, lens flare, particles, haze, volumetric light, dust motes.",
    aiInstruction: "Extract recurring atmospheric effects from the source assets: fog, glow, lens flare, particles, haze, volumetric light, dust motes, rain, etc.",
  },
}
