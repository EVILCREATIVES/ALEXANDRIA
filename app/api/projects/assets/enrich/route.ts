import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import { fetchManifestDirect, saveManifest, type ProjectManifest, type PageAsset } from "@/app/lib/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = "gemini-2.0-flash";

const enrichSchema: Schema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      assetId: { type: SchemaType.STRING, description: "The assetId of the image being analyzed" },
      geo: {
        type: SchemaType.OBJECT,
        description: "Geographic location depicted or associated. null if cannot be determined.",
        nullable: true,
        properties: {
          lat: { type: SchemaType.NUMBER, description: "Latitude" },
          lng: { type: SchemaType.NUMBER, description: "Longitude" },
          placeName: { type: SchemaType.STRING, description: "Human-readable place name" },
        },
        required: ["lat", "lng", "placeName"],
      },
      dateInfo: {
        type: SchemaType.OBJECT,
        description: "Temporal context of the image content. null if cannot be determined.",
        nullable: true,
        properties: {
          date: { type: SchemaType.STRING, description: "ISO date or year string (e.g. '1453', '1920-06', '2024-03-15')" },
          era: { type: SchemaType.STRING, description: "Historical era or period (e.g. 'Medieval', 'Renaissance', '20th Century', 'Modern')" },
          label: { type: SchemaType.STRING, description: "Short human-readable time label for display" },
        },
        required: ["label"],
      },
    },
    required: ["assetId"],
  },
};

const PROMPT = `You are an expert archivist analyzing images from a document. For each image, determine:

1. **Geographic context**: Where in the world is this image set, depicts, or is associated with? Look for:
   - Depicted locations (cities, landmarks, landscapes, buildings)
   - Text/labels mentioning places
   - Architectural or cultural indicators of geography
   - Maps or diagrams showing locations
   Only provide coordinates if you can reasonably determine a location. Use the center of a city/region if exact location is unclear.

2. **Temporal context**: When does this image relate to? Look for:
   - Depicted time periods (fashion, technology, architecture)
   - Dates written in the image
   - Historical events shown
   - Art style indicating era
   Provide a date/year if possible, always provide an era and display label.

For fictional/fantasy content: Use real-world analogs for era (e.g. "Medieval-inspired") and leave geo as null unless a real location is referenced.
For logos, diagrams, charts, or abstract images: Set both geo and dateInfo to null unless they contain clear geographic or temporal information.

Analyze these images:
`;

interface EnrichRequest {
  projectId: string;
  manifestUrl: string;
  batchSize?: number;
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ ok: false, error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  let body: EnrichRequest;
  try {
    body = (await req.json()) as EnrichRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId, manifestUrl, batchSize = 10 } = body;
  if (!projectId || !manifestUrl) {
    return NextResponse.json({ ok: false, error: "Missing projectId or manifestUrl" }, { status: 400 });
  }

  let manifest: ProjectManifest;
  try {
    manifest = await fetchManifestDirect(manifestUrl);
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Failed to load manifest: ${e instanceof Error ? e.message : e}` }, { status: 400 });
  }

  // Collect assets that haven't been enriched yet
  const unenriched: (PageAsset & { pageNumber: number })[] = [];
  for (const page of manifest.pages || []) {
    for (const asset of page.assets || []) {
      if (!asset.geo && !asset.dateInfo) {
        unenriched.push({ ...asset, pageNumber: page.pageNumber });
      }
    }
  }

  if (unenriched.length === 0) {
    return NextResponse.json({ ok: true, enriched: 0, message: "All assets already enriched" });
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: enrichSchema,
      temperature: 0.2,
    },
  });

  let totalEnriched = 0;
  const batches = [];
  for (let i = 0; i < unenriched.length; i += batchSize) {
    batches.push(unenriched.slice(i, i + batchSize));
  }

  for (const batch of batches) {
    // Build image parts for Gemini
    const imageParts: Array<{ inlineData: { data: string; mimeType: string } } | { text: string }> = [];
    const assetIndex: string[] = [];

    // Build context text listing what we're analyzing
    let contextText = PROMPT + "\n";
    for (const asset of batch) {
      contextText += `\n- assetId: "${asset.assetId}", title: "${asset.title || "untitled"}", category: "${asset.category || "unknown"}", description: "${asset.description || "none"}", page: ${asset.pageNumber}`;
    }
    imageParts.push({ text: contextText });

    // Fetch and add images
    for (const asset of batch) {
      const imageUrl = asset.thumbnailUrl || asset.url;
      try {
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) continue;
        const buf = Buffer.from(await imgRes.arrayBuffer());
        const mimeType = imgRes.headers.get("content-type") || "image/png";
        imageParts.push({ inlineData: { data: buf.toString("base64"), mimeType } });
        imageParts.push({ text: `(Above image is assetId: "${asset.assetId}")` });
        assetIndex.push(asset.assetId);
      } catch {
        console.error(`[enrich] Failed to fetch image for ${asset.assetId}`);
      }
    }

    if (assetIndex.length === 0) continue;

    try {
      const result = await model.generateContent(imageParts);
      const text = result.response.text();
      const parsed = JSON.parse(text) as Array<{
        assetId: string;
        geo?: { lat: number; lng: number; placeName: string } | null;
        dateInfo?: { date?: string; era?: string; label: string } | null;
      }>;

      // Apply enrichment to manifest
      for (const enrichment of parsed) {
        if (!enrichment.assetId) continue;
        for (const page of manifest.pages || []) {
          const asset = page.assets?.find((a) => a.assetId === enrichment.assetId);
          if (!asset) continue;
          if (enrichment.geo) asset.geo = enrichment.geo;
          if (enrichment.dateInfo) asset.dateInfo = enrichment.dateInfo;
          totalEnriched++;
          break;
        }
      }
    } catch (e) {
      console.error(`[enrich] Gemini batch error:`, e);
    }
  }

  // Save updated manifest
  const newManifestUrl = await saveManifest(manifest);

  return NextResponse.json({
    ok: true,
    enriched: totalEnriched,
    total: unenriched.length,
    manifestUrl: newManifestUrl,
  });
}
