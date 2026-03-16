import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { fetchMemoManifest} from "@/app/lib/memos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

/**
 * Scribe — AI creative assistant powered by Gemini.
 * Streams responses via SSE so the UI can render incrementally.
 *
 * Accepts: { manifestUrl, messages: Array<{role, content}> }
 * The manifest provides full project context (settings, notes, memory, story).
 */
export async function POST(req: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { manifestUrl, messages } = (await req.json()) as {
      manifestUrl: string;
      messages: Array<{ role: "user" | "assistant"; content: string }>;
    };

    if (!manifestUrl || !messages?.length) {
      return new Response(JSON.stringify({ error: "Missing manifestUrl or messages" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const manifest = await fetchMemoManifest(manifestUrl);
    const { settings, notes, memory, currentStory } = manifest;

    // ── Build project context for the system instruction ──
    const noteSummaries = notes
      .slice(-30) // most recent 30 notes
      .map((n) => `[${n.date}] (${n.type}) ${n.content.slice(0, 300)}${n.content.length > 300 ? "…" : ""}`)
      .join("\n");

    const memoryEntries = memory
      .slice(0, 20)
      .map((m) => `[${m.type}] ${m.label}: ${m.content.slice(0, 200)}`)
      .join("\n");

    const storyExcerpt = currentStory
      ? currentStory.slice(0, 6000) + (currentStory.length > 6000 ? "\n…[truncated]" : "")
      : "(No story written yet)";

    const systemInstruction = `You are SCRIBE — a brilliant, knowledgeable creative assistant embedded in a storytelling tool called Memos. You are the creator's trusted companion: part literary advisor, part historian, part muse.

YOUR ROLE:
- Answer questions about the creator's project, characters, world, plot, and lore
- Tell stories, histories, and legends set in the project's world when asked
- Answer real-world questions: history, geography, science, culture, current events, mythology, religion — anything a creator might need for research or inspiration
- Suggest grammar fixes, rephrasings, and prose improvements when shown text
- Brainstorm ideas, explore "what if" scenarios, and provide creative inspiration
- Explain narrative techniques, genre conventions, and writing craft
- Be warm, encouraging, and intellectually curious — like a well-read writing partner who also happens to be a walking encyclopedia

PROJECT CONTEXT:
Title: "${settings.title}"
Type: ${settings.workType} | POV: ${settings.pointOfView}
${settings.authorName ? `Author: ${settings.authorName}` : ""}
${settings.genre ? `Genre: ${settings.genre}` : ""}
${settings.tone ? `Tone: ${settings.tone}` : ""}
${settings.language && settings.language !== "English" ? `Language preference: ${settings.language}` : ""}

ESTABLISHED LORE & MEMORY:
${memoryEntries || "(No memory entries yet)"}

RECENT NOTES (source material):
${noteSummaries || "(No notes yet)"}

CURRENT STORY STATE:
${storyExcerpt}

GUIDELINES:
- Stay consistent with the established world, characters, and tone.
- When the creator asks about their own world or characters, draw from the memory and notes above.
- When the creator asks about real-world history, science, culture, events, or any general knowledge topic, answer thoroughly and accurately — creators often research for their stories.
- When inventing lore or backstory, mark it as a suggestion the creator can accept or reject.
- For grammar/style questions, provide the corrected version and briefly explain why.
- Keep responses focused and useful. You can be creative but never rambling.
- If asked to write a passage, match the project's POV, tone, and style.
- Use the project's language preference when responding, unless the user writes in a different language.`;

    // ── Initialize Gemini ──
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction,
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 8192,
      },
    });

    // ── Build conversation history for Gemini ──
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const lastMessage = messages[messages.length - 1].content;

    const chat = model.startChat({ history });

    // ── Stream response via SSE ──
    const result = await chat.sendMessageStream(lastMessage);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ type: "delta", text })}\n\n`)
              );
            }
          }
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Scribe error";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`)
          );
        } finally {
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
    console.error("[scribe] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
