import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { saveManifest, fetchManifestDirect, type PageAsset, type AssetBBox } from "@/app/lib/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Body = {
  projectId?: string;
  manifestUrl?: string;
};

type AssetMetadata = {
  assetId: string;
  pageNumber: number;
  url: string;
  bbox: AssetBBox;
  title?: string;
  description?: string;
  category?: string;
  author?: string;
  metadata?: Record<string, string>;
  geo?: { lat: number; lng: number; placeName?: string; continent?: string; country?: string; region?: string; city?: string };
  geoPreserved?: { lat: number; lng: number; placeName?: string; continent?: string; country?: string; region?: string; city?: string };
  dateInfo?: { date?: string; era?: string; label?: string };
};

type ListResult = {
  blobs: Array<{ url: string; pathname: string }>;
  cursor?: string;
};

async function listAll(prefix: string): Promise<Array<{ url: string; pathname: string }>> {
  const out: Array<{ url: string; pathname: string }> = [];
  let cursor: string | undefined = undefined;

  for (;;) {
    const page = (await list({ prefix, limit: 1000, cursor })) as unknown;
    const p = page as ListResult;

    if (Array.isArray(p.blobs)) {
      for (const b of p.blobs) {
        if (b && typeof b.url === "string" && typeof b.pathname === "string") out.push(b);
      }
    }

    if (!p.cursor) break;
    cursor = p.cursor;
  }

  return out;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(`${url}?v=${Date.now()}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" }
  });
  if (!res.ok) return null;
  try {
    // Try parsing as JSON first
    const text = await res.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as Body;
    const projectId = String(body.projectId || "").trim();
    const manifestUrl = String(body.manifestUrl || "").trim();

    if (!projectId || !manifestUrl) {
      return NextResponse.json({ ok: false, error: "Missing projectId/manifestUrl" }, { status: 400 });
    }

    // Fetch current manifest
    const manifest = await fetchManifestDirect(manifestUrl);
    if (manifest.projectId !== projectId) {
      return NextResponse.json({ ok: false, error: "projectId does not match manifest" }, { status: 400 });
    }

    // List all .meta.txt files in assets folder
    const assetsPrefix = `projects/${projectId}/assets/`;
    const allBlobs = await listAll(assetsPrefix);
    const metaBlobs = allBlobs.filter(b => b.pathname.endsWith(".meta.txt"));

    console.log(`[build-manifest] Found ${metaBlobs.length} metadata files`);

    // Build a map of pageNumber -> assets
    const pageAssets = new Map<number, PageAsset[]>();

    for (const blob of metaBlobs) {
      const meta = (await fetchJson(blob.url)) as AssetMetadata | null;
      if (!meta || !meta.assetId || !meta.pageNumber || !meta.url) {
        console.log(`[build-manifest] Skipping invalid metadata: ${blob.pathname}, got:`, JSON.stringify(meta));
        continue;
      }

      const asset: PageAsset = {
        assetId: meta.assetId,
        url: meta.url,
        bbox: meta.bbox,
        title: meta.title,
        description: meta.description,
        category: meta.category,
        author: meta.author,
        metadata: meta.metadata,
        geo: meta.geo || undefined,
        geoPreserved: meta.geoPreserved || undefined,
        dateInfo: meta.dateInfo || undefined,
      };

      const existing = pageAssets.get(meta.pageNumber) || [];
      existing.push(asset);
      pageAssets.set(meta.pageNumber, existing);
    }

    // Update manifest pages with assets
    if (!Array.isArray(manifest.pages)) manifest.pages = [];

    let totalAssets = 0;
    for (const [pageNumber, assets] of pageAssets) {
      const page = manifest.pages.find(p => p.pageNumber === pageNumber);
      if (!page) {
        console.log(`[build-manifest] Page ${pageNumber} not in manifest, skipping ${assets.length} assets`);
        continue;
      }

      // Get tombstones
      const deleted = new Set<string>(Array.isArray(page.deletedAssetIds) ? page.deletedAssetIds : []);
      
      // Merge with existing assets (preserve tags, etc.)
      const existingById = new Map<string, PageAsset>();
      if (Array.isArray(page.assets)) {
        for (const a of page.assets) existingById.set(a.assetId, a);
      }

      for (const a of assets) {
        if (deleted.has(a.assetId)) continue;
        
        const existing = existingById.get(a.assetId);
        const merged: PageAsset = {
          assetId: a.assetId,
          url: a.url,
          bbox: a.bbox,
          // Prefer new metadata, fallback to existing
          title: a.title || existing?.title,
          description: a.description || existing?.description,
          category: a.category || existing?.category,
          author: a.author || existing?.author,
          metadata: (a.metadata && Object.keys(a.metadata).length > 0) ? a.metadata : existing?.metadata,
          // Preserve enrichment data
          geo: a.geo || existing?.geo,
          geoPreserved: a.geoPreserved || existing?.geoPreserved,
          dateInfo: a.dateInfo || existing?.dateInfo,
          // Preserve existing tags
          tags: existing?.tags,
          negativeTags: existing?.negativeTags,
          trigger: existing?.trigger,
          tagRationale: existing?.tagRationale,
          thumbnailUrl: existing?.thumbnailUrl
        };
        existingById.set(a.assetId, merged);
      }

      page.assets = Array.from(existingById.values())
        .filter(a => !deleted.has(a.assetId))
        .sort((a, b) => a.assetId.localeCompare(b.assetId));
      
      totalAssets += page.assets.length;
    }

    // Add debug log
    if (!Array.isArray(manifest.debugLog)) manifest.debugLog = [];
    const timestamp = new Date().toISOString();
    manifest.debugLog.unshift(`[${timestamp}] BUILD-MANIFEST: Built from ${metaBlobs.length} metadata files. Total assets: ${totalAssets}.`);
    if (manifest.debugLog.length > 50) manifest.debugLog = manifest.debugLog.slice(0, 50);

    const newManifestUrl = await saveManifest(manifest);

    console.log(`[build-manifest] Saved manifest with ${totalAssets} assets`);

    return NextResponse.json({
      ok: true,
      manifestUrl: newManifestUrl,
      metaFilesFound: metaBlobs.length,
      assetsFound: totalAssets
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[build-manifest] Error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
