import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

/**
 * Transcribe audio using Gemini's multimodal capabilities.
 * Accepts audio as base64 in the request body.
 */
export async function POST(req: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ ok: false, error: "GEMINI_API_KEY not configured" }, { status: 500 });
    }

    const { audioBase64, mimeType } = (await req.json()) as {
      audioBase64: string;
      mimeType: string;
    };

    if (!audioBase64 || !mimeType) {
      return NextResponse.json(
        { ok: false, error: "Missing audioBase64 or mimeType" },
        { status: 400 }
      );
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      },
    });

    const response = await model.generateContent({
      contents: [{
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: audioBase64,
            },
          },
          {
            text: "Transcribe this audio recording verbatim. Output ONLY the transcription text, nothing else. If you cannot understand parts, use [...] to indicate unclear sections.",
          },
        ],
      }],
    });

    const text = response.response.text().trim();

    return NextResponse.json({ ok: true, transcript: text });
  } catch (err) {
    console.error("[memos/transcribe] Error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
