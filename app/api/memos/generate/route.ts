import { NextRequest } from "next/server";
import { put } from "@vercel/blob";
import {
  fetchMemoManifest,
  saveMemoManifest,
  constructContext,
  formatPrompt,
  runContextEvaluator,
  mergeMemory,
  type StoryVersion,
} from "@/app/lib/memos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLAUDE_AI_KEY = process.env.CLAUDE_AI_KEY || "";

/**
 * Story generation endpoint — implements the Context Engineering Pipeline:
 * 
 * 1. Context Constructor: selects notes + memory, builds prompt
 * 2. Context Updater: streams context to Claude
 * 3. Context Evaluator: validates output, updates memory, saves version
 * 
 * Streams the response back to the client for real-time display.
 */
export async function POST(req: NextRequest) {
  try {
    const { manifestUrl, language } = (await req.json()) as { manifestUrl: string; language?: string };
    if (!manifestUrl) {
      return new Response(JSON.stringify({ error: "Missing manifestUrl" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!CLAUDE_AI_KEY) {
      return new Response(JSON.stringify({ error: "CLAUDE_AI_KEY not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const manifest = await fetchMemoManifest(manifestUrl);

    // Apply language override for this generation if provided
    if (language) {
      manifest.settings.language = language;
    }

    const model = manifest.settings.model || "claude-sonnet-4-6";

    // ── Context Constructor (§V-B1) ──
    const ctx = constructContext(manifest);
    const prompt = formatPrompt(ctx);
    const maxOutputTokens = model.includes("opus") ? 128000 : 64000;

    console.log(`[memos/generate] Model: ${model}`);
    console.log(`[memos/generate] Notes: ${ctx.recentNotes.length}, Memory: ${ctx.relevantMemory.length}`);
    console.log(`[memos/generate] Token estimate: ${ctx.tokenEstimate}`);
    console.log(`[memos/generate] Pending notes: ${manifest.pendingNoteIds?.length || 0}`);

    // ── Context Updater (§V-B2) — Stream to Claude ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function send(data: Record<string, unknown>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }

        try {
          send({ type: "status", message: "Constructing context..." });

          const anthRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": CLAUDE_AI_KEY,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model,
              max_tokens: maxOutputTokens,
              stream: true,
              temperature: 0.7,
              system: ctx.systemPrompt,
              messages: [{ role: "user", content: prompt }],
            }),
          });

          if (!anthRes.ok) {
            const errText = await anthRes.text().catch(() => "unknown");
            send({ type: "error", error: `Claude API error ${anthRes.status}: ${errText.slice(0, 200)}` });
            controller.close();
            return;
          }

          send({ type: "status", message: "Generating story..." });

          // Stream the response
          let fullText = "";
          const reader = anthRes.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const event = JSON.parse(data) as {
                  type: string;
                  delta?: { type?: string; text?: string };
                };

                if (event.type === "content_block_delta" && event.delta?.text) {
                  fullText += event.delta.text;
                  send({ type: "delta", text: event.delta.text });
                }
              } catch {
                // Skip unparseable SSE lines
              }
            }
          }

          if (!fullText.trim()) {
            send({ type: "error", error: "Empty response from Claude" });
            controller.close();
            return;
          }

          // ── Context Evaluator (§V-B3) — extract entities, update memory, save version ──
          send({ type: "status", message: "Analyzing story structure..." });

          // Save story text to blob
          const versionId = crypto.randomUUID();
          const storyBlob = await put(
            `memos/${manifest.memoId}/stories/${versionId}.txt`,
            fullText,
            { access: "public", contentType: "text/plain", addRandomSuffix: false }
          );

          // Create version entry
          const version: StoryVersion = {
            versionId,
            createdAt: new Date().toISOString(),
            storyUrl: storyBlob.url,
            wordCount: fullText.split(/\s+/).length,
            notesIncorporated: manifest.pendingNoteIds || [],
            changelog: `Incorporated ${manifest.pendingNoteIds?.length || 0} new notes. Word count: ${fullText.split(/\s+/).length}`,
          };

          // Update manifest with story
          manifest.storyVersions.push(version);
          manifest.currentStory = fullText;
          manifest.currentStoryUrl = storyBlob.url;
          manifest.lastGeneratedAt = new Date().toISOString();
          const incorporatedNoteIds = manifest.pendingNoteIds || [];
          manifest.pendingNoteIds = []; // Clear pending

          // Run the real Context Evaluator — Claude extracts structured entities
          try {
            const extracted = await runContextEvaluator(
              CLAUDE_AI_KEY,
              fullText,
              ctx.recentNotes,
              manifest.memory,
              model
            );

            if (extracted.length > 0) {
              manifest.memory = mergeMemory(manifest.memory, extracted, incorporatedNoteIds);
              console.log(`[context-evaluator] Extracted ${extracted.length} entities, memory now has ${manifest.memory.length} entries`);
              send({ type: "status", message: `Extracted ${extracted.length} narrative entities` });
            } else {
              console.log("[context-evaluator] No entities extracted");
            }
          } catch (evalErr) {
            // Evaluator failure is non-fatal — story is already saved
            console.error("[context-evaluator] Error (non-fatal):", evalErr);
            send({ type: "status", message: "Memory extraction skipped (non-fatal)" });
          }

          const newManifestUrl = await saveMemoManifest(manifest);

          send({
            type: "complete",
            manifestUrl: newManifestUrl,
            versionId,
            wordCount: version.wordCount,
          });

          controller.close();
        } catch (err) {
          send({ type: "error", error: String(err) });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
