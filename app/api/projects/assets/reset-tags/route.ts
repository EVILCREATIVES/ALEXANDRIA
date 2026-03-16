import { NextResponse } from "next/server";
import { saveManifest, fetchManifestDirect } from "@/app/lib/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  projectId?: string;
  manifestUrl?: string;
};

/**
 * Reset/clear all tags from all assets in a project.
 * This removes:
 * - tags array
 * - negativeTags array  
 * - trigger string
 * - tagRationale string
 * But preserves the assets themselves (images).
 */
export async function POST(req: Request): Promise<Response> {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const projectId = (body.projectId || "").trim();
    const manifestUrl = (body.manifestUrl || "").trim();

    if (!projectId || !manifestUrl) {
      return NextResponse.json(
        { ok: false, error: "Missing projectId or manifestUrl" },
        { status: 400 }
      );
    }

    // Fetch current manifest
    const manifest = await fetchManifestDirect(manifestUrl);
    if (manifest.projectId !== projectId) {
      return NextResponse.json(
        { ok: false, error: "projectId does not match manifest" },
        { status: 400 }
      );
    }

    // Clear tags from all assets
    let assetsCleared = 0;

    if (Array.isArray(manifest.pages)) {
      for (const page of manifest.pages) {
        if (Array.isArray(page.assets)) {
          for (const asset of page.assets) {
            // Check if asset has any tagging data
            const hadTags = 
              (Array.isArray(asset.tags) && asset.tags.length > 0) ||
              (Array.isArray(asset.negativeTags) && asset.negativeTags.length > 0) ||
              asset.trigger ||
              asset.tagRationale;

            if (hadTags) {
              // Clear all tag-related fields
              delete asset.tags;
              delete asset.negativeTags;
              delete asset.trigger;
              delete asset.tagRationale;
              assetsCleared++;
            }
          }
        }
      }
    }

    // Add debug log entry
    if (!Array.isArray(manifest.debugLog)) manifest.debugLog = [];
    const timestamp = new Date().toISOString();
    manifest.debugLog.unshift(
      `[${timestamp}] RESET-TAGS: Cleared tags from ${assetsCleared} assets.`
    );
    // Keep log size manageable
    if (manifest.debugLog.length > 50) manifest.debugLog = manifest.debugLog.slice(0, 50);

    // Save updated manifest
    const newManifestUrl = await saveManifest(manifest);

    return NextResponse.json({
      ok: true,
      manifestUrl: newManifestUrl,
      assetsCleared
    });
  } catch (e) {
    console.error("reset-tags error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
