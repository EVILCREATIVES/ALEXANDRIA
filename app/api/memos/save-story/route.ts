import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import { fetchMemoManifest, saveMemoManifest, type StoryVersion } from "@/app/lib/memos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Save an edited story as a new version, load a specific version, or delete a version.
 * 
 * Actions:
 *  - save:   Save current story text as a new version
 *  - load:   Load a specific version by versionId into currentStory
 *  - delete: Delete a specific version by versionId
 */
export async function POST(req: Request) {
  try {
    const { manifestUrl, action, storyText, versionId } = (await req.json()) as {
      manifestUrl: string;
      action: "save" | "load" | "delete";
      storyText?: string;
      versionId?: string;
    };

    if (!manifestUrl || !action) {
      return NextResponse.json({ ok: false, error: "Missing manifestUrl or action" }, { status: 400 });
    }

    const manifest = await fetchMemoManifest(manifestUrl);

    if (action === "save") {
      if (!storyText?.trim()) {
        return NextResponse.json({ ok: false, error: "No story text to save" }, { status: 400 });
      }

      // Save story text to blob
      const newVersionId = crypto.randomUUID();
      const storyBlob = await put(
        `memos/${manifest.memoId}/stories/${newVersionId}.txt`,
        storyText,
        { access: "public", contentType: "text/plain", addRandomSuffix: false }
      );

      const version: StoryVersion = {
        versionId: newVersionId,
        createdAt: new Date().toISOString(),
        storyUrl: storyBlob.url,
        wordCount: storyText.split(/\s+/).length,
        notesIncorporated: [],
        changelog: "Manual save (edited)",
      };

      manifest.storyVersions.push(version);
      manifest.currentStory = storyText;
      manifest.currentStoryUrl = storyBlob.url;

      const newUrl = await saveMemoManifest(manifest);
      return NextResponse.json({ ok: true, manifestUrl: newUrl, versionId: newVersionId });
    }

    if (action === "load") {
      if (!versionId) {
        return NextResponse.json({ ok: false, error: "Missing versionId" }, { status: 400 });
      }

      const version = manifest.storyVersions.find((v) => v.versionId === versionId);
      if (!version) {
        return NextResponse.json({ ok: false, error: "Version not found" }, { status: 404 });
      }

      // Fetch the story text from blob
      const res = await fetch(version.storyUrl, { cache: "no-store" });
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: "Failed to load version text" }, { status: 500 });
      }
      const text = await res.text();

      // Update current story to this version
      manifest.currentStory = text;
      manifest.currentStoryUrl = version.storyUrl;

      const newUrl = await saveMemoManifest(manifest);
      return NextResponse.json({ ok: true, manifestUrl: newUrl, storyText: text });
    }

    if (action === "delete") {
      if (!versionId) {
        return NextResponse.json({ ok: false, error: "Missing versionId" }, { status: 400 });
      }

      const versionIndex = manifest.storyVersions.findIndex((v) => v.versionId === versionId);
      if (versionIndex === -1) {
        return NextResponse.json({ ok: false, error: "Version not found" }, { status: 404 });
      }

      const version = manifest.storyVersions[versionIndex];

      // Delete the story blob
      try {
        await del(version.storyUrl);
      } catch {
        // Non-fatal — blob may already be gone
      }

      // Remove from versions array
      manifest.storyVersions.splice(versionIndex, 1);

      // If we deleted the current story, revert to the latest remaining version
      if (manifest.currentStoryUrl === version.storyUrl) {
        if (manifest.storyVersions.length > 0) {
          const latest = manifest.storyVersions[manifest.storyVersions.length - 1];
          try {
            const res = await fetch(latest.storyUrl, { cache: "no-store" });
            manifest.currentStory = res.ok ? await res.text() : "";
          } catch {
            manifest.currentStory = "";
          }
          manifest.currentStoryUrl = latest.storyUrl;
        } else {
          manifest.currentStory = "";
          manifest.currentStoryUrl = undefined;
        }
      }

      const newUrl = await saveMemoManifest(manifest);
      return NextResponse.json({ ok: true, manifestUrl: newUrl, currentStory: manifest.currentStory });
    }

    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
