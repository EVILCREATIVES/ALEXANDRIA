import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI, SchemaType, type Schema } from "@google/generative-ai";
import { fetchManifestDirect, saveManifest, type ProjectManifest, type PageAsset } from "@/app/lib/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const MODEL = process.env.GEMINI_ENRICH_MODEL || "gemini-3.1-flash-lite-preview";
const FETCH_TIMEOUT_MS = 15000;

/* ── Structured output schema ── */

const enrichSchema: Schema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      assetId: { type: SchemaType.STRING, description: "The assetId being enriched" },
      geo: {
        type: SchemaType.OBJECT,
        description: "Geographic location. null if cannot be determined.",
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
        description: "Temporal context. null if cannot be determined.",
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

const SYSTEM_PROMPT = `You are an expert archivist analyzing images extracted from document pages.
For each image, determine its **geographic location** and **temporal context**.

You receive each asset's image alongside its text metadata and the surrounding page text.
Use the images to match each asset with the correct textual context.

PRIORITY ORDER for deriving geo/date:
1. **ASSET DESCRIPTION & METADATA** (highest priority) — the title, description, category, and metadata fields already attached to each asset. These were assigned during detection and are the most direct source.
2. **PAGE TEXT CONTEXT** — extracted text from the same page. Use captions, headings, place names, dates, and historical references near each asset.
3. **VISUAL CUES** (supporting) — use the image itself to confirm or supplement what the text says (architecture style, landscape, fashion era, visible signage, etc.). Do NOT rely on visual analysis alone when text is available.

RULES:
- Set geo to null if no location can be determined.
- Set dateInfo to null if no time period can be determined.
- Be conservative — only assign when evidence supports it.
- Use city/region center coordinates when exact location is unclear but a place is named.
- For fictional/fantasy content: use real-world analogs for era, leave geo null unless a real location is referenced.
- For logos, diagrams, or abstract images: set both null unless text context provides information.`;

interface EnrichRequest {
  projectId: string;
  manifestUrl: string;
  pageNumbers?: number[];
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
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
  const requestedPages = Array.isArray(body.pageNumbers)
    ? body.pageNumbers.filter((n) => Number.isFinite(n)).map((n) => Number(n))
    : [];
  const pageFilter = requestedPages.length > 0 ? new Set<number>(requestedPages) : null;
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

  /* ── Collect unenriched assets grouped by page, plus page image URLs ── */
  const byPage = new Map<number, PageAsset[]>();
  const pageUrlMap = new Map<number, string>(); // pageNumber -> full page image URL
  let totalUnenriched = 0;

  for (const page of manifest.pages || []) {
    if (pageFilter && !pageFilter.has(page.pageNumber)) continue;
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
    return NextResponse.json({ ok: true, enriched: 0, message: "All assets already enriched" });
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

  console.log(`[enrich] Using model: ${MODEL}`);

  let totalEnriched = 0;
  const errors: string[] = [];
  const BATCH_SIZE = 10; // smaller batches since we're sending images
  const assetById = new Map<string, PageAsset>();
  for (const page of manifest.pages || []) {
    for (const asset of page.assets || []) {
      assetById.set(asset.assetId, asset);
    }
  }

  /* ── Helper: fetch image as base64 ── */
  async function fetchImage(url: string): Promise<{ data: string; mimeType: string } | null> {
    try {
      const res = await fetchWithTimeout(url, { cache: "no-store" });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const mimeType = res.headers.get("content-type") || "image/png";
      return { data: buf.toString("base64"), mimeType };
    } catch {
      return null;
    }
  }

  /* ── Process page by page ── */
  const pagesInRun = [...byPage.entries()].sort((a, b) => a[0] - b[0]);
  for (const [pageNum, assets] of pagesInRun) {
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
        if (asset.metadata && typeof asset.metadata === "object") {
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
        const imageUrl = asset.thumbnailUrl || asset.url;
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
          const asset = assetById.get(enrichment.assetId);
          if (!asset) continue;
          const gotData = !!(enrichment.geo || enrichment.dateInfo);
          if (enrichment.geo) asset.geo = enrichment.geo;
          if (enrichment.dateInfo) asset.dateInfo = enrichment.dateInfo;
          // Only mark _enriched if we actually got data — allows retry otherwise
          if (gotData) {
            (asset as Record<string, unknown>)._enriched = true;
            totalEnriched++;
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
