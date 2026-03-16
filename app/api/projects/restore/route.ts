import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { saveManifest, fetchManifestDirect, type PageImage, type PageAsset, type AssetBBox } from "@/app/lib/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  projectId?: string;
  manifestUrl?: string;
};

type ListResult = {
  blobs: Array<{ url: string; pathname: string }>;
  cursor?: string;
};

type AssetMetadata = {
  assetId: string;
  pageNumber: number;
  url: string;
  bbox: AssetBBox;
  title?: string;
  description?: string;
  category?: string;
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
    // Parse as text first, then JSON (handles text/plain content type)
    const text = await res.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function parsePageNumberFromPath(pathname: string): number | null {
  // projects/{id}/pages/page-12.png
  const m = pathname.match(/\/pages\/page-(\d+)\.png$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseAssetFromPath(pathname: string): { pageNumber: number; assetId: string } | null {
  // projects/{id}/assets/p12/p12-img03.png
  const m = pathname.match(/\/assets\/p(\d+)\/(p\d+-img\d+)\.png$/i);
  if (!m) return null;
  const pageNumber = Number(m[1]);
  const assetId = String(m[2]);
  if (!Number.isFinite(pageNumber) || pageNumber <= 0) return null;
  return { pageNumber, assetId };
}

const ZERO_BBOX: AssetBBox = { x: 0, y: 0, w: 0, h: 0 };

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as Body;
    const projectId = String(body.projectId || "").trim();
    const manifestUrl = String(body.manifestUrl || "").trim();

    if (!projectId || !manifestUrl) {
      return NextResponse.json({ ok: false, error: "Missing projectId/manifestUrl" }, { status: 400 });
    }

    const manifest = await fetchManifestDirect(manifestUrl);

    if (manifest.projectId !== projectId) {
      return NextResponse.json({ ok: false, error: "projectId does not match manifest" }, { status: 400 });
    }

    const pagesPrefix = `projects/${projectId}/pages/`;
    const assetsPrefix = `projects/${projectId}/assets/`;

    const pageBlobs = await listAll(pagesPrefix);
    const assetBlobs = await listAll(assetsPrefix);

    // Separate PNG files and metadata JSON files
    const pngBlobs = assetBlobs.filter(b => b.pathname.endsWith(".png"));
    const metaBlobs = assetBlobs.filter(b => b.pathname.endsWith(".meta.txt"));

    // Build a map of assetId -> metadata from JSON files
    const metadataByAssetId = new Map<string, AssetMetadata>();
    for (const b of metaBlobs) {
      const meta = (await fetchJson(b.url)) as AssetMetadata | null;
      if (meta && meta.assetId) {
        metadataByAssetId.set(meta.assetId, meta);
      }
    }
    console.log(`[restore] Found ${metaBlobs.length} metadata files`);

    const pagesByNumber = new Map<number, PageImage>();

    // Start from existing manifest pages (if any)
    if (Array.isArray(manifest.pages)) {
      for (const p of manifest.pages) {
        if (p && Number.isFinite(p.pageNumber)) {
          pagesByNumber.set(p.pageNumber, p);
        }
      }
    }

    // Ensure pages exist for each page PNG blob
    for (const b of pageBlobs) {
      const pageNumber = parsePageNumberFromPath(b.pathname);
      if (!pageNumber) continue;

      const existing = pagesByNumber.get(pageNumber);
      if (existing) {
        // If url missing, set it
        if (!existing.url) existing.url = b.url;
      } else {
        pagesByNumber.set(pageNumber, {
          pageNumber,
          url: b.url,
          width: 0,
          height: 0,
          assets: []
        });
      }
    }

    // Add assets if missing, but never re-add tombstoned assetIds
    for (const b of pngBlobs) {
      const parsed = parseAssetFromPath(b.pathname);
      if (!parsed) continue;

      // Check tombstone
      const page = pagesByNumber.get(parsed.pageNumber);
      const deleted = page && Array.isArray(page.deletedAssetIds) ? new Set(page.deletedAssetIds) : new Set();
      if (deleted.has(parsed.assetId)) continue;

      // Get metadata from JSON file if available
      const meta = metadataByAssetId.get(parsed.assetId);

      if (!page) {
        pagesByNumber.set(parsed.pageNumber, {
          pageNumber: parsed.pageNumber,
          url: "",
          width: 0,
          height: 0,
          assets: [{
            assetId: parsed.assetId,
            url: b.url,
            bbox: meta?.bbox || { ...ZERO_BBOX },
            title: meta?.title,
            description: meta?.description,
            category: meta?.category
          }],
          deletedAssetIds: []
        });
        continue;
      }

      if (!Array.isArray(page.assets)) page.assets = [];

      const existingIdx = page.assets.findIndex((a: PageAsset) => a.assetId === parsed.assetId);
      if (existingIdx < 0) {
        // Add new asset with metadata
        page.assets.push({
          assetId: parsed.assetId,
          url: b.url,
          bbox: meta?.bbox || { ...ZERO_BBOX },
          title: meta?.title,
          description: meta?.description,
          category: meta?.category
        });
      } else {
        // Update existing asset - ALWAYS use PNG URL from blob storage (b.url)
        const existing = page.assets[existingIdx];
        existing.url = b.url;  // Always overwrite with correct PNG URL
        if (!existing.title && meta?.title) existing.title = meta.title;
        if (!existing.description && meta?.description) existing.description = meta.description;
        if (!existing.category && meta?.category) existing.category = meta.category;
        if ((!existing.bbox || (existing.bbox.w === 0 && existing.bbox.h === 0)) && meta?.bbox) {
          existing.bbox = meta.bbox;
        }
      }
    }

    // Re-fetch latest manifest to avoid race conditions
    const latest = await fetchManifestDirect(manifestUrl);
    if (latest.projectId !== projectId) {
      return NextResponse.json({ ok: false, error: "projectId does not match manifest on re-fetch" }, { status: 400 });
    }

    // Merge restored assets into latest manifest
    const latestPagesByNumber = new Map<number, PageImage>();
    if (Array.isArray(latest.pages)) {
      for (const p of latest.pages) latestPagesByNumber.set(p.pageNumber, p);
    } else {
      latest.pages = [];
    }

    for (const [pageNumber, p] of pagesByNumber) {
      let latestPage = latestPagesByNumber.get(pageNumber);
      if (!latestPage) {
        latestPage = {
          pageNumber,
          url: p.url,
          width: p.width,
          height: p.height,
          assets: [],
          deletedAssetIds: []
        };
        latest.pages.push(latestPage);
        latestPagesByNumber.set(pageNumber, latestPage);
      }

      if (!Array.isArray(latestPage.assets)) latestPage.assets = [];
      const deleted = new Set(Array.isArray(latestPage.deletedAssetIds) ? latestPage.deletedAssetIds : []);

      // Only add assets that are NOT in the latest tombstone list
      if (Array.isArray(p.assets)) {
        for (const a of p.assets) {
          if (deleted.has(a.assetId)) continue;
          
          const existingIdx = latestPage.assets.findIndex((x) => x.assetId === a.assetId);
          if (existingIdx >= 0) {
             // Update existing - ALWAYS use PNG URL from restored asset
             const existing = latestPage.assets[existingIdx];
             existing.url = a.url;  // Always overwrite with correct PNG URL
             // Preserve title, description, category from restored asset if missing in latest
             if (!existing.title && a.title) existing.title = a.title;
             if (!existing.description && a.description) existing.description = a.description;
             if (!existing.category && a.category) existing.category = a.category;
          } else {
             // Add new - preserve all metadata from the restored asset
             latestPage.assets.push({
               ...a,
               // Ensure we have at least the basic fields
               assetId: a.assetId,
               url: a.url,
               bbox: a.bbox || { ...ZERO_BBOX },
             });
          }
        }
      }
    }
    
    latest.pages.sort((a, b) => a.pageNumber - b.pageNumber);

    // Check if any assets are missing thumbnails
    let assetsMissingThumbnails = 0;
    for (const page of latest.pages) {
      if (Array.isArray(page.assets)) {
        for (const asset of page.assets) {
          if (asset.url && !asset.thumbnailUrl) {
            assetsMissingThumbnails++;
          }
        }
      }
    }

    // Add debug log
    if (!Array.isArray(latest.debugLog)) latest.debugLog = [];
    const timestamp = new Date().toISOString();
    latest.debugLog.unshift(`[${timestamp}] RESTORE: Restored assets. Found ${pngBlobs.length} images, ${metaBlobs.length} metadata files.`);
    if (latest.debugLog.length > 50) latest.debugLog = latest.debugLog.slice(0, 50);

    const newManifestUrl = await saveManifest(latest);

    // Only trigger thumbnail generation if there are assets missing thumbnails
    if (assetsMissingThumbnails > 0) {
      const baseUrl = process.env.VERCEL_URL 
        ? `https://${process.env.VERCEL_URL}` 
        : process.env.NEXT_PUBLIC_BASE_URL || "";
      if (baseUrl) {
        fetch(`${baseUrl}/api/projects/assets/generate-thumbnails`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, manifestUrl: newManifestUrl }),
        }).catch(() => {
          // Ignore errors - thumbnail generation is non-critical
        });
      }
    }

    return NextResponse.json({
      ok: true,
      manifestUrl: newManifestUrl,
      pagesFound: pageBlobs.length,
      assetsFound: pngBlobs.length,
      metadataFound: metaBlobs.length,
      pagesInManifest: latest.pages?.length ?? 0,
      assetsMissingThumbnails
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
