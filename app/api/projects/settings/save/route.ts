import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { saveManifest, fetchManifestDirect, type ProjectManifest, type SettingsHistory } from "@/app/lib/manifest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  projectId?: string;
  manifestUrl?: string;
  aiRules?: string;
  taggingJson?: string;
  schemaJson?: string;
  completenessRules?: string;
  detectionRulesJson?: string;
  styleRulesJson?: string;
  history?: SettingsHistory;
};

type SettingsFile = {
  url: string;
  version: number;
  savedAt: string;
};

type SettingsFiles = {
  aiRules?: SettingsFile;
  taggingJson?: SettingsFile;
  schemaJson?: SettingsFile;
  completenessRules?: SettingsFile;
  detectionRulesJson?: SettingsFile;
  styleRulesJson?: SettingsFile;
};

// Global settings index path
const GLOBAL_SETTINGS_INDEX_PATH = "settings/global-index.json";
const GLOBAL_HISTORY_PATH = "settings/history.json";

type GlobalSettingsIndex = {
  aiRules?: SettingsFile;
  taggingJson?: SettingsFile;
  schemaJson?: SettingsFile;
  completenessRules?: SettingsFile;
  detectionRulesJson?: SettingsFile;
  styleRulesJson?: SettingsFile;
  historyUrl?: string;
  lastUpdated: string;
};

// Generate versioned filename with date - GLOBAL settings (not per-project)
function generateSettingsPath(settingType: string, version: number, ext: string): string {
  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return `settings/${settingType}/${date}_v${version}.${ext}`;
}

// Get next version number from existing settings files
function getNextVersion(existingFile?: SettingsFile): number {
  if (!existingFile) return 1;
  return existingFile.version + 1;
}

export async function POST(req: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const projectId = String(body.projectId || "").trim();
  const manifestUrlRaw = String(body.manifestUrl || "").trim();

  if (!projectId || !manifestUrlRaw) {
    return NextResponse.json({ ok: false, error: "Missing projectId/manifestUrl" }, { status: 400 });
  }

  // Validate JSON fields
  if (typeof body.taggingJson === "string" && body.taggingJson.trim()) {
    try {
      JSON.parse(body.taggingJson);
    } catch {
      return NextResponse.json({ ok: false, error: "taggingJson is not valid JSON" }, { status: 400 });
    }
  }

  if (typeof body.schemaJson === "string" && body.schemaJson.trim()) {
    try {
      JSON.parse(body.schemaJson);
    } catch {
      return NextResponse.json({ ok: false, error: "schemaJson is not valid JSON" }, { status: 400 });
    }
  }

  if (typeof body.completenessRules === "string" && body.completenessRules.trim()) {
    try {
      JSON.parse(body.completenessRules);
    } catch {
      return NextResponse.json({ ok: false, error: "completenessRules is not valid JSON" }, { status: 400 });
    }
  }

  if (typeof body.detectionRulesJson === "string" && body.detectionRulesJson.trim()) {
    try {
      JSON.parse(body.detectionRulesJson);
    } catch {
      return NextResponse.json({ ok: false, error: "detectionRulesJson is not valid JSON" }, { status: 400 });
    }
  }

  if (typeof body.styleRulesJson === "string" && body.styleRulesJson.trim()) {
    try {
      JSON.parse(body.styleRulesJson);
    } catch {
      return NextResponse.json({ ok: false, error: "styleRulesJson is not valid JSON" }, { status: 400 });
    }
  }

  let manifest: ProjectManifest;
  try {
    manifest = await fetchManifestDirect(manifestUrlRaw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  if (manifest.projectId !== projectId) {
    return NextResponse.json({ ok: false, error: "projectId does not match manifest" }, { status: 400 });
  }

  // Re-fetch latest manifest to avoid race conditions
  const latest = await fetchManifestDirect(manifestUrlRaw);
  if (latest.projectId !== projectId) {
    return NextResponse.json({ ok: false, error: "projectId does not match manifest on re-fetch" }, { status: 400 });
  }

  // Initialize settings structures
  if (!latest.settings) {
    latest.settings = { aiRules: "", uiFieldsJson: "{}", taggingJson: "{}", schemaJson: "{}", completenessRules: "{}", detectionRulesJson: "{}" };
  }
  
  // Get existing settingsFiles for blob storage tracking
  const settingsFiles: SettingsFiles = (latest as ProjectManifest & { settingsFiles?: SettingsFiles }).settingsFiles || {};
  const savedAt = new Date().toISOString();

  // Save each setting to its own blob file (only if non-empty)
  try {
    if (typeof body.aiRules === "string") {
      latest.settings.aiRules = body.aiRules;
      if (body.aiRules.trim()) {
        const version = getNextVersion(settingsFiles.aiRules);
        const path = generateSettingsPath("ai-rules", version, "txt");
        console.log(`[settings/save] Saving aiRules to: ${path} (${body.aiRules.length} chars)`);
        const blob = await put(path, body.aiRules, {
          access: "public",
          contentType: "text/plain; charset=utf-8",
          addRandomSuffix: false
        });
        console.log(`[settings/save] Saved aiRules blob: ${blob.url}`);
        settingsFiles.aiRules = { url: blob.url, version, savedAt };
      }
    }

    if (typeof body.taggingJson === "string") {
      latest.settings.taggingJson = body.taggingJson;
      if (body.taggingJson.trim()) {
        const version = getNextVersion(settingsFiles.taggingJson);
        const path = generateSettingsPath("tagging", version, "json");
        const blob = await put(path, body.taggingJson, {
          access: "public",
          contentType: "application/json",
          addRandomSuffix: false
        });
        settingsFiles.taggingJson = { url: blob.url, version, savedAt };
      }
    }

    if (typeof body.schemaJson === "string") {
      latest.settings.schemaJson = body.schemaJson;
      if (body.schemaJson.trim()) {
        const version = getNextVersion(settingsFiles.schemaJson);
        const path = generateSettingsPath("schema", version, "json");
        const blob = await put(path, body.schemaJson, {
          access: "public",
          contentType: "application/json",
          addRandomSuffix: false
        });
        settingsFiles.schemaJson = { url: blob.url, version, savedAt };
      }
    }

    if (typeof body.completenessRules === "string") {
      latest.settings.completenessRules = body.completenessRules;
      if (body.completenessRules.trim()) {
        const version = getNextVersion(settingsFiles.completenessRules);
        const path = generateSettingsPath("completeness", version, "json");
        const blob = await put(path, body.completenessRules, {
          access: "public",
          contentType: "application/json",
          addRandomSuffix: false
        });
        settingsFiles.completenessRules = { url: blob.url, version, savedAt };
      }
    }

    if (typeof body.detectionRulesJson === "string") {
      latest.settings.detectionRulesJson = body.detectionRulesJson;
      if (body.detectionRulesJson.trim()) {
        const version = getNextVersion(settingsFiles.detectionRulesJson);
        const path = generateSettingsPath("detection", version, "json");
        const blob = await put(path, body.detectionRulesJson, {
          access: "public",
          contentType: "application/json",
          addRandomSuffix: false
        });
        settingsFiles.detectionRulesJson = { url: blob.url, version, savedAt };
      }
    }

    if (typeof body.styleRulesJson === "string") {
      latest.settings.styleRulesJson = body.styleRulesJson;
      if (body.styleRulesJson.trim()) {
        const version = getNextVersion(settingsFiles.styleRulesJson);
        const path = generateSettingsPath("style-rules", version, "json");
        const blob = await put(path, body.styleRulesJson, {
          access: "public",
          contentType: "application/json",
          addRandomSuffix: false
        });
        settingsFiles.styleRulesJson = { url: blob.url, version, savedAt };
      }
    }


  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: `Failed to save settings files: ${msg}` }, { status: 500 });
  }

  // Store history to GLOBAL blob (not per-project)
  let historyUrl: string | undefined;
  if (body.history) {
    try {
      const historyBlob = await put(GLOBAL_HISTORY_PATH, JSON.stringify(body.history, null, 2), {
        access: "public",
        contentType: "application/json",
        addRandomSuffix: false
      });
      historyUrl = historyBlob.url;
      console.log(`[settings/save] Saved global history: ${historyUrl}`);
    } catch (e) {
      console.error(`[settings/save] Failed to save history:`, e);
    }
    // Also keep in manifest for backwards compatibility
    latest.settings.history = body.history;
  }

  // Save settingsFiles reference in manifest
  (latest as ProjectManifest & { settingsFiles?: SettingsFiles }).settingsFiles = settingsFiles;

  // Save global settings index
  const globalIndex: GlobalSettingsIndex = {
    ...settingsFiles,
    historyUrl,
    lastUpdated: savedAt
  };
  
  try {
    await put(GLOBAL_SETTINGS_INDEX_PATH, JSON.stringify(globalIndex, null, 2), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false
    });
    console.log(`[settings/save] Saved global settings index`);
  } catch (e) {
    console.error(`[settings/save] Failed to save global index:`, e);
  }

  console.log(`[settings/save] Saving manifest with settingsFiles:`, JSON.stringify(settingsFiles));
  const newManifestUrl = await saveManifest(latest);
  console.log(`[settings/save] Manifest saved: ${newManifestUrl}`);

  return NextResponse.json({ 
    ok: true, 
    manifestUrl: newManifestUrl,
    settingsFiles 
  });
}
