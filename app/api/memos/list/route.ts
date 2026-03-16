import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ProjectRow = {
  memoId: string;
  manifestUrl: string;
  title: string;
  workType: string;
  createdAt: string;
  updatedAt: string;
  notesCount: number;
  hasStory: boolean;
};

type MemoManifest = {
  memoId: string;
  createdAt: string;
  updatedAt: string;
  settings: { title: string; workType: string };
  notes?: Array<unknown>;
  currentStory?: string;
};

type ListResult = {
  blobs: Array<{ url: string; pathname?: string }>;
  cursor?: string | null;
};

async function safeFetch(url: string): Promise<MemoManifest | null> {
  try {
    const res = await fetch(`${url}?v=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!res.ok) return null;
    return (await res.json()) as MemoManifest;
  } catch {
    return null;
  }
}

export async function GET(): Promise<Response> {
  const manifestBlobs: Array<{ url: string; pathname: string }> = [];
  let cursor: string | undefined;

  for (;;) {
    const page = (await list({ prefix: "memos/", limit: 1000, cursor })) as unknown as ListResult;
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

  const rows: ProjectRow[] = [];
  for (const mb of manifestBlobs) {
    const m = await safeFetch(mb.url);
    if (!m?.memoId) continue;
    rows.push({
      memoId: m.memoId,
      manifestUrl: mb.url,
      title: m.settings?.title || "(untitled)",
      workType: m.settings?.workType || "unknown",
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      notesCount: Array.isArray(m.notes) ? m.notes.length : 0,
      hasStory: !!m.currentStory,
    });
  }

  rows.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return NextResponse.json({ ok: true, projects: rows });
}
