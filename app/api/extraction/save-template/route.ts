import { NextRequest, NextResponse } from "next/server";
import { put, list } from "@vercel/blob";

/**
 * Save a schema template file to Vercel Blob storage
 * Also saves version history
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { file, content, initials } = body;

    if (!file || typeof content !== "string") {
      return NextResponse.json({ ok: false, error: "Missing file or content" }, { status: 400 });
    }

    // Validate file name to prevent path traversal
    const validFiles = [
      "schema-test-prompt-template.txt",
      "schema-test-extraction-prompt.txt",
      "schema-test-synthesis-prompt.txt",
      "ipbible-v4-schema.json",
      "ipbible-v4-metadata.ts",
      "ipbible-v4-overview.ts",
      "ipbible-v4-characters.ts",
      "ipbible-v4-factions.ts",
      "ipbible-v4-world.ts",
      "ipbible-v4-lore.ts",
      "ipbible-v4-tone.ts",
      "ipbible-v4-style.ts",
      "ipbible-v4-story.ts",
    ];

    if (!validFiles.includes(file)) {
      return NextResponse.json({ ok: false, error: "Invalid file name" }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const fileBaseName = file.replace(/\.(json|ts|txt)$/, "");
    const initialsTag = initials ? `_${String(initials).trim().toUpperCase()}` : "";

    // Save current version to blob
    const currentBlob = await put(
      `schema-templates/${file}`,
      content,
      {
        access: "public",
        contentType: file.endsWith(".json") ? "application/json" : "text/typescript",
        addRandomSuffix: false,
      }
    );

    // Save to version history
    const historyBlob = await put(
      `schema-templates/history/${fileBaseName}/${timestamp}${initialsTag}.txt`,
      content,
      {
        access: "public",
        contentType: "text/plain",
        addRandomSuffix: false,
      }
    );

    return NextResponse.json({ 
      ok: true, 
      url: currentBlob.url,
      historyUrl: historyBlob.url,
      timestamp 
    });
  } catch (e) {
    console.error("Error saving template:", e);
    return NextResponse.json({ ok: false, error: "Failed to save template" }, { status: 500 });
  }
}

/**
 * Get version history for a template file
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const file = searchParams.get("file");

    if (!file) {
      return NextResponse.json({ ok: false, error: "Missing file parameter" }, { status: 400 });
    }

    const fileBaseName = file.replace(/\.(json|ts|txt)$/, "");
    
    // List all versions in history folder
    const historyPrefix = `schema-templates/history/${fileBaseName}/`;
    const { blobs } = await list({ prefix: historyPrefix });

    const versions = blobs.map(blob => {
      const raw = blob.pathname.replace(historyPrefix, "").replace(".txt", "");
      // Filename format: 2026-02-12T12:00:00.000Z_AB  (timestamp + optional _INITIALS)
      // ISO timestamps contain colons but no underscores before the initials tag
      // Match: everything up to the last underscore-separated uppercase segment
      const initialsMatch = raw.match(/_([A-Z]{1,5})$/);
      const initials = initialsMatch ? initialsMatch[1] : undefined;
      const timestamp = initials ? raw.slice(0, -(initials.length + 1)) : raw;
      return {
        url: blob.url,
        timestamp,
        initials,
        size: blob.size,
      };
    }).sort((a, b) => b.timestamp.localeCompare(a.timestamp)); // newest first

    return NextResponse.json({ ok: true, versions });
  } catch (e) {
    console.error("Error listing history:", e);
    return NextResponse.json({ ok: false, error: "Failed to list history" }, { status: 500 });
  }
}
