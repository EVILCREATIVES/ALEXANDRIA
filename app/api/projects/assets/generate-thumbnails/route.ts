import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { saveManifest, fetchManifestDirect } from "@/app/lib/manifest";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes for processing many images

// Thumbnail settings
const THUMBNAIL_MAX_WIDTH = 400;
const THUMBNAIL_QUALITY = 80;

type Body = {
  projectId?: string;
  manifestUrl?: string;
  pageNumber?: number; // Optional: process specific page only
};

/**
 * Generate thumbnails for all assets that don't have one yet.
 * This runs in the background and updates the manifest with thumbnailUrl for each asset.
 */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    const body = (await req.json()) as Body;
    const projectId = (body.projectId || "").trim();
    const manifestUrl = (body.manifestUrl || "").trim();
    const specificPage = body.pageNumber;

    if (!projectId || !manifestUrl) {
      return NextResponse.json(
        { ok: false, error: "Missing projectId or manifestUrl" },
        { status: 400 }
      );
    }

    const manifest = await fetchManifestDirect(manifestUrl);
    if (manifest.projectId !== projectId) {
      return NextResponse.json(
        { ok: false, error: "projectId does not match manifest" },
        { status: 400 }
      );
    }

    if (!Array.isArray(manifest.pages)) {
      return NextResponse.json(
        { ok: false, error: "No pages in manifest" },
        { status: 400 }
      );
    }

    let processed = 0;
    let skipped = 0;
    let errors = 0;

    // Process pages
    const pagesToProcess = specificPage
      ? manifest.pages.filter(p => p.pageNumber === specificPage)
      : manifest.pages;

    for (const page of pagesToProcess) {
      if (!Array.isArray(page.assets)) continue;

      for (const asset of page.assets) {
        // Skip if thumbnail already exists
        if (asset.thumbnailUrl) {
          skipped++;
          continue;
        }

        // Skip if no original URL
        if (!asset.url) {
          skipped++;
          continue;
        }

        try {
          // Fetch original image
          const response = await fetch(asset.url);
          if (!response.ok) {
            console.error(`Failed to fetch ${asset.url}: ${response.status}`);
            errors++;
            continue;
          }

          const buffer = Buffer.from(await response.arrayBuffer());

          // Generate thumbnail using sharp
          const thumbnail = await sharp(buffer)
            .resize(THUMBNAIL_MAX_WIDTH, undefined, {
              fit: "inside",
              withoutEnlargement: true,
            })
            .webp({ quality: THUMBNAIL_QUALITY })
            .toBuffer();

          // Upload thumbnail to blob storage
          const thumbnailPath = `projects/${projectId}/thumbnails/${asset.assetId}.webp`;
          const blob = await put(thumbnailPath, thumbnail, {
            access: "public",
            contentType: "image/webp",
            addRandomSuffix: false,
          });

          // Update asset with thumbnail URL
          asset.thumbnailUrl = blob.url;
          processed++;
        } catch (err) {
          console.error(`Error processing thumbnail for ${asset.assetId}:`, err);
          errors++;
        }
      }
    }

    // Save updated manifest with thumbnail URLs
    if (processed > 0) {
      const newManifestUrl = await saveManifest(manifest);
      return NextResponse.json({
        ok: true,
        manifestUrl: newManifestUrl,
        processed,
        skipped,
        errors,
      });
    }

    return NextResponse.json({
      ok: true,
      manifestUrl,
      processed,
      skipped,
      errors,
      message: "No new thumbnails generated",
    });
  } catch (err) {
    console.error("Thumbnail generation error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
