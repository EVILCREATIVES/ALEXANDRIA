import { NextResponse } from "next/server";
import { fetchMemoManifest, saveMemoManifest, type MemoSettings } from "@/app/lib/memos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { manifestUrl, settings } = (await req.json()) as {
      manifestUrl: string;
      settings: Partial<MemoSettings>;
    };
    
    if (!manifestUrl) {
      return NextResponse.json({ ok: false, error: "Missing manifestUrl" }, { status: 400 });
    }
    
    const manifest = await fetchMemoManifest(manifestUrl);
    
    // Merge settings
    if (settings.workType) manifest.settings.workType = settings.workType;
    if (settings.pointOfView) manifest.settings.pointOfView = settings.pointOfView;
    if (settings.title) manifest.settings.title = settings.title;
    if (settings.authorName !== undefined) manifest.settings.authorName = settings.authorName;
    if (settings.genre !== undefined) manifest.settings.genre = settings.genre;
    if (settings.tone !== undefined) manifest.settings.tone = settings.tone;
    if (settings.customInstructions !== undefined) manifest.settings.customInstructions = settings.customInstructions;
    if (settings.model !== undefined) manifest.settings.model = settings.model;
    if (settings.language !== undefined) manifest.settings.language = settings.language;
    if (settings.writerPersona !== undefined) manifest.settings.writerPersona = settings.writerPersona;
    if (settings.creativeDirectives !== undefined) manifest.settings.creativeDirectives = settings.creativeDirectives;
    if (settings.sourceInterpretation !== undefined) manifest.settings.sourceInterpretation = settings.sourceInterpretation;
    if (settings.narrativeStyle !== undefined) manifest.settings.narrativeStyle = settings.narrativeStyle;
    if (settings.evaluatorInstructions !== undefined) manifest.settings.evaluatorInstructions = settings.evaluatorInstructions;
    
    const newUrl = await saveMemoManifest(manifest);
    return NextResponse.json({ ok: true, manifestUrl: newUrl });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
