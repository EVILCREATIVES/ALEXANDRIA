import { NextResponse } from "next/server";
import { del, list } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListResult = {
  blobs: Array<{ url: string; pathname?: string }>;
  cursor?: string | null;
};

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { memoId?: string };
    const memoId = (body.memoId || "").trim();

    if (!memoId) {
      return NextResponse.json({ ok: false, error: "Missing memoId" }, { status: 400 });
    }

    const prefix = `memos/${memoId}/`;
    const urls: string[] = [];
    let cursor: string | undefined;

    for (;;) {
      const page = (await list({ prefix, limit: 1000, cursor })) as unknown as ListResult;
      for (const b of page.blobs) {
        if (typeof b.url === "string" && b.url) urls.push(b.url);
      }
      const next = page.cursor ?? undefined;
      cursor = typeof next === "string" && next.length > 0 ? next : undefined;
      if (!cursor) break;
    }

    if (urls.length > 0) {
      await del(urls);
    }

    return NextResponse.json({ ok: true, deletedCount: urls.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
