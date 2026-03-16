import { NextResponse } from "next/server";
import { newCanonManifest, saveCanonManifest } from "@/app/lib/canon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { title, linkedProjectId, linkedMemoId } = (await req.json()) as {
      title: string;
      linkedProjectId?: string;
      linkedMemoId?: string;
    };

    if (!title?.trim()) {
      return NextResponse.json({ ok: false, error: "Missing title" }, { status: 400 });
    }

    const canonId = crypto.randomUUID();
    const manifest = newCanonManifest(canonId, title.trim());
    if (linkedProjectId) manifest.linkedProjectId = linkedProjectId;
    if (linkedMemoId) manifest.linkedMemoId = linkedMemoId;

    const manifestUrl = await saveCanonManifest(manifest);
    return NextResponse.json({ ok: true, canonId, manifestUrl });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
