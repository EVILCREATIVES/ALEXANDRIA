import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { fetchManifestDirect, saveManifest } from "@/app/lib/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  projectId?: string;
  manifestUrl?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const projectId = body.projectId;
    const manifestUrl = body.manifestUrl;

    if (!projectId || !manifestUrl) {
      return NextResponse.json({ ok: false, error: "Missing projectId or manifestUrl" }, { status: 400 });
    }

    // Fetch manifest
    const manifest = await fetchManifestDirect(manifestUrl);

    // Delete formatted text blob if it exists
    if (manifest.formattedText?.url) {
      try {
        await del(manifest.formattedText.url);
      } catch (delErr) {
        console.error("Failed to delete formatted text blob:", delErr);
        // Continue anyway - the blob may already be gone
      }
    }

    // Remove formattedText from manifest
    delete manifest.formattedText;

    // Save updated manifest
    const newManifestUrl = await saveManifest(manifest);

    return NextResponse.json({ ok: true, manifestUrl: newManifestUrl });
  } catch (err) {
    console.error("Error clearing formatted text:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
