import { NextResponse } from "next/server";
import { saveManifest, type ProjectManifest, type PageAsset } from "@/app/lib/manifest";
import { GoogleGenerativeAI, type GenerativeModel } from "@google/generative-ai";
import { buildSystemPrompt, buildUserPrompt, parseTaggerPromptConfig, type TaggerPromptInput } from "@/app/lib/tagger-prompt";
import { enforceTagging, parseEnforcerConfig, type LLMCoreOutput } from "@/app/lib/tagger-enforcer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  projectId?: string;
  manifestUrl?: string;
  overwrite?: boolean;
  limitAssets?: number; // optional safety
  model?: string; // optional: gemini-3-flash (default), gemini-3-pro, gemini-2.5-pro, etc.
  aiRules?: string; // optional: override manifest settings with current UI values
  taggerPromptJson?: string; // LLM prompt config (new two-part system)
  taggerEnforcerJson?: string; // Hard enforcement rules (new two-part system)
  taggingJson?: string; // deprecated - kept for backwards compatibility
};

// Allowed models for tagging (use actual Google API model names)
const ALLOWED_MODELS = [
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  "gemini-2.5-pro-preview",
  "gemini-2.5-flash-preview",
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
] as const;

type TagUpdate = { 
  pageNumber: number; 
  assetId: string; 
  tags: string[]; 
  negativeTags?: string[];
  trigger?: string;
  rationale: string 
};
type TagError = { pageNumber: number; assetId: string; error: string };

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing ${name}`);
  return String(v).trim();
}

function optEnv(name: string, fallback: string): string {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : fallback;
}

function baseUrl(u: string) {
  const url = new URL(u);
  return `${url.origin}${url.pathname}`;
}

async function readErrorText(res: Response) {
  try {
    const t = await res.text();
    return t || `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(`${baseUrl(url)}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${await readErrorText(res)}`);
  return (await res.json()) as T;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(`${baseUrl(url)}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${await readErrorText(res)}`);
  return await res.text();
}

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeParseJsonFromText(raw: string): unknown {
  const t = raw.trim();
  if (!t) return null;

  // Helper to fix truncated JSON by closing unclosed brackets/braces
  function fixTruncatedJson(s: string): string {
    let fixed = s.trim();
    // Remove trailing comma
    fixed = fixed.replace(/,\s*$/, "");
    // Remove incomplete string at end (e.g., "foo", "bar - no closing quote)
    fixed = fixed.replace(/,\s*"[^"]*$/, "");
    // Remove incomplete key-value pair (e.g., "key": or "key":"val)
    fixed = fixed.replace(/,?\s*"[^"]*"\s*:\s*"?[^"{}\[\]]*$/, "");
    // Remove trailing whitespace again after removals
    fixed = fixed.trim();
    // Remove any trailing comma left after cleanup
    fixed = fixed.replace(/,\s*$/, "");
    // Count brackets
    const openBraces = (fixed.match(/{/g) || []).length;
    const closeBraces = (fixed.match(/}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/]/g) || []).length;
    // Close unclosed brackets/braces
    for (let i = 0; i < openBrackets - closeBrackets; i++) fixed += "]";
    for (let i = 0; i < openBraces - closeBraces; i++) fixed += "}";
    // Fix trailing commas before closing
    fixed = fixed.replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
    return fixed;
  }

  // 1) ```json ... ``` or ``` ... ``` (any code fence)
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      try {
        return JSON.parse(fixTruncatedJson(fence[1]));
      } catch {
        // fall through
      }
    }
  }

  // 2) first {...} block - match from first { to end (may be truncated)
  const firstObj = t.match(/\{[\s\S]*/);
  if (firstObj?.[0]) {
    try {
      return JSON.parse(firstObj[0]);
    } catch {
      try {
        return JSON.parse(fixTruncatedJson(firstObj[0]));
      } catch {
        // fall through
      }
    }
  }

  // 3) first [...] array block (for batch responses)
  const firstArr = t.match(/\[[\s\S]*/);
  if (firstArr?.[0]) {
    try {
      return JSON.parse(firstArr[0]);
    } catch {
      try {
        return JSON.parse(fixTruncatedJson(firstArr[0]));
      } catch {
        // fall through
      }
    }
  }

  // 4) try whole text
  try {
    return JSON.parse(t);
  } catch {
    try {
      return JSON.parse(fixTruncatedJson(t));
    } catch {
      return null;
    }
  }
}

function uniqCleanTags(tags: unknown, maxTags: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  if (!Array.isArray(tags)) return out;

  for (const v of tags) {
    if (typeof v !== "string") continue;
    const s = v.trim().replace(/\s+/g, " ");
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= maxTags) break;
  }

  return out;
}

function getPageTextFallback(fullText: string, pageNumber: number): string {
  // Look for formatted page markers: --- PAGE X ---
  const pageMarker = `--- PAGE ${pageNumber} ---`;
  const nextPageMarker = `--- PAGE ${pageNumber + 1} ---`;
  
  const startIdx = fullText.indexOf(pageMarker);
  if (startIdx >= 0) {
    // Found the page marker, extract text until next page or end
    const afterMarker = startIdx + pageMarker.length;
    const endIdx = fullText.indexOf(nextPageMarker, afterMarker);
    
    // Get the page text, plus some context from adjacent pages
    const prevPageMarker = `--- PAGE ${pageNumber - 1} ---`;
    const prevIdx = pageNumber > 1 ? fullText.indexOf(prevPageMarker) : -1;
    
    // Include previous page context if available (for character continuity)
    const contextStart = prevIdx >= 0 ? prevIdx : startIdx;
    const contextEnd = endIdx >= 0 ? endIdx : clampInt(afterMarker + 4000, 0, fullText.length);
    
    // Limit total context to avoid huge prompts, but prioritize current page
    let pageText = fullText.slice(contextStart, contextEnd);
    if (pageText.length > 6000) {
      // Too long - prioritize current page
      pageText = fullText.slice(startIdx, endIdx >= 0 ? endIdx : startIdx + 4000);
    }
    
    return pageText;
  }
  
  // Fallback: look for simpler markers like "Page X" or "page X"
  const simpleMarker = new RegExp(`\\bpage\\s*${pageNumber}\\b`, "i");
  const simpleIdx = fullText.search(simpleMarker);
  if (simpleIdx >= 0) {
    const start = clampInt(simpleIdx - 1500, 0, fullText.length);
    const end = clampInt(simpleIdx + 3500, 0, fullText.length);
    return fullText.slice(start, end);
  }
  
  // Last resort: return first portion of text
  return fullText.slice(0, 5000);
}

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  // Don't use baseUrl() here - Vercel Blob URLs need their query params
  const fetchUrl = new URL(url);
  fetchUrl.searchParams.set("v", String(Date.now()));
  
  const res = await fetch(fetchUrl.toString(), { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  
  const contentType = res.headers.get("content-type") || "image/png";
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  
  return { base64, mimeType: contentType };
}

async function geminiGenerateWithImage(
  model: GenerativeModel,
  prompt: string,
  imageBase64: string,
  imageMimeType: string
): Promise<{ text: string; raw: unknown; contentFiltered?: boolean }> {
  let res;
  try {
    res = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: imageMimeType, data: imageBase64 } },
            { text: prompt }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 2000
      }
    });
  } catch (e) {
    // Handle Gemini API errors (rate limits, content filtering, etc.)
    const errMsg = e instanceof Error ? e.message : String(e);
    if (errMsg.includes("pattern") || errMsg.includes("SAFETY") || errMsg.includes("blocked") || errMsg.includes("RECITATION")) {
      // Content filter - return empty result instead of throwing
      console.log(`[tag] Content filtered: ${errMsg.slice(0, 100)}`);
      return { text: "", raw: null, contentFiltered: true };
    }
    if (errMsg.includes("429") || errMsg.includes("quota") || errMsg.includes("rate")) {
      throw new Error(`Gemini rate limit: ${errMsg}`);
    }
    throw new Error(`Gemini API error: ${errMsg}`);
  }

  // Primary: response.text()
  let text = "";
  try {
    text = res.response.text?.() ?? "";
  } catch (e) {
    // Sometimes .text() throws if blocked
    const errMsg = e instanceof Error ? e.message : String(e);
    if (errMsg.includes("pattern") || errMsg.includes("SAFETY") || errMsg.includes("blocked") || errMsg.includes("RECITATION")) {
      console.log(`[tag] Response content filtered: ${errMsg.slice(0, 100)}`);
      return { text: "", raw: res, contentFiltered: true };
    }
    throw new Error(`Gemini response error: ${errMsg}`);
  }
  
  if (text && text.trim()) return { text, raw: res };

  // Fallback: candidates parts
  const anyRes = res as unknown as {
    response?: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  };

  const parts = anyRes.response?.candidates?.[0]?.content?.parts ?? [];
  const joined = parts.map((p) => (typeof p.text === "string" ? p.text : "")).join("");
  if (joined && joined.trim()) return { text: joined, raw: res };

  throw new Error("Gemini returned empty response text");
}

async function callGeminiTagger(args: {
  apiKey: string;
  modelName: string;
  aiRules: string;
  taggerPromptJson: string;
  taggerEnforcerJson: string;
  pageNumber: number;
  assetId: string;
  assetUrl: string;
  pageText: string;
  knownEntities?: Array<{ canonical: string; aliases: string[] }>;
  leadCharacters?: string[];
  // Detection metadata from Gemini detection phase
  detectionTitle?: string;
  detectionDescription?: string;
  detectionCategory?: string;
}) {
  const { 
    apiKey, modelName, aiRules, taggerPromptJson, taggerEnforcerJson, 
    pageNumber, assetId, assetUrl, pageText, 
    knownEntities = [], leadCharacters = [],
    detectionTitle, detectionDescription, detectionCategory
  } = args;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  // Fetch the image for visual analysis
  const { base64: imageBase64, mimeType: imageMimeType } = await fetchImageAsBase64(assetUrl);

  // Parse configs
  const promptConfig = parseTaggerPromptConfig(taggerPromptJson);
  const enforcerConfig = parseEnforcerConfig(taggerEnforcerJson);

  // Build prompts using new two-part system
  const systemPrompt = buildSystemPrompt(promptConfig);
  const promptInput: TaggerPromptInput = {
    pageNumber,
    assetId,
    pageText,
    knownEntities,
    leadCharacters,
    detectionTitle,
    detectionDescription,
    detectionCategory
  };
  const userPrompt = buildUserPrompt(promptConfig, promptInput);

  // Combine system prompt, AI rules, and user prompt
  const fullPrompt = [
    systemPrompt,
    "",
    "ADDITIONAL RULES:",
    aiRules,
    "",
    userPrompt
  ].join("\n");

  // Retry strategy for empty/invalid JSON
  const attempts: Array<{ prompt: string }> = [
    { prompt: fullPrompt },
    {
      prompt:
        fullPrompt +
        `\n\nIMPORTANT: Output ONLY JSON. No markdown. If you cannot comply, output {"tags":[],"rationale":"could not analyze image"}.`
    }
  ];

  let lastErr: Error | null = null;
  let wasContentFiltered = false;
  let lastRawResponse = "";

  for (let i = 0; i < attempts.length; i++) {
    try {
      const { text, contentFiltered } = await geminiGenerateWithImage(model, attempts[i].prompt, imageBase64, imageMimeType);

      // If content was filtered, return graceful fallback
      if (contentFiltered) {
        wasContentFiltered = true;
        continue; // Try next attempt with different prompt
      }

      lastRawResponse = text;
      console.log(`[tag] Gemini response (attempt ${i + 1}, ${text.length} chars): ${text.slice(0, 500)}...`);

      const parsed = safeParseJsonFromText(text);
      if (!parsed || typeof parsed !== "object") {
        throw new Error(`Gemini did not return valid JSON. Response: ${text.slice(0, 200)}`);
      }

      // Cast LLM output and apply hard enforcement
      const llmOutput = parsed as LLMCoreOutput;
      const enforceContext = { knownEntities, leadCharacters };
      const enforced = enforceTagging(llmOutput, enforceContext, enforcerConfig);

      // Return the enforced result
      return {
        tags: enforced.tags,
        negativeTags: enforced.negativeTags.length > 0 ? enforced.negativeTags : undefined,
        trigger: enforced.trigger || undefined,
        rationale: enforced.rationale || (enforced.tags.length ? "tags inferred from image and context" : "could not determine tags")
      };
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }

  // If all attempts were content filtered, return graceful empty result
  if (wasContentFiltered) {
    return {
      tags: [],
      negativeTags: undefined,
      trigger: undefined,
      rationale: "content filtered by Gemini safety - image may need manual review"
    };
  }

  // Include raw response in error for debugging
  const errMsg = lastErr?.message ?? "Gemini tagger failed";
  throw new Error(`${errMsg}${lastRawResponse ? ` | Raw: ${lastRawResponse.slice(0, 300)}` : ""}`);
}

// Batch asset info for batch tagging
type BatchAsset = {
  pageNumber: number;
  assetId: string;
  assetUrl: string;
  pageText: string;
};

type BatchResult = {
  assetId: string;
  tags: string[];
  negativeTags?: string[];
  trigger?: string;
  rationale: string;
};

function buildBatchPrompt(args: {
  aiRules: string;
  taggingJson: string;
  assets: Array<{ assetId: string; pageNumber: number; pageText: string }>;
  maxTags: number;
}) {
  const { aiRules, taggingJson, assets, maxTags } = args;

  // Build asset list with page text context for each
  const assetList = assets.map((a, i) => {
    const textSnippet = a.pageText.slice(0, 1200); // Reduced for faster processing
    return `  Image ${i + 1}: assetId="${a.assetId}" (page ${a.pageNumber})\n    PAGE TEXT:\n${textSnippet}`;
  }).join("\n\n");

  return [
    `SYSTEM RULES (follow strictly):`,
    aiRules,
    ``,
    `TAGGING CONFIG (JSON, use as constraints):`,
    taggingJson,
    ``,
    `TASK: You are tagging MULTIPLE cropped image assets extracted from a PDF.`,
    `The PAGE TEXT for each image is your PRIMARY context - READ IT FIRST.`,
    `You must RECONTEXTUALIZE each image based on what the text says about it.`,
    `You must output ONLY valid JSON (no markdown).`,
    ``,
    `CRITICAL: The page text tells you WHO/WHAT each image depicts and their ROLE in the story.`,
    ``,
    `IMAGES TO TAG (with page text context for each):`,
    assetList,
    ``,
    `FOR EACH IMAGE, FOLLOW THIS PROCESS:`,
    `1. READ THE PAGE TEXT FIRST - understand the narrative context`,
    `2. Find CHARACTER NAMES in the text → use as TRIGGER`,
    `3. Find CHARACTER ROLES (hero, antagonist, villain, mentor, protagonist) → MUST be in tags`,
    `4. Find SCENE CONTEXT (battle, confrontation, journey, discovery) → add to tags`,
    `5. Find EMOTIONAL TONE (tense, triumphant, menacing, peaceful) → add to tags`,
    `6. Find PHYSICAL DESCRIPTIONS from text → add to tags`,
    `7. NOW look at the image for VISUAL DETAILS not in text → add to tags`,
    ``,
    `OUTPUT SCHEMA (JSON array):`,
    `[`,
    `  {`,
    `    "assetId": "...",`,
    `    "trigger": "character_name_from_text",`,
    `    "tags": ["narrative-role", "scene-context", "emotional-tone", "text-descriptions", "visual-details", ...],`,
    `    "negativeTags": ["things-to-avoid", ...],`,
    `    "rationale": "Explain: name source, role identified, scene context, which tags came from text vs image"`,
    `  },`,
    `  ...`,
    `]`,
    ``,
    `RULES:`,
    `- Output one object per image in the same order as provided`,
    `- trigger: MUST be CHARACTER/LOCATION NAME from page text (e.g., "aria", "lord_varen", "castle_thornwood")`,
    `- If text says "the hero John" → trigger="john" AND "hero" MUST be in tags`,
    `- If text says "antagonist" or "villain" → those words MUST be in tags`,
    `- tags: max ${maxTags} - prioritize NARRATIVE context over generic visual descriptions`,
    `- negativeTags: max 15 - opposites of their role, style inconsistencies, things to avoid`,
    `- all tags: lowercase, hyphen-separated`,
    `- rationale: MUST cite specific phrases from the text that informed your tags`,
    `- FAILURE: returning only generic visual tags without narrative context from the text`
  ].join("\n");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function callGeminiBatchTagger(args: {
  apiKey: string;
  modelName: string;
  aiRules: string;
  taggingJson: string;
  assets: BatchAsset[];
}): Promise<BatchResult[]> {
  const { apiKey, modelName, aiRules, taggingJson, assets } = args;

  if (assets.length === 0) return [];

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  // Read max_tags_per_image from taggingJson if present
  let maxTags = 20;
  try {
    const cfg = JSON.parse(taggingJson) as unknown;
    if (cfg && typeof cfg === "object") {
      const mt = (cfg as Record<string, unknown>)["max_tags_per_image"];
      if (typeof mt === "number" && Number.isFinite(mt) && mt > 0) maxTags = clampInt(mt, 1, 50);
    }
  } catch {
    // ignore
  }

  // Fetch all images in parallel
  const imagePromises = assets.map(async (a) => {
    try {
      const { base64, mimeType } = await fetchImageAsBase64(a.assetUrl);
      return { assetId: a.assetId, base64, mimeType, error: null };
    } catch (e) {
      return { assetId: a.assetId, base64: null, mimeType: null, error: e instanceof Error ? e.message : String(e) };
    }
  });
  const imageResults = await Promise.all(imagePromises);

  // Filter out failed fetches
  const validImages = imageResults.filter((r) => r.base64 !== null);
  if (validImages.length === 0) {
    // All failed - return empty results
    return assets.map((a) => ({
      assetId: a.assetId,
      tags: [],
      rationale: "failed to fetch image"
    }));
  }

  const prompt = buildBatchPrompt({
    aiRules,
    taggingJson,
    assets: validImages.map((v) => {
      const orig = assets.find((a) => a.assetId === v.assetId)!;
      return { assetId: v.assetId, pageNumber: orig.pageNumber, pageText: orig.pageText };
    }),
    maxTags
  });

  console.log(`[tag] Batch request: ${validImages.length} images, prompt length: ${prompt.length}`);

  // Build parts: prompt text + all images
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt }
  ];
  for (const img of validImages) {
    parts.push({ inlineData: { mimeType: img.mimeType!, data: img.base64! } });
  }

  try {
    console.log(`[tag] Sending batch to Gemini with ${parts.length} parts`);
    const res = await model.generateContent({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.2,
        topP: 0.9,
        maxOutputTokens: 4000
      }
    });

    let text = "";
    try {
      text = res.response.text?.() ?? "";
    } catch {
      text = "";
    }

    const parsed = safeParseJsonFromText(text);
    if (!parsed || !Array.isArray(parsed)) {
      // Fallback: return empty for all
      return assets.map((a) => ({
        assetId: a.assetId,
        tags: [],
        rationale: "batch parse failed"
      }));
    }

    // Map results back to assets
    const results: BatchResult[] = [];
    for (const a of assets) {
      const match = (parsed as Array<Record<string, unknown>>).find(
        (r) => r.assetId === a.assetId
      );
      if (match) {
        const negativeTags = uniqCleanTags(match.negativeTags, 15);
        const trigger = typeof match.trigger === "string" ? match.trigger.trim().toLowerCase().replace(/\s+/g, "_") : "";
        results.push({
          assetId: a.assetId,
          tags: uniqCleanTags(match.tags, maxTags),
          negativeTags: negativeTags.length > 0 ? negativeTags : undefined,
          trigger: trigger || undefined,
          rationale: typeof match.rationale === "string" ? match.rationale : ""
        });
      } else {
        results.push({
          assetId: a.assetId,
          tags: [],
          rationale: "not found in batch response"
        });
      }
    }
    return results;
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    
    // Check if it's a content filter error - return graceful results instead of error
    if (errMsg.includes("pattern") || errMsg.includes("SAFETY") || errMsg.includes("blocked") || errMsg.includes("RECITATION")) {
      console.log(`[tag] Batch content filtered: ${errMsg.slice(0, 100)}`);
      return assets.map((a) => ({
        assetId: a.assetId,
        tags: [],
        rationale: "content filtered - may need individual processing or manual review"
      }));
    }
    
    // Return error for all
    return assets.map((a) => ({
      assetId: a.assetId,
      tags: [],
      rationale: `batch error: ${errMsg}`
    }));
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as Body;

    const projectId = String(body.projectId || "").trim();
    const manifestUrl = String(body.manifestUrl || "").trim();
    const overwrite = Boolean(body.overwrite);
    const limitAssets = typeof body.limitAssets === "number" && Number.isFinite(body.limitAssets) ? body.limitAssets : 0;
    const requestedModel = typeof body.model === "string" ? body.model.trim() : "";
    // Settings can come from request body (current UI state) or fall back to manifest
    const bodyAiRules = typeof body.aiRules === "string" ? body.aiRules : undefined;
    const bodyTaggerPromptJson = typeof body.taggerPromptJson === "string" ? body.taggerPromptJson : undefined;
    const bodyTaggerEnforcerJson = typeof body.taggerEnforcerJson === "string" ? body.taggerEnforcerJson : undefined;

    if (!projectId || !manifestUrl) {
      return NextResponse.json({ ok: false, error: "Missing projectId/manifestUrl" }, { status: 400 });
    }

    let GEMINI_API_KEY: string;
    try {
      GEMINI_API_KEY = mustEnv("GEMINI_API_KEY");
    } catch {
      return NextResponse.json({ ok: false, error: "GEMINI_API_KEY not configured on server" }, { status: 500 });
    }
    
    // Model selection: request body > env var > default
    const DEFAULT_MODEL = "gemini-3-flash-preview";
    let GEMINI_DETECT_MODEL: string;
    
    if (requestedModel) {
      // Validate requested model
      if (!ALLOWED_MODELS.includes(requestedModel as typeof ALLOWED_MODELS[number])) {
        return NextResponse.json({ 
          ok: false, 
          error: `Invalid model "${requestedModel}". Allowed: ${ALLOWED_MODELS.join(", ")}` 
        }, { status: 400 });
      }
      GEMINI_DETECT_MODEL = requestedModel;
    } else {
      GEMINI_DETECT_MODEL = optEnv("GEMINI_DETECT_MODEL", DEFAULT_MODEL);
    }
    
    // Log model being used for debugging
    console.log(`[tag] Using model: ${GEMINI_DETECT_MODEL}`);

    // NOTE: We will *not* save this manifest directly at the end.
    // Tagging can take time, and the user may delete assets while it's running.
    // If we save the stale manifest, we can resurrect deleted assets.
    let manifest: ProjectManifest;
    try {
      manifest = await fetchJson<ProjectManifest>(manifestUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ ok: false, error: `Failed to fetch manifest: ${msg}` }, { status: 500 });
    }

    if (manifest.projectId !== projectId) {
      return NextResponse.json({ ok: false, error: "projectId does not match manifest" }, { status: 400 });
    }

    if (!manifest.extractedText?.url) {
      return NextResponse.json({ ok: false, error: "No extractedText in manifest. Please process the document first." }, { status: 400 });
    }

    if (!manifest.pages || !Array.isArray(manifest.pages) || manifest.pages.length === 0) {
      return NextResponse.json({ ok: false, error: "No pages in manifest" }, { status: 400 });
    }

    // Full text (fallback) — later you can store per-page text in DocAI JSON
    let fullText: string;
    try {
      fullText = await fetchText(manifest.extractedText.url);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ ok: false, error: `Failed to fetch extracted text: ${msg}` }, { status: 500 });
    }

    // Use settings from request body (current UI state) if provided, otherwise fall back to manifest
    const aiRules = bodyAiRules ?? manifest.settings?.aiRules ?? "";
    const taggerPromptJson = bodyTaggerPromptJson ?? manifest.settings?.taggerPromptJson ?? "{}";
    const taggerEnforcerJson = bodyTaggerEnforcerJson ?? manifest.settings?.taggerEnforcerJson ?? "{}";
    console.log(`[tag] Using aiRules from: ${bodyAiRules !== undefined ? 'request body' : 'manifest'} (${aiRules.length} chars)`);
    console.log(`[tag] Using taggerPromptJson from: ${bodyTaggerPromptJson !== undefined ? 'request body' : 'manifest'} (${taggerPromptJson.length} chars)`);
    console.log(`[tag] Using taggerEnforcerJson from: ${bodyTaggerEnforcerJson !== undefined ? 'request body' : 'manifest'} (${taggerEnforcerJson.length} chars)`);

    let totalConsidered = 0;
    let totalTagged = 0;
    const updates: TagUpdate[] = [];
    const errors: TagError[] = [];
    
    // Time limit to avoid Vercel timeout (leave 15s buffer for saving)
    const startTime = Date.now();
    const MAX_DURATION_MS = 285_000; // 285 seconds, Vercel limit is 300s
    let timedOut = false;

    // Collect all assets to tag first
    const assetsToTag: (BatchAsset & { 
      pageText: string;
      detectionTitle?: string;
      detectionDescription?: string;
      detectionCategory?: string;
    })[] = [];
    
    for (const page of manifest.pages) {
      const pageNumber = page.pageNumber;
      const pageText = getPageTextFallback(fullText, pageNumber);
      const deleted = new Set<string>(Array.isArray(page.deletedAssetIds) ? page.deletedAssetIds : []);
      const assets = Array.isArray(page.assets) ? page.assets : [];

      for (const asset of assets) {
        if (deleted.has(asset.assetId)) continue;

        const alreadyTagged = Array.isArray(asset.tags) && asset.tags.length > 0;
        if (alreadyTagged && !overwrite) continue;

        totalConsidered += 1;
        if (limitAssets > 0 && totalConsidered > limitAssets) break;

        // Use full image URL for better tagging accuracy (thumbnails lose detail)
        const imageUrl = asset.url;
        if (!imageUrl) continue; // Skip assets without URLs

        assetsToTag.push({
          pageNumber,
          assetId: asset.assetId,
          assetUrl: imageUrl,
          pageText,
          // Include detection metadata for smarter tagging
          detectionTitle: asset.title,
          detectionDescription: asset.description,
          detectionCategory: asset.category
        });
      }

      if (limitAssets > 0 && totalConsidered > limitAssets) break;
    }

    console.log(`[tag] Found ${assetsToTag.length} assets to tag`);

    // Sequential processing with small delay to respect rate limits
    // gemini-3-flash-preview handles 500ms delay well; pro models may need more
    const DELAY_BETWEEN_CALLS_MS = 500; // 0.5 seconds between calls

    console.log(`[tag] Processing ${assetsToTag.length} assets sequentially with ${DELAY_BETWEEN_CALLS_MS}ms delay`);

    // Process assets one at a time with delay
    for (let i = 0; i < assetsToTag.length; i++) {
      // Check time limit
      if (Date.now() - startTime > MAX_DURATION_MS) {
        console.log(`[tag] Time limit reached after ${totalTagged} assets`);
        timedOut = true;
        break;
      }

      const asset = assetsToTag[i];
      console.log(`[tag] Processing asset ${i + 1}/${assetsToTag.length}: ${asset.assetId}`);

      try {
        const result = await callGeminiTagger({
          apiKey: GEMINI_API_KEY,
          modelName: GEMINI_DETECT_MODEL,
          aiRules,
          taggerPromptJson,
          taggerEnforcerJson,
          pageNumber: asset.pageNumber,
          assetId: asset.assetId,
          assetUrl: asset.assetUrl,
          pageText: asset.pageText,
          // Pass detection metadata for smarter tagging
          detectionTitle: asset.detectionTitle,
          detectionDescription: asset.detectionDescription,
          detectionCategory: asset.detectionCategory
        });

        if (result.tags.length > 0) {
          updates.push({
            pageNumber: asset.pageNumber,
            assetId: asset.assetId,
            tags: result.tags,
            negativeTags: result.negativeTags,
            trigger: result.trigger,
            rationale: result.rationale
          });
          totalTagged += 1;
        } else {
          // Empty tags - save with placeholder
          updates.push({
            pageNumber: asset.pageNumber,
            assetId: asset.assetId,
            tags: ["needs-manual-tagging"],
            negativeTags: undefined,
            trigger: undefined,
            rationale: result.rationale || "no tags could be determined"
          });
          totalTagged += 1;
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error(`[tag] Failed for ${asset.assetId}:`, errMsg);
        
        errors.push({
          pageNumber: asset.pageNumber,
          assetId: asset.assetId,
          error: errMsg
        });

        // If rate limited, add longer delay before next call
        if (errMsg.includes("rate") || errMsg.includes("429") || errMsg.includes("quota")) {
          console.log(`[tag] Rate limit hit, waiting 5 seconds...`);
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }
      }

      // Delay between calls to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_CALLS_MS));
    }

    // Re-fetch latest manifest and merge tag updates onto it, so we don't
    // overwrite concurrent changes like deletions.
    const latest = await fetchJson<ProjectManifest>(manifestUrl);

    for (const u of updates) {
      const p = latest.pages?.find((x) => x.pageNumber === u.pageNumber);
      if (!p) continue;
      if (Array.isArray(p.deletedAssetIds) && p.deletedAssetIds.includes(u.assetId)) continue;
      const a = p.assets?.find((x) => x.assetId === u.assetId);
      if (!a) continue;
      (a as PageAsset).tags = u.tags;
      (a as PageAsset).tagRationale = u.rationale;
      if (u.negativeTags && u.negativeTags.length > 0) {
        (a as PageAsset).negativeTags = u.negativeTags;
      }
      if (u.trigger) {
        (a as PageAsset).trigger = u.trigger;
      }
    }

    const newManifestUrl = await saveManifest(latest);

    // Calculate remaining: assets we intended to tag but didn't complete
    const remaining = assetsToTag.length - totalTagged - errors.length;
    
    // Build informative message
    let message: string | undefined;
    if (timedOut && remaining > 0) {
      message = `Tagged ${totalTagged}/${assetsToTag.length} assets before time limit. ${remaining} remaining - run again to continue.`;
    } else if (errors.length > 0) {
      message = `Tagged ${totalTagged} assets with ${errors.length} failures. Check errors for details.`;
    }

    return NextResponse.json({
      ok: true,
      manifestUrl: newManifestUrl,
      considered: totalConsidered,
      toTag: assetsToTag.length,
      tagged: totalTagged,
      failed: errors.length,
      remaining: timedOut ? remaining : 0,
      errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // Limit to first 10 errors
      model: GEMINI_DETECT_MODEL,
      timedOut,
      message
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
