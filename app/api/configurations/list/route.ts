import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type SavedConfiguration = {
  id: string;
  name: string;
  type: "schema" | "tagging" | "ai-rules" | "completeness" | "detection";
  createdAt: string;
  updatedAt: string;
  url: string;
};

export async function GET(): Promise<Response> {
  try {
    const { blobs } = await list({ prefix: "configurations/" });

    const configurations: SavedConfiguration[] = [];

    for (const blob of blobs) {
      // Parse path: configurations/{type}/{id}.json
      const parts = blob.pathname.split("/");
      if (parts.length !== 3 || !parts[2].endsWith(".json")) continue;

      const type = parts[1] as SavedConfiguration["type"];
      const id = parts[2].replace(".json", "");

      // Fetch the blob to get metadata
      try {
        const res = await fetch(blob.url);
        if (!res.ok) continue;
        const data = await res.json() as { name?: string; createdAt?: string; updatedAt?: string };

        configurations.push({
          id,
          name: data.name || id,
          type,
          createdAt: data.createdAt || blob.uploadedAt.toISOString(),
          updatedAt: data.updatedAt || blob.uploadedAt.toISOString(),
          url: blob.url
        });
      } catch {
        // Skip invalid blobs
      }
    }

    // Sort by updatedAt descending
    configurations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return NextResponse.json({ ok: true, configurations });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
