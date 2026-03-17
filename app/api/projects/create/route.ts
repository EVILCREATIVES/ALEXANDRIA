import { NextResponse } from "next/server";
import { newManifest, saveManifest } from "@/app/lib/manifest";

export async function POST(req: Request) {
  try {
    let displayName: string | undefined;
    try {
      const body = (await req.json()) as { displayName?: string };
      const candidate = String(body?.displayName || "").trim();
      if (candidate) displayName = candidate;
    } catch {
      // Request body is optional for backward compatibility
    }

    const projectId = crypto.randomUUID();
    const manifest = newManifest(projectId);
    if (displayName) {
      manifest.displayName = displayName;
    }
    const manifestUrl = await saveManifest(manifest);
    return NextResponse.json({ ok: true, projectId, manifestUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Create project error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
