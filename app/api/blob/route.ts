import { del } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  // Clone so we can safely read JSON without consuming the original stream
  const cloned = request.clone();

  const body = (await cloned.json()) as HandleUploadBody;

  const result = await handleUpload({
    request,
    body,
    onBeforeGenerateToken: async () => {
      return {
        allowedContentTypes: [
          "image/png",
          "application/pdf",
          "text/plain",
          "text/markdown",
          "application/json",
        ]
      };
    },
    onUploadCompleted: async () => {
      // no-op
    }
  });

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { url?: string };
    const url = String(body.url || "").trim();

    if (!url) {
      return new Response(JSON.stringify({ ok: false, error: "Missing url" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await del(url);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
