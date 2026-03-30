import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CanonRow = {
  canonId: string;
  manifestUrl: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  characterCount: number;
  locationCount: number;
  factionCount: number;
  publicationCount: number;
};

type CanonManifestPartial = {
  canonId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  characters?: unknown[];
  locations?: unknown[];
  factions?: unknown[];
  publications?: unknown[];
};

type ListResult = {
  blobs: Array<{ url: string; pathname?: string }>;
  cursor?: string | null;
};

async function safeFetch(url: string): Promise<CanonManifestPartial | null> {
  try {
    const res = await fetch(`${url}?v=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) return null;
    return (await res.json()) as CanonManifestPartial;
  } catch {
    return null;
  }
}

export async function GET(): Promise<Response> {
  try {
  const manifestBlobs: Array<{ url: string; pathname: string }> = [];
  let cursor: string | undefined;

  for (;;) {
    const page = (await list({ prefix: "canon/", limit: 1000, cursor })) as unknown as ListResult;
    for (const b of page.blobs) {
      const pathname = typeof b.pathname === "string" ? b.pathname : "";
      if (pathname.endsWith("/manifest.json")) {
        manifestBlobs.push({ url: b.url, pathname });
      }
    }
    const next = page.cursor ?? undefined;
    cursor = typeof next === "string" && next.length > 0 ? next : undefined;
    if (!cursor) break;
  }

  const rows: CanonRow[] = [];
  for (const mb of manifestBlobs) {
    const m = await safeFetch(mb.url);
    if (!m?.canonId) continue;
    rows.push({
      canonId: m.canonId,
      manifestUrl: mb.url,
      title: m.title || "(untitled)",
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      characterCount: Array.isArray(m.characters) ? m.characters.length : 0,
      locationCount: Array.isArray(m.locations) ? m.locations.length : 0,
      factionCount: Array.isArray(m.factions) ? m.factions.length : 0,
      publicationCount: Array.isArray(m.publications) ? m.publications.length : 0,
    });
  }

  rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return NextResponse.json({ ok: true, canons: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
