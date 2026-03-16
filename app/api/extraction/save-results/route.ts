import { NextRequest, NextResponse } from "next/server";
import { list, put } from "@vercel/blob";

type SessionListItem = {
  filename: string;
  url: string;
  size: number;
  uploadedAt?: string;
};

function isSessionFilename(filename: string): boolean {
  return (
    filename === "schema-test-session.json" ||
    filename.startsWith("schema-session_") ||
    filename.startsWith("schema-results_")
  );
}

function parseFilenameFromPath(pathname: string): string {
  const parts = pathname.split("/");
  return parts[parts.length - 1] || "";
}

async function listProjectSessionFiles(projectId: string): Promise<SessionListItem[]> {
  const prefix = `projects/${projectId}/`;
  const found: SessionListItem[] = [];
  let cursor: string | undefined;

  do {
    const page = await list({ prefix, limit: 1000, cursor });
    for (const blob of page.blobs) {
      const pathname = blob.pathname || "";
      const filename = parseFilenameFromPath(pathname);
      if (!filename || !isSessionFilename(filename)) continue;
      found.push({
        filename,
        url: blob.url,
        size: blob.size,
        uploadedAt: blob.uploadedAt ? blob.uploadedAt.toISOString() : undefined,
      });
    }
    cursor = page.cursor || undefined;
  } while (cursor);

  found.sort((a, b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")));
  return found;
}

/**
 * Save schema test results to a project
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, results, filename, initials, session } = body as {
      projectId?: string;
      results?: unknown;
      filename?: string;
      initials?: string;
      session?: Record<string, unknown>;
    };

    if (!projectId || (!results && !session)) {
      return NextResponse.json({ ok: false, error: "Missing projectId and session/results payload" }, { status: 400 });
    }

    // Use provided filename or default
    const saveFilename = filename || "schema-test-results.json";

    const nowIso = new Date().toISOString();
    const payload = session || {
      ...(results as Record<string, unknown>),
      _savedBy: initials ? String(initials).trim().toUpperCase() : undefined,
      _savedAt: nowIso,
    };

    // Upload results to blob storage
    const resultsJson = JSON.stringify(payload, null, 2);
    const resultsBlob = await put(
      `projects/${projectId}/${saveFilename}`,
      resultsJson,
      {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false,
      }
    );

    return NextResponse.json({
      ok: true,
      url: resultsBlob.url,
      filename: saveFilename,
    });
  } catch (err) {
    console.error("Error saving schema test results:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

/**
 * GET /api/extraction/save-results?projectId=...                -> list sessions
 * GET /api/extraction/save-results?projectId=...&filename=...   -> load one session
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId") || "";
    const filename = url.searchParams.get("filename") || "";

    if (!projectId) {
      return NextResponse.json({ ok: false, error: "Missing projectId" }, { status: 400 });
    }

    const files = await listProjectSessionFiles(projectId);

    if (!filename) {
      return NextResponse.json({ ok: true, sessions: files });
    }

    const match = files.find((f) => f.filename === filename);
    if (!match) {
      return NextResponse.json({ ok: false, error: "Session file not found" }, { status: 404 });
    }

    const sessionRes = await fetch(match.url, { cache: "no-store" });
    if (!sessionRes.ok) {
      return NextResponse.json({ ok: false, error: "Failed to read session file" }, { status: 500 });
    }
    const session = await sessionRes.json();

    return NextResponse.json({ ok: true, session, file: match });
  } catch (err) {
    console.error("Error loading schema test sessions:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
