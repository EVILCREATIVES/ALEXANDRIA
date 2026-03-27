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
        description: "Geographic location. Set to null ONLY for pure abstract art, logos with no geographic origin, or entirely generic diagrams. For everything else, infer the most likely location.",
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
        description: "Temporal context. Set to null ONLY for pure abstract art or logos with no temporal context. For everything else, infer the most likely time period.",
        nullable: true,
        properties: {
          date: { type: SchemaType.STRING, description: "ISO date or year string (e.g. '1453', '1920-06', '2024-03-15')" },
          era: { type: SchemaType.STRING, description: "Historical era or period (e.g. 'Medieval', 'Renaissance', '20th Century', 'Modern')" },
          label: { type: SchemaType.STRING, description: "Short human-readable time label for display" },
        },
        required: ["label"],
      },
    },
    required: ["assetId", "geo", "dateInfo"],
  },
};

const SYSTEM_PROMPT = `You are an expert archivist analyzing images extracted from document pages.
For each image, you MUST determine its **geographic location** and **temporal context**.

You receive each asset's image alongside its text metadata and the surrounding page text.
Use the images to match each asset with the correct textual context.

INPUT PRIORITY (use all available sources):
1. **ASSET DESCRIPTION & METADATA** — the title, description, category, and metadata fields already attached to each asset.
2. **PAGE TEXT CONTEXT** — extracted text from the same page. Use captions, headings, place names, dates, and historical references near each asset.
3. **VISUAL CUES** — architecture style, landscape, fashion era, visible signage, vegetation, technology visible, artistic style/movement, etc.

RULES — BE GENEROUS, NOT CONSERVATIVE:
- You MUST provide geo and dateInfo for every asset unless it is truly impossible (pure abstract art, generic logos).
- If the exact location is unknown, infer the MOST LIKELY region, country, or city based on all clues (text mentions, architectural style, cultural markers, vegetation, script/language visible, etc.).
- If the exact date is unknown, infer the MOST LIKELY era or century. Historical paintings, engravings, photographs all have identifiable time periods based on style, technique, and subject matter.
- Use city/region center coordinates when exact location is unclear but a place or culture is identifiable.
- For photographs: infer era from technology, fashion, photographic technique (daguerreotype, albumen print, digital, etc.).
- For artwork: infer era from artistic style/movement and medium. Infer location from subject, artist origin, or depicted location.
- For maps: the geographic subject IS the location. The style/technique indicates the era.
- For fictional/fantasy content: use real-world analogs for era; use real-world cultural inspiration for geo if identifiable.
- ONLY return null for geo/dateInfo if the image is a pure abstract shape, a generic icon, or a modern logo with zero geographic/temporal context.
- When in doubt, make your best educated guess — an approximate answer is far better than null.`;

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

  /* ── Load extracted page text (try extractedText first, then formattedText as fallback) ── */
  const pageTextMap = new Map<number, string>();
  const textUrl = manifest.extractedText?.url || manifest.formattedText?.url;
  if (textUrl) {
    try {
      const textRes = await fetch(textUrl);
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
        console.log(`[enrich] Loaded text for ${pageTextMap.size} pages from ${manifest.extractedText?.url ? 'extractedText' : 'formattedText'}`);
      }
    } catch (e) {
      console.warn(`[enrich] Could not load text:`, e instanceof Error ? e.message : e);
    }
  } else {
    console.warn(`[enrich] No extractedText or formattedText URL available — enrichment will rely on images only`);
  }

  /* ── Collect unenriched assets grouped by page, plus page image URLs ── */
  const byPage = new Map<number, PageAsset[]>();
  const pageUrlMap = new Map<number, string>(); // pageNumber -> full page image URL
  let totalUnenriched = 0;

  for (const page of manifest.pages || []) {
    let hasUnenriched = false;
    for (const asset of page.assets || []) {
      if ((asset as Record<string, unknown>)._enriched) continue;
      if (asset.geo || asset.dateInfo) continue;
      const arr = byPage.get(page.pageNumber) || [];
      arr.push(asset);
      byPage.set(page.pageNumber, arr);
      totalUnenriched++;
      hasUnenriched = true;
    }
    if (hasUnenriched) {
      pageUrlMap.set(page.pageNumber, page.url);
    }
  }

  if (totalUnenriched === 0) {
    return NextResponse.json({ ok: true, enriched: 0, total: 0, message: "All assets already enriched", manifestUrl });
  }

  console.log(`[enrich] Found ${totalUnenriched} unenriched assets across ${byPage.size} pages`);

  /* ── Set up Gemini ── */
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
  const BATCH_SIZE = 10; // smaller batches since we're sending images

  /* ── Helper: fetch image as base64 ── */
  async function fetchImage(url: string): Promise<{ data: string; mimeType: string } | null> {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const mimeType = res.headers.get("content-type") || "image/png";
      return { data: buf.toString("base64"), mimeType };
    } catch {
      return null;
    }
  }

  /* ── Process page by page ── */
  for (const [pageNum, assets] of byPage) {
    // Sub-batch within each page
    const subBatches: PageAsset[][] = [];
    for (let i = 0; i < assets.length; i += BATCH_SIZE) {
      subBatches.push(assets.slice(i, i + BATCH_SIZE));
    }

    // Fetch page image once per page
    const pageUrl = pageUrlMap.get(pageNum);
    let pageImagePart: { inlineData: { data: string; mimeType: string } } | null = null;
    if (pageUrl) {
      const img = await fetchImage(pageUrl);
      if (img) {
        pageImagePart = { inlineData: img };
        console.log(`[enrich] Page ${pageNum}: loaded page image (${(img.data.length * 0.75 / 1024).toFixed(0)}KB)`);
      }
    }

    for (const batch of subBatches) {
      // Build multimodal content parts: text + images interleaved
      const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

      // 1. Start with the text context for this page
      let textBlock = `=== PAGE ${pageNum} ===\n`;
      const pageText = pageTextMap.get(pageNum);
      if (pageText) {
        const truncated = pageText.length > 4000 ? pageText.slice(0, 4000) + "\n[...truncated]" : pageText;
        textBlock += `\nEXTRACTED PAGE TEXT:\n${truncated}\n`;
      }
      textBlock += `\nASSETS TO ANALYZE:\n`;
      for (const asset of batch) {
        textBlock += `\n- assetId: "${asset.assetId}"`;
        if (asset.title) textBlock += `\n  title: "${asset.title}"`;
        if (asset.description) textBlock += `\n  description: "${asset.description}"`;
        if (asset.category) textBlock += `\n  category: "${asset.category}"`;
        if (asset.metadata) {
          const metaStr = Object.entries(asset.metadata).map(([k, v]) => `${k}: ${v}`).join("; ");
          if (metaStr) textBlock += `\n  metadata: {${metaStr}}`;
        }
      }
      textBlock += `\n\nBelow are the images. First the full page, then each individual asset image labeled with its assetId.\n`;
      parts.push({ text: textBlock });

      // 2. Full page image (helps Gemini see where assets sit in context)
      if (pageImagePart) {
        parts.push({ text: `[Full page ${pageNum} image:]` });
        parts.push(pageImagePart);
      }

      // 3. Individual asset images
      const assetIds: string[] = [];
      for (const asset of batch) {
        const imageUrl = asset.url; // Always use full-resolution image for enrichment analysis
        const img = await fetchImage(imageUrl);
        if (img) {
          parts.push({ text: `[Asset "${asset.assetId}":]` });
          parts.push({ inlineData: img });
          assetIds.push(asset.assetId);
        } else {
          console.warn(`[enrich] Could not fetch image for ${asset.assetId}`);
          // Still include in text so Gemini can try from text alone
          assetIds.push(asset.assetId);
        }
      }

      if (assetIds.length === 0) continue;

      console.log(`[enrich] Page ${pageNum}: sending ${assetIds.length} assets to Gemini (${parts.length} parts)`);

      try {
        const result = await model.generateContent(parts);
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
            const gotData = !!(enrichment.geo || enrichment.dateInfo);
            if (enrichment.geo) asset.geo = enrichment.geo;
            if (enrichment.dateInfo) asset.dateInfo = enrichment.dateInfo;
            // Only mark _enriched if we actually got data — allows retry otherwise
            if (gotData) {
              (asset as Record<string, unknown>)._enriched = true;
              totalEnriched++;
            }
            break;
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[enrich] Gemini batch error page ${pageNum}:`, msg);
        errors.push(`Page ${pageNum}: ${msg}`);
      }
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
