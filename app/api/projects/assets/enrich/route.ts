import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import { fetchManifestDirect, saveManifest, type ProjectManifest, type PageAsset } from "@/app/lib/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = "gemini-3.1-flash-lite-preview";

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

const PROMPT = `You are an expert archivist analyzing images extracted from document pages. For each image, determine geographic and temporal context.

You will receive:
1. The FULL PAGE image where each asset was extracted from — use visible text, captions, labels, headings, and surrounding context to inform your analysis
2. EXTRACTED TEXT from the page — use this text for identifying dates, place names, and historical context (this is the most reliable source)
3. Each individual cropped asset image

**Use the extracted page text as your PRIMARY source for determining location and timeline.** The text contains captions, article dates, place names, and historical references that are often clearer than visual inference.

**Geographic context** — Where in the world is this image set, depicts, or referenced? Priority sources:
- Place names mentioned in the extracted page text (highest priority)
- Depicted locations (cities, landmarks, landscapes, buildings)
- Captions and labels referencing geography
- Architectural or cultural indicators
- Maps or diagrams showing locations
Only provide coordinates if you can reasonably determine a location. Use city/region center if exact location is unclear.

**Temporal context** — When does this image relate to? Priority sources:
- Dates in the extracted page text (article dates, publication dates, historical references) (highest priority)
- Depicted time periods (fashion, technology, architecture)
- Historical events referenced in page text
- Art style indicating era
Always provide an era and display label. Provide a specific date/year if text indicates one.

For fictional/fantasy content: Use real-world analogs for era and leave geo as null unless a real location is referenced.
For logos, diagrams, charts, or abstract images: Set both to null unless page context provides clear geographic or temporal information.

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

  // Fetch extracted text for page context
  const pageTextMap = new Map<number, string>(); // pageNumber -> extracted text for that page
  if (manifest.extractedText?.url) {
    try {
      const textRes = await fetch(manifest.extractedText.url);
      if (textRes.ok) {
        const fullText = await textRes.text();
        // Parse text by page markers: "--- Page N ---" or "[Page N]"
        const pageBlocks = fullText.split(/(?:---\s*Page\s+(\d+)\s*---|^\[Page\s+(\d+)\])/m);
        for (let i = 0; i < pageBlocks.length; i++) {
          const pageNumMatch = pageBlocks[i]?.match(/\d+/);
          if (pageNumMatch) {
            const pageNum = parseInt(pageNumMatch[0], 10);
            const pageText = pageBlocks[i + 1]?.trim();
            if (pageText) {
              pageTextMap.set(pageNum, pageText);
            }
          }
        }
        console.log(`[enrich] Loaded extracted text for ${pageTextMap.size} pages`);
      }
    } catch (e) {
      console.warn(`[enrich] Could not load extracted text:`, e instanceof Error ? e.message : e);
    }
  }

  // Collect assets that haven't been enriched yet, grouped by page
  // An asset is "unenriched" if it was never processed (no _enriched flag)
  const unenriched: (PageAsset & { pageNumber: number })[] = [];
  const pageImageMap = new Map<number, string>(); // pageNumber -> page image URL
  for (const page of manifest.pages || []) {
    let hasUnenriched = false;
    for (const asset of page.assets || []) {
      // Skip assets already processed (even if Gemini returned null for both)
      if ((asset as Record<string, unknown>)._enriched) continue;
      if (asset.geo || asset.dateInfo) continue; // already has data
      unenriched.push({ ...asset, pageNumber: page.pageNumber });
      hasUnenriched = true;
    }
    if (hasUnenriched) {
      pageImageMap.set(page.pageNumber, page.url);
    }
  }

  if (unenriched.length === 0) {
    return NextResponse.json({ ok: true, enriched: 0, message: "All assets already enriched" });
  }

  console.log(`[enrich] Found ${unenriched.length} unenriched assets across ${pageImageMap.size} pages`);

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
  const errors: string[] = [];

  // Process per page (not arbitrary batches) to keep page context aligned
  const byPage = new Map<number, (PageAsset & { pageNumber: number })[]>();
  for (const a of unenriched) {
    const arr = byPage.get(a.pageNumber) || [];
    arr.push(a);
    byPage.set(a.pageNumber, arr);
  }

  for (const [pageNum, pageAssets] of byPage) {
    // Sub-batch within each page if many assets
    const subBatches: typeof pageAssets[] = [];
    for (let i = 0; i < pageAssets.length; i += batchSize) {
      subBatches.push(pageAssets.slice(i, i + batchSize));
    }

    // Fetch page image once per page
    let pageImageData: { data: string; mimeType: string } | null = null;
    const pageUrl = pageImageMap.get(pageNum);
    if (pageUrl) {
      try {
        const pageRes = await fetch(pageUrl);
        if (pageRes.ok) {
          const pageBuf = Buffer.from(await pageRes.arrayBuffer());
          const pageMime = pageRes.headers.get("content-type") || "image/png";
          pageImageData = { data: pageBuf.toString("base64"), mimeType: pageMime };
          console.log(`[enrich] Page ${pageNum}: loaded page image (${(pageBuf.length / 1024).toFixed(0)}KB)`);
        }
      } catch (e) {
        console.error(`[enrich] Failed to fetch page image for page ${pageNum}:`, e);
      }
    }

    for (const batch of subBatches) {
      const imageParts: Array<{ inlineData: { data: string; mimeType: string } } | { text: string }> = [];
      const assetIndex: string[] = [];

      // Build context text
      let contextText = PROMPT + "\n";
      for (const asset of batch) {
        contextText += `\n- assetId: "${asset.assetId}", title: "${asset.title || "untitled"}", category: "${asset.category || "unknown"}", description: "${asset.description || "none"}", page: ${asset.pageNumber}`;
      }

      // Add extracted page text if available
      const pageText = pageTextMap.get(pageNum);
      if (pageText) {
        contextText += `\n\n--- EXTRACTED TEXT FROM PAGE ${pageNum} (for location/time context) ---\n${pageText}`;
      }

      imageParts.push({ text: contextText });

      // Add page image for context (once per batch)
      if (pageImageData) {
        imageParts.push({ text: `\n--- Full page ${pageNum} (use visible text, captions, labels for context) ---` });
        imageParts.push({ inlineData: pageImageData });
      }

      // Fetch and add individual asset images
      for (const asset of batch) {
        const imageUrl = asset.thumbnailUrl || asset.url;
        try {
          const imgRes = await fetch(imageUrl);
          if (!imgRes.ok) {
            console.error(`[enrich] Failed to fetch asset image ${asset.assetId}: HTTP ${imgRes.status}`);
            continue;
          }
          const buf = Buffer.from(await imgRes.arrayBuffer());
          const mimeType = imgRes.headers.get("content-type") || "image/png";
          imageParts.push({ inlineData: { data: buf.toString("base64"), mimeType } });
          imageParts.push({ text: `(Above image is assetId: "${asset.assetId}" from page ${asset.pageNumber})` });
          assetIndex.push(asset.assetId);
        } catch (e) {
          console.error(`[enrich] Failed to fetch image for ${asset.assetId}:`, e);
        }
      }

      if (assetIndex.length === 0) continue;

      console.log(`[enrich] Page ${pageNum}: sending ${assetIndex.length} assets to Gemini (${imageParts.length} parts)`);

      try {
        const result = await model.generateContent(imageParts);
        const text = result.response.text();
        console.log(`[enrich] Gemini response (${text.length} chars): ${text.slice(0, 300)}...`);

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
            // Mark as processed so we don't retry assets where Gemini returned null
            (asset as Record<string, unknown>)._enriched = true;
            totalEnriched++;
            break;
          }
        }

        // Also mark any assets we sent but Gemini didn't return results for
        for (const aid of assetIndex) {
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
        console.error(`[enrich] Gemini batch error for page ${pageNum}:`, msg);
        errors.push(`Page ${pageNum}: ${msg}`);
      }
    }
  }

  // Save updated manifest
  const newManifestUrl = await saveManifest(manifest);

  console.log(`[enrich] Complete: ${totalEnriched}/${unenriched.length} enriched, ${errors.length} errors`);

  return NextResponse.json({
    ok: true,
    enriched: totalEnriched,
    total: unenriched.length,
    manifestUrl: newManifestUrl,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
