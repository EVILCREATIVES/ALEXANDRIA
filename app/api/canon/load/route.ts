import { NextResponse } from "next/server";
import { fetchCanonManifest } from "@/app/lib/canon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { manifestUrl } = (await req.json()) as { manifestUrl: string };
    if (!manifestUrl) {
      return NextResponse.json({ ok: false, error: "Missing manifestUrl" }, { status: 400 });
    }
    const manifest = await fetchCanonManifest(manifestUrl);
    return NextResponse.json({ ok: true, manifest });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
