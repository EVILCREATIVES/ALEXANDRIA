import { NextRequest, NextResponse } from "next/server";
import { fetchManifestDirect } from "@/app/lib/manifest";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 300;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

/**
 * Extract all valid field names from the schema definition.
 * This handles the nested structure with fields and structure keys.
 */
function extractSchemaFields(schemaDef: Record<string, unknown>): Set<string> {
  const validFields = new Set<string>();
  
  function recurse(obj: unknown) {
    if (!obj || typeof obj !== "object") return;
    
    const record = obj as Record<string, unknown>;
    
    // Handle "fields" objects - these define the valid field names
    if (record.fields && typeof record.fields === "object") {
      const fields = record.fields as Record<string, unknown>;
      for (const fieldName of Object.keys(fields)) {
        validFields.add(fieldName);
        // Recurse into nested field definitions
        recurse(fields[fieldName]);
      }
    }
    
    // Handle "structure" objects - these define object[] item structures
    if (record.structure && typeof record.structure === "object") {
      const structure = record.structure as Record<string, unknown>;
      for (const structName of Object.keys(structure)) {
        validFields.add(structName);
        recurse(structure[structName]);
      }
    }
    
    // Also add direct keys that might be domain/level names
    for (const key of Object.keys(record)) {
      if (key !== "fields" && key !== "structure" && key !== "type" && 
          key !== "required" && key !== "hint" && key !== "limits" &&
          key !== "enumRef" && key !== "itemName" && key !== "assetType" &&
          key !== "maxItems" && key !== "output" && key !== "modality" &&
          key !== "count" && key !== "use") {
        // This is likely a domain or nested object name
        if (typeof record[key] === "object") {
          validFields.add(key);
          recurse(record[key]);
        }
      }
    }
  }
  
  recurse(schemaDef);
  return validFields;
}

/**
 * Filter the Gemini output to only include fields that exist in the schema.
 * This prevents Gemini from "inventing" field names.
 * Also renames any misnamed fields back to the correct schema names.
 */
function filterToSchemaFields(
  data: unknown,
  validFields: Set<string>,
  knownStructuralKeys: Set<string>
): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== "object") return data;
  
  if (Array.isArray(data)) {
    return data.map(item => filterToSchemaFields(item, validFields, knownStructuralKeys));
  }
  
  const record = data as Record<string, unknown>;
  const filtered: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(record)) {
    // Allow keys that are in the schema OR are structural (L1, L2, L3, domain names)
    if (validFields.has(key) || knownStructuralKeys.has(key)) {
      filtered[key] = filterToSchemaFields(value, validFields, knownStructuralKeys);
    }
    // Also allow underscore-prefixed metadata fields (like _matchConfidence, _matchReason)
    else if (key.startsWith("_")) {
      filtered[key] = value;
    }
    // Also allow standard asset fields
    else if (["url", "source", "caption", "assetId", "page", "tags"].includes(key)) {
      filtered[key] = value;
    }
    // Log rejected fields for debugging
    else {
      console.log(`[Schema Fill] Rejected field: "${key}" - not in schema`);
    }
  }
  
  return filtered;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      manifestUrl?: string;
    };

    const { projectId, manifestUrl } = body;

    if (!projectId || !manifestUrl) {
      return NextResponse.json({ ok: false, error: "Missing projectId or manifestUrl" }, { status: 400 });
    }

    // Load manifest
    const manifest = await fetchManifestDirect(manifestUrl);

    // Get AI rules and schema JSON from settings
    const aiRules = manifest.settings?.aiRules ?? "";
    const schemaJsonRaw = manifest.settings?.schemaJson ?? "{}";

    let schemaDefinition: unknown;
    try {
      schemaDefinition = JSON.parse(schemaJsonRaw);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid schemaJson in settings" }, { status: 400 });
    }

    // Load extracted text if available
    let extractedText = "";
    if (manifest.extractedText?.url) {
      try {
        const res = await fetch(manifest.extractedText.url);
        if (res.ok) {
          extractedText = await res.text();
        }
      } catch {
        // Continue without extracted text
      }
    }

    // Load formatted text if available (prefer this over extracted)
    let formattedText = "";
    if (manifest.formattedText?.url) {
      try {
        const res = await fetch(manifest.formattedText.url);
        if (res.ok) {
          formattedText = await res.text();
        }
      } catch {
        // Continue without formatted text
      }
    }

    // Use formatted text if available, otherwise extracted text
    const sourceText = formattedText || extractedText;

    if (!sourceText) {
      return NextResponse.json({ ok: false, error: "No extracted or formatted text available. Please process the PDF first." }, { status: 400 });
    }

    // Load style analysis if available (from Gemini 2.5 Pro image analysis)
    let styleAnalysis: unknown = null;
    if (manifest.styleAnalysis?.url) {
      try {
        const res = await fetch(manifest.styleAnalysis.url);
        if (res.ok) {
          styleAnalysis = await res.json();
        }
      } catch {
        // Continue without style analysis
      }
    }

    // Check for STYLE chapter in source text (secondary to image analysis)
    let styleChapterText = "";
    const styleMatch = sourceText.match(/(?:^|\n)(?:#{1,3}\s*)?(?:STYLE|VISUAL STYLE|ART STYLE|ARTISTIC STYLE)[^\n]*\n([\s\S]*?)(?=\n(?:#{1,3}\s*)?(?:STORY|CHARACTERS|WORLD|LORE|OVERVIEW|---|\[|$))/i);
    if (styleMatch) {
      styleChapterText = styleMatch[0].slice(0, 5000); // Limit to 5000 chars
    }

    // Get assets with their URLs and tags for matching
    interface TaggedAsset {
      url: string;
      assetId: string;
      page: number;
      tags: string[];
    }
    const taggedAssets: TaggedAsset[] = [];
    
    if (manifest.pages) {
      for (const page of manifest.pages) {
        if (page.assets) {
          for (const asset of page.assets) {
            if (asset.url && asset.tags && asset.tags.length > 0) {
              taggedAssets.push({
                url: asset.url,
                assetId: asset.assetId,
                page: page.pageNumber,
                tags: asset.tags
              });
            }
          }
        }
      }
    }
    
    // Get unique tags for context
    const allTags = taggedAssets.flatMap(a => a.tags);
    const uniqueTags = [...new Set(allTags)].sort();

    // Build style analysis section for the prompt
    const styleAnalysisSection = styleAnalysis 
      ? `## STYLE ANALYSIS (PRIMARY SOURCE FOR STYLE DOMAIN - FROM IMAGE ANALYSIS):
This style analysis was generated by analyzing the actual images with Gemini 2.5 Pro.
**USE THIS AS YOUR PRIMARY SOURCE for filling the STYLE domain fields.**
The style analysis data takes precedence over text descriptions for STYLE-related fields.

${JSON.stringify(styleAnalysis, null, 2)}

`
      : "";

    const styleChapterSection = styleChapterText
      ? `## STYLE CHAPTER FROM SOURCE TEXT (SECONDARY SOURCE FOR STYLE):
${styleChapterText}

NOTE: This text is SECONDARY to the Style Analysis above (if available). Use it to supplement, not replace, the image-based analysis.

`
      : "";

    // Build the prompt for Gemini
    const prompt = `You are an expert narrative-schema creator. Your task is to fill in a structured schema based on the source material provided.

## CRITICAL FIELD NAME RULES (MUST FOLLOW):
1. **USE EXACT FIELD NAMES**: You MUST use the EXACT field names from the SCHEMA DEFINITION below. Do NOT rename, reinterpret, or modify field names in any way.
2. **INCLUDE ALL FIELDS**: You MUST include EVERY field defined in the schema, even if you have no information for it.
3. **EMPTY VALUES**: For fields with no information:
   - String fields: use "" (empty string)
   - Array fields: use [] (empty array)
   - Object fields: include the object with empty nested fields
   - Asset fields: use null
4. **NO INVENTED FIELDS**: Do NOT add fields that are not in the schema definition.

## AI RULES (follow strictly):
${aiRules}

## SCHEMA DEFINITION (USE THESE EXACT FIELD NAMES):
${JSON.stringify(schemaDefinition, null, 2)}

${styleAnalysisSection}${styleChapterSection}## SOURCE MATERIAL:
${sourceText}

## TAGGED ASSETS (images with their URLs and tags - USE THESE FOR IMAGE FIELDS):
${taggedAssets.length > 0 ? JSON.stringify(taggedAssets, null, 2) : "No tagged assets available."}

## UNIQUE TAGS FOUND:
${uniqueTags.length > 0 ? uniqueTags.join(", ") : "None"}

## ASSET MATCHING INSTRUCTIONS:
When populating image/asset fields in the schema, you MUST match tagged assets to the appropriate fields:

1. **For Character Images**: Search tagged assets for the character's name in the tags array. Match by:
   - Exact name match (highest confidence: 0.8+)
   - Partial name match (medium: 0.5-0.8)
   - Role match like "protagonist", "villain" (lower: 0.3-0.5)

2. **For Location Images**: Search for location name or environment type in tags.

3. **For Style Images**: Use assets with style-related tags (colors, art style, composition).

4. **Output Format for image fields**:
   - If a matching asset is found, return: { "url": "[actual asset URL]", "source": "extracted", "caption": "[brief description]", "_matchConfidence": 0.X, "_matchReason": "[why this asset matches]" }
   - If no asset matches with confidence >= 0.3, return: null

5. **CRITICAL**: Use the ACTUAL URLs from the tagged assets list above. Do NOT invent URLs.

## STYLE DOMAIN PRIORITY:
**IMPORTANT**: For the STYLE domain specifically:
1. **PRIMARY**: Use the Style Analysis data (from image analysis) as your main source
2. **SECONDARY**: Supplement with Style Chapter text if available
3. **TERTIARY**: Use other source material only if the above don't provide enough detail

The Style Analysis contains detailed visual characteristics extracted directly from the images:
- Art style, rendering technique, line work
- Color palette, mood, saturation
- Textures, materials, surfaces
- Composition patterns, framing
- Lighting, shadows, atmosphere

Map these to the appropriate STYLE schema fields (VisualStyle, ColorPalette, TextureMaterialLanguage, Composition, etc.)

## GENERAL INSTRUCTIONS:
1. Analyze the source material carefully
2. Fill the schema according to 3 levels:
   - L1: High-level overview (mostly images/key art references)
   - L2: Category breakdown (main text descriptions)  
   - L3: Detailed entries (full specifications)
3. For each domain (OVERVIEW, CHARACTERS, WORLD, LORE, STYLE, STORY), provide appropriate content
4. Be comprehensive but accurate - do NOT invent details not in the source material
5. For real-world locations (cities, countries), infer Setting, Context, Scale from world knowledge

## OUTPUT FORMAT:
Return ONLY valid JSON with this exact structure:
{
  "L1": {
    "OVERVIEW": { ... },
    "CHARACTERS": { ... },
    "WORLD": { ... },
    "LORE": { ... },
    "STYLE": { ... },
    "STORY": { ... }
  },
  "L2": {
    "OVERVIEW": { "IPTitle": "...", "Logline": "...", ... },
    "CHARACTERS": { "CharacterList": [...] },
    ...
  },
  "L3": {
    "CHARACTERS": { "CharacterList": [...] },
    "WORLD": { "Locations": [...] },
    ...
  }
}

REMEMBER: 
- Use the EXACT field names from the schema (e.g., "IPTitle" not "Title", "NameLabel" not "Name")
- Include ALL fields even when empty
- Do NOT skip any fields defined in the schema`;

    // Call Gemini with high output token limit for large schema
    const GEMINI_DETECT_MODEL = process.env.GEMINI_DETECT_MODEL || "gemini-2.0-flash";
    const model = genAI.getGenerativeModel({ 
      model: GEMINI_DETECT_MODEL,
      generationConfig: {
        maxOutputTokens: 65536,  // Maximum output for large schema
        responseMimeType: "application/json",  // Ensure JSON output
      }
    });
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Try to extract JSON from the response
    let cleanedText = text.trim();
    
    // Remove markdown code blocks if present
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.slice(7);
    } else if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.slice(3);
    }
    if (cleanedText.endsWith("```")) {
      cleanedText = cleanedText.slice(0, -3);
    }
    cleanedText = cleanedText.trim();

    // Validate that it's valid JSON
    try {
      JSON.parse(cleanedText);
    } catch {
      // If not valid JSON, return the raw text anyway
      // User can edit it in the panel
    }

    // Format the JSON nicely and filter to valid schema fields
    let formattedResults = cleanedText;
    try {
      const parsed = JSON.parse(cleanedText);
      
      // Extract valid field names from the schema definition (if it's an object)
      const schemaDef = (typeof schemaDefinition === "object" && schemaDefinition !== null)
        ? schemaDefinition as Record<string, unknown>
        : {};
      const validFields = extractSchemaFields(schemaDef);
      
      // Known structural keys that should always be allowed
      const structuralKeys = new Set([
        "L1", "L2", "L3",
        "OVERVIEW", "CHARACTERS", "WORLD", "LORE", "STYLE", "STORY"
      ]);
      
      // Filter the parsed output to only include valid fields
      const filtered = filterToSchemaFields(parsed, validFields, structuralKeys);
      
      formattedResults = JSON.stringify(filtered, null, 2);
    } catch {
      // Keep as-is if parsing fails
    }

    return NextResponse.json({
      ok: true,
      results: formattedResults
    });
  } catch (err) {
    console.error("Schema fill error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
