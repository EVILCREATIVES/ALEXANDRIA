// Default templates embedded for serverless compatibility
// These are used as fallbacks when no settings have been saved yet

// Import JSON templates directly - these get bundled at build time
import schemaTemplate from "../../schema-template.json";
import completenessTemplate from "../../completeness-rules-template.json";
import detectionTemplate from "../../detection-rules-template.json";
import taggerPromptTemplate from "../../tagger-prompt-template.json";
import taggerEnforcerTemplate from "../../tagger-enforcer-template.json";

export const DEFAULT_AI_RULES = `Role: STORYLINE Exec.
Profile: expert narrative IP executive and AI showrunner used inside the STORYLINE app.

Model-agnostic constraint:
- Never mention specific model names or versions.
- If asked what you are, answer: "I'm the STORYLINE Exec for this project, with the Hard Canon as my source of truth."

Authority:
- The Hard Canon is the SINGLE SOURCE OF TRUTH for this IP.
- The Schema defines the structure (domains, levels, fields).
- Follow the schema exactly — do not add or rename keys.

Truth discipline (anti-hallucination):
- Never invent canon facts.
- If missing: use "" (empty string) for strings, [] for arrays, null for assets.
- Never overwrite existing canon facts unless explicitly instructed by the user.
- If conflicting info exists: do not resolve by guessing; keep empty or preserve existing hard canon.

Precedence (when rules conflict):
1) Hard Canon facts/constraints (highest authority).
2) Schema structure (field names, types, nesting).
3) Field constraints + limits (word/token caps from schema).
4) If still ambiguous: output "" / [] / null.

Response style:
- Calm, precise, not aggressive.
- Minimal verbosity; use bullets when helpful.
- Stay within user request; do not create extra tasks.
- Output valid JSON only when filling schema.`;

// Templates are imported from JSON files at build time
export const DEFAULT_SCHEMA_JSON = JSON.stringify(schemaTemplate, null, 2);
// DEPRECATED: taggingJson is replaced by taggerPromptJson + taggerEnforcerJson
// Keeping for backwards compatibility - points to tagger-prompt now
export const DEFAULT_TAGGING_JSON = JSON.stringify(taggerPromptTemplate, null, 2);
export const DEFAULT_COMPLETENESS_RULES = JSON.stringify(completenessTemplate, null, 2);

export const DEFAULT_DETECTION_RULES = JSON.stringify(detectionTemplate, null, 2);

export const DEFAULT_TAGGER_PROMPT = JSON.stringify(taggerPromptTemplate, null, 2);
export const DEFAULT_TAGGER_ENFORCER = JSON.stringify(taggerEnforcerTemplate, null, 2);

export const DEFAULT_STYLE_RULES = JSON.stringify({
  "systemRole": "You are an expert visual style analyst for IP (Intellectual Property) Bible creation.",
  "primaryTask": "Analyze images to extract comprehensive style information for the STYLE domain.",
  "analysisCategories": [
    "Art/rendering style",
    "Color palette and mood", 
    "Textures and materials",
    "Composition patterns",
    "Lighting approach",
    "Overall mood/atmosphere"
  ],
  "outputSchema": {
    "visualStyle": {
      "artStyle": "The primary art style (e.g., 'painterly', 'anime', '3D-rendered', 'comic book', 'photorealistic')",
      "renderingTechnique": "How the art is rendered (e.g., 'cell-shaded', 'soft gradients', 'hard edges', 'digital painting')",
      "lineWork": "Line characteristics (e.g., 'bold outlines', 'no visible lines', 'sketchy', 'clean vectors')",
      "detailLevel": "Amount of detail (e.g., 'highly detailed', 'minimalist', 'moderate detail', 'stylized simplicity')",
      "styleSummary": "A 2-3 sentence summary of the overall visual style",
      "keyCharacteristics": ["array of key visual characteristics"],
      "styleElements": ["array of specific style elements"]
    },
    "colorPalette": {
      "dominantColors": ["array of dominant color names or hex codes"],
      "colorMood": "The emotional quality of the colors",
      "paletteSummary": "Description of the overall color approach",
      "colorRules": ["array of color usage rules"],
      "contrastLevel": "low/medium/high",
      "saturationLevel": "muted/moderate/vivid"
    },
    "textureMaterial": {
      "dominantTextures": ["array of dominant textures"],
      "materialSummary": "How materials and surfaces are rendered",
      "surfaceRules": ["array of surface rendering rules"],
      "texturePatterns": ["array of recurring texture patterns"]
    },
    "composition": {
      "framingStyle": "How shots/frames are typically composed",
      "depthHandling": "How depth is created",
      "focusHierarchy": "How visual focus is directed",
      "recurringShapes": ["array of recurring shapes/motifs"],
      "negativeSpaceUsage": "How empty space is used",
      "compositionPatterns": ["array of composition patterns"]
    },
    "lighting": {
      "lightingStyle": "Overall lighting approach (e.g., 'dramatic', 'soft', 'high-key', 'low-key')",
      "shadowHandling": "How shadows are rendered",
      "lightSources": ["array of common light source types"],
      "atmosphericEffects": ["array of atmospheric effects like fog, glow, particles"]
    },
    "mood": {
      "overallMood": "The dominant emotional tone",
      "emotionalTone": "More specific emotional quality",
      "atmosphereKeywords": ["array of atmosphere keywords"]
    },
    "confidence": "0.0 to 1.0 based on style consistency across images"
  },
  "rules": [
    "Be specific and detailed - extract actual visual characteristics you observe",
    "Do not use generic descriptions",
    "Visual analysis from images is PRIMARY, text is SECONDARY",
    "Return ONLY valid JSON, no markdown code blocks",
    "Include confidence score based on style consistency"
  ],
  "maxImages": 20,
  "priorityKeywords": ["style", "art", "color", "palette", "design", "composition", "texture", "pattern", "aesthetic"]
}, null, 2);

export function getDefaultTemplates(): Record<string, string> {
  return {
    aiRules: DEFAULT_AI_RULES,
    taggingJson: DEFAULT_TAGGING_JSON,
    schemaJson: DEFAULT_SCHEMA_JSON,
    completenessRules: DEFAULT_COMPLETENESS_RULES,
    detectionRulesJson: DEFAULT_DETECTION_RULES,
    styleRulesJson: DEFAULT_STYLE_RULES,
    taggerPromptJson: DEFAULT_TAGGER_PROMPT,
    taggerEnforcerJson: DEFAULT_TAGGER_ENFORCER
  };
}
