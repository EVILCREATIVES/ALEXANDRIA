import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import { fetchManifestDirect, saveManifest, type ProjectManifest, type PageAsset } from "@/app/lib/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = "gemini-2.0-flash";

/* ── Structured output schema ── */

const enrichSchema: Schema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      assetId: { type: SchemaType.STRING, description: "The assetId being enriched" },
      geo: {
        type: SchemaType.OBJECT,
        description: "Geographic location. null if cannot be determined from the text.",
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
        description: "Temporal context. null if cannot be determined from the text.",
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

const SYSTEM_PROMPT = `You are an expert archivist. You will receive TEXT ONLY — extracted page text from a document and metadata about images found on each page (title, description, category, etc.).

Your job: determine **geographic** and **temporal** context for each asset using ONLY the text information provided. Do NOT hallucinate — only provide geo/date when the text clearly supports it.

**Geographic context** — derive from:
- Place names, city names, country names mentioned in the page text
- Captions or descriptions referencing locations
- Geographic references near the asset on the page
- If a specific place is named, provide approximate coordinates (city/region center is fine)
- Set geo to null if no location can be determined from the text

**Temporal context** — derive from:
- Explicit dates in the page text (publication dates, historical dates, "circa" dates)
- Historical periods or eras referenced in text
- Time-related descriptions in asset metadata (e.g. "18th century painting")
- Set dateInfo to null if no time can be determined from the text

Be conservative — only assign geo/dateInfo when the text provides clear evidence.`;

interface EnrichRequest {
  projectId: string;
  manifestUrl: string;
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

  const { projectId, manifestUrl } = body;
  if (!projectId || !manifestUrl) {
    return NextResponse.json({ ok: false, error: "Missing projectId or manifestUrl" }, { status: 400 });
  }

  let manifest: ProjectManifest;
  try {
    manifest = await fetchManifestDirect(manifestUrl);
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Failed to load manifest: ${e instanceof Error ? e.message : e}` }, { status: 400 });
  }

  /* ── Load extracted page text ── */
  const pageTextMap = new Map<number, string>();
  if (manifest.extractedText?.url) {
    try {
      const textRes = await fetch(manifest.extractedText.url);
      if (textRes.ok) {
        const fullText = await textRes.text();
        const pagePattern = /---\s*Page\s+(\d+)\s*---/g;
        let match: RegExpExecArray | null;
        const markers: { pageNum: number; idx: number }[] = [];
        while ((match = pagePattern.exec(fullText)) !== null) {
          markers.push({ pageNum: parseInt(match[1], 10), idx: match.index + match[0].length });
        }
        for (let i = 0; i < markers.length; i++) {
          const end = i + 1 < markers.length ? markers[i + 1].idx - `--- Page ${markers[i + 1].pageNum} ---`.length : fullText.length;
          const text = fullText.slice(markers[i].idx, end).trim();
          if (text) pageTextMap.set(markers[i].pageNum, text);
        }
        console.log(`[enrich] Loaded extracted text for ${pageTextMap.size} pages`);
      }
    } catch (e) {
      console.warn(`[enrich] Could not load extracted text:`, e instanceof Error ? e.message : e);
    }
  }

  /* ── Collect unenriched assets grouped by page ── */
  const byPage = new Map<number, PageAsset[]>();
  let totalUnenriched = 0;

  for (const page of manifest.pages || []) {
    for (const asset of page.assets || []) {
      if ((asset as Record<string, unknown>)._enriched) continue;
      if (asset.geo || asset.dateInfo) continue;
      const arr = byPage.get(page.pageNumber) || [];
      arr.push(asset);
      byPage.set(page.pageNumber, arr);
      totalUnenriched++;
    }
  }

  if (totalUnenriched === 0) {
    return NextResponse.json({ ok: true, enriched: 0, message: "All assets already enriched" });
  }

  console.log(`[enrich] Found ${totalUnenriched} unenriched assets across ${byPage.size} pages`);

  /* ── Call Gemini with TEXT ONLY — no images ── */
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: enrichSchema,
      temperature: 0.1,
    },
    systemInstruction: SYSTEM_PROMPT,
  });

  let totalEnriched = 0;
  const errors: string[] = [];

  // Batch pages together (~20 assets per Gemini call)
  const BATCH_SIZE = 20;
  const allEntries = Array.from(byPage.entries());
  let pendingPages: { pageNum: number; assets: PageAsset[] }[] = [];
  let pendingCount = 0;
  const batches: (typeof pendingPages)[] = [];

  for (const [pageNum, assets] of allEntries) {
    pendingPages.push({ pageNum, assets });
    pendingCount += assets.length;
    if (pendingCount >= BATCH_SIZE) {
      batches.push(pendingPages);
      pendingPages = [];
      pendingCount = 0;
    }
  }
  if (pendingPages.length > 0) batches.push(pendingPages);

  for (const batch of batches) {
    let prompt = "Analyze these assets and provide geo/dateInfo based on the text context.\n\n";

    for (const { pageNum, assets } of batch) {
      prompt += `=== PAGE ${pageNum} ===\n`;

      const pageText = pageTextMap.get(pageNum);
      if (pageText) {
        const truncated = pageText.length > 3000 ? pageText.slice(0, 3000) + "\n[...truncated]" : pageText;
        prompt += `EXTRACTED TEXT:\n${truncated}\n\n`;
      } else {
        prompt += `EXTRACTED TEXT: (not available)\n\n`;
      }

      prompt += `ASSETS ON THIS PAGE:\n`;
      for (const asset of assets) {
        prompt += `- assetId: "${asset.assetId}"`;
        if (asset.title) prompt += `, title: "${asset.title}"`;
        if (asset.description) prompt += `, description: "${asset.description}"`;
        if (asset.category) prompt += `, category: "${asset.category}"`;
        if (asset.metadata) {
          const metaStr = Object.entries(asset.metadata).map(([k, v]) => `${k}: ${v}`).join("; ");
          if (metaStr) prompt += `, metadata: {${metaStr}}`;
        }
        prompt += `\n`;
      }
      prompt += `\n`;
    }

    const assetIds = batch.flatMap(b => b.assets.map(a => a.assetId));
    console.log(`[enrich] Sending ${assetIds.length} assets to Gemini (text-only, ${prompt.length} chars)`);

    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      console.log(`[enrich] Gemini response (${text.length} chars)`);

      const parsed = JSON.parse(text) as Array<{
        assetId: string;
        geo?: { lat: number; lng: number; placeName: string } | null;
        dateInfo?: { date?: string; era?: string; label: string } | null;
      }>;

      for (const enrichment of parsed) {
        if (!enrichment.assetId) continue;
        for (const page of manifest.pages || []) {
          const asset = page.assets?.find((a) => a.assetId === enrichment.assetId);
          if (!asset) continue;
          if (enrichment.geo) asset.geo = enrichment.geo;
          if (enrichment.dateInfo) asset.dateInfo = enrichment.dateInfo;
          (asset as Record<string, unknown>)._enriched = true;
          totalEnriched++;
          break;
        }
      }

      // Mark assets we sent but Gemini didn't return results for
      for (const aid of assetIds) {
        if (parsed.some(p => p.assetId === aid)) continue;
        for (const page of manifest.pages || []) {
          const asset = page.assets?.find((a) => a.assetId === aid);
          if (!asset) continue;
          (asset as Record<string, unknown>)._enriched = true;
          break;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[enrich] Gemini batch error:`, msg);
      errors.push(msg);
    }
  }

  const newManifestUrl = await saveManifest(manifest);
  console.log(`[enrich] Complete: ${totalEnriched}/${totalUnenriched} enriched, ${errors.length} errors`);

  return NextResponse.json({
    ok: true,
    enriched: totalEnriched,
    total: totalUnenriched,
    manifestUrl: newManifestUrl,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
