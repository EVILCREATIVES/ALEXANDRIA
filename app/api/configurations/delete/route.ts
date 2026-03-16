import { NextResponse } from "next/server";
import { del, list } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  id?: string;
  type?: "schema" | "tagging" | "ai-rules" | "completeness" | "detection";
};

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const id = String(body.id || "").trim();
  const type = body.type;

  if (!id) {
    return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
  }

  if (!type || !["schema", "tagging", "ai-rules", "completeness", "detection"].includes(type)) {
    return NextResponse.json({ ok: false, error: "Invalid type" }, { status: 400 });
  }

  try {
    const path = `configurations/${type}/${id}.json`;
    const { blobs } = await list({ prefix: path });

    if (blobs.length === 0) {
      return NextResponse.json({ ok: false, error: "Configuration not found" }, { status: 404 });
    }

    await del(blobs[0].url);

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
