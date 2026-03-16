import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { fetchManifestDirect, saveManifest } from "@/app/lib/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  projectId?: string;
  manifestUrl?: string;
  text?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;
    const text = String(body.text || "");
    const projectId = body.projectId;
    const manifestUrl = body.manifestUrl;

    if (!projectId || !manifestUrl) {
      return NextResponse.json({ ok: false, error: "Missing projectId or manifestUrl" }, { status: 400 });
    }

    // Save formatted text to blob
    const formattedBlob = await put(
      `projects/${projectId}/formatted-text.txt`,
      text,
      { access: "public", contentType: "text/plain", addRandomSuffix: false }
    );

    // Update manifest with formatted text URL
    const manifest = await fetchManifestDirect(manifestUrl);
    manifest.formattedText = { url: formattedBlob.url };
    const newManifestUrl = await saveManifest(manifest);

    return NextResponse.json({ ok: true, manifestUrl: newManifestUrl });
  } catch (err) {
    console.error("save-formatted-text error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
