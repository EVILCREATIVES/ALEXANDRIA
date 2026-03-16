import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  url?: string;
};

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const url = String(body.url || "").trim();

  if (!url) {
    return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: `Failed to fetch: ${res.status}` }, { status: 400 });
    }

    const data = await res.json() as { content?: string; name?: string; type?: string };

    if (typeof data.content !== "string") {
      return NextResponse.json({ ok: false, error: "Invalid configuration data" }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      content: data.content,
      name: data.name,
      type: data.type
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
