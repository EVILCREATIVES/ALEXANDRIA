import { NextRequest, NextResponse } from "next/server";
import { fetchManifestDirect, saveManifest, type ProjectManifest } from "@/app/lib/manifest";
import { put, list } from "@vercel/blob";
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { DEFAULT_STYLE_RULES } from "@/app/lib/default-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for large analysis

// Initialize Gemini client
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? "" });

// Type for style rules configuration
interface StyleRulesConfig {
  systemRole?: string;
  primaryTask?: string;
  analysisCategories?: string[];
  outputSchema?: Record<string, unknown>;
  rules?: string[];
  maxImages?: number;
  priorityKeywords?: string[];
}

// Load style rules from global settings
async function loadStyleRules(): Promise<StyleRulesConfig> {
  try {
    const indexBlobs = await list({ prefix: "settings/global-index.json" });
    if (indexBlobs.blobs.length > 0) {
      const indexRes = await fetch(`${indexBlobs.blobs[0].url}?v=${Date.now()}`, { cache: "no-store" });
      if (indexRes.ok) {
        const index = await indexRes.json();
        if (index.styleRulesJson?.url) {
          const rulesRes = await fetch(`${index.styleRulesJson.url}?v=${Date.now()}`, { cache: "no-store" });
          if (rulesRes.ok) {
            const text = await rulesRes.text();
            if (text.trim() && text.trim() !== "{}") {
              return JSON.parse(text) as StyleRulesConfig;
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("[style/analyze] Failed to load custom style rules:", e);
  }
  
  // Return default rules
  return JSON.parse(DEFAULT_STYLE_RULES) as StyleRulesConfig;
}

interface StyleAnalysisResult {
  visualStyle: {
    artStyle: string;
    renderingTechnique: string;
    lineWork: string;
    detailLevel: string;
    styleSummary: string;
    keyCharacteristics: string[];
    styleElements: string[];
  };
  colorPalette: {
    dominantColors: string[];
    colorMood: string;
    paletteSummary: string;
    colorRules: string[];
    contrastLevel: string;
    saturationLevel: string;
  };
  textureMaterial: {
    dominantTextures: string[];
    materialSummary: string;
    surfaceRules: string[];
    texturePatterns: string[];
  };
  composition: {
    framingStyle: string;
    depthHandling: string;
    focusHierarchy: string;
    recurringShapes: string[];
    negativeSpaceUsage: string;
    compositionPatterns: string[];
  };
  lighting: {
    lightingStyle: string;
    shadowHandling: string;
    lightSources: string[];
    atmosphericEffects: string[];
  };
  mood: {
    overallMood: string;
    emotionalTone: string;
    atmosphereKeywords: string[];
  };
  confidence: number;
  analyzedAssetCount: number;
  timestamp: string;
}

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    
    const contentType = res.headers.get("content-type") || "image/png";
    const buffer = await res.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    
    return { base64, mimeType: contentType };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      manifestUrl?: string;
      maxImages?: number; // Limit images to analyze (override from rules)
    };

    const { projectId, manifestUrl } = body;

    if (!projectId || !manifestUrl) {
      return NextResponse.json({ ok: false, error: "Missing projectId or manifestUrl" }, { status: 400 });
    }

    // Load style rules from global settings
    const styleRules = await loadStyleRules();
    const maxImages = body.maxImages ?? styleRules.maxImages ?? 20;
    const priorityKeywords = styleRules.priorityKeywords ?? ["style", "art", "color", "palette", "design", "composition", "texture", "pattern", "aesthetic"];

    // Load manifest
    const manifest = await fetchManifestDirect(manifestUrl);

    // Collect tagged assets (prioritize those with style-related tags)
    const taggedAssets: Array<{
      url: string;
      thumbnailUrl?: string;
      assetId: string;
      page: number;
      tags: string[];
    }> = [];

    if (manifest.pages) {
      for (const page of manifest.pages) {
        if (page.assets) {
          for (const asset of page.assets) {
            if (asset.url && asset.tags && asset.tags.length > 0) {
              taggedAssets.push({
                url: asset.url,
                thumbnailUrl: asset.thumbnailUrl,
                assetId: asset.assetId,
                page: page.pageNumber,
                tags: asset.tags
              });
            }
          }
        }
      }
    }

    if (taggedAssets.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: "No tagged assets found. Please tag assets first." 
      }, { status: 400 });
    }

    // Sort assets to prioritize style-related ones (using configurable keywords)
    const sortedAssets = [...taggedAssets].sort((a, b) => {
      const aScore = a.tags.filter(t => priorityKeywords.some(k => t.toLowerCase().includes(k))).length;
      const bScore = b.tags.filter(t => priorityKeywords.some(k => t.toLowerCase().includes(k))).length;
      return bScore - aScore;
    });

    // Select representative assets (spread across pages if possible)
    const selectedAssets = sortedAssets.slice(0, maxImages);

    // Fetch images and prepare for Gemini
    const imageParts: Part[] = [];
    const imageContexts: string[] = [];

    for (const asset of selectedAssets) {
      // Prefer thumbnail for faster processing
      const imageUrl = asset.thumbnailUrl || asset.url;
      const imageData = await fetchImageAsBase64(imageUrl);
      
      if (imageData) {
        imageParts.push({
          inlineData: {
            data: imageData.base64,
            mimeType: imageData.mimeType
          }
        });
        imageContexts.push(`Asset ${asset.assetId} (page ${asset.page}): Tags: ${asset.tags.join(", ")}`);
      }
    }

    if (imageParts.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        error: "Could not fetch any images for analysis." 
      }, { status: 400 });
    }

    // Check if there's a STYLE chapter in formatted text
    let styleChapterText = "";
    if (manifest.formattedText?.url) {
      try {
        const res = await fetch(manifest.formattedText.url);
        if (res.ok) {
          const fullText = await res.text();
          // Look for STYLE chapter/section
          const styleMatch = fullText.match(/(?:^|\n)(?:#{1,3}\s*)?(?:STYLE|VISUAL STYLE|ART STYLE|ARTISTIC STYLE)[^\n]*\n([\s\S]*?)(?=\n(?:#{1,3}\s*)?(?:STORY|CHARACTERS|WORLD|LORE|OVERVIEW|---|\[|$))/i);
          if (styleMatch) {
            styleChapterText = styleMatch[0].slice(0, 3000); // Limit to 3000 chars
          }
        }
      } catch {
        // Continue without style chapter text
      }
    }

    // Build the prompt using configurable rules
    const systemRole = styleRules.systemRole ?? "You are an expert visual style analyst for IP (Intellectual Property) Bible creation.";
    const primaryTask = styleRules.primaryTask ?? "Analyze images to extract comprehensive style information for the STYLE domain.";
    const analysisCategories = styleRules.analysisCategories ?? [
      "Art/rendering style",
      "Color palette and mood",
      "Textures and materials",
      "Composition patterns",
      "Lighting approach",
      "Overall mood/atmosphere"
    ];
    const outputSchema = styleRules.outputSchema ?? null;
    const rules = styleRules.rules ?? [
      "Be specific and detailed - extract actual visual characteristics you observe",
      "Do not use generic descriptions",
      "Visual analysis from images is PRIMARY, text is SECONDARY",
      "Return ONLY valid JSON, no markdown code blocks",
      "Include confidence score based on style consistency"
    ];

    // Format output schema for prompt
    const outputSchemaText = outputSchema 
      ? JSON.stringify(outputSchema, null, 2)
      : `{
  "visualStyle": {
    "artStyle": "The primary art style (e.g., 'painterly', 'anime', '3D-rendered', 'comic book', 'photorealistic')",
    "renderingTechnique": "How the art is rendered (e.g., 'cell-shaded', 'soft gradients', 'hard edges', 'digital painting')",
    "lineWork": "Line characteristics (e.g., 'bold outlines', 'no visible lines', 'sketchy', 'clean vectors')",
    "detailLevel": "Amount of detail (e.g., 'highly detailed', 'minimalist', 'moderate detail', 'stylized simplicity')",
    "styleSummary": "A 2-3 sentence summary of the overall visual style",
    "keyCharacteristics": ["characteristic1", "characteristic2", ...],
    "styleElements": ["element1", "element2", ...]
  },
  "colorPalette": {
    "dominantColors": ["color1", "color2", ...],
    "colorMood": "The emotional quality of the colors",
    "paletteSummary": "Description of the overall color approach",
    "colorRules": ["When to use X color", "Y color for emphasis", ...],
    "contrastLevel": "low/medium/high",
    "saturationLevel": "muted/moderate/vivid"
  },
  "textureMaterial": {
    "dominantTextures": ["texture1", "texture2", ...],
    "materialSummary": "How materials and surfaces are rendered",
    "surfaceRules": ["Rule about surface rendering", ...],
    "texturePatterns": ["pattern1", "pattern2", ...]
  },
  "composition": {
    "framingStyle": "How shots/frames are typically composed",
    "depthHandling": "How depth is created",
    "focusHierarchy": "How visual focus is directed",
    "recurringShapes": ["shape1", "shape2", ...],
    "negativeSpaceUsage": "How empty space is used",
    "compositionPatterns": ["pattern1", "pattern2", ...]
  },
  "lighting": {
    "lightingStyle": "Overall lighting approach (e.g., 'dramatic', 'soft', 'high-key', 'low-key')",
    "shadowHandling": "How shadows are rendered",
    "lightSources": ["common light source types"],
    "atmosphericEffects": ["fog", "glow", "particles", etc.]
  },
  "mood": {
    "overallMood": "The dominant emotional tone",
    "emotionalTone": "More specific emotional quality",
    "atmosphereKeywords": ["keyword1", "keyword2", ...]
  },
  "confidence": 0.0 to 1.0 based on how consistent the style is across images
}`;

    const prompt = `${systemRole}

## YOUR PRIMARY TASK:
${primaryTask}

Analyze the visual characteristics of these ${imageParts.length} images to extract style information for:
${analysisCategories.map(c => `- ${c}`).join("\n")}

## IMAGE CONTEXT (tags assigned to each image):
${imageContexts.join("\n")}

${styleChapterText ? `## STYLE CHAPTER FROM SOURCE (USE THIS AS SECONDARY REFERENCE):
${styleChapterText}

NOTE: The visual analysis from the images is PRIMARY. The text above is SECONDARY reference only.` : ""}

## OUTPUT FORMAT:
Return a JSON object with this structure:
${outputSchemaText}

## RULES:
${rules.map(r => `- ${r}`).join("\n")}`;

    // Call Gemini for vision analysis - use env var or default
    const model = process.env.GEMINI_DETECT_MODEL || "gemini-2.0-flash";
    
    const contents: Content[] = [{
      role: "user",
      parts: [
        { text: prompt },
        ...imageParts
      ]
    }];

    const response = await genAI.models.generateContent({
      model,
      contents,
      config: {
        maxOutputTokens: 8192,
        responseMimeType: "application/json"
      }
    });

    const text = response.text ?? "";
    
    // Clean and parse the response
    let cleanedText = text.trim();
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.slice(7);
    } else if (cleanedText.startsWith("```")) {
      cleanedText = cleanedText.slice(3);
    }
    if (cleanedText.endsWith("```")) {
      cleanedText = cleanedText.slice(0, -3);
    }
    cleanedText = cleanedText.trim();

    let analysisResult: StyleAnalysisResult;
    try {
      const parsed = JSON.parse(cleanedText);
      analysisResult = {
        ...parsed,
        analyzedAssetCount: imageParts.length,
        timestamp: new Date().toISOString()
      };
    } catch {
      return NextResponse.json({ 
        ok: false, 
        error: "Failed to parse style analysis response as JSON",
        rawResponse: cleanedText.slice(0, 500)
      }, { status: 500 });
    }

    // Save the analysis results to blob storage
    const analysisBlob = await put(
      `projects/${projectId}/style-analysis.json`,
      JSON.stringify(analysisResult, null, 2),
      {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false
      }
    );

    // Update manifest with style analysis reference
    const updatedManifest: ProjectManifest = {
      ...manifest,
      styleAnalysis: { url: analysisBlob.url }
    };

    const newManifestUrl = await saveManifest(updatedManifest);

    return NextResponse.json({
      ok: true,
      manifestUrl: newManifestUrl,
      styleAnalysis: analysisResult,
      analyzedImages: imageParts.length
    });

  } catch (err) {
    console.error("Style analysis error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
