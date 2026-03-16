import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { list } from "@vercel/blob";
import { DEFAULT_SCHEMA_TEST_PROMPT } from "@/app/lib/default-schema-test-prompt";
import { DEFAULT_EXTRACTION_PROMPT } from "@/app/lib/default-extraction-prompt";
import { DEFAULT_SYNTHESIS_PROMPT } from "@/app/lib/default-synthesis-prompt";

/**
 * Load a schema template file.
 * Default: tries Vercel Blob first, then local filesystem, then embedded default.
 * With ?builtIn=true: skips Blob and returns the shipped template (for "Restore Template").
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const file = searchParams.get("file");
    const builtIn = searchParams.get("builtIn") === "true";

    if (!file) {
      return NextResponse.json({ ok: false, error: "Missing file parameter" }, { status: 400 });
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
      "ai-rules-template.ts",
      "detection-rules-template.json",
      "tagger-prompt-template.json",
      "tagger-enforcer-template.json",
      "style-rules-template.json",
      "completeness-rules-template.json",
    ];

    if (!validFiles.includes(file)) {
      return NextResponse.json({ ok: false, error: "Invalid file name" }, { status: 400 });
    }

    // Try to load from Vercel Blob first (skip when builtIn=true — used by "Restore Template")
    if (!builtIn) {
      try {
        const blobPath = `schema-templates/${file}`;
        const { blobs } = await list({ prefix: blobPath });
        
        if (blobs.length > 0) {
          const blobUrl = blobs[0].url;
          const blobRes = await fetch(blobUrl);
          if (blobRes.ok) {
            const content = await blobRes.text();
            return NextResponse.json({ ok: true, content, source: "blob" });
          }
        }
      } catch (blobError) {
        // Blob not available, fall through to local filesystem
        console.log("Blob not found, trying local filesystem:", blobError);
      }
    }

    // Fall back to local filesystem
    // Prompt templates + visual config files live in project root; schema files live in SCHEMA v4/
    const isPromptTemplate = file.startsWith("schema-test-") && file.endsWith(".txt");
    const isVisualConfig = file.endsWith("-template.json") || file === "ai-rules-template.ts" || file === "style-rules-template.json";
    const baseDir = (isPromptTemplate || isVisualConfig) ? process.cwd() : path.join(process.cwd(), "SCHEMA v4");
    const filePath = path.join(baseDir, file);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      return NextResponse.json({ ok: true, content, source: "local" });
    } catch {
      // File doesn't exist on disk — use embedded default for prompt templates
      if (isPromptTemplate) {
        const embeddedDefaults: Record<string, string> = {
          "schema-test-prompt-template.txt": DEFAULT_SCHEMA_TEST_PROMPT,
          "schema-test-extraction-prompt.txt": DEFAULT_EXTRACTION_PROMPT,
          "schema-test-synthesis-prompt.txt": DEFAULT_SYNTHESIS_PROMPT,
        };
        const defaultContent = embeddedDefaults[file] || DEFAULT_SCHEMA_TEST_PROMPT;
        return NextResponse.json({ ok: true, content: defaultContent, source: "embedded" });
      }
      return NextResponse.json({ ok: true, content: "", source: "empty" });
    }
  } catch (e) {
    console.error("Error loading template:", e);
    return NextResponse.json({ ok: false, error: "Failed to load template" }, { status: 500 });
  }
}
