import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { del } from "@vercel/blob";
import { PDFDocument } from "pdf-lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 800; // Allow enough time for very large PDFs

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_PDF_MODEL = process.env.GEMINI_PDF_MODEL || "gemini-3-flash-preview";

/** Max pages per Gemini call — keeps output well within token limits */
const PAGES_PER_CHUNK = 30;

/** How many chunks to process in parallel (Gemini rate-limits apply) */
const MAX_CONCURRENT_CHUNKS = 4;

const HEARTBEAT_INTERVAL_MS = 15_000;

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

/**
 * Stream PDF text extraction via Gemini.
 *
 * For PDFs ≤ PAGES_PER_CHUNK pages, sends the entire PDF in one call.
 * For larger PDFs, splits into chunks and processes sequentially,
 * streaming progress back as SSE.
 */
export async function POST(req: Request): Promise<Response> {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { ok: false, error: "GEMINI_API_KEY not configured" },
      { status: 500 }
    );
  }

  let parsedBody: { url?: string; keepBlob?: boolean };
  try {
    parsedBody = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { url: blobUrl, keepBlob } = parsedBody;
  if (!blobUrl) {
    return NextResponse.json(
      { ok: false, error: "No blob URL provided" },
      { status: 400 }
    );
  }

  // Fetch PDF from Vercel Blob
  const blobRes = await fetch(blobUrl);
  if (!blobRes.ok) {
    return NextResponse.json(
      { ok: false, error: `Failed to fetch PDF from blob: ${blobRes.status}` },
      { status: 500 }
    );
  }

  const arrayBuffer = await blobRes.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);

  // Get page count
  let totalPages: number;
  try {
    const doc = await PDFDocument.load(pdfBytes);
    totalPages = doc.getPageCount();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Failed to read PDF: ${e instanceof Error ? e.message : String(e)}` },
      { status: 400 }
    );
  }

  // Stream SSE back to keep the connection alive
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Heartbeat keeps the connection alive during long chunk processing
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, HEARTBEAT_INTERVAL_MS);

      try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({
          model: GEMINI_PDF_MODEL,
          generationConfig: { maxOutputTokens: 65536 },
        });

        // Tell the client how many pages we're processing
        send({ type: "info", totalPages });

        let fullText = "";

        if (totalPages <= PAGES_PER_CHUNK) {
          // Small PDF — single streaming call
          const b64 = Buffer.from(pdfBytes).toString("base64");
          const streamResult = await model.generateContentStream([
            buildPrompt(1, totalPages),
            { inlineData: { mimeType: "application/pdf", data: b64 } },
          ]);

          for await (const chunk of streamResult.stream) {
            const text = chunk.text();
            if (text) {
              fullText += text;
              send({ type: "chunk", text });
            }
          }
        } else {
          // Large PDF — build chunk definitions first
          const chunks: { start: number; end: number; index: number }[] = [];
          for (let start = 0; start < totalPages; start += PAGES_PER_CHUNK) {
            const end = Math.min(start + PAGES_PER_CHUNK, totalPages);
            chunks.push({ start, end, index: chunks.length });
          }

          // Pre-slice all chunks so we can parallelize Gemini calls
          send({ type: "progress", message: `Splitting ${totalPages}-page PDF into ${chunks.length} chunks...` });
          const chunkSlices: Uint8Array[] = [];
          for (const c of chunks) {
            chunkSlices.push(await slicePdf(pdfBytes, c.start, c.end));
          }

          // Results array (ordered by chunk index)
          const chunkResults: string[] = new Array(chunks.length).fill("");
          let completedChunks = 0;

          // Process chunks with bounded concurrency
          const queue = [...chunks];
          async function processNext(): Promise<void> {
            while (queue.length > 0) {
              const c = queue.shift()!;
              const chunkLabel = `pages ${c.start + 1}–${c.end} of ${totalPages}`;
              send({ type: "progress", message: `Extracting ${chunkLabel} (${completedChunks}/${chunks.length} done)...` });
              console.log(`[extract-pdf] Processing ${chunkLabel}`);

              const b64 = Buffer.from(chunkSlices[c.index]).toString("base64");

              // Use non-streaming for parallel chunks (simpler, avoids interleaved output)
              const result = await model.generateContent([
                buildPrompt(c.start + 1, c.end),
                { inlineData: { mimeType: "application/pdf", data: b64 } },
              ]);

              const text = result.response.text()?.trim() || "";
              chunkResults[c.index] = text;
              completedChunks++;

              // Send chunk text to client for page counting
              if (text) {
                send({ type: "chunk", text: `\n${text}\n` });
              }
              send({ type: "progress", message: `Completed ${chunkLabel} (${completedChunks}/${chunks.length} done)` });
            }
          }

          // Launch concurrent workers
          const workers = Array.from(
            { length: Math.min(MAX_CONCURRENT_CHUNKS, chunks.length) },
            () => processNext()
          );
          await Promise.all(workers);

          // Assemble in order
          fullText = chunkResults.filter(Boolean).join("\n\n");
        }

        if (!fullText.trim()) {
          fullText = "[No text could be extracted from this document]";
        }

        send({ type: "done", text: fullText });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[extract-pdf] Error:", msg);
        send({ type: "error", error: msg });
      } finally {
        clearInterval(heartbeat);
        // Clean up temporary blobs unless caller asks to keep it
        if (blobUrl && keepBlob !== true) {
          try { await del(blobUrl); } catch { /* ignore */ }
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
