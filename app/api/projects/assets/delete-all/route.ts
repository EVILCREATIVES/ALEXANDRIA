import { NextResponse } from "next/server";
import { del, list } from "@vercel/blob";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { saveManifest, fetchManifestDirect, type ProjectManifest } from "@/app/lib/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for deleting many blobs

type Body = {
  projectId?: string;
  manifestUrl?: string;
};

type ListResult = {
  blobs: Array<{ url: string; pathname?: string }>;
  cursor?: string | null;
};

/**
 * Delete ALL assets from a project and reset the manifest to allow fresh extraction.
 * This deletes:
 * - All asset blobs (cropped images) from storage
 * - All thumbnail blobs from storage
 * - All asset references from the manifest
 * - All deletedAssetIds tombstones (to allow re-extraction)
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

    const urlsToDelete: string[] = [];

    // 1) Collect all asset URLs from manifest (main images + thumbnails)
    if (Array.isArray(manifest.pages)) {
      for (const page of manifest.pages) {
        if (Array.isArray(page.assets)) {
          for (const asset of page.assets) {
            if (asset.url) urlsToDelete.push(asset.url);
            if (asset.thumbnailUrl) urlsToDelete.push(asset.thumbnailUrl);
          }
        }
      }
    }

    // 2) Also scan the blob storage for any orphaned assets under the assets folder
    // This catches any blobs that might not be in the manifest
    const prefix = `projects/${projectId}/assets/`;

    let cursor: string | undefined = undefined;
    for (;;) {
      const page = (await list({ prefix, limit: 1000, cursor })) as unknown as ListResult;

      for (const b of page.blobs) {
        if (typeof b.url === "string" && b.url) {
          urlsToDelete.push(b.url);
        }
      }

      const next = page.cursor ?? undefined;
      cursor = typeof next === "string" && next.length > 0 ? next : undefined;
      if (!cursor) break;
    }

    // De-dupe URLs before delete
    const uniqUrls = Array.from(new Set(urlsToDelete));
    
    // Delete in batches (Vercel Blob del can handle arrays)
    if (uniqUrls.length > 0) {
      // Delete in chunks of 100 to avoid potential limits
      const chunkSize = 100;
      for (let i = 0; i < uniqUrls.length; i += chunkSize) {
        const chunk = uniqUrls.slice(i, i + chunkSize);
        await del(chunk);
      }
    }

    // 3) Re-fetch latest manifest to avoid race conditions
    const latest = await fetchManifestDirect(manifestUrl);
    if (latest.projectId !== projectId) {
      throw new Error("projectId does not match manifest on re-fetch");
    }

    // 4) Clear all assets and tombstones from manifest
    let pagesCleared = 0;
    let assetsCleared = 0;
    let tombstonesCleared = 0;

    if (Array.isArray(latest.pages)) {
      for (const page of latest.pages) {
        if (Array.isArray(page.assets) && page.assets.length > 0) {
          assetsCleared += page.assets.length;
          page.assets = [];
          pagesCleared++;
        }
        if (Array.isArray(page.deletedAssetIds) && page.deletedAssetIds.length > 0) {
          tombstonesCleared += page.deletedAssetIds.length;
          page.deletedAssetIds = [];
        }
      }
    }

    // Add debug log entry
    if (!Array.isArray(latest.debugLog)) latest.debugLog = [];
    const timestamp = new Date().toISOString();
    latest.debugLog.unshift(
      `[${timestamp}] DELETE-ALL: Removed ${uniqUrls.length} blobs, cleared ${assetsCleared} assets from ${pagesCleared} pages, cleared ${tombstonesCleared} tombstones.`
    );
    // Keep log size manageable
    if (latest.debugLog.length > 50) latest.debugLog = latest.debugLog.slice(0, 50);

    // 5) Save updated manifest
    const newManifestUrl = await saveManifest(latest);

    return NextResponse.json({
      ok: true,
      manifestUrl: newManifestUrl,
      deletedBlobCount: uniqUrls.length,
      assetsCleared,
      pagesCleared,
      tombstonesCleared
    });
  } catch (e) {
    console.error("delete-all error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
