import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { fetchManifestDirect, saveManifest, type ProjectManifest } from "@/app/lib/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  projectId?: string;
  manifestUrl?: string;
  sourceId?: string;
};

function collectDerivedUrls(manifest: ProjectManifest): string[] {
  const urls: string[] = [];

  if (manifest.extractedText?.url) urls.push(manifest.extractedText.url);
  if (manifest.formattedText?.url) urls.push(manifest.formattedText.url);
  if (manifest.docAiJson?.url) urls.push(manifest.docAiJson.url);

  for (const page of manifest.pages || []) {
    if (page.url) urls.push(page.url);
    for (const a of page.assets || []) {
      if (a.url) urls.push(a.url);
      if (a.thumbnailUrl) urls.push(a.thumbnailUrl);
    }
  }

  return Array.from(new Set(urls.filter(Boolean)));
}

export async function POST(req: Request): Promise<Response> {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const projectId = String(body.projectId || "").trim();
    const manifestUrl = String(body.manifestUrl || "").trim();
    const sourceId = String(body.sourceId || "").trim();

    if (!projectId || !manifestUrl || !sourceId) {
      return NextResponse.json({ ok: false, error: "Missing projectId, manifestUrl, or sourceId" }, { status: 400 });
    }

    const manifest = await fetchManifestDirect(manifestUrl);
    if (manifest.projectId !== projectId) {
      return NextResponse.json({ ok: false, error: "Project mismatch" }, { status: 400 });
    }

    const existingSources = Array.isArray(manifest.sources) ? manifest.sources : [];
    const target = existingSources.find((s) => s.sourceId === sourceId);
    if (!target) {
      return NextResponse.json({ ok: false, error: "Source not found" }, { status: 404 });
    }

    const remainingSources = existingSources.filter((s) => s.sourceId !== sourceId);
    manifest.sources = remainingSources;

    const deletingActiveSource = manifest.sourcePdf?.url === target.url;

    if (deletingActiveSource) {
      const derivedUrls = collectDerivedUrls(manifest);
      const CHUNK = 1000;
      for (let i = 0; i < derivedUrls.length; i += CHUNK) {
        await del(derivedUrls.slice(i, i + CHUNK));
      }

      manifest.pages = [];
      manifest.extractedText = undefined;
      manifest.formattedText = undefined;
      manifest.docAiJson = undefined;
      manifest.sourcePdf = remainingSources[remainingSources.length - 1]
        ? {
            url: remainingSources[remainingSources.length - 1].url,
            filename: remainingSources[remainingSources.length - 1].filename,
          }
        : undefined;
      manifest.status = manifest.sourcePdf ? "uploaded" : "empty";
    }

    // Best-effort delete of the source blob itself.
    if (target.url) {
      await del([target.url]);
    }

    const newManifestUrl = await saveManifest(manifest);
    return NextResponse.json({
      ok: true,
      manifestUrl: newManifestUrl,
      deletedSourceId: sourceId,
      remainingSources: manifest.sources?.length || 0,
      resetDerivedData: deletingActiveSource,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}