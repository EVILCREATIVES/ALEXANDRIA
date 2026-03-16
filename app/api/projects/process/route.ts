import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { saveManifest, fetchManifestDirect } from "@/app/lib/manifest";
import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { PDFDocument } from "pdf-lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for processing

type Body = {
  projectId?: string;
  manifestUrl?: string;
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_DETECT_MODEL = process.env.GEMINI_DETECT_MODEL || "gemini-2.0-flash";

/** Max pages per Gemini call — keeps output well within token limits */
const PAGES_PER_CHUNK = 20;

function baseUrl(u: string) {
  const url = new URL(u);
  return `${url.origin}${url.pathname}`;
}

// Fetch PDF as Uint8Array
async function fetchPdfBytes(pdfUrl: string): Promise<Uint8Array> {
  const url = baseUrl(pdfUrl);
  const res = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Cannot fetch PDF (${res.status})`);
  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}

/**
 * Build the extraction prompt for a page range
 */
function buildPrompt(startPage: number, endPage: number): string {
  return `Extract ALL text from this PDF document (pages ${startPage} to ${endPage}).

For each page, output:
--- Page X ---
[extracted text from that page]

Preserve:
- Headers and titles
- Bullet points and lists  
- Paragraph structure
- Any captions or labels

Do NOT add any commentary or explanations. Just return the extracted text with page markers.
If a page has no text, write "[No text on this page]" for that page.`;
}

/**
 * Extract text from a single PDF chunk via Gemini
 */
async function extractChunk(
  model: GenerativeModel,
  pdfBytes: Uint8Array,
  startPage: number,
  endPage: number
): Promise<string> {
  const b64 = Buffer.from(pdfBytes).toString("base64");
  const prompt = buildPrompt(startPage, endPage);

  const result = await model.generateContent([
    prompt,
    { inlineData: { mimeType: "application/pdf", data: b64 } },
  ]);

  try {
    return result.response.text()?.trim() || "";
  } catch {
    return "";
  }
}

/**
 * Split a PDF into a chunk containing only the specified page range.
 */
async function slicePdf(
  srcBytes: Uint8Array,
  fromPage: number,   // 0-based inclusive
  toPage: number       // 0-based exclusive
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(srcBytes);
  const destDoc = await PDFDocument.create();
  const indices = Array.from({ length: toPage - fromPage }, (_, i) => fromPage + i);
  const copied = await destDoc.copyPages(srcDoc, indices);
  for (const page of copied) destDoc.addPage(page);
  return destDoc.save();
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as Body;

    const projectId = String(body.projectId || "").trim();
    const manifestUrl = String(body.manifestUrl || "").trim();

    if (!projectId || !manifestUrl) {
      return NextResponse.json({ ok: false, error: "Missing projectId/manifestUrl" }, { status: 400 });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ ok: false, error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const manifest = await fetchManifestDirect(manifestUrl);

    if (manifest.projectId !== projectId) {
      return NextResponse.json({ ok: false, error: "projectId does not match manifest" }, { status: 400 });
    }

    // Check for source PDF
    const pdfUrl = manifest.sourcePdf?.url;
    if (!pdfUrl) {
      return NextResponse.json({ ok: false, error: "No source PDF found. Upload a PDF first." }, { status: 400 });
    }

    // Fetch PDF bytes
    const pdfBytes = await fetchPdfBytes(pdfUrl);

    // Get page count
    const srcDoc = await PDFDocument.load(pdfBytes);
    const totalPages = srcDoc.getPageCount();

    // Initialize Gemini
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: GEMINI_DETECT_MODEL,
      generationConfig: { maxOutputTokens: 8192 },
    });

    let fullText = "";

    if (totalPages <= PAGES_PER_CHUNK) {
      // Small PDF — single call
      fullText = await extractChunk(model, pdfBytes, 1, totalPages);
    } else {
      // Large PDF — split into chunks and process sequentially
      const parts: string[] = [];
      for (let start = 0; start < totalPages; start += PAGES_PER_CHUNK) {
        const end = Math.min(start + PAGES_PER_CHUNK, totalPages);
        const chunkBytes = await slicePdf(pdfBytes, start, end);
        console.log(`[process] Processing pages ${start + 1}–${end} of ${totalPages}`);
        const chunkText = await extractChunk(model, chunkBytes, start + 1, end);
        if (chunkText) parts.push(chunkText);
      }
      fullText = parts.join("\n\n");
    }

    // Ensure we have something to store (Vercel Blob requires non-empty body)
    if (!fullText) {
      fullText = "[No text could be extracted from this document]";
    }

    // Store extracted text
    const textBlob = await put(`projects/${projectId}/extracted/text.txt`, fullText, {
      access: "public",
      contentType: "text/plain; charset=utf-8",
      addRandomSuffix: false
    });

    // Update manifest
    const latest = await fetchManifestDirect(manifestUrl);
    if (latest.projectId !== projectId) {
      return NextResponse.json({ ok: false, error: "projectId does not match manifest on re-fetch" }, { status: 400 });
    }

    latest.extractedText = { url: textBlob.url };
    latest.status = "processed";

    const newManifestUrl = await saveManifest(latest);

    return NextResponse.json({ ok: true, manifestUrl: newManifestUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
