import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

type Message = { role: "user" | "assistant"; content: string };

type Body = {
  messages: Message[];
  provider: "gemini" | "claude";
  sourceTextUrl?: string;
  projectContext?: string; // short summary: project name, page count, asset count
};

const SYSTEM_PROMPT = `You are a concise research assistant for the ALEXANDRIA archival platform. You help users understand, explore and discuss the contents of their uploaded source document.

RULES:
- Keep answers short and direct — 2-4 sentences unless the user asks for detail
- Your primary source of truth is the DOCUMENT TEXT provided below. Always ground answers in it.
- You may supplement with general world knowledge (history, culture, geography) when it adds useful context, but always distinguish between what the document says and what you're adding
- If something is not in the document, say so clearly
- Never invent quotes or facts that aren't in the document
- Use plain language; avoid filler phrases like "Certainly!" or "Great question!"

DOCUMENT TEXT:
`;

async function fetchSourceText(url: string): Promise<string> {
  if (!url) return "";
  try {
    const r = await fetch(url);
    if (!r.ok) return "";
    const text = await r.text();
    // Truncate to ~120k chars to stay within context limits
    return text.slice(0, 120_000);
  } catch {
    return "";
  }
}

function buildSystemPrompt(sourceText: string, projectContext?: string): string {
  let sys = SYSTEM_PROMPT;
  if (sourceText) {
    sys += sourceText;
  } else {
    sys += "(No document text available yet. The user may not have processed the source yet.)";
  }
  if (projectContext) {
    sys += `\n\nPROJECT INFO: ${projectContext}`;
  }
  return sys;
}

async function streamGemini(messages: Message[], systemPrompt: string): Promise<ReadableStream> {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-preview",
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  });

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === "user" ? "user" : ("model" as const),
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({
    history: [
      { role: "user", parts: [{ text: "System context: " + systemPrompt }] },
      { role: "model", parts: [{ text: "Understood. I'll answer concisely based on the document." }] },
      ...history,
    ],
  });

  const lastMessage = messages[messages.length - 1];
  const result = await chat.sendMessageStream(lastMessage.content);

  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of result.stream) {
          const text = chunk.text();
          if (text) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: text })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
        controller.close();
      }
    },
  });
}

async function streamClaude(messages: Message[], systemPrompt: string): Promise<ReadableStream> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        const stream = anthropic.messages.stream({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2048,
          temperature: 0.3,
          system: systemPrompt,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        });

        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: event.delta.text })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
        controller.close();
      }
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const { messages, provider, sourceTextUrl, projectContext } = body;

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages" }), { status: 400 });
    }

    const sourceText = await fetchSourceText(sourceTextUrl || "");
    const systemPrompt = buildSystemPrompt(sourceText, projectContext);

    const stream = provider === "claude"
      ? await streamClaude(messages, systemPrompt)
      : await streamGemini(messages, systemPrompt);

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500 });
  }
}
