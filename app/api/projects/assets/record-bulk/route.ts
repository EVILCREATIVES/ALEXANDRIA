import { NextResponse } from "next/server";
import { saveManifest, fetchManifestDirect, type PageAsset, type AssetBBox } from "@/app/lib/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  projectId?: string;
  manifestUrl?: string;
  pageNumber?: number;
  assets?: Array<{
    assetId: string;
    url: string;
    bbox: AssetBBox;
    tags?: string[];
    title?: string;
    description?: string;
    category?: string;
  }>;
};

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as Body;

    const projectId = (body.projectId || "").trim();
    const manifestUrl = (body.manifestUrl || "").trim();
    const pageNumber = Number(body.pageNumber);
    const incoming = Array.isArray(body.assets) ? body.assets : [];

    if (!projectId || !manifestUrl || !Number.isFinite(pageNumber)) {
      return NextResponse.json(
        { ok: false, error: "Missing projectId/manifestUrl/pageNumber" },
        { status: 400 }
      );
    }

    if (incoming.length === 0) {
      return NextResponse.json({ ok: true, manifestUrl }, { status: 200 });
    }

    // Debug: log what we're receiving
    console.log(`[record-bulk] Page ${pageNumber}: Receiving ${incoming.length} assets`);
    for (const a of incoming) {
      console.log(`[record-bulk]   ${a.assetId}: title="${a.title}", desc="${a.description?.slice(0,30)}...", cat="${a.category}"`);
    }

    // Validate shape (no silent junk)
    for (const a of incoming) {
      if (!a || typeof a.assetId !== "string" || typeof a.url !== "string") {
        return NextResponse.json({ ok: false, error: "Invalid assets[] payload" }, { status: 400 });
      }
      const b = a.bbox;
      if (
        !b ||
        !Number.isFinite(b.x) ||
        !Number.isFinite(b.y) ||
        !Number.isFinite(b.w) ||
        !Number.isFinite(b.h)
      ) {
        return NextResponse.json({ ok: false, error: "Invalid bbox in assets[]" }, { status: 400 });
      }
    }

    // Re-fetch latest manifest before saving to avoid resurrecting deleted assets
    const latest = await fetchManifestDirect(manifestUrl);
    if (latest.projectId !== projectId) {
      return NextResponse.json({ ok: false, error: "projectId does not match manifest" }, { status: 400 });
    }
    if (!Array.isArray(latest.pages)) latest.pages = [];
    const page = latest.pages.find((p) => p.pageNumber === pageNumber);
    if (!page) {
      return NextResponse.json({ ok: false, error: `Page ${pageNumber} not found in manifest.pages` }, { status: 400 });
    }
    const deleted = new Set<string>(Array.isArray(page.deletedAssetIds) ? page.deletedAssetIds : []);
    const existing = Array.isArray(page.assets) ? page.assets : [];
    const byId = new Map<string, PageAsset>();
    for (const e of existing) byId.set(e.assetId, e);
    for (const a of incoming) {
      // Respect tombstones: never resurrect a deleted assetId.
      if (deleted.has(a.assetId)) continue;
      const merged: PageAsset = {
        assetId: a.assetId,
        url: a.url,
        bbox: a.bbox,
        tags: Array.isArray(a.tags) ? a.tags : byId.get(a.assetId)?.tags,
        title: a.title || byId.get(a.assetId)?.title,
        description: a.description || byId.get(a.assetId)?.description,
        category: a.category || byId.get(a.assetId)?.category
      };
      byId.set(a.assetId, merged);
    }
    // Final filter: never keep assets with tombstoned assetIds
    page.assets = Array.from(byId.values()).filter((a) => !deleted.has(a.assetId)).sort((a, b) => a.assetId.localeCompare(b.assetId));

    // Debug: log what we're saving
    console.log(`[record-bulk] Page ${pageNumber}: Saving ${page.assets.length} assets to manifest`);
    for (const a of page.assets) {
      console.log(`[record-bulk]   SAVED ${a.assetId}: title="${a.title}", desc="${a.description?.slice(0,30)}...", cat="${a.category}"`);
    }

    // Add debug log
    if (!Array.isArray(latest.debugLog)) latest.debugLog = [];
    const timestamp = new Date().toISOString();
    latest.debugLog.unshift(`[${timestamp}] RECORD-BULK: Page ${pageNumber}, recorded ${incoming.length} assets. Total on page: ${page.assets.length}.`);
    if (latest.debugLog.length > 50) latest.debugLog = latest.debugLog.slice(0, 50);

    const newManifestUrl = await saveManifest(latest);
    
    // Trigger thumbnail generation in the background (non-blocking)
    // This will create optimized versions of images for faster loading
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : process.env.NEXT_PUBLIC_BASE_URL || "";
    if (baseUrl) {
      fetch(`${baseUrl}/api/projects/assets/generate-thumbnails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl: newManifestUrl, pageNumber }),
      }).catch(() => {
        // Ignore errors - thumbnail generation is non-critical
      });
    }
    
    return NextResponse.json({ ok: true, manifestUrl: newManifestUrl, pageNumber, count: incoming.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
