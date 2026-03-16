import { NextResponse } from "next/server";
import { fetchMemoManifest, saveMemoManifest, type MemoNote } from "@/app/lib/memos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      manifestUrl: string;
      note: {
        date: string;
        type: "text" | "audio" | "image";
        content: string;
        audioUrl?: string;
        audioDuration?: number;
        imageUrl?: string;
        imageCaption?: string;
      };
    };

    if (!body.manifestUrl || !body.note?.content?.trim()) {
      return NextResponse.json(
        { ok: false, error: "Missing manifestUrl or note content" },
        { status: 400 }
      );
    }

    const manifest = await fetchMemoManifest(body.manifestUrl);

    const note: MemoNote = {
      noteId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      date: body.note.date || new Date().toISOString().slice(0, 10),
      type: body.note.type || "text",
      content: body.note.content.trim(),
      audioUrl: body.note.audioUrl,
      audioDuration: body.note.audioDuration,
      imageUrl: body.note.imageUrl,
      imageCaption: body.note.imageCaption,
    };

    // Append to history (immutable — only add, never edit)
    manifest.notes.push(note);

    // Track as pending (not yet incorporated into story)
    if (!manifest.pendingNoteIds) manifest.pendingNoteIds = [];
    manifest.pendingNoteIds.push(note.noteId);

    const newUrl = await saveMemoManifest(manifest);

    return NextResponse.json({ ok: true, manifestUrl: newUrl, noteId: note.noteId });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
