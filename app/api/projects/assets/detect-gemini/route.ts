import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";

export const maxDuration = 300;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

// Allowed models for detection
const ALLOWED_MODELS = [
  "gemini-3.1-flash-lite-preview",
  "gemini-3-flash-preview",
  "gemini-3-pro-preview",
  "gemini-2.5-pro-preview",
  "gemini-2.5-flash-preview",
  "gemini-2.0-flash",
  "gemini-2.0-flash-exp",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
] as const;

const DEFAULT_MODEL = "gemini-3.1-flash-lite-preview";

// Output box format matching existing manifest structure
interface DetectedBox {
  x: number;
  y: number;
  width: number;
  height: number;
  category?: string;
  title?: string;
  description?: string;
  author?: string;
  metadata?: Record<string, string>;
  geo?: { lat: number; lng: number; placeName: string; continent?: string; country?: string; region?: string; city?: string } | null;
  dateInfo?: { date?: string; era?: string; label: string } | null;
}

// Simplified detection rules - PDF Vision Extractor approach
interface DetectionRules {
  model?: string;
  prompt?: string;  // Custom prompt override
  categories?: string[];
  temperature?: number;
  maxOutputTokens?: number;
  minSizePx?: number;  // Minimum box size in pixels (default 35)
}

interface DetectRequest {
  pageUrl: string;
  pageWidth: number;
  pageHeight: number;
  detectionRules?: DetectionRules;
}

// Schema for structured output - images-only with metadata
// Uses box_2d: [ymin, xmin, ymax, xmax] normalized to 0-1000 scale
const analysisSchema: Schema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      title: {
        type: SchemaType.STRING,
        description: "Brief title for the image (3-6 words)",
      },
      description: {
        type: SchemaType.STRING,
        description: "Description of the visual content (1-2 sentences)",
      },
      category: {
        type: SchemaType.STRING,
        description: "Content-appropriate category determined by analyzing the image (e.g. portrait, landscape, character, vehicle, diagram, map, logo, architectural, still-life, fashion, wildlife, abstract, etc.)",
      },
      author: {
        type: SchemaType.STRING,
        description: "Author, artist, photographer, or creator of this image. Infer from signatures, credits, captions, artistic style, or contextual clues. Return empty string if unknown.",
      },
      metadata: {
        type: SchemaType.ARRAY,
        description: "Dynamic content-specific metadata as key-value pairs. Keys depend on what is relevant to this image. Examples: author, year, style, medium, camera, lens, technique, period, material, culture, movement.",
        nullable: true,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            key: { type: SchemaType.STRING, description: "Metadata field name (e.g. 'camera', 'style', 'medium')" },
            value: { type: SchemaType.STRING, description: "Metadata field value" },
          },
          required: ["key", "value"],
        },
      },
      geo: {
        type: SchemaType.OBJECT,
        description: "Geographic location of the image subject. Infer from visible landmarks, architecture, text, cultural markers, vegetation, or any contextual clue. Set null ONLY for pure abstract art, generic icons, or logos with zero geographic context.",
        nullable: true,
        properties: {
          lat: { type: SchemaType.NUMBER, description: "Latitude" },
          lng: { type: SchemaType.NUMBER, description: "Longitude" },
          placeName: { type: SchemaType.STRING, description: "Human-readable place name" },
          continent: { type: SchemaType.STRING, description: "Continent (e.g. 'Europe', 'Asia', 'North America', 'South America', 'Africa', 'Oceania', 'Antarctica')" },
          country: { type: SchemaType.STRING, description: "Country name (e.g. 'Italy', 'Japan', 'United States')" },
          region: { type: SchemaType.STRING, description: "Region, state, or province (e.g. 'Tuscany', 'Kanto', 'California')" },
          city: { type: SchemaType.STRING, description: "City or town name (e.g. 'Florence', 'Tokyo', 'San Francisco')" },
        },
        required: ["lat", "lng", "placeName", "continent", "country"],
      },
      dateInfo: {
        type: SchemaType.OBJECT,
        description: "Temporal context of the image. Infer from artistic style, photographic technique, fashion, technology visible, medium, or any contextual clue. Set null ONLY for pure abstract art or generic logos.",
        nullable: true,
        properties: {
          date: { type: SchemaType.STRING, description: "ISO date or year string (e.g. '1453', '1920-06', '2024-03-15')" },
          era: { type: SchemaType.STRING, description: "Historical era or period (e.g. 'Medieval', 'Renaissance', '20th Century', 'Modern')" },
          label: { type: SchemaType.STRING, description: "Short human-readable time label for display" },
        },
        required: ["label"],
      },
      box_2d: {
        type: SchemaType.ARRAY,
        description: "Bounding box [ymin, xmin, ymax, xmax] on 0-1000 scale",
        items: { type: SchemaType.INTEGER },
      },
    },
    required: ["title", "description", "category", "author", "geo", "dateInfo", "box_2d"],
  },
};

const DEFAULT_PROMPT = `Detect every image on this page. For each image found, provide its title, description, category, author, bounding box, relevant metadata, geographic location (with hierarchy), and time period.

What counts as an image:
- Illustrations, character art, portraits
- Photos, screenshots
- Location/environment scenes
- Logos, key art, promotional images
- Diagrams, charts, graphs, maps
- Props, weapons, objects, vehicles
- Architectural drawings, fashion plates, still lifes

What to ignore:
- Text paragraphs, headings, page numbers
- Decorative borders, watermarks

Categorization:
Do NOT use a fixed category list. Analyze the actual content and assign the most specific, accurate category.
Examples: portrait, landscape, character, vehicle, diagram, map, logo, architectural, still-life, fashion, wildlife, abstract, aerial, microscopy, x-ray, sketch, painting, engraving, screenshot, infographic, icon, etc.
Use lowercase single words or hyphenated compounds.

Metadata:
Extract any content-specific metadata visible in or inferable from the image:
- For photographs: style (e.g. "documentary", "studio"), camera/lens if EXIF-style data visible, technique (e.g. "long exposure", "HDR"), medium ("silver gelatin", "digital")
- For artwork: medium (e.g. "oil on canvas", "watercolor"), style/movement (e.g. "impressionist", "art nouveau"), artist if signed or identifiable
- For diagrams/charts: chartType (e.g. "bar chart", "flowchart"), subject
- For any image: period, culture, material, technique — whatever is genuinely relevant
Only include metadata keys that are clearly supported by visual evidence. Do not guess.

Author:
Identify the author, artist, photographer, or creator of each image. Use ALL available clues:
- Signatures, monograms, watermarks visible in the image
- Credit lines, captions, attribution text on the page
- Recognizable artistic style (e.g. "Hokusai" ukiyo-e style, "Ansel Adams" landscape photography)
- Known works (e.g. Mona Lisa → Leonardo da Vinci)
Return an empty string only if there are absolutely no clues to the creator.

Location (geo):
You MUST determine the geographic location for every image. Use ALL available clues:
- Visible text, captions, labels, place names on the page
- Architecture style, landmarks, cultural markers
- Vegetation, landscape, climate indicators
- Language/script visible, cultural artifacts
- Subject matter context (e.g. "Samurai" → Japan, "Colosseum" → Rome)
Use city/region center coordinates when exact location is unclear.
You MUST also provide the location hierarchy: continent, country, region (state/province), and city.
Only return null for pure abstract art or generic logos.

Time Period (dateInfo):
You MUST determine the time period for every image. Use ALL available clues:
- Dates visible in text or captions on the page
- Photographic technique (daguerreotype → 1840s-1860s, albumen print → 1850s-1890s, etc.)
- Artistic style and medium (oil painting style, engraving technique, etc.)
- Fashion, technology, architecture visible
- Historical context from subject matter
When in doubt, give your best estimate. Only return null for pure abstract art or generic logos.

Be thorough — check edges and corners too.`;

async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  
  const contentType = res.headers.get("content-type") || "image/png";
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  
  let mimeType = contentType.split(";")[0].trim();
  if (mimeType === "image/jpg") mimeType = "image/jpeg";
  
  return { data: base64, mimeType };
}

// Convert box_2d [ymin, xmin, ymax, xmax] (0-1000 scale) to pixel coordinates
function convertBox2dToPixels(
  box2d: number[],
  pageWidth: number,
  pageHeight: number
): { x: number; y: number; width: number; height: number } {
  const [ymin, xmin, ymax, xmax] = box2d;
  
  const x = Math.round((xmin / 1000) * pageWidth);
  const y = Math.round((ymin / 1000) * pageHeight);
  const width = Math.round(((xmax - xmin) / 1000) * pageWidth);
  const height = Math.round(((ymax - ymin) / 1000) * pageHeight);
  
  return { x, y, width, height };
}

async function detectVisualElements(
  imageUrl: string,
  pageWidth: number,
  pageHeight: number,
  modelName: string,
  customPrompt?: string,
  temperature?: number,
  maxOutputTokens?: number,
  minSizePx: number = 35
): Promise<DetectedBox[]> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  
  // Configure model with structured output schema
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: temperature ?? 0.1,
      maxOutputTokens: maxOutputTokens ?? 8192,
      responseMimeType: "application/json",
      responseSchema: analysisSchema,
    },
  });

  const { data: base64Data, mimeType } = await fetchImageAsBase64(imageUrl);
  const prompt = customPrompt || DEFAULT_PROMPT;
  
  console.log(`[detect-gemini] Model: ${modelName}`);
  console.log(`[detect-gemini] Page size: ${pageWidth}x${pageHeight}`);
  console.log(`[detect-gemini] Image data: ${base64Data.length} chars (${mimeType})`);
  console.log(`[detect-gemini] Prompt length: ${prompt.length} chars`);
  console.log(`[detect-gemini] maxOutputTokens: ${maxOutputTokens ?? 8192}`);

  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[detect-gemini] Attempt ${attempt}/${MAX_RETRIES}`);
      
      const response = await model.generateContent({
        contents: [{
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data,
              },
            },
            { text: prompt },
          ],
        }],
      });

      // Check for blocked or empty response
      const candidate = response.response.candidates?.[0];
      if (!candidate) {
        const blockReason = response.response.promptFeedback?.blockReason;
        console.log(`[detect-gemini] No candidates returned. Block reason: ${blockReason || 'unknown'}`);
        if (attempt < MAX_RETRIES) continue;
        return []; // No visual elements or blocked
      }

      // Log finish reason to diagnose truncation
      const finishReason = candidate.finishReason;
      console.log(`[detect-gemini] Finish reason: ${finishReason}`);
      if (finishReason === "MAX_TOKENS") {
        console.log(`[detect-gemini] WARNING: Response truncated due to MAX_TOKENS`);
      }

      const text = response.response.text().trim();
      // Log raw response for debugging
      console.log(`[detect-gemini] Raw response (${text.length} chars): ${text.slice(0, 500)}...`);

      // Handle empty response - return empty array (no visual elements found)
      if (!text || text === "[]") {
        console.log(`[detect-gemini] Empty response - no visual elements detected`);
        return [];
      }

      // Try to parse JSON
      let elements: Array<{
        title: string;
        description: string;
        category?: string;
        author?: string;
        metadata?: Array<{ key: string; value: string }> | null;
        geo?: { lat: number; lng: number; placeName: string; continent?: string; country?: string; region?: string; city?: string } | null;
        dateInfo?: { date?: string; era?: string; label: string } | null;
        box_2d: number[];
      }>;

      try {
        elements = JSON.parse(text);
      } catch (parseError) {
        // Try to fix common JSON issues
        let fixedText = text;
        
        // If it looks like truncated JSON, try to close it
        if (!text.endsWith("]") && !text.endsWith("}")) {
          // Count open brackets/braces
          const openBrackets = (text.match(/\[/g) || []).length;
          const closeBrackets = (text.match(/\]/g) || []).length;
          const openBraces = (text.match(/\{/g) || []).length;
          const closeBraces = (text.match(/\}/g) || []).length;
          
          // Try to close the JSON properly
          let suffix = "";
          if (openBraces > closeBraces) {
            // Find if we're inside a string
            const lastQuote = text.lastIndexOf('"');
            const lastColon = text.lastIndexOf(':');
            if (lastQuote > lastColon) {
              // We might be inside a string value - close it
              suffix += '"';
            }
            for (let i = 0; i < openBraces - closeBraces; i++) suffix += "}";
          }
          if (openBrackets > closeBrackets) {
            for (let i = 0; i < openBrackets - closeBrackets; i++) suffix += "]";
          }
          fixedText = text + suffix;
          console.log(`[detect-gemini] Attempted JSON fix: added "${suffix}"`);
        }

        try {
          elements = JSON.parse(fixedText);
          console.log(`[detect-gemini] Fixed JSON parsed successfully`);
        } catch {
          // If still failing and we have retries left, try again
          if (attempt < MAX_RETRIES) {
            console.log(`[detect-gemini] JSON parse failed, retrying...`);
            lastError = parseError as Error;
            continue;
          }
          throw new Error(`JSON parse error: ${(parseError as Error).message}. Raw response (first 500 chars): ${text.slice(0, 500)}`);
        }
      }

      if (!Array.isArray(elements)) {
        if (attempt < MAX_RETRIES) {
          console.log(`[detect-gemini] Response is not an array, retrying...`);
          continue;
        }
        console.log(`[detect-gemini] Response is not an array`);
        return [];
      }

      // Convert to pixel coordinates
      const boxes: DetectedBox[] = elements
        .filter(el => el.box_2d && el.box_2d.length === 4)
        .map(el => {
          const { x, y, width, height } = convertBox2dToPixels(el.box_2d, pageWidth, pageHeight);
          console.log(`[detect-gemini] Element: title="${el.title}", desc="${el.description?.slice(0,50)}...", category="${el.category}"`);
          // Clean metadata: convert key-value array to Record, remove null/empty values
          const meta: Record<string, string> = {};
          if (Array.isArray(el.metadata)) {
            for (const kv of el.metadata) {
              if (kv && kv.key && kv.value && String(kv.value).trim()) {
                meta[String(kv.key).trim()] = String(kv.value).trim();
              }
            }
          }
          return {
            x, y, width, height,
            title: el.title,
            description: el.description,
            category: el.category,
            author: el.author || undefined,
            ...(Object.keys(meta).length > 0 ? { metadata: meta } : {}),
            geo: el.geo || null,
            dateInfo: el.dateInfo || null,
          };
        })
        .filter(box => box.width >= minSizePx && box.height >= minSizePx);

      console.log(`[detect-gemini] Detected ${boxes.length} visual elements (filtered <${minSizePx}px)`);
      return boxes;
    } catch (error) {
      console.error(`[detect-gemini] Attempt ${attempt} error:`, error);
      lastError = error as Error;
      
      // If it's a quota/rate limit error, don't retry
      const errorMsg = String(error);
      if (errorMsg.includes("429") || errorMsg.includes("quota") || errorMsg.includes("rate")) {
        throw error;
      }
      
      if (attempt < MAX_RETRIES) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  // All retries exhausted
  throw lastError || new Error("Detection failed after all retries")
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as DetectRequest;
    const { pageUrl, pageWidth, pageHeight, detectionRules } = body;

    if (!pageUrl || !pageWidth || !pageHeight) {
      return NextResponse.json(
        { error: "Missing pageUrl, pageWidth, or pageHeight" },
        { status: 400 }
      );
    }

    // Model selection: rules.model > env var > default
    let selectedModel = DEFAULT_MODEL;
    
    if (detectionRules?.model) {
      if (!ALLOWED_MODELS.includes(detectionRules.model as typeof ALLOWED_MODELS[number])) {
        return NextResponse.json(
          { error: `Invalid model "${detectionRules.model}". Allowed: ${ALLOWED_MODELS.join(", ")}` },
          { status: 400 }
        );
      }
      selectedModel = detectionRules.model;
    } else if (process.env.GEMINI_DETECT_MODEL) {
      selectedModel = process.env.GEMINI_DETECT_MODEL;
    }

    console.log(`[detect-gemini] === Starting Detection ===`);
    console.log(`  URL: ${pageUrl.slice(0, 80)}...`);
    console.log(`  Model: ${selectedModel}`);
    console.log(`  Page: ${pageWidth}x${pageHeight}`);

    const boxes = await detectVisualElements(
      pageUrl,
      pageWidth,
      pageHeight,
      selectedModel,
      detectionRules?.prompt,
      detectionRules?.temperature,
      detectionRules?.maxOutputTokens,
      detectionRules?.minSizePx ?? 35
    );

    console.log(`[detect-gemini] === Detection Complete ===`);
    console.log(`  Found: ${boxes.length} elements`);
    // Log first box to verify title/description extraction
    if (boxes.length > 0) {
      console.log(`  First box sample: title="${boxes[0].title}", desc="${boxes[0].description?.slice(0,80)}...", category="${boxes[0].category}"`);
    }

    return NextResponse.json({
      boxes,
      model: selectedModel,
      count: boxes.length,
    });
  } catch (err) {
    console.error("[detect-gemini] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
