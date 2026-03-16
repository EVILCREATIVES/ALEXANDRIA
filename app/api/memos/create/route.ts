import { NextResponse } from "next/server";
import { newMemoManifest, saveMemoManifest, type MemoSettings } from "@/app/lib/memos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { settings: MemoSettings };
    
    if (!body.settings?.workType || !body.settings?.pointOfView || !body.settings?.title) {
      return NextResponse.json(
        { ok: false, error: "Missing required settings: workType, pointOfView, title" },
        { status: 400 }
      );
    }
    
    const memoId = crypto.randomUUID();
    const manifest = newMemoManifest(memoId, body.settings);
    const manifestUrl = await saveMemoManifest(manifest);
    
    return NextResponse.json({ ok: true, memoId, manifestUrl });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    );
  }
}
