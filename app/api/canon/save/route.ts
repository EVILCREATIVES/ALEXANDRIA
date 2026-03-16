import { NextResponse } from "next/server";
import { fetchCanonManifest, saveCanonManifest, type CanonManifest } from "@/app/lib/canon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { manifestUrl, manifest: partialManifest } = (await req.json()) as {
      manifestUrl: string;
      manifest: Partial<CanonManifest>;
    };

    if (!manifestUrl) {
      return NextResponse.json({ ok: false, error: "Missing manifestUrl" }, { status: 400 });
    }

    const existing = await fetchCanonManifest(manifestUrl);

    // Deep merge supported fields
    if (partialManifest.title !== undefined) existing.title = partialManifest.title;
    if (partialManifest.overview) existing.overview = { ...existing.overview, ...partialManifest.overview };
    if (partialManifest.characters) existing.characters = partialManifest.characters;
    if (partialManifest.locations) existing.locations = partialManifest.locations;
    if (partialManifest.lore) existing.lore = { ...existing.lore, ...partialManifest.lore };
    if (partialManifest.factions) existing.factions = partialManifest.factions;
    if (partialManifest.tone) existing.tone = { ...existing.tone, ...partialManifest.tone };
    if (partialManifest.style) existing.style = { ...existing.style, ...partialManifest.style };
    if (partialManifest.publications) existing.publications = partialManifest.publications;
    if (partialManifest.linkedProjectId !== undefined) existing.linkedProjectId = partialManifest.linkedProjectId;
    if (partialManifest.linkedMemoId !== undefined) existing.linkedMemoId = partialManifest.linkedMemoId;

    const newUrl = await saveCanonManifest(existing);
    return NextResponse.json({ ok: true, manifestUrl: newUrl });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
