import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { fetchMemoManifest, saveMemoManifest } from "@/app/lib/memos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  try {
    const body = (await req.json()) as { manifestUrl: string; noteId: string };

    if (!body.manifestUrl || !body.noteId) {
      return NextResponse.json({ ok: false, error: "Missing manifestUrl or noteId" }, { status: 400 });
    }

    const manifest = await fetchMemoManifest(body.manifestUrl);

    const note = manifest.notes.find((n) => n.noteId === body.noteId);
    if (!note) {
      return NextResponse.json({ ok: false, error: "Note not found" }, { status: 404 });
    }

    // Collect blob URLs to delete (audio/image files)
    const blobsToDelete: string[] = [];
    if (note.audioUrl) blobsToDelete.push(note.audioUrl);
    if (note.imageUrl) blobsToDelete.push(note.imageUrl);

    // Remove from notes array
    manifest.notes = manifest.notes.filter((n) => n.noteId !== body.noteId);

    // Remove from pending if present
    if (manifest.pendingNoteIds) {
      manifest.pendingNoteIds = manifest.pendingNoteIds.filter((id) => id !== body.noteId);
    }

    // Remove from memory source references
    for (const entry of manifest.memory) {
      entry.sourceNoteIds = entry.sourceNoteIds.filter((id) => id !== body.noteId);
    }

    const newUrl = await saveMemoManifest(manifest);

    // Delete associated blobs after manifest is saved
    if (blobsToDelete.length > 0) {
      try { await del(blobsToDelete); } catch { /* best effort */ }
    }

    return NextResponse.json({ ok: true, manifestUrl: newUrl });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
