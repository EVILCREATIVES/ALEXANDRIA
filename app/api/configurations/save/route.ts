import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  name?: string;
  type?: "schema" | "tagging" | "ai-rules" | "completeness" | "detection";
  content?: string;
  id?: string; // If provided, update existing; otherwise create new
};

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const name = String(body.name || "").trim();
  const type = body.type;
  const content = body.content;
  const existingId = body.id?.trim();

  if (!name) {
    return NextResponse.json({ ok: false, error: "Missing name" }, { status: 400 });
  }

  if (!type || !["schema", "tagging", "ai-rules", "completeness", "detection"].includes(type)) {
    return NextResponse.json({ ok: false, error: "Invalid type" }, { status: 400 });
  }

  if (typeof content !== "string") {
    return NextResponse.json({ ok: false, error: "Missing content" }, { status: 400 });
  }

  // Validate JSON for non-ai-rules types
  if (type !== "ai-rules" && content.trim()) {
    try {
      JSON.parse(content);
    } catch {
      return NextResponse.json({ ok: false, error: "Content is not valid JSON" }, { status: 400 });
    }
  }

  try {
    const now = new Date().toISOString();
    const id = existingId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const configData = {
      id,
      name,
      type,
      content,
      createdAt: existingId ? undefined : now, // Will be preserved from existing if updating
      updatedAt: now
    };

    // If updating, try to preserve createdAt
    if (existingId) {
      try {
        const { blobs } = await import("@vercel/blob").then(m => m.list({ prefix: `configurations/${type}/${existingId}.json` }));
        if (blobs.length > 0) {
          const existingRes = await fetch(blobs[0].url);
          if (existingRes.ok) {
            const existing = await existingRes.json() as { createdAt?: string };
            if (existing.createdAt) {
              configData.createdAt = existing.createdAt;
            }
          }
        }
      } catch {
        // Ignore errors, just use current time
      }
    }

    if (!configData.createdAt) {
      configData.createdAt = now;
    }

    const blob = await put(`configurations/${type}/${id}.json`, JSON.stringify(configData, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false
    });

    return NextResponse.json({
      ok: true,
      configuration: {
        id,
        name,
        type,
        createdAt: configData.createdAt,
        updatedAt: now,
        url: blob.url
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
