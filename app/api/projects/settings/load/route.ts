import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { getDefaultTemplates } from "@/app/lib/default-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GLOBAL_SETTINGS_INDEX_PATH = "settings/global-index.json";

type SettingsFile = {
  url: string;
  version: number;
  savedAt: string;
};

type GlobalSettingsIndex = {
  aiRules?: SettingsFile;
  taggingJson?: SettingsFile;
  completenessRules?: SettingsFile;
  detectionRulesJson?: SettingsFile;
  taggerPromptJson?: SettingsFile;
  taggerEnforcerJson?: SettingsFile;
  historyUrl?: string;
  lastUpdated: string;
};

type SettingsHistoryEntry = {
  timestamp: string;
  label?: string;
  content: string;
};

type SettingsHistory = {
  aiRules?: SettingsHistoryEntry[];
  taggingJson?: SettingsHistoryEntry[];
  detectionRulesJson?: SettingsHistoryEntry[];
  taggerPromptJson?: SettingsHistoryEntry[];
  taggerEnforcerJson?: SettingsHistoryEntry[];
};

async function fetchText(url: string): Promise<string> {
  const res = await fetch(`${url}?v=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch ${url}`);
  return res.text();
}

async function fetchJson<T>(url: string): Promise<T> {
  const text = await fetchText(url);
  return JSON.parse(text) as T;
}

// Load template files as fallbacks when no settings are saved
// Templates are now bundled at build time via TypeScript imports
function loadTemplates(): Record<string, string> {
  const templates = getDefaultTemplates();
  console.log(`[settings/load] Templates loaded - aiRules: ${templates.aiRules.length} chars, taggingJson: ${templates.taggingJson.length} chars`);
  return templates;
}

export async function GET(): Promise<Response> {
  try {
    // Load templates as fallbacks (synchronous - bundled at build time)
    const templates = loadTemplates();
    
    // Find global settings index
    const blobs = await list({ prefix: GLOBAL_SETTINGS_INDEX_PATH });
    
    if (blobs.blobs.length === 0) {
      // No global settings saved yet - return templates as defaults
      return NextResponse.json({
        ok: true,
        settings: templates,
        history: {},
        source: "templates"
      });
    }

    // Fetch the index
    const indexUrl = blobs.blobs[0].url;
    const index = await fetchJson<GlobalSettingsIndex>(indexUrl);

    // Start with templates as fallbacks, then override with saved settings
    // But only override if the saved content is substantial (not just "{}" or empty)
    const settings: Record<string, string> = { ...templates };

    const isSubstantial = (content: string): boolean => {
      const trimmed = content.trim();
      // Consider empty, "{}", or very short content as not substantial
      return trimmed.length > 10 && trimmed !== "{}";
    };

    if (index.aiRules?.url) {
      try {
        const content = await fetchText(index.aiRules.url);
        if (isSubstantial(content)) {
          settings.aiRules = content;
        }
      } catch (e) {
        console.error("Failed to load aiRules:", e);
        // Keep template as fallback
      }
    }

    if (index.taggingJson?.url) {
      try {
        const content = await fetchText(index.taggingJson.url);
        if (isSubstantial(content)) {
          settings.taggingJson = content;
        }
      } catch (e) {
        console.error("Failed to load taggingJson:", e);
      }
    }

    if (index.completenessRules?.url) {
      try {
        const content = await fetchText(index.completenessRules.url);
        if (isSubstantial(content)) {
          settings.completenessRules = content;
        }
      } catch (e) {
        console.error("Failed to load completenessRules:", e);
      }
    }

    if (index.detectionRulesJson?.url) {
      try {
        const content = await fetchText(index.detectionRulesJson.url);
        if (isSubstantial(content)) {
          settings.detectionRulesJson = content;
        }
      } catch (e) {
        console.error("Failed to load detectionRulesJson:", e);
      }
    }

    if (index.taggerPromptJson?.url) {
      try {
        const content = await fetchText(index.taggerPromptJson.url);
        if (isSubstantial(content)) {
          settings.taggerPromptJson = content;
        }
      } catch (e) {
        console.error("Failed to load taggerPromptJson:", e);
      }
    }

    if (index.taggerEnforcerJson?.url) {
      try {
        const content = await fetchText(index.taggerEnforcerJson.url);
        if (isSubstantial(content)) {
          settings.taggerEnforcerJson = content;
        }
      } catch (e) {
        console.error("Failed to load taggerEnforcerJson:", e);
      }
    }

    // Fetch history
    let history: SettingsHistory = {};
    if (index.historyUrl) {
      try {
        history = await fetchJson<SettingsHistory>(index.historyUrl);
      } catch (e) {
        console.error("Failed to load history:", e);
      }
    }

    return NextResponse.json({
      ok: true,
      settings,
      history,
      lastUpdated: index.lastUpdated,
      source: "saved"
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
