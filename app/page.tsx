"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { DEFAULT_DETECTION_RULES, DEFAULT_TAGGER_PROMPT, DEFAULT_TAGGER_ENFORCER } from "./lib/default-templates";

type AssetBBox = { x: number; y: number; w: number; h: number };

type PageAsset = {
  assetId: string;
  url: string;
  thumbnailUrl?: string; // Resized version for faster loading
  bbox: AssetBBox;
  tags?: string[];
  negativeTags?: string[];
  trigger?: string;
  tagRationale?: string;
  title?: string;       // Short descriptive title from detection
  description?: string; // Brief explanation of what element depicts
  category?: string;    // Asset category from detection (character, location, keyArt, logo, etc.)
};

type SettingsHistoryEntry = {
  timestamp: string;
  label?: string;
  content: string;
};

type SettingsHistory = {
  aiRules?: SettingsHistoryEntry[];
  taggingJson?: SettingsHistoryEntry[];
  schemaJson?: SettingsHistoryEntry[];
  completenessRules?: SettingsHistoryEntry[];
  detectionRulesJson?: SettingsHistoryEntry[];
  styleRulesJson?: SettingsHistoryEntry[];
  taggerPromptJson?: SettingsHistoryEntry[];
  taggerEnforcerJson?: SettingsHistoryEntry[];
};

type Manifest = {
  projectId: string;
  createdAt: string;
  status: "empty" | "uploaded" | "processed";
  sourcePdf?: { url: string; filename: string };
  extractedText?: { url: string };
  formattedText?: { url: string };
  docAiJson?: { url: string };
  schemaResults?: { url: string };
  styleAnalysis?: { url: string };
  pages?: Array<{
    pageNumber: number;
    url: string;
    width: number;
    height: number;
    tags?: string[];
    assets?: PageAsset[];
    deletedAssetIds?: string[];
  }>;
  settings: {
    aiRules: string;
    uiFieldsJson: string;
    taggingJson: string;
    schemaJson: string;
    completenessRules?: string;
    detectionRulesJson?: string;
    history?: SettingsHistory;
  };
};

type ProjectRow = {
  projectId: string;
  manifestUrl: string;
  createdAt: string;
  status: string;
  filename: string;
  pagesCount: number;
  hasText: boolean;
};

type PdfJsLib = {
  getDocument: (opts: { url: string; withCredentials?: boolean }) => PdfLoadingTask;
  GlobalWorkerOptions: { workerSrc: string };
};

type PdfLoadingTask = { promise: Promise<PdfDocument> };

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};

type PdfPage = {
  getViewport: (opts: { scale: number }) => PdfViewport;
  render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => { promise: Promise<void> };
};

type PdfViewport = { width: number; height: number };

async function readErrorText(res: Response) {
  try {
    const t = await res.text();
    return t || `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

function setUrlParams(pid: string, m: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("pid", pid);
  url.searchParams.set("m", m);
  window.history.replaceState({}, "", url.toString());
}

function clearUrlParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("pid");
  url.searchParams.delete("m");
  window.history.replaceState({}, "", url.toString());
}

function getUrlParams() {
  const url = new URL(window.location.href);
  return {
    pid: url.searchParams.get("pid") || "",
    m: url.searchParams.get("m") || ""
  };
}

function bust(url: string) {
  const u = new URL(url);
  u.searchParams.set("v", String(Date.now()));
  return u.toString();
}

function setPdfJsWorker(pdfjs: PdfJsLib) {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
}

function Chevron({ up }: { up: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d={up ? "M6 14l6-6 6 6" : "M6 10l6 6 6-6"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Trash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7h16M10 11v7M14 11v7M9 7l1-2h4l1 2M6 7l1 14h10l1-14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Refresh() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 12a9 9 0 10-3 6.7M21 12v-6m0 6h-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Tabs({
  value,
  onChange
}: {
  value: "ai" | "schema" | "completeness" | "detection" | "style" | "styleRules" | "taggerPrompt" | "taggerEnforcer" | "debugLog" | "cloudState";
  onChange: (v: "ai" | "schema" | "completeness" | "detection" | "style" | "styleRules" | "taggerPrompt" | "taggerEnforcer" | "debugLog" | "cloudState") => void;
}) {
  const tabStyle = (active: boolean): React.CSSProperties => ({
    border: "1px solid #000",
    background: active ? "#000" : "#fff",
    color: active ? "#fff" : "#000",
    borderRadius: 10,
    padding: "7px 10px",
    fontSize: 13,
    cursor: "pointer",
    whiteSpace: "nowrap"
  });

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        minWidth: 0,
        flex: 1,
        overflow: "hidden"
      }}
    >
      <button type="button" onClick={() => onChange("ai")} style={tabStyle(value === "ai")}>
        AI Rules
      </button>
      <button type="button" onClick={() => onChange("schema")} style={tabStyle(value === "schema")}>
        Schema JSON
      </button>
      <button type="button" onClick={() => onChange("taggerPrompt")} style={tabStyle(value === "taggerPrompt")}>
        Tagger Prompt
      </button>
      <button type="button" onClick={() => onChange("taggerEnforcer")} style={tabStyle(value === "taggerEnforcer")}>
        Tagger Enforcer
      </button>
      <button type="button" onClick={() => onChange("styleRules")} style={tabStyle(value === "styleRules")}>
        Style Rules
      </button>
      <button type="button" onClick={() => onChange("style")} style={tabStyle(value === "style")}>
        Style Analysis
      </button>
      <button type="button" onClick={() => onChange("completeness")} style={tabStyle(value === "completeness")}>
        Completeness
      </button>
      <button type="button" onClick={() => onChange("detection")} style={tabStyle(value === "detection")}>
        Detection
      </button>
      <div style={{ width: 1, height: 20, background: "#ccc" }} />
      <button type="button" onClick={() => onChange("debugLog")} style={tabStyle(value === "debugLog")}>
        Debug Log
      </button>
      <button type="button" onClick={() => onChange("cloudState")} style={tabStyle(value === "cloudState")}>
        Cloud State
      </button>
    </div>
  );
}

// Completeness calculation helper
function calculateCompleteness(
  schemaData: Record<string, unknown>,
  completenessRules: string
): { overall: number; byDomain: Record<string, number>; alert: { color: string; message: string } } {
  const domains = ["OVERVIEW", "CHARACTERS", "WORLD", "LORE", "FACTIONS", "STYLE", "TONE", "STORY"];
  const byDomain: Record<string, number> = {};
  
  // Parse custom rules if provided
  let customWeights: Record<string, number> = {};
  try {
    if (completenessRules.trim()) {
      const parsed = JSON.parse(completenessRules);
      if (parsed.weights) customWeights = parsed.weights;
    }
  } catch {
    // Use defaults if parsing fails
  }

  // Calculate per-domain completeness
  for (const domain of domains) {
    const domainData = schemaData[domain];
    if (!domainData || typeof domainData !== "object") {
      byDomain[domain] = 0;
      continue;
    }

    const fields = Object.entries(domainData as Record<string, unknown>);
    if (fields.length === 0) {
      byDomain[domain] = 0;
      continue;
    }

    let totalWeight = 0;
    let filledWeight = 0;

    for (const [key, val] of fields) {
      const weight = customWeights[`${domain}.${key}`] || 1;
      totalWeight += weight;
      
      const isFilled = val !== null && val !== undefined && val !== "" && 
        !(Array.isArray(val) && val.length === 0) &&
        !(typeof val === "object" && !Array.isArray(val) && Object.keys(val).length === 0);
      
      if (isFilled) {
        // filledCount tracked for debugging but weight is what matters for percentage
        filledWeight += weight;
      }
    }

    byDomain[domain] = totalWeight > 0 ? Math.round((filledWeight / totalWeight) * 100) : 0;
  }

  // Calculate overall with domain weights
  const domainWeights: Record<string, number> = {
    OVERVIEW: customWeights.OVERVIEW || 18,
    CHARACTERS: customWeights.CHARACTERS || 18,
    WORLD: customWeights.WORLD || 12,
    LORE: customWeights.LORE || 12,
    FACTIONS: customWeights.FACTIONS || 8,
    STYLE: customWeights.STYLE || 12,
    TONE: customWeights.TONE || 8,
    STORY: customWeights.STORY || 12
  };
  
  let weightedSum = 0;
  let totalDomainWeight = 0;
  for (const domain of domains) {
    const w = domainWeights[domain];
    weightedSum += byDomain[domain] * w;
    totalDomainWeight += w;
  }
  const overall = totalDomainWeight > 0 ? Math.round(weightedSum / totalDomainWeight) : 0;

  // Determine alert
  let alert = { color: "#22c55e", message: "Baseline is production-ready" };
  if (overall < 50) {
    alert = { color: "#ef4444", message: "Insufficient baseline — upload more sources or fill key fields" };
  } else if (overall < 70) {
    alert = { color: "#f97316", message: "Review before production — address missing fields" };
  } else if (overall < 80) {
    alert = { color: "#eab308", message: "Minor additions recommended" };
  }

  return { overall, byDomain, alert };
}

// Default domain colors - can be overridden by schema.uiRendering.domainColors
const DEFAULT_DOMAIN_COLORS: Record<string, { bg: string; accent: string; light: string }> = {
  OVERVIEW: { bg: "#f0f7ff", accent: "#2563eb", light: "#dbeafe" },
  CHARACTERS: { bg: "#fdf2f8", accent: "#db2777", light: "#fce7f3" },
  WORLD: { bg: "#ecfdf5", accent: "#059669", light: "#d1fae5" },
  LORE: { bg: "#fefce8", accent: "#ca8a04", light: "#fef9c3" },
  FACTIONS: { bg: "#fef2f2", accent: "#dc2626", light: "#fee2e2" },
  STYLE: { bg: "#faf5ff", accent: "#000", light: "#f3e8ff" },
  TONE: { bg: "#f0fdfa", accent: "#0d9488", light: "#ccfbf1" },
  STORY: { bg: "#fff7ed", accent: "#ea580c", light: "#ffedd5" }
};

// Default object card field mappings - can be overridden by schema.uiRendering.objectCardMapping
const DEFAULT_CARD_MAPPING = {
  titleFields: ["Name", "name", "Title", "title", "NameLabel", "EventTitle", "ArcName", "EpisodeId", "Character", "Label", "label"],
  subtitleFields: ["Role", "role", "RoleType", "TimeMarker", "Type"],
  headlineFields: ["Headline", "headline", "Summary", "summary", "Logline", "logline", "Description", "description"],
  imageFields: ["Images.LeadImage", "Visual.LeadImage", "Visuals.LeadImage", "Visuals.Image", "Visual.Image", "Images.Image", "LeadImage", "Image"],
  imageCaptionField: "caption"
};

// Type for UI rendering config from schema
type UIRenderingConfig = {
  domainColors?: Record<string, { bg: string; accent: string; light: string }>;
  objectCardMapping?: {
    defaults?: typeof DEFAULT_CARD_MAPPING;
  };
};

// Parse schema to extract UI rendering config
function getUIConfig(schemaJson: string): UIRenderingConfig {
  try {
    const schema = JSON.parse(schemaJson) as { uiRendering?: UIRenderingConfig };
    return schema.uiRendering || {};
  } catch {
    return {};
  }
}

// Get domain colors from schema or use defaults
function getDomainColors(schemaJson: string, domain: string): { bg: string; accent: string; light: string } {
  const config = getUIConfig(schemaJson);
  const schemaColors = config.domainColors?.[domain];
  return schemaColors || DEFAULT_DOMAIN_COLORS[domain] || DEFAULT_DOMAIN_COLORS.OVERVIEW;
}

// Get card mapping from schema or use defaults
function getCardMapping(schemaJson: string): typeof DEFAULT_CARD_MAPPING {
  const config = getUIConfig(schemaJson);
  return config.objectCardMapping?.defaults || DEFAULT_CARD_MAPPING;
}

// Get levels from schema
function getSchemaLevels(schemaJson: string): string[] {
  try {
    const schema = JSON.parse(schemaJson) as { levels?: string[] };
    return schema.levels || ["L1", "L2", "L3"];
  } catch {
    return ["L1", "L2", "L3"];
  }
}

// Get domains from schema  
function getSchemaDomains(schemaJson: string): string[] {
  try {
    const schema = JSON.parse(schemaJson) as { domains?: string[] };
    return schema.domains || ["OVERVIEW", "CHARACTERS", "WORLD", "LORE", "FACTIONS", "STYLE", "TONE", "STORY"];
  } catch {
    return ["OVERVIEW", "CHARACTERS", "WORLD", "LORE", "FACTIONS", "STYLE", "TONE", "STORY"];
  }
}

// Helper to get nested value from object using dot notation path
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

// Schema Results UI Component - renders filled schema as cards
function SchemaResultsUI({
  jsonString,
  domain,
  level,
  schemaJson
}: {
  jsonString: string;
  domain: string;
  level: string;
  schemaJson: string;
}) {
  const colors = getDomainColors(schemaJson, domain);
  const cardMapping = getCardMapping(schemaJson);

  // Parse JSON safely
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(jsonString) as Record<string, unknown>;
  } catch {
    return (
      <div style={{ padding: 16, background: "#fef2f2", borderRadius: 12, fontSize: 13, color: "#dc2626", border: "1px solid #fecaca" }}>
        ⚠️ Invalid JSON. Switch to Raw JSON view to fix.
      </div>
    );
  }

  // Navigate to the correct level and domain
  const levelData = (data[level] as Record<string, unknown>) ?? {};
  const domainData = (levelData[domain] as Record<string, unknown>) ?? {};

  if (Object.keys(domainData).length === 0) {
    return (
      <div style={{ padding: 24, background: "#f8fafc", borderRadius: 12, fontSize: 14, color: "#64748b", textAlign: "center", border: "1px dashed #e2e8f0" }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>📭</div>
        No data for {level} → {domain}
      </div>
    );
  }

  // Render cards for each field
  return (
    <div style={{ display: "grid", gap: 16 }}>
      {Object.entries(domainData).map(([key, value]) => (
        <SchemaCard key={key} fieldName={key} value={value} colors={colors} cardMapping={cardMapping} />
      ))}
    </div>
  );
}

// CSS named colors that browsers understand
const CSS_NAMED_COLORS = new Set([
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque", "black", "blanchedalmond", 
  "blue", "blueviolet", "brown", "burlywood", "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", 
  "cornsilk", "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", 
  "darkkhaki", "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen", 
  "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue", 
  "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro", 
  "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey", "honeydew", "hotpink", "indianred", 
  "indigo", "ivory", "khaki", "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral", 
  "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey", "lightpink", "lightsalmon", 
  "lightseagreen", "lightskyblue", "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow", "lime", 
  "limegreen", "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue", "mediumorchid", "mediumpurple", 
  "mediumseagreen", "mediumslateblue", "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue", 
  "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange", 
  "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff", 
  "peru", "pink", "plum", "powderblue", "purple", "rebeccapurple", "red", "rosybrown", "royalblue", "saddlebrown", 
  "salmon", "sandybrown", "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray", 
  "slategrey", "snow", "springgreen", "steelblue", "tan", "teal", "thistle", "tomato", "turquoise", "violet", 
  "wheat", "white", "whitesmoke", "yellow", "yellowgreen"
]);

// Check if a string is a valid CSS color (hex or named)
function isValidCssColor(str: string): boolean {
  if (typeof str !== "string") return false;
  // Check hex format
  if (/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8}|[0-9A-Fa-f]{3})$/.test(str)) return true;
  // Check named colors (case-insensitive)
  return CSS_NAMED_COLORS.has(str.toLowerCase().trim());
}

// Individual card component for schema fields
function SchemaCard({
  fieldName,
  value,
  colors,
  cardMapping
}: {
  fieldName: string;
  value: unknown;
  colors: { bg: string; accent: string; light: string };
  cardMapping: typeof DEFAULT_CARD_MAPPING;
}) {
  const formatFieldName = (name: string) => {
    // Convert camelCase/PascalCase to readable format
    return name.replace(/([A-Z])/g, " $1").trim();
  };

  // Handle null/undefined
  if (value === null || value === undefined) {
    return (
      <div
        style={{
          background: "#f8fafc",
          borderRadius: 12,
          padding: 16,
          border: "1px dashed #e2e8f0"
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          {formatFieldName(fieldName)}
        </div>
        <div style={{ fontSize: 14, color: "#94a3b8", fontStyle: "italic" }}>Not specified</div>
      </div>
    );
  }

  // Handle asset type (image/audio with url) - e.g., KeyArtPoster
  if (typeof value === "object" && value !== null && "url" in value) {
    const asset = value as { url: string; thumbnailUrl?: string; source?: string; caption?: string };
    return (
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          border: "1px solid #e2e8f0"
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.05em", padding: "12px 16px", background: colors.bg, borderBottom: "1px solid #e2e8f0" }}>
          {formatFieldName(fieldName)}
        </div>
        <div style={{ padding: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset.thumbnailUrl || asset.url}
            alt={asset.caption || fieldName}
            style={{
              width: "100%",
              maxHeight: 400,
              objectFit: "contain",
              borderRadius: 8
            }}
          />
          {asset.caption && (
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 8, textAlign: "center" }}>
              {asset.caption}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Handle string
  if (typeof value === "string") {
    return (
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          border: "1px solid #e2e8f0"
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          {formatFieldName(fieldName)}
        </div>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: "#1e293b" }}>
          {value || <span style={{ color: "#94a3b8" }}>—</span>}
        </div>
      </div>
    );
  }

  // Handle color array (ExtractedPalette) - render as circular swatches
  // Supports both hex codes (#FF0000) and CSS named colors (red, blue, etc.)
  const isColorArray = Array.isArray(value) && 
    value.length > 0 && 
    value.every((v) => typeof v === "string" && isValidCssColor(v as string));

  if (isColorArray) {
    const colorValues = value as string[];
    return (
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          border: "1px solid #e2e8f0"
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
          {formatFieldName(fieldName)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
          {colorValues.map((color, i) => (
            <div
              key={i}
              title={color}
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: color,
                border: "3px solid #fff",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                cursor: "pointer",
                transition: "transform 0.15s"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            />
          ))}
        </div>
      </div>
    );
  }

  // Handle array of strings (tags) - but not hex colors
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return (
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          border: "1px solid #e2e8f0"
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
          {formatFieldName(fieldName)}
        </div>
        {value.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {value.map((item, i) => (
              <span
                key={i}
                style={{
                  background: colors.light,
                  color: colors.accent,
                  padding: "6px 12px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 500
                }}
              >
                {item}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 14, color: "#94a3b8" }}>—</div>
        )}
      </div>
    );
  }

  // Handle array of objects (like CharacterList, Locations, etc.)
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object") {
    return (
      <div
        style={{
          background: colors.bg,
          borderRadius: 16,
          overflow: "hidden",
          border: `1px solid ${colors.light}`
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            padding: "14px 18px",
            color: colors.accent,
            borderBottom: `1px solid ${colors.light}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            textTransform: "uppercase",
            letterSpacing: "0.05em"
          }}
        >
          {formatFieldName(fieldName)}
          <span
            style={{
              background: colors.accent,
              color: "#fff",
              padding: "2px 8px",
              borderRadius: 10,
              fontSize: 11,
              fontWeight: 600
            }}
          >
            {value.length}
          </span>
        </div>
        <div style={{ display: "grid", gap: 2, background: colors.light }}>
          {value.map((item, i) => (
            <div key={i} style={{ background: "#fff" }}>
              <ObjectCard data={item as Record<string, unknown>} index={i} colors={colors} cardMapping={cardMapping} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Handle nested object
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    return (
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          border: "1px solid #e2e8f0"
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "12px 16px",
            color: colors.accent,
            background: colors.bg,
            borderBottom: "1px solid #e2e8f0",
            textTransform: "uppercase",
            letterSpacing: "0.05em"
          }}
        >
          {formatFieldName(fieldName)}
        </div>
        <div style={{ padding: 16, display: "grid", gap: 14 }}>
          {Object.entries(obj).map(([k, v]) => (
            <NestedField key={k} fieldName={k} value={v} colors={colors} />
          ))}
        </div>
      </div>
    );
  }

  // Fallback for other types
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: 16,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        border: "1px solid #e2e8f0"
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
        {formatFieldName(fieldName)}
      </div>
      <div style={{ fontSize: 14, color: "#1e293b" }}>{String(value)}</div>
    </div>
  );
}

// Nested field renderer for objects within objects
function NestedField({
  fieldName,
  value,
  colors
}: {
  fieldName: string;
  value: unknown;
  colors: { bg: string; accent: string; light: string };
}) {
  const formatFieldName = (name: string) => name.replace(/([A-Z])/g, " $1").trim();

  // Handle asset type (image/audio with url)
  if (typeof value === "object" && value !== null && "url" in value) {
    const asset = value as { url: string; thumbnailUrl?: string; source?: string; caption?: string };
    return (
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          {formatFieldName(fieldName)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset.thumbnailUrl || asset.url}
            alt={asset.caption || fieldName}
            style={{
              maxWidth: "100%",
              maxHeight: 300,
              objectFit: "contain",
              borderRadius: 8,
              border: "2px solid #e2e8f0",
              boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
              background: "#f8fafc"
            }}
          />
          {asset.caption && <span style={{ fontSize: 13, color: "#64748b" }}>{asset.caption}</span>}
        </div>
      </div>
    );
  }

  // Handle string
  if (typeof value === "string") {
    // Skip empty or "Unknown" values for cleaner UI
    if (!value || value === "Unknown") {
      return null;
    }
    return (
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          {formatFieldName(fieldName)}
        </div>
        <div style={{ fontSize: 14, color: "#1e293b", lineHeight: 1.5 }}>{value}</div>
      </div>
    );
  }

  // Handle color array (ExtractedPalette) - render as circular swatches
  // Supports both hex codes (#FF0000) and CSS named colors (red, blue, etc.)
  const isColorArray = Array.isArray(value) && 
    value.length > 0 && 
    value.every((v) => typeof v === "string" && isValidCssColor(v as string));

  if (isColorArray) {
    const colorValues = value as string[];
    return (
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          {formatFieldName(fieldName)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {colorValues.map((color, i) => (
            <div
              key={i}
              title={color}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: color,
                border: "2px solid #fff",
                boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                cursor: "pointer",
                transition: "transform 0.15s"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.15)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            />
          ))}
        </div>
      </div>
    );
  }

  // Handle string array (but not colors which are handled above)
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    if (value.length === 0) return null;
    return (
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
          {formatFieldName(fieldName)}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {value.map((item, i) => (
            <span
              key={i}
              style={{
                background: colors.light,
                color: colors.accent,
                padding: "4px 10px",
                borderRadius: 16,
                fontSize: 12,
                fontWeight: 500
              }}
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Handle array of objects (like relationships)
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "object") {
    return (
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
          {formatFieldName(fieldName)}
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {value.map((item, i) => {
            const obj = item as Record<string, unknown>;
            const targetName = obj.TargetCharacterName || obj.Name || obj.name || `Item ${i + 1}`;
            const relType = obj.RelationshipType || obj.Type || obj.type || "";
            const desc = obj.Description || obj.description || "";
            return (
              <div
                key={i}
                style={{
                  background: colors.bg,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${colors.light}`
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: "#1e293b" }}>{String(targetName)}</span>
                  {relType && (
                    <span
                      style={{
                        background: colors.accent,
                        color: "#fff",
                        padding: "2px 8px",
                        borderRadius: 10,
                        fontSize: 10,
                        fontWeight: 600
                      }}
                    >
                      {String(relType)}
                    </span>
                  )}
                </div>
                {desc && <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{String(desc)}</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Handle nested object
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    const entries = Object.entries(obj).filter(([, v]) => v && v !== "Unknown");
    if (entries.length === 0) return null;
    return (
      <div
        style={{
          padding: "12px 14px",
          background: colors.bg,
          borderRadius: 8,
          border: `1px solid ${colors.light}`
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 600, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
          {formatFieldName(fieldName)}
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {entries.map(([k, v]) => (
            <NestedField key={k} fieldName={k} value={v} colors={colors} />
          ))}
        </div>
      </div>
    );
  }

  // Fallback - better handling to avoid [object Object]
  const displayValue = (() => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return "[Complex object]";
      }
    }
    return String(value);
  })();

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
        {formatFieldName(fieldName)}
      </div>
      <div style={{ fontSize: 14, color: "#1e293b", whiteSpace: "pre-wrap" }}>{displayValue}</div>
    </div>
  );
}

// Card for object items in arrays (like individual characters, locations)
function ObjectCard({
  data,
  index,
  colors,
  cardMapping
}: {
  data: Record<string, unknown>;
  index: number;
  colors: { bg: string; accent: string; light: string };
  cardMapping: typeof DEFAULT_CARD_MAPPING;
}) {
  // Use cardMapping to find the name/title field dynamically
  let nameField = `Item ${index + 1}`;
  for (const field of cardMapping.titleFields) {
    const val = getNestedValue(data, field);
    if (val) { nameField = String(val); break; }
  }

  // Find headline using cardMapping
  let headline = "";
  for (const field of cardMapping.headlineFields) {
    const val = getNestedValue(data, field);
    if (val) { headline = String(val); break; }
  }

  // Find role/subtitle using cardMapping
  let role = "";
  for (const field of cardMapping.subtitleFields) {
    const val = getNestedValue(data, field);
    if (val) { role = String(val); break; }
  }

  // Find lead image using cardMapping.imageFields (supports dot notation paths)
  let leadImage: { url: string; caption?: string } | undefined;
  for (const path of cardMapping.imageFields) {
    const val = getNestedValue(data, path) as { url?: string; caption?: string } | undefined;
    if (val && val.url) { 
      leadImage = val as { url: string; caption?: string }; 
      break; 
    }
  }
  
  // Get caption from the image if available
  const leadImageCaption = leadImage?.caption;

  // Build skipFields dynamically from cardMapping
  const skipFields = new Set<string>([
    ...cardMapping.titleFields,
    ...cardMapping.headlineFields, 
    ...cardMapping.subtitleFields,
    // For image paths, skip both the full path and the root field (e.g., "Images" from "Images.LeadImage")
    ...cardMapping.imageFields,
    ...cardMapping.imageFields.map(p => p.split(".")[0]),
  ]);

  return (
    <div style={{ padding: 20 }}>
      {/* Header with image and name */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          {leadImage?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={leadImage.url}
              alt={nameField}
              style={{
                width: 160,
                height: 160,
                objectFit: "contain",
                borderRadius: 12,
                border: "3px solid #fff",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                background: "#f8fafc"
              }}
            />
          ) : (
            <div
              style={{
                width: 160,
                height: 160,
                borderRadius: 12,
                background: `linear-gradient(135deg, ${colors.light} 0%, ${colors.bg} 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 48,
                color: colors.accent,
                fontWeight: 700,
                border: `2px solid ${colors.light}`
              }}
            >
              {nameField.charAt(0).toUpperCase()}
            </div>
          )}
          {leadImageCaption && (
            <div style={{ fontSize: 11, color: "#64748b", textAlign: "center", maxWidth: 160, lineHeight: 1.3 }}>
              {leadImageCaption}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>{nameField}</div>
          {role && (
            <span
              style={{
                display: "inline-block",
                background: colors.accent,
                color: "#fff",
                padding: "4px 10px",
                borderRadius: 16,
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: 6
              }}
            >
              {role}
            </span>
          )}
          {headline && <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.4, marginTop: 4 }}>{headline}</div>}
        </div>
      </div>

      {/* Other fields in a grid */}
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {Object.entries(data)
          .filter(([k, v]) => !skipFields.has(k) && v && v !== "Unknown")
          .map(([k, v]) => (
            <NestedField key={k} fieldName={k} value={v} colors={colors} />
          ))}
      </div>
    </div>
  );
}

export default function Page() {
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState("");
  const [projectId, setProjectId] = useState<string>("");
  const [manifestUrl, setManifestUrl] = useState<string>("");
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const manifestRef = useRef<Manifest | null>(null);
  const manifestUrlRef = useRef<string>("");
  const [lastError, setLastError] = useState<string>("");

  const [cloudOpen, setCloudOpen] = useState(true);

  const [projectsOpen, setProjectsOpen] = useState(true);
  const [projectsBusy, setProjectsBusy] = useState(false);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [startupOpen, setStartupOpen] = useState(true);
  const [startupStep, setStartupStep] = useState<"pick-mode" | "previous-project">("pick-mode");
  const [startupProjectId, setStartupProjectId] = useState<string>("");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"ai" | "schema" | "completeness" | "detection" | "style" | "styleRules" | "taggerPrompt" | "taggerEnforcer" | "debugLog" | "cloudState">("ai");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState<string>("");

  const [aiRulesDraft, setAiRulesDraft] = useState<string>("");
  const [taggingJsonDraft, setTaggingJsonDraft] = useState<string>("");
  const [schemaJsonDraft, setSchemaJsonDraft] = useState<string>("");

  // Model selection for tagging
  const [taggingModel, setTaggingModel] = useState<string>("gemini-3-flash-preview");
  const [taggingOverwrite, setTaggingOverwrite] = useState<boolean>(false);
  const [completenessRulesDraft, setCompletenessRulesDraft] = useState<string>("");
  const [detectionRulesJsonDraft, setDetectionRulesJsonDraft] = useState<string>("");
  const [styleRulesJsonDraft, setStyleRulesJsonDraft] = useState<string>("");
  const [taggerPromptJsonDraft, setTaggerPromptJsonDraft] = useState<string>("");
  const [taggerEnforcerJsonDraft, setTaggerEnforcerJsonDraft] = useState<string>("");

  // Style analysis state
  const [styleAnalysisDraft, setStyleAnalysisDraft] = useState<string>("");
  const [styleAnalysisBusy, setStyleAnalysisBusy] = useState(false);

  // Settings history state
  const [settingsHistory, setSettingsHistory] = useState<SettingsHistory>({});
  const [showHistoryPanel, setShowHistoryPanel] = useState<boolean>(false);

  // AI Helper state
  type AiHelperMessage = { role: "user" | "assistant"; content: string };
  const [aiHelperOpen, setAiHelperOpen] = useState<boolean>(false);
  const [aiHelperMessages, setAiHelperMessages] = useState<AiHelperMessage[]>([]);
  const [aiHelperInput, setAiHelperInput] = useState<string>("");
  const [aiHelperLoading, setAiHelperLoading] = useState<boolean>(false);
  const [aiHelperProvider, setAiHelperProvider] = useState<"gemini" | "openai">("gemini");
  const [aiHelperUndocked, setAiHelperUndocked] = useState<boolean>(false);

  // Settings panel undock state
  const [settingsUndocked, setSettingsUndocked] = useState<boolean>(false);

  // Pipeline mode
  const [stepByStepMode, setStepByStepMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("storyline-step-by-step") === "true";
    }
    return false;
  });

  type PipelineStep = "upload" | "process" | "format" | "rasterize" | "detect" | "tag" | "style" | "schema" | "done";
  const PIPELINE_STEPS: { key: PipelineStep; label: string }[] = [
    { key: "upload", label: "Upload Source" },
    { key: "process", label: "Process Text" },
    { key: "format", label: "Format Text" },
    { key: "rasterize", label: "Rasterize Pages" },
    { key: "detect", label: "Detect Images" },
    { key: "tag", label: "Tag Assets" },
    { key: "style", label: "Analyze Style" },
    { key: "schema", label: "Fill Schema" },
    { key: "done", label: "Complete" },
  ];
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const pipelineRunningRef = useRef(false);
  const [pipelineStep, setPipelineStep] = useState<PipelineStep | "">("");
  const [pipelineError, setPipelineError] = useState<string>("");
  const [pipelineResumeStep, setPipelineResumeStep] = useState<PipelineStep | "">("");

  const [rasterProgress, setRasterProgress] = useState({
    running: false,
    currentPage: 0,
    totalPages: 0,
    uploaded: 0
  });

  const [splitProgress, setSplitProgress] = useState({
    running: false,
    page: 0,
    totalPages: 0,
    assetsUploaded: 0
  });

  const [taggingProgress, setTaggingProgress] = useState({
    running: false,
    total: 0,
    tagged: 0
  });

  const [assetsOpen, setAssetsOpen] = useState(true);
  const [pagesPreviewOpen, setPagesPreviewOpen] = useState(false);
  const [deletingAssets, setDeletingAssets] = useState<Record<string, boolean>>({});

  const [textPanelOpen, setTextPanelOpen] = useState(false);
  const [, setExtractedText] = useState<string>("");
  const [formattedText, setFormattedText] = useState<string>("");
  const [formattedTextDraft, setFormattedTextDraft] = useState<string>("");
  const [textEditing, setTextEditing] = useState(false);
  const [textSaving, setTextSaving] = useState(false);
  const [textLoading, setTextLoading] = useState(false);

  const [debugLogOpen, setDebugLogOpen] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  // Schema filling state
  const [schemaResultsOpen, setSchemaResultsOpen] = useState(false);
  const [schemaResults, setSchemaResults] = useState<string>("");
  const [schemaResultsDraft, setSchemaResultsDraft] = useState<string>("");
  const [schemaFillBusy, setSchemaFillBusy] = useState(false);
  const [schemaSaveBusy, setSchemaSaveBusy] = useState(false);
  const [schemaResultsTab, setSchemaResultsTab] = useState<string>("OVERVIEW");
  const [schemaResultsLevel, setSchemaResultsLevel] = useState<string>("L2");
  const [schemaResultsViewMode, setSchemaResultsViewMode] = useState<"ui" | "json">("ui");

  // Completeness calculation state
  const [completenessResult, setCompletenessResult] = useState<{
    overall: number;
    byDomain: Record<string, number>;
    alert: { color: string; message: string };
  } | null>(null);
  const [completenessVisible, setCompletenessVisible] = useState(false);

  // Thumbnail generation state
  const [thumbnailsBusy, setThumbnailsBusy] = useState(false);

  const selectedStartupProject = useMemo(
    () => projects.find((p) => p.projectId === startupProjectId) || null,
    [projects, startupProjectId]
  );

  function classifyProjectMode(p: ProjectRow): "canon" | "schema" {
    if (p.pagesCount > 0 || !p.hasText) return "canon";
    return "schema";
  }

  function log(msg: string) {
    const ts = new Date().toLocaleTimeString();
    setDebugLog((prev) => [...prev.slice(-99), `[${ts}] ${msg}`]);
  }

  // Helper to get current content for a settings tab
  function getCurrentSettingsContent(tab: typeof settingsTab): string {
    switch (tab) {
      case "ai": return aiRulesDraft;
      case "schema": return schemaJsonDraft;
      case "completeness": return completenessRulesDraft;
      case "detection": return detectionRulesJsonDraft;
      case "style": return styleAnalysisDraft;
      case "styleRules": return styleRulesJsonDraft;
      case "taggerPrompt": return taggerPromptJsonDraft;
      case "taggerEnforcer": return taggerEnforcerJsonDraft;
      default: return "";
    }
  }

  // Helper to get history key for a settings tab
  function getHistoryKey(tab: typeof settingsTab): keyof SettingsHistory {
    switch (tab) {
      case "ai": return "aiRules";
      case "schema": return "schemaJson";
      case "completeness": return "completenessRules";
      case "detection": return "detectionRulesJson";
      case "style": return "aiRules"; // Style analysis doesn't have history tracking
      case "styleRules": return "styleRulesJson";
      case "taggerPrompt": return "taggerPromptJson";
      case "taggerEnforcer": return "taggerEnforcerJson";
      default: return "aiRules";
    }
  }

  // Save current content as a version snapshot
  async function saveVersionSnapshot(label?: string) {
    const content = getCurrentSettingsContent(settingsTab);
    if (!content.trim()) return;

    const key = getHistoryKey(settingsTab);
    const entry: SettingsHistoryEntry = {
      timestamp: new Date().toISOString(),
      label: label || undefined,
      content
    };

    // Create updated history synchronously for the API call
    const updatedHistory = {
      ...settingsHistory,
      [key]: [entry, ...(settingsHistory[key] ?? [])].slice(0, 20)
    };

    // Update local state
    setSettingsHistory(updatedHistory);

    // Persist to storage with the updated history
    await saveSettingsWithHistory(updatedHistory);
  }

  // Save settings with a specific history object (to avoid React state timing issues)
  async function saveSettingsWithHistory(historyToSave: SettingsHistory) {
    setSettingsError("");
    if (!projectId || !manifestUrl) {
      setSettingsError("No active project.");
      return;
    }

    // Validate schemaJson is valid JSON (if not empty)
    if (schemaJsonDraft.trim()) {
      try {
        JSON.parse(schemaJsonDraft);
      } catch {
        setSettingsError("Schema JSON is invalid.");
        return;
      }
    }

    // Validate completenessRules is valid JSON (if not empty)
    if (completenessRulesDraft.trim()) {
      try {
        JSON.parse(completenessRulesDraft);
      } catch {
        setSettingsError("Completeness Rules JSON is invalid.");
        return;
      }
    }

    // Validate detectionRulesJson is valid JSON (if not empty)
    if (detectionRulesJsonDraft.trim()) {
      try {
        JSON.parse(detectionRulesJsonDraft);
      } catch {
        setSettingsError("Detection Rules JSON is invalid.");
        return;
      }
    }

    // Validate styleRulesJson is valid JSON (if not empty)
    if (styleRulesJsonDraft.trim()) {
      try {
        JSON.parse(styleRulesJsonDraft);
      } catch {
        setSettingsError("Style Rules JSON is invalid.");
        return;
      }
    }

    setSettingsBusy(true);
    try {
      const r = await fetch("/api/projects/settings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          manifestUrl,
          aiRules: aiRulesDraft,
          taggingJson: taggingJsonDraft,
          schemaJson: schemaJsonDraft,
          completenessRules: completenessRulesDraft,
          detectionRulesJson: detectionRulesJsonDraft,
          styleRulesJson: styleRulesJsonDraft,
          taggerPromptJson: taggerPromptJsonDraft,
          taggerEnforcerJson: taggerEnforcerJsonDraft,
          history: historyToSave
        })
      });

      if (!r.ok) throw new Error(await readErrorText(r));

      const j = (await r.json()) as { ok: boolean; manifestUrl?: string; error?: string };
      if (!j.ok || !j.manifestUrl) throw new Error(j.error || "Save failed (bad response)");

      setManifestUrl(j.manifestUrl);
      setUrlParams(projectId, j.manifestUrl);
      await loadManifest(j.manifestUrl);

      await refreshProjects();
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSettingsBusy(false);
    }
  }

  // Restore a version from history
  function restoreVersion(entry: SettingsHistoryEntry) {
    const content = entry.content;
    switch (settingsTab) {
      case "ai": setAiRulesDraft(content); break;
      case "schema": setSchemaJsonDraft(content); break;
      case "completeness": setCompletenessRulesDraft(content); break;
      case "detection": setDetectionRulesJsonDraft(content); break;
      case "styleRules": setStyleRulesJsonDraft(content); break;
      case "taggerPrompt": setTaggerPromptJsonDraft(content); break;
      case "taggerEnforcer": setTaggerEnforcerJsonDraft(content); break;
    }
    setShowHistoryPanel(false);
  }

  // Delete a version from history
  async function deleteVersion(index: number) {
    const key = getHistoryKey(settingsTab);
    const existing = settingsHistory[key] ?? [];
    const updated = existing.filter((_, i) => i !== index);
    const updatedHistory = { ...settingsHistory, [key]: updated };
    
    // Update local state
    setSettingsHistory(updatedHistory);
    
    // Persist to server
    await saveSettingsWithHistory(updatedHistory);
  }

  // AI Helper chat function
  async function sendAiHelperMessage() {
    if (!aiHelperInput.trim() || aiHelperLoading) return;

    const userMessage: AiHelperMessage = { role: "user", content: aiHelperInput.trim() };
    const newMessages = [...aiHelperMessages, userMessage];
    setAiHelperMessages(newMessages);
    setAiHelperInput("");
    setAiHelperLoading(true);

    try {
      const res = await fetch("/api/projects/settings/ai-helper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          settingsTab,
          currentContent: getCurrentSettingsContent(settingsTab),
          provider: aiHelperProvider
        })
      });

      const data = (await res.json()) as { ok: boolean; response?: string; error?: string };

      if (!res.ok || !data.ok) {
        setAiHelperMessages([
          ...newMessages,
          { role: "assistant", content: `Error: ${data.error || "Failed to get response"}` }
        ]);
      } else {
        setAiHelperMessages([...newMessages, { role: "assistant", content: data.response || "" }]);
      }
    } catch (err) {
      setAiHelperMessages([
        ...newMessages,
        { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` }
      ]);
    } finally {
      setAiHelperLoading(false);
    }
  }

  // Apply AI suggestion to current settings
  function applyAiSuggestion(content: string) {
    // Extract JSON from markdown code blocks
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const extracted = jsonMatch ? jsonMatch[1].trim() : content.trim();

    // Validate if it's valid JSON for JSON tabs
    if (settingsTab !== "ai") {
      try {
        JSON.parse(extracted);
      } catch {
        // Not valid JSON, don't apply
        return;
      }
    }

    switch (settingsTab) {
      case "ai": setAiRulesDraft(extracted); break;
      case "schema": setSchemaJsonDraft(extracted); break;
      case "completeness": setCompletenessRulesDraft(extracted); break;
      case "detection": setDetectionRulesJsonDraft(extracted); break;
      case "styleRules": setStyleRulesJsonDraft(extracted); break;
      case "taggerPrompt": setTaggerPromptJsonDraft(extracted); break;
      case "taggerEnforcer": setTaggerEnforcerJsonDraft(extracted); break;
    }
  }

  async function loadManifest(url: string) {
    const mRes = await fetch("/api/projects/manifest/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manifestUrl: url })
    });

    if (!mRes.ok) throw new Error(`Failed to read manifest: ${await readErrorText(mRes)}`);

    const payload = (await mRes.json()) as { ok: boolean; manifest?: Manifest; error?: string };
    if (!payload.ok || !payload.manifest) throw new Error(payload.error || "Bad manifest read response");

    const m = payload.manifest;
    setManifest(m);
    manifestRef.current = m;
    
    // NOTE: Settings are GLOBAL, not per-project. 
    // Do NOT overwrite settings from manifest - they are loaded separately via loadGlobalSettings()

    // Load cached formatted text if available
    if (m.formattedText?.url) {
      try {
        const res = await fetch(`${m.formattedText.url}?v=${Date.now()}`, { cache: "no-store" });
        if (res.ok) {
          const text = await res.text();
          setFormattedText(text);
        }
      } catch {
        // Ignore errors loading cached text
      }
    } else {
      setFormattedText("");
    }

    // Load cached extracted text if available
    if (m.extractedText?.url) {
      try {
        const res = await fetch(m.extractedText.url);
        if (res.ok) {
          const text = await res.text();
          setExtractedText(text);
        }
      } catch {
        // Ignore errors loading extracted text
      }
    } else {
      setExtractedText("");
    }

    // Load cached schema results if available
    if (m.schemaResults?.url) {
      try {
        const res = await fetch(m.schemaResults.url);
        if (res.ok) {
          const text = await res.text();
          setSchemaResults(text);
          setSchemaResultsDraft(text);
        }
      } catch {
        // Ignore errors loading schema results
      }
    } else {
      setSchemaResults("");
      setSchemaResultsDraft("");
    }

    // Load cached style analysis if available
    if (m.styleAnalysis?.url) {
      try {
        const res = await fetch(m.styleAnalysis.url);
        if (res.ok) {
          const text = await res.text();
          setStyleAnalysisDraft(text);
        }
      } catch {
        // Ignore errors loading style analysis
      }
    } else {
      setStyleAnalysisDraft("");
    }

    return m;
  }

  async function refreshProjects() {
    setProjectsBusy(true);
    try {
      const r = await fetch("/api/projects/list", { cache: "no-store" });
      if (!r.ok) throw new Error(await readErrorText(r));
      const j = (await r.json()) as { ok: boolean; projects?: ProjectRow[]; error?: string };
      if (!j.ok || !Array.isArray(j.projects)) throw new Error(j.error || "Bad /list response");
      setProjects(j.projects);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setProjectsBusy(false);
    }
  }

  // Load global settings (not per-project)
  async function loadGlobalSettings() {
    try {
      const res = await fetch("/api/projects/settings/load", { cache: "no-store" });
      if (!res.ok) return;
      
      const data = (await res.json()) as {
        ok: boolean;
        settings?: {
          aiRules: string;
          taggingJson: string;
          schemaJson: string;
          completenessRules: string;
          detectionRulesJson: string;
          styleRulesJson: string;
          taggerPromptJson: string;
          taggerEnforcerJson: string;
        };
        history?: SettingsHistory;
      };
      
      if (data.ok && data.settings) {
        setAiRulesDraft(data.settings.aiRules || "");
        setTaggingJsonDraft(data.settings.taggingJson || "{}");
        setSchemaJsonDraft(data.settings.schemaJson || "{}");
        setCompletenessRulesDraft(data.settings.completenessRules || "{}");
        setDetectionRulesJsonDraft(data.settings.detectionRulesJson || "{}");
        setStyleRulesJsonDraft(data.settings.styleRulesJson || "{}");
        setTaggerPromptJsonDraft(data.settings.taggerPromptJson || "{}");
        setTaggerEnforcerJsonDraft(data.settings.taggerEnforcerJson || "{}");
      }
      
      if (data.ok && data.history) {
        setSettingsHistory(data.history);
      }
    } catch (e) {
      console.error("Failed to load global settings:", e);
    }
  }

  async function generateThumbnails() {
    if (!projectId || !manifestUrl) return;
    
    setThumbnailsBusy(true);
    log("Starting thumbnail generation...");
    
    try {
      const res = await fetch("/api/projects/assets/generate-thumbnails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl })
      });
      
      if (!res.ok) {
        throw new Error(await readErrorText(res));
      }
      
      const data = (await res.json()) as { ok: boolean; processed?: number; skipped?: number; errors?: number; manifestUrl?: string; error?: string };
      
      if (!data.ok) {
        throw new Error(data.error || "Failed to generate thumbnails");
      }
      
      log(`Thumbnails: ${data.processed ?? 0} generated, ${data.skipped ?? 0} skipped, ${data.errors ?? 0} errors`);
      
      // Reload manifest to get updated thumbnail URLs
      if (data.manifestUrl) {
        setManifestUrl(data.manifestUrl);
        await loadManifest(data.manifestUrl);
      } else {
        await loadManifest(manifestUrl);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      log(`Thumbnail error: ${msg}`);
    } finally {
      setThumbnailsBusy(false);
    }
  }

  // Keep refs in sync with state so the pipeline can read fresh values
  useEffect(() => { manifestUrlRef.current = manifestUrl; }, [manifestUrl]);

  useEffect(() => {
    // Load global settings first (independent of project)
    loadGlobalSettings().catch(() => {});
    
    const { pid, m } = getUrlParams();
    if (pid && m) {
      setProjectId(pid);
      setManifestUrl(m);
      manifestUrlRef.current = m;
      loadManifest(m).then(() => {
        // Check for saved pipeline checkpoint and offer to resume
        try {
          const raw = localStorage.getItem("storyline-pipeline-checkpoint");
          if (raw) {
            const cp = JSON.parse(raw) as { projectId: string; manifestUrl: string; completedStep: string; timestamp: number };
            // Only resume if same project and checkpoint is less than 24h old
            if (cp.projectId === pid && (Date.now() - cp.timestamp) < 86400000) {
              const stepKeys: PipelineStep[] = ["process", "format", "rasterize", "detect", "tag", "style", "schema"];
              const completedIdx = stepKeys.indexOf(cp.completedStep as PipelineStep);
              if (completedIdx >= 0 && completedIdx < stepKeys.length - 1) {
                const nextStep = stepKeys[completedIdx + 1];
                // Update manifestUrl from checkpoint in case it changed
                if (cp.manifestUrl) {
                  setManifestUrl(cp.manifestUrl);
                  manifestUrlRef.current = cp.manifestUrl;
                }
                setPipelineResumeStep(nextStep);
                // Mark previous steps as visually complete
                setPipelineStep(cp.completedStep as PipelineStep);
                log(`[Pipeline] Found checkpoint: "${PIPELINE_STEPS.find(s => s.key === cp.completedStep)?.label}" completed. Ready to resume from "${PIPELINE_STEPS.find(s => s.key === nextStep)?.label}".`);
              }
            } else {
              // Stale checkpoint, clear it
              localStorage.removeItem("storyline-pipeline-checkpoint");
            }
          }
        } catch { /* ignore checkpoint errors */ }
      }).catch((e) => setLastError(e instanceof Error ? e.message : String(e)));
    }
    refreshProjects().catch(() => {});
  }, []);

  async function createProject() {
    const r = await fetch("/api/projects/create", { method: "POST" });
    if (!r.ok) throw new Error(`Create project failed: ${await readErrorText(r)}`);

    const j = (await r.json()) as { ok: boolean; projectId?: string; manifestUrl?: string; error?: string };
    if (!j.ok || !j.projectId || !j.manifestUrl) throw new Error(j.error || "Create project failed (bad response)");

    setProjectId(j.projectId);
    setManifestUrl(j.manifestUrl);
    setUrlParams(j.projectId, j.manifestUrl);

    await loadManifest(j.manifestUrl);
    await refreshProjects();

    return { projectId: j.projectId, manifestUrl: j.manifestUrl };
  }

  async function uploadSource(file: File) {
    setLastError("");
    setBusy("Uploading SOURCE...");

    // Clear any stale pipeline checkpoint since we're starting fresh
    try { localStorage.removeItem("storyline-pipeline-checkpoint"); } catch { /* ignore */ }
    setPipelineResumeStep("");
    setPipelineStep("");
    setPipelineError("");

    // Settings are GLOBAL, not per-project - no need to preserve/restore them

    // Clear project-specific data fields since we're starting fresh with a new source
    setSchemaResults("");
    setSchemaResultsDraft("");
    setFormattedText("");
    setExtractedText("");
    setManifest(null);

    try {
      // Always create a new project for each upload
      const p = await createProject();

      // Use client-side upload to bypass serverless function size limits
      const blob = await upload(`projects/${p.projectId}/source/source.pdf`, file, {
        access: "public",
        handleUploadUrl: "/api/blob"
      });

      // Record the PDF URL in the manifest
      const r = await fetch("/api/projects/record-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: p.projectId,
          manifestUrl: p.manifestUrl,
          sourcePdfUrl: blob.url,
          filename: file.name
        })
      });
      if (!r.ok) throw new Error(`Record source failed: ${await readErrorText(r)}`);

      const j = (await r.json()) as { ok: boolean; manifestUrl?: string; error?: string };
      if (!j.ok || !j.manifestUrl) throw new Error(j.error || "Record source failed (bad response)");

      setManifestUrl(j.manifestUrl);
      setUrlParams(p.projectId, j.manifestUrl);

      await loadManifest(j.manifestUrl);

      // Settings are GLOBAL - no need to restore, they're already in state

      await refreshProjects();
    } finally {
      setBusy("");
    }
  }

  async function processPdf() {
    setLastError("");

    const mUrl = pipelineRunningRef.current ? manifestUrlRef.current : manifestUrl;
    if (!projectId || !mUrl) return setLastError("Missing projectId/manifestUrl");
    const m = pipelineRunningRef.current ? manifestRef.current : manifest;
    if (!m?.sourcePdf?.url) return setLastError("No source PDF");
    if (busy && !pipelineRunningRef.current) return;

    setBusy("Processing...");
    log("Starting DocAI processing...");

    try {
      const r = await fetch("/api/projects/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl: mUrl })
      });

      if (!r.ok) throw new Error(await readErrorText(r));

      const j = (await r.json()) as { ok: boolean; manifestUrl?: string; error?: string };
      if (!j.ok || !j.manifestUrl) throw new Error(j.error || "Process failed (bad response)");

      log("DocAI processing complete");
      setManifestUrl(j.manifestUrl);
      manifestUrlRef.current = j.manifestUrl;
      setUrlParams(projectId, j.manifestUrl);

      await loadManifest(j.manifestUrl);
      await refreshProjects();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`Process error: ${msg}`);
      setLastError(msg);
    } finally {
      setBusy("");
    }
  }

  async function rasterizeToPngs() {
    setLastError("");

    const mUrl = pipelineRunningRef.current ? manifestUrlRef.current : manifestUrl;
    const m = pipelineRunningRef.current ? manifestRef.current : manifest;
    if (!projectId || !mUrl) return setLastError("Missing projectId/manifestUrl");
    if (!m?.sourcePdf?.url) return setLastError("No source PDF");
    if ((busy || rasterProgress.running) && !pipelineRunningRef.current) return;

    setBusy("Rasterizing...");
    setRasterProgress({ running: true, currentPage: 0, totalPages: 0, uploaded: 0 });
    log("Starting rasterization...");

    try {
      const pdfjsImport = (await import("pdfjs-dist")) as unknown as PdfJsLib;
      setPdfJsWorker(pdfjsImport);

      const loadingTask = pdfjsImport.getDocument({ url: m!.sourcePdf!.url, withCredentials: false });
      const pdf = await loadingTask.promise;

      const totalPages = Number(pdf.numPages) || 0;
      setRasterProgress((p) => ({ ...p, totalPages }));
      log(`PDF has ${totalPages} pages`);

      // Collect all page data first, then save in one batch at the end
      const allPages: Array<{ pageNumber: number; url: string; width: number; height: number }> = [];

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
        setRasterProgress((p) => ({ ...p, currentPage: pageNumber }));

        const page = await pdf.getPage(pageNumber);
        // Calculate scale to fit longest edge within 1500px
        const MAX_EDGE = 1500;
        const baseViewport = page.getViewport({ scale: 1 });
        const longestEdge = Math.max(baseViewport.width, baseViewport.height);
        const scale = longestEdge > MAX_EDGE ? MAX_EDGE / longestEdge : 1;
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Cannot create canvas 2D context");

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));

        await page.render({ canvasContext: ctx, viewport }).promise;

        const pngBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))), "image/png");
        });

        const file = new File([pngBlob], `page-${pageNumber}.png`, { type: "image/png" });

        const blob = await upload(`projects/${projectId}/pages/page-${pageNumber}.png`, file, {
          access: "public",
          handleUploadUrl: "/api/blob"
        });

        // Collect page data instead of saving one by one
        allPages.push({
          pageNumber,
          url: blob.url,
          width: canvas.width,
          height: canvas.height
        });

        setRasterProgress((p) => ({ ...p, uploaded: p.uploaded + 1 }));
        log(`Uploaded page ${pageNumber}/${totalPages}`);
      }

      // Now save all pages in one bulk operation to avoid race conditions
      log(`Saving ${allPages.length} pages to manifest...`);
      const r = await fetch("/api/projects/pages/record-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl: mUrl, pages: allPages })
      });

      if (!r.ok) throw new Error(await readErrorText(r));

      const j = (await r.json()) as { ok: boolean; manifestUrl?: string; error?: string };
      if (!j.ok || !j.manifestUrl) throw new Error(j.error || "Record bulk pages failed");

      log(`All ${allPages.length} pages saved successfully`);
      setManifestUrl(j.manifestUrl);
      manifestUrlRef.current = j.manifestUrl;
      setUrlParams(projectId, j.manifestUrl);

      // Load final manifest at the end
      await loadManifest(j.manifestUrl);
      await refreshProjects();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`Rasterization error: ${msg}`);
      setLastError(msg);
    } finally {
      setBusy("");
      setRasterProgress((p) => ({ ...p, running: false }));
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function recordAssetsBulk(pageNumber: number, assets: Array<{ assetId: string; url: string; bbox: AssetBBox; title?: string; description?: string; category?: string }>, currentManifestUrl?: string): Promise<string> {
    const urlToUse = currentManifestUrl || manifestUrl;
    const r = await fetch("/api/projects/assets/record-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, manifestUrl: urlToUse, pageNumber, assets })
    });

    if (!r.ok) throw new Error(await readErrorText(r));

    const j = (await r.json()) as { ok: boolean; manifestUrl?: string; error?: string };
    if (!j.ok || !j.manifestUrl) throw new Error(j.error || "Record bulk failed (bad response)");

    setManifestUrl(j.manifestUrl);
    setUrlParams(projectId, j.manifestUrl);
    await loadManifest(j.manifestUrl);
    
    return j.manifestUrl; // Return the new manifest URL for chaining
  }

  async function splitImages() {
    setLastError("");

    const mUrl = pipelineRunningRef.current ? manifestUrlRef.current : manifestUrl;
    const m = pipelineRunningRef.current ? manifestRef.current : manifest;
    if (!projectId || !mUrl) return setLastError("Missing projectId/manifestUrl");
    if (!m?.pages?.length) return setLastError("No page PNGs - run Rasterize first");
    if ((busy || splitProgress.running) && !pipelineRunningRef.current) return;

    const pages = m.pages;

    // Parse detection rules from settings
    let detectionRules: Record<string, unknown> | undefined;
    if (detectionRulesJsonDraft.trim()) {
      try {
        detectionRules = JSON.parse(detectionRulesJsonDraft) as Record<string, unknown>;
      } catch {
        return setLastError("Invalid Detection Rules JSON");
      }
    }

    setBusy("Detecting images...");
    setSplitProgress({ running: true, page: 0, totalPages: pages.length, assetsUploaded: 0 });
    log("Starting image detection with Gemini...");

    try {
      // Detect images on ALL pages (single pass, fast model)
      const allResults: Map<number, Array<{ x: number; y: number; width: number; height: number; category?: string; title?: string; description?: string }>> = new Map();

      log("=== Detecting images on all pages ===");
      for (const page of pages) {
        setSplitProgress((s) => ({ ...s, page: page.pageNumber }));
        log(`Detecting on page ${page.pageNumber}...`);

        const detectRes = await fetch("/api/projects/assets/detect-gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageUrl: page.url,
            pageWidth: page.width,
            pageHeight: page.height,
            detectionRules: detectionRules || {}
          })
        });

        if (!detectRes.ok) {
          log(`Detection failed for page ${page.pageNumber}: ${await readErrorText(detectRes)}`);
          continue;
        }

        const detected = (await detectRes.json()) as { 
          boxes?: Array<{ x: number; y: number; width: number; height: number; category?: string; title?: string; description?: string }>; 
          error?: string;
        };
        const boxes = detected.boxes ?? [];
        
        log(`Page ${page.pageNumber}: ${boxes.length} images found`);
        
        if (boxes.length > 0) {
          allResults.set(page.pageNumber, boxes);
        }
      }

      // Crop and upload all detected assets + metadata JSON files
      log(`=== Cropping and uploading assets with metadata ===`);
      const pagesWithDetections = pages.filter(p => allResults.has(p.pageNumber));
      
      for (const page of pagesWithDetections) {
        const boxes = allResults.get(page.pageNumber)!;
        log(`Processing page ${page.pageNumber}: ${boxes.length} assets to crop`);

        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.crossOrigin = "anonymous";
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error(`Failed to load page image p${page.pageNumber}`));
          el.src = bust(page.url);
        });

        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          const bbox: AssetBBox = { x: b.x, y: b.y, w: b.width, h: b.height };

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Cannot create canvas 2D context");

          canvas.width = Math.max(1, Math.floor(bbox.w));
          canvas.height = Math.max(1, Math.floor(bbox.h));

          ctx.drawImage(img, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, canvas.width, canvas.height);

          const pngBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((bb) => (bb ? resolve(bb) : reject(new Error("toBlob returned null"))), "image/png");
          });

          const assetId = `p${page.pageNumber}-img${String(i + 1).padStart(2, "0")}`;
          
          // Upload image
          const imageFile = new File([pngBlob], `${assetId}.png`, { type: "image/png" });
          const uploaded = await upload(`projects/${projectId}/assets/p${page.pageNumber}/${assetId}.png`, imageFile, {
            access: "public",
            handleUploadUrl: "/api/blob"
          });

          // Upload metadata JSON alongside the image (use text/plain to avoid Vercel Blob content type restriction)
          const metadata = {
            assetId,
            pageNumber: page.pageNumber,
            url: uploaded.url,
            bbox,
            title: b.title,
            description: b.description,
            category: b.category
          };
          const metaBlob = new Blob([JSON.stringify(metadata)], { type: "text/plain" });
          const metaFile = new File([metaBlob], `${assetId}.meta.txt`, { type: "text/plain" });
          await upload(`projects/${projectId}/assets/p${page.pageNumber}/${assetId}.meta.txt`, metaFile, {
            access: "public",
            handleUploadUrl: "/api/blob"
          });

          setSplitProgress((s) => ({ ...s, assetsUploaded: s.assetsUploaded + 1 }));
          log(`Uploaded asset ${assetId} with metadata`);
        }
      }

      // Build manifest from all metadata files (ONE call at the end)
      log(`=== Building manifest from metadata files ===`);
      const buildRes = await fetch("/api/projects/assets/build-manifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl: mUrl })
      });
      
      if (!buildRes.ok) throw new Error(await readErrorText(buildRes));
      const buildResult = (await buildRes.json()) as { ok: boolean; manifestUrl?: string; assetsFound?: number; error?: string };
      if (!buildResult.ok || !buildResult.manifestUrl) throw new Error(buildResult.error || "Build manifest failed");
      
      setManifestUrl(buildResult.manifestUrl);
      manifestUrlRef.current = buildResult.manifestUrl;
      setUrlParams(projectId, buildResult.manifestUrl);
      await loadManifest(buildResult.manifestUrl);
      log(`Built manifest with ${buildResult.assetsFound} assets`);

      // Summary
      const totalDetected = Array.from(allResults.values()).reduce((sum, boxes) => sum + boxes.length, 0);
      const pagesWithAssets = allResults.size;
      const pagesWithoutAssets = pages.length - pagesWithAssets;
      log(`Detection complete: ${totalDetected} assets on ${pagesWithAssets} pages, ${pagesWithoutAssets} pages empty`);
      
      await refreshProjects();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`Detection error: ${msg}`);
      setLastError(msg);
    } finally {
      setBusy("");
      setSplitProgress((s) => ({ ...s, running: false }));
    }
  }

  async function rebuildAssets() {
    setLastError("");
    if (!projectId || !manifestUrl) return;

    setBusy("Rebuilding assets...");
    try {
      const r = await fetch("/api/projects/assets/rebuild-index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl })
      });

      const j = (await r.json()) as { ok: boolean; manifestUrl?: string; error?: string };
      if (!r.ok || !j.ok || !j.manifestUrl) throw new Error(j.error || `Rebuild failed (${r.status})`);

      setManifestUrl(j.manifestUrl);
      setUrlParams(projectId, j.manifestUrl);
      await loadManifest(j.manifestUrl);
      await refreshProjects();
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function restoreFromBlob() {
    setLastError("");
    if (!projectId || !manifestUrl) return;

    setBusy("Restoring from blob storage...");
    log("Starting restore from blob storage...");
    try {
      const r = await fetch("/api/projects/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl })
      });

      const j = (await r.json()) as { 
        ok: boolean; 
        manifestUrl?: string; 
        error?: string;
        pagesFound?: number;
        assetsFound?: number;
        pagesInManifest?: number;
      };
      if (!r.ok || !j.ok || !j.manifestUrl) throw new Error(j.error || `Restore failed (${r.status})`);

      log(`Restore complete: ${j.pagesFound} page blobs, ${j.assetsFound} asset blobs, ${j.pagesInManifest} pages in manifest`);
      setManifestUrl(j.manifestUrl);
      setUrlParams(projectId, j.manifestUrl);
      await loadManifest(j.manifestUrl);
      await refreshProjects();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`Restore error: ${msg}`);
      setLastError(msg);
    } finally {
      setBusy("");
    }
  }

  async function deleteAllAssets() {
    setLastError("");
    if (!projectId || !manifestUrl) return;

    // Confirm with user
    if (!window.confirm("Delete ALL extracted images and reset? This cannot be undone.")) {
      return;
    }

    setBusy("Deleting all images...");
    log("Starting delete-all assets...");
    try {
      const r = await fetch("/api/projects/assets/delete-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl })
      });

      const j = (await r.json()) as {
        ok: boolean;
        manifestUrl?: string;
        error?: string;
        deletedBlobCount?: number;
        assetsCleared?: number;
      };
      if (!r.ok || !j.ok || !j.manifestUrl) throw new Error(j.error || `Delete-all failed (${r.status})`);

      log(`Delete-all complete: ${j.deletedBlobCount} blobs deleted, ${j.assetsCleared} assets cleared`);
      setManifestUrl(j.manifestUrl);
      setUrlParams(projectId, j.manifestUrl);
      await loadManifest(j.manifestUrl);
      await refreshProjects();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`Delete-all error: ${msg}`);
      setLastError(msg);
    } finally {
      setBusy("");
    }
  }

  async function resetTags() {
    setLastError("");
    if (!projectId || !manifestUrl) return;

    // Confirm with user
    if (!window.confirm("Reset ALL tags from all assets? The images will be preserved but all tags, triggers, and rationale will be cleared.")) {
      return;
    }

    setBusy("Resetting tags...");
    log("Starting reset-tags...");
    try {
      const r = await fetch("/api/projects/assets/reset-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl })
      });

      const j = (await r.json()) as {
        ok: boolean;
        manifestUrl?: string;
        error?: string;
        assetsCleared?: number;
      };
      if (!r.ok || !j.ok || !j.manifestUrl) throw new Error(j.error || `Reset-tags failed (${r.status})`);

      log(`Reset-tags complete: ${j.assetsCleared} assets cleared of tags`);
      setManifestUrl(j.manifestUrl);
      setUrlParams(projectId, j.manifestUrl);
      await loadManifest(j.manifestUrl);
      await refreshProjects();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`Reset-tags error: ${msg}`);
      setLastError(msg);
    } finally {
      setBusy("");
    }
  }

  async function tagAssets() {
    setLastError("");
    const mUrl = pipelineRunningRef.current ? manifestUrlRef.current : manifestUrl;
    if (!projectId || !mUrl) return;
    const m = pipelineRunningRef.current ? manifestRef.current : manifest;
    if (!m?.pages?.length) {
      setLastError("No pages to tag.");
      return;
    }

    // Count total assets and assets needing tagging
    let totalAssets = 0;
    let assetsNeedingTagging = 0;
    for (const p of m.pages) {
      const pageAssets = p.assets ?? [];
      totalAssets += pageAssets.length;
      for (const a of pageAssets) {
        const alreadyTagged = Array.isArray(a.tags) && a.tags.length > 0;
        if (taggingOverwrite || !alreadyTagged) {
          assetsNeedingTagging += 1;
        }
      }
    }

    if (totalAssets === 0) {
      log("No assets to tag.");
      return;
    }

    if (assetsNeedingTagging === 0) {
      log(`All ${totalAssets} assets already tagged. Enable 'Overwrite' to re-tag.`);
      return;
    }

    setBusy("Tagging assets...");
    setTaggingProgress({ running: true, total: assetsNeedingTagging, tagged: 0 });
    log(`Starting tagging of ${assetsNeedingTagging} assets (${totalAssets - assetsNeedingTagging} already tagged)${taggingOverwrite ? " (overwrite mode)" : ""}...`);

    try {
      const r = await fetch("/api/projects/assets/tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          projectId, 
          manifestUrl: mUrl, 
          overwrite: taggingOverwrite, 
          model: taggingModel,
          // Pass current UI settings to ensure tagging uses what's in the editor, not stale manifest
          aiRules: aiRulesDraft,
          taggerPromptJson: taggerPromptJsonDraft,
          taggerEnforcerJson: taggerEnforcerJsonDraft
        })
      });

      const j = (await r.json()) as {
        ok: boolean;
        manifestUrl?: string;
        error?: string;
        considered?: number;
        toTag?: number;
        tagged?: number;
        failed?: number;
        errors?: Array<{ pageNumber: number; assetId: string; error: string }>;
        timedOut?: boolean;
        message?: string;
      };

      if (!r.ok || !j.ok || !j.manifestUrl) throw new Error(j.error || `Tagging failed (${r.status})`);

      let logMsg = `Tagging complete: ${j.tagged} assets tagged out of ${j.toTag ?? j.considered} to tag`;
      if (j.failed && j.failed > 0) {
        logMsg += ` (${j.failed} failed)`;
        if (j.errors && j.errors.length > 0) {
          const firstErr = j.errors[0];
          log(`First error: ${firstErr.assetId} - ${firstErr.error}`);
        }
      }
      if (j.timedOut) {
        logMsg += ` - PARTIAL (time limit reached, run again to continue)`;
      }
      log(logMsg);
      setTaggingProgress((s) => ({ ...s, tagged: j.tagged ?? 0 }));

      setManifestUrl(j.manifestUrl);
      manifestUrlRef.current = j.manifestUrl;
      setUrlParams(projectId, j.manifestUrl);
      await loadManifest(j.manifestUrl);
      await refreshProjects();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`Tagging error: ${msg}`);
      setLastError(msg);
    } finally {
      setBusy("");
      setTaggingProgress((s) => ({ ...s, running: false }));
    }
  }

  async function analyzeStyle() {
    setLastError("");
    const mUrl = pipelineRunningRef.current ? manifestUrlRef.current : manifestUrl;
    if (!projectId || !mUrl) return;

    setStyleAnalysisBusy(true);
    setBusy("Analyzing visual style with Gemini 3 Pro...");
    log("Starting style analysis...");

    try {
      const r = await fetch("/api/projects/style/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl: mUrl, maxImages: 20 })
      });

      const j = (await r.json()) as {
        ok: boolean;
        manifestUrl?: string;
        styleAnalysis?: unknown;
        analyzedImages?: number;
        error?: string;
      };

      if (!r.ok || !j.ok) throw new Error(j.error || `Style analysis failed (${r.status})`);

      log(`Style analysis complete: analyzed ${j.analyzedImages} images`);
      
      // Update the style analysis draft
      if (j.styleAnalysis) {
        setStyleAnalysisDraft(JSON.stringify(j.styleAnalysis, null, 2));
      }

      // Refresh manifest if URL changed
      if (j.manifestUrl) {
        setManifestUrl(j.manifestUrl);
        manifestUrlRef.current = j.manifestUrl;
        await loadManifest(j.manifestUrl);
      }

      // Switch to the style tab to show results (only outside pipeline)
      if (!pipelineRunningRef.current) setSettingsTab("style");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`Style analysis error: ${msg}`);
      setLastError(msg);
    } finally {
      setBusy("");
      setStyleAnalysisBusy(false);
    }
  }

  async function fillSchema() {
    setLastError("");
    const mUrl = pipelineRunningRef.current ? manifestUrlRef.current : manifestUrl;
    if (!projectId || !mUrl) return;

    setSchemaFillBusy(true);
    setBusy("Filling schema with AI...");
    log("Starting schema fill...");

    try {
      const r = await fetch("/api/projects/schema/fill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl: mUrl })
      });

      const j = (await r.json()) as {
        ok: boolean;
        results?: string;
        error?: string;
      };

      if (!r.ok || !j.ok || !j.results) throw new Error(j.error || `Schema fill failed (${r.status})`);

      log("Schema fill complete");
      setSchemaResultsDraft(j.results);
      setSchemaResultsOpen(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`Schema fill error: ${msg}`);
      setLastError(msg);
    } finally {
      setBusy("");
      setSchemaFillBusy(false);
    }
  }

  async function saveSchemaResults() {
    setLastError("");
    if (!projectId || !manifestUrl) return;

    setSchemaSaveBusy(true);
    log("Saving schema results...");

    try {
      const r = await fetch("/api/projects/schema/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl, results: schemaResultsDraft })
      });

      const j = (await r.json()) as {
        ok: boolean;
        manifestUrl?: string;
        error?: string;
      };

      if (!r.ok || !j.ok || !j.manifestUrl) throw new Error(j.error || `Schema save failed (${r.status})`);

      log("Schema results saved");
      setSchemaResults(schemaResultsDraft);
      setManifestUrl(j.manifestUrl);
      setUrlParams(projectId, j.manifestUrl);
      await loadManifest(j.manifestUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`Schema save error: ${msg}`);
      setLastError(msg);
    } finally {
      setSchemaSaveBusy(false);
    }
  }

  async function deleteProject(targetProjectId: string) {
    const ok = window.confirm(`Delete project ${targetProjectId}?`);
    if (!ok) return;

    setLastError("");
    setProjectsBusy(true);

    try {
      const r = await fetch("/api/projects/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: targetProjectId })
      });

      if (!r.ok) throw new Error(await readErrorText(r));

      if (targetProjectId === projectId) {
        setProjectId("");
        setManifestUrl("");
        setManifest(null);
        setAiRulesDraft("");
        setTaggingJsonDraft("");
        clearUrlParams();
      }

      await refreshProjects();
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setProjectsBusy(false);
    }
  }

  // Auto-pipeline: run all steps sequentially after source upload
  // If startFrom is provided, skip steps before it (resume from checkpoint)
  async function runAutoPipeline(startFrom?: PipelineStep) {
    if (pipelineRunning) return;
    setPipelineRunning(true);
    pipelineRunningRef.current = true;
    setPipelineError("");
    setPipelineResumeStep("");
    setLastError("");

    // Helper to reload manifest from current URL to get fresh state
    async function refreshManifestForPipeline() {
      const url = manifestUrlRef.current;
      if (!url) return;
      await loadManifest(url);
    }

    // Helper: save checkpoint after each step so we can resume on reload
    function saveCheckpoint(completedStep: PipelineStep) {
      try {
        localStorage.setItem("storyline-pipeline-checkpoint", JSON.stringify({
          projectId,
          manifestUrl: manifestUrlRef.current,
          completedStep,
          timestamp: Date.now(),
        }));
      } catch { /* ignore storage errors */ }
    }

    function clearCheckpoint() {
      try { localStorage.removeItem("storyline-pipeline-checkpoint"); } catch { /* ignore */ }
    }

    // Determine which steps to skip (for resume)
    const stepKeys: PipelineStep[] = ["process", "format", "rasterize", "detect", "tag", "style", "schema"];
    const startIdx = startFrom ? stepKeys.indexOf(startFrom) : 0;

    try {
      // Step 1: Process Text
      if (startIdx <= 0) {
        setPipelineStep("process");
        log("[Pipeline] Processing text...");
        await processPdf();
        await refreshManifestForPipeline();
        saveCheckpoint("process");
      }

      // Step 2: Format Text
      if (startIdx <= 1) {
        setPipelineStep("format");
        log("[Pipeline] Formatting text...");
        await loadExtractedText();
        saveCheckpoint("format");
      }

      // Step 3: Rasterize
      if (startIdx <= 2) {
        setPipelineStep("rasterize");
        log("[Pipeline] Rasterizing pages...");
        await rasterizeToPngs();
        await refreshManifestForPipeline();
        saveCheckpoint("rasterize");
      }

      // Step 4: Detect Images
      if (startIdx <= 3) {
        setPipelineStep("detect");
        log("[Pipeline] Detecting images...");
        await splitImages();
        await refreshManifestForPipeline();
        saveCheckpoint("detect");
      }

      // Step 5: Tag Assets
      if (startIdx <= 4) {
        setPipelineStep("tag");
        log("[Pipeline] Tagging assets...");
        await tagAssets();
        await refreshManifestForPipeline();
        saveCheckpoint("tag");
      }

      // Step 6: Analyze Style
      if (startIdx <= 5) {
        setPipelineStep("style");
        log("[Pipeline] Analyzing style...");
        await analyzeStyle();
        await refreshManifestForPipeline();
        saveCheckpoint("style");
      }

      // Step 7: Fill Schema
      if (startIdx <= 6) {
        setPipelineStep("schema");
        log("[Pipeline] Filling schema...");
        await fillSchema();
        saveCheckpoint("schema");
      }

      setPipelineStep("done");
      clearCheckpoint();
      log("[Pipeline] Complete!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPipelineError(msg);
      // Save checkpoint at the failed step so user can resume
      if (pipelineStep) {
        setPipelineResumeStep(pipelineStep as PipelineStep);
      }
      log(`[Pipeline] Error at step ${pipelineStep}: ${msg}`);
    } finally {
      setPipelineRunning(false);
      pipelineRunningRef.current = false;
    }
  }

  function getPipelineCurrentStepIndex(): number {
    if (!pipelineStep) return -1;
    return PIPELINE_STEPS.findIndex(s => s.key === pipelineStep);
  }

  function getPipelinePercent(): number {
    if (pipelineStep === "done") return 100;
    const idx = getPipelineCurrentStepIndex();
    if (idx < 0) return 0;
    // 8 real steps (excluding "done"), distribute evenly
    return Math.round((idx / (PIPELINE_STEPS.length - 1)) * 100);
  }

  async function openProject(p: ProjectRow) {
    setLastError("");
    setProjectId(p.projectId);
    setManifestUrl(p.manifestUrl);
    setUrlParams(p.projectId, p.manifestUrl);

    try {
      await loadManifest(p.manifestUrl);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      await refreshProjects();
    }
  }

  async function openStartupPreviousProject() {
    if (!selectedStartupProject) return;

    await openProject(selectedStartupProject);
    setStartupOpen(false);
  }

  async function loadExtractedText() {
    const m = pipelineRunningRef.current ? manifestRef.current : manifest;
    if (!m?.extractedText?.url) {
      setLastError("No extracted text available. Run 'Process Text' first.");
      return;
    }

    setTextLoading(true);
    log("Loading extracted text...");

    try {
      // Load raw extracted text
      const res = await fetch(m.extractedText!.url);
      if (!res.ok) throw new Error(`Failed to fetch text: ${res.status}`);
      const raw = await res.text();
      setExtractedText(raw);
      log(`Loaded ${raw.length} chars of extracted text`);

      // Check if we have cached formatted text
      if (m.formattedText?.url) {
        log("Loading cached formatted text...");
        const cachedRes = await fetch(m.formattedText!.url);
        if (cachedRes.ok) {
          const cachedText = await cachedRes.text();
          setFormattedText(cachedText);
          log("Loaded cached formatted text");
          setTextPanelOpen(true);
          return;
        }
        log("Failed to load cached text, re-formatting...");
      }

      // Format with Gemini and cache the result
      log("Formatting with Gemini...");
      const mUrl = pipelineRunningRef.current ? manifestUrlRef.current : manifestUrl;
      const fRes = await fetch("/api/projects/format-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl: mUrl, text: raw })
      });

      if (!fRes.ok) {
        log("Gemini formatting failed, showing raw text");
        setFormattedText(raw);
      } else {
        const fj = (await fRes.json()) as { ok: boolean; formatted?: string; manifestUrl?: string; error?: string };
        if (fj.ok && fj.formatted) {
          setFormattedText(fj.formatted);
          log("Text formatted and cached successfully");
          // Update manifest URL if it changed (due to caching)
          if (fj.manifestUrl) {
            setManifestUrl(fj.manifestUrl);
            manifestUrlRef.current = fj.manifestUrl;
            setUrlParams(projectId, fj.manifestUrl);
            await loadManifest(fj.manifestUrl);
          }
        } else {
          log(fj.error || "Format failed, showing raw");
          setFormattedText(raw);
        }
      }

      setTextPanelOpen(true);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      log(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTextLoading(false);
    }
  }

  async function clearFormattedText() {
    if (!projectId || !manifestUrl) return;

    setTextLoading(true);
    log("Clearing formatted text...");

    try {
      const res = await fetch("/api/projects/format-text/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl })
      });

      if (!res.ok) throw new Error(`Failed to clear: ${res.status}`);

      const json = (await res.json()) as { ok: boolean; manifestUrl?: string; error?: string };
      if (json.ok) {
        setFormattedText("");
        // Update manifest locally without reloading (to avoid re-fetching old cached text)
        if (manifest) {
          const updatedManifest = { ...manifest };
          delete updatedManifest.formattedText;
          setManifest(updatedManifest);
        }
        if (json.manifestUrl) {
          setManifestUrl(json.manifestUrl);
          setUrlParams(projectId, json.manifestUrl);
        }
        log("Formatted text cleared");
      } else {
        throw new Error(json.error || "Clear failed");
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      log(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTextLoading(false);
    }
  }

  async function saveFormattedText() {
    if (!projectId || !manifestUrl) return;
    
    setTextSaving(true);
    log("Saving formatted text...");

    try {
      const res = await fetch("/api/projects/format-text/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl, text: formattedTextDraft })
      });

      if (!res.ok) throw new Error(`Failed to save: ${res.status}`);

      const json = (await res.json()) as { ok: boolean; manifestUrl?: string; error?: string };
      if (json.ok) {
        setFormattedText(formattedTextDraft);
        setTextEditing(false);
        if (json.manifestUrl) {
          setManifestUrl(json.manifestUrl);
          setUrlParams(projectId, json.manifestUrl);
          await loadManifest(json.manifestUrl);
        }
        log("Formatted text saved");
      } else {
        throw new Error(json.error || "Save failed");
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      log(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTextSaving(false);
    }
  }

  async function deleteAsset(pageNumber: number, assetId: string) {
    if (!projectId || !manifestUrl) return;

    const key = `${pageNumber}-${assetId}`;
    if (deletingAssets[key]) return;

    setDeletingAssets((m) => ({ ...m, [key]: true }));
    setLastError("");

    setManifest((prev) => {
      if (!prev?.pages) return prev;
      return {
        ...prev,
        pages: prev.pages.map((p) => {
          if (p.pageNumber !== pageNumber) return p;
          const assets = Array.isArray(p.assets) ? p.assets : [];
          const deleted = Array.isArray(p.deletedAssetIds) ? p.deletedAssetIds : [];
          const nextDeleted = deleted.includes(assetId) ? deleted : [...deleted, assetId];
          return { ...p, assets: assets.filter((a) => a.assetId !== assetId), deletedAssetIds: nextDeleted };
        })
      };
    });

    try {
      const r = await fetch("/api/projects/assets/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl, pageNumber, assetId })
      });

      const j = (await r.json().catch(() => null)) as { ok?: boolean; manifestUrl?: string; error?: string } | null;
      if (!r.ok || !j?.ok || !j.manifestUrl) throw new Error(j?.error || `Delete failed (${r.status})`);

      setManifestUrl(j.manifestUrl);
      setUrlParams(projectId, j.manifestUrl);
      await loadManifest(j.manifestUrl);
      await refreshProjects();
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      await loadManifest(manifestUrl);
    } finally {
      setDeletingAssets((m) => {
        const copy = { ...m };
        delete copy[key];
        return copy;
      });
    }
  }

  const pagesCount = manifest?.pages?.length ?? 0;

  const totalAssetsCount =
    (manifest?.pages ?? []).reduce((acc, p) => acc + (Array.isArray(p.assets) ? p.assets.length : 0), 0) ?? 0;

  const assetsFlat = useMemo(() => {
    const out: Array<{ pageNumber: number; asset: PageAsset }> = [];
    for (const p of manifest?.pages ?? []) {
      for (const a of p.assets ?? []) out.push({ pageNumber: p.pageNumber, asset: a });
    }
    return out;
  }, [manifest]);

  const taggedAssetsCount = useMemo(() => {
    let n = 0;
    for (const p of manifest?.pages ?? []) {
      for (const a of p.assets ?? []) {
        if (Array.isArray(a.tags) && a.tags.length > 0) n += 1;
      }
    }
    return n;
  }, [manifest]);

  const assetCard = (pageNumber: number, asset: PageAsset) => {
    const tags = Array.isArray(asset.tags) ? asset.tags : [];
    const negativeTags = Array.isArray(asset.negativeTags) ? asset.negativeTags : [];
    const trigger = asset.trigger || "";
    const delKey = `${pageNumber}-${asset.assetId}`;
    const delBusy = !!deletingAssets[delKey] || !!busy;

    return (
      <div
        key={`${pageNumber}-${asset.assetId}`}
        style={{
          border: "1px solid rgba(0,0,0,0.25)",
          borderRadius: 12,
          overflow: "hidden",
          background: "#fff",
          position: "relative"
        }}
      >
        <button
          type="button"
          aria-label="Delete asset"
          disabled={delBusy}
          onClick={() => void deleteAsset(pageNumber, asset.assetId)}
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: 10,
            border: "1px solid #000",
            background: "#fff",
            display: "grid",
            placeItems: "center",
            opacity: delBusy ? 0.4 : 1,
            cursor: delBusy ? "not-allowed" : "pointer",
            zIndex: 2
          }}
        >
          <XIcon />
        </button>

        <div style={{ aspectRatio: "1 / 1", background: "rgba(0,0,0,0.03)" }}>
          {(asset.thumbnailUrl || asset.url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bust(asset.thumbnailUrl || asset.url)}
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 12 }}>
              No image URL
            </div>
          )}
        </div>

        <div style={{ padding: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>
            p{pageNumber} · {asset.assetId}
          </div>

          {/* Title and Description from detection */}
          {asset.title && (
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: 8 }}>
              {asset.title}
              {asset.category && (
                <span style={{
                  background: "#e0f2fe",
                  color: "#0369a1",
                  borderRadius: 6,
                  padding: "2px 6px",
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase"
                }}>
                  {asset.category}
                </span>
              )}
            </div>
          )}
          {!asset.title && asset.category && (
            <div style={{ marginTop: 6 }}>
              <span style={{
                background: "#e0f2fe",
                color: "#0369a1",
                borderRadius: 6,
                padding: "2px 6px",
                fontSize: 10,
                fontWeight: 600,
                textTransform: "uppercase"
              }}>
                {asset.category}
              </span>
            </div>
          )}
          {asset.description && (
            <div style={{ marginTop: 4, fontSize: 12, color: "#64748b", lineHeight: 1.4 }}>
              {asset.description}
            </div>
          )}

          {/* Trigger */}
          {trigger && (
            <div style={{ marginTop: 8 }}>
              <span
                style={{
                  background: "#000",
                  color: "#fff",
                  borderRadius: 6,
                  padding: "3px 8px",
                  fontSize: 11,
                  fontWeight: 600
                }}
              >
                🎯 {trigger}
              </span>
            </div>
          )}

          {/* Positive tags */}
          {tags.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {tags.slice(0, 20).map((t) => (
                <span
                  key={t}
                  style={{
                    border: "1px solid rgba(0,0,0,0.25)",
                    borderRadius: 999,
                    padding: "3px 8px",
                    fontSize: 12
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Negative tags */}
          {negativeTags.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {negativeTags.slice(0, 15).map((t) => (
                <span
                  key={t}
                  style={{
                    background: "#fef2f2",
                    border: "1px solid #fca5a5",
                    color: "#b91c1c",
                    borderRadius: 999,
                    padding: "3px 8px",
                    fontSize: 12
                  }}
                >
                  ✗ {t}
                </span>
              ))}
            </div>
          )}

          {/* Rationale */}
          {asset.tagRationale && (
            <details style={{ marginTop: 10 }}>
              <summary
                style={{
                  fontSize: 11,
                  color: "#64748b",
                  cursor: "pointer",
                  userSelect: "none"
                }}
              >
                💡 Rationale
              </summary>
              <div
                style={{
                  marginTop: 6,
                  padding: 8,
                  background: "#f8fafc",
                  borderRadius: 8,
                  fontSize: 11,
                  color: "#475569",
                  lineHeight: 1.5
                }}
              >
                {asset.tagRationale}
              </div>
            </details>
          )}
        </div>
      </div>
    );
  };

  if (startupOpen) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
        background: "#fafafa",
      }}>
        <div style={{ width: "min(560px, 100%)" }}>
          <div style={{
            fontSize: 96,
            fontWeight: 900,
            letterSpacing: -3,
            color: "#0f172a",
            marginBottom: 6,
            textAlign: "center",
            lineHeight: 1,
          }}>
            STORYLINE
          </div>
          <div style={{
            fontSize: 16,
            color: "#64748b",
            textAlign: "center",
            marginBottom: 40,
          }}>
            Build your narrative schema
          </div>

          <div style={{ display: "grid", gap: 12 }}>
              <button
                type="button"
                onClick={() => setStartupOpen(false)}
                style={{
                  textAlign: "left",
                  border: "1px dashed #cbd5e1",
                  background: "#fafbfc",
                  borderRadius: 12,
                  padding: "18px 20px",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#0f172a")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
              >
                <div style={{ fontSize: 17, fontWeight: 700, color: "#64748b" }}>
                  Just an idea…
                </div>
                <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                  We will elaborate more on that later — go to an empty page for now.
                </div>
              </button>

              <button
                type="button"
                onClick={() => { window.location.href = "/extraction"; }}
                style={{
                  textAlign: "left",
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  borderRadius: 12,
                  padding: "18px 20px",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#0f172a")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
              >
                <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
                  New Project
                </div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                  Start fresh — upload text, images, or both.
                </div>
              </button>

              <button
                type="button"
                onClick={() => { window.location.href = "/memos"; }}
                style={{
                  textAlign: "left",
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  borderRadius: 12,
                  padding: "18px 20px",
                  cursor: "pointer",
                  transition: "border-color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#0f172a")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
              >
                <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
                  Memos
                </div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                  Daily notes — text, voice, or images — that evolve into a story.
                </div>
              </button>

              <div
                style={{
                  border: startupStep === "previous-project" ? "1px solid #0f172a" : "1px solid #e2e8f0",
                  background: "#fff",
                  borderRadius: 12,
                  padding: "18px 20px",
                  cursor: startupStep === "previous-project" ? "default" : "pointer",
                  transition: "border-color 0.15s",
                }}
                onClick={() => { if (startupStep !== "previous-project") setStartupStep("previous-project"); }}
                onMouseEnter={(e) => { if (startupStep !== "previous-project") e.currentTarget.style.borderColor = "#0f172a"; }}
                onMouseLeave={(e) => { if (startupStep !== "previous-project") e.currentTarget.style.borderColor = "#e2e8f0"; }}
              >
                <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a" }}>
                  Open Project
                </div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
                  Resume where you left off.
                </div>

                {startupStep === "previous-project" && (
                  <div style={{ marginTop: 14 }}>
                    <select
                      value={startupProjectId}
                      onChange={(e) => setStartupProjectId(e.target.value)}
                      disabled={projectsBusy}
                      style={{
                        width: "100%",
                        padding: 12,
                        border: "1px solid #e2e8f0",
                        borderRadius: 10,
                        fontSize: 14,
                        marginBottom: 10,
                        background: "#fff",
                      }}
                    >
                      <option value="">Select a project...</option>
                      {projects.map((p) => (
                        <option key={p.projectId} value={p.projectId}>
                          {p.filename || "(untitled)"} ({p.projectId.slice(0, 8)})
                        </option>
                      ))}
                    </select>

                    {projectsBusy && (
                      <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>Loading projects...</div>
                    )}

                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setStartupStep("pick-mode"); setStartupProjectId(""); }}
                        style={{
                          border: "1px solid #e2e8f0",
                          background: "#fff",
                          color: "#0f172a",
                          borderRadius: 8,
                          padding: "8px 14px",
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        Collapse
                      </button>
                      <button
                        type="button"
                        disabled={!selectedStartupProject}
                        onClick={(e) => { e.stopPropagation(); void openStartupPreviousProject(); }}
                        style={{
                          border: "1px solid #0f172a",
                          background: selectedStartupProject ? "#0f172a" : "#e2e8f0",
                          color: selectedStartupProject ? "#fff" : "#94a3b8",
                          borderRadius: 8,
                          padding: "8px 14px",
                          fontSize: 13,
                          cursor: selectedStartupProject ? "pointer" : "not-allowed",
                        }}
                      >
                        Open
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", padding: 28 }}>
      {/* Row 1: App name + buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setStartupOpen(true)}
          style={{
            fontSize: 26,
            fontWeight: 800,
            letterSpacing: -0.3,
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: "#0f172a",
          }}
        >
          STORYLINE
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            style={{
              border: "1px solid #000",
              background: "#fff",
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6
            }}
          >
            ⚙️ Settings
          </button>
          <a
            href="https://docs.google.com/document/d/1psP9VqNS9_4SU_psH3xO6bJxytYvXALpPSeOyf0jj1U/edit?usp=sharing"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              border: "1px solid #000",
              background: "#fff",
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "none",
              color: "#000",
              display: "inline-flex",
              alignItems: "center",
              gap: 6
            }}
          >
            📖 Manual
          </a>
          <a
            href="/api/log-visit?secret=storyline-admin-2024"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              border: "1px solid #64748b",
              background: "#f8fafc",
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              textDecoration: "none",
              color: "#64748b",
              display: "inline-flex",
              alignItems: "center",
              gap: 6
            }}
          >
            📊 Activity Logs
          </a>
        </div>
      </div>

      {/* Intro Modal */}
      {/* Row 2: Pipeline progress bar (auto mode) or step buttons (step-by-step mode) */}
      {stepByStepMode ? (
        <>
          <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={!!busy || !!manifest?.sourcePdf?.url}
              onClick={() => fileRef.current?.click()}
              style={{
                border: "1px solid #000",
                background: manifest?.sourcePdf?.url ? "#16a34a" : "#fff",
                color: manifest?.sourcePdf?.url ? "#fff" : "#000",
                padding: "10px 12px",
                borderRadius: 12,
                cursor: manifest?.sourcePdf?.url ? "default" : "pointer"
              }}
            >
              {manifest?.sourcePdf?.url ? "✓ Source Loaded" : "1. Load Source"}
            </button>

            <button
              type="button"
              disabled={!manifest?.sourcePdf?.url || !!busy || !!manifest?.extractedText?.url}
              onClick={() => void processPdf()}
              style={{
                border: "1px solid #000",
                background: manifest?.extractedText?.url ? "#16a34a" : (manifest?.sourcePdf?.url && !busy ? "#000" : "#fff"),
                color: manifest?.extractedText?.url ? "#fff" : (manifest?.sourcePdf?.url && !busy ? "#fff" : "#000"),
                padding: "10px 12px",
                borderRadius: 12,
                opacity: manifest?.extractedText?.url ? 1 : (manifest?.sourcePdf?.url && !busy ? 1 : 0.4),
                cursor: manifest?.extractedText?.url ? "default" : "pointer"
              }}
            >
              {manifest?.extractedText?.url ? "✓ Text Extracted" : "2. Process Text"}
            </button>

            <button
              type="button"
              disabled={!manifest?.extractedText?.url || !!busy || textLoading || !!formattedText}
              onClick={() => {
                if (formattedText) {
                  setTextPanelOpen(true);
                } else {
                  void loadExtractedText();
                }
              }}
              style={{
                border: "1px solid #000",
                background: formattedText ? "#16a34a" : (manifest?.extractedText?.url && !busy ? "#000" : "#fff"),
                color: formattedText ? "#fff" : (manifest?.extractedText?.url && !busy ? "#fff" : "#000"),
                padding: "10px 12px",
                borderRadius: 12,
                opacity: formattedText ? 1 : (manifest?.extractedText?.url && !busy ? 1 : 0.4),
                cursor: formattedText ? "default" : "pointer"
              }}
            >
              {textLoading ? "Formatting..." : formattedText ? "✓ Text Formatted" : "3. Format Text"}
            </button>

            <button
              type="button"
              disabled={!manifest?.sourcePdf?.url || !!busy || rasterProgress.running || !!manifest?.pages?.length}
              onClick={() => void rasterizeToPngs()}
              style={{
                border: "1px solid #000",
                background: manifest?.pages?.length ? "#16a34a" : (manifest?.sourcePdf?.url && !busy ? "#000" : "#fff"),
                color: manifest?.pages?.length ? "#fff" : (manifest?.sourcePdf?.url && !busy ? "#fff" : "#000"),
                padding: "10px 12px",
                borderRadius: 12,
                opacity: manifest?.pages?.length ? 1 : (manifest?.sourcePdf?.url && !busy ? 1 : 0.4),
                cursor: manifest?.pages?.length ? "default" : "pointer"
              }}
            >
              {manifest?.pages?.length ? "✓ Pages Rasterized" : "4. Rasterize PNGs"}
            </button>

            <button
              type="button"
              disabled={!manifest?.pages?.length || !!busy || splitProgress.running || !!totalAssetsCount}
              onClick={() => void splitImages()}
              style={{
                border: "1px solid #000",
                background: totalAssetsCount ? "#16a34a" : (manifest?.pages?.length && !busy ? "#000" : "#fff"),
                color: totalAssetsCount ? "#fff" : (manifest?.pages?.length && !busy ? "#fff" : "#000"),
                padding: "10px 12px",
                borderRadius: 12,
                opacity: totalAssetsCount ? 1 : (manifest?.pages?.length && !busy ? 1 : 0.4),
                cursor: totalAssetsCount ? "default" : "pointer"
              }}
            >
              {totalAssetsCount ? `✓ ${totalAssetsCount} Images` : "5. Detect Images"}
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                disabled={!totalAssetsCount || !!busy || taggingProgress.running}
                onClick={() => void tagAssets()}
                style={{
                  border: "1px solid #000",
                  background: totalAssetsCount && !busy ? "#000" : "#fff",
                  color: totalAssetsCount && !busy ? "#fff" : "#000",
                  padding: "10px 12px",
                  borderRadius: 12,
                  opacity: totalAssetsCount && !busy ? 1 : 0.4
                }}
              >
                6. Tag Assets
              </button>
              <select
                value={taggingModel}
                onChange={(e) => setTaggingModel(e.target.value)}
                disabled={!!busy || taggingProgress.running}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #ccc",
                  fontSize: 12,
                  background: "#fff",
                  cursor: "pointer"
                }}
              >
                <option value="gemini-3.1-pro-preview">3.1-Pro-Preview</option>
                <option value="gemini-3-flash-preview">3-Flash-Preview</option>
                <option value="gemini-3-pro-preview">3-Pro-Preview</option>
                <option value="gemini-2.0-flash">2.0-Flash</option>
                <option value="gemini-2.0-flash-exp">2.0-Flash-Exp</option>
                <option value="gemini-1.5-flash">1.5-Flash</option>
                <option value="gemini-1.5-pro">1.5-Pro</option>
                <option value="gemini-2.5-pro-preview">2.5-Pro-Preview</option>
                <option value="gemini-2.5-flash-preview">2.5-Flash-Preview</option>
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={taggingOverwrite}
                  onChange={(e) => setTaggingOverwrite(e.target.checked)}
                  disabled={!!busy || taggingProgress.running}
                />
                Overwrite
              </label>
            </div>

            <button
              type="button"
              disabled={!totalAssetsCount || !!busy || styleAnalysisBusy}
              onClick={() => void analyzeStyle()}
              style={{
                border: "1px solid #000",
                background: manifest?.styleAnalysis?.url ? "#000" : (totalAssetsCount && !busy && !styleAnalysisBusy ? "#000" : "#fff"),
                color: manifest?.styleAnalysis?.url ? "#fff" : (totalAssetsCount && !busy && !styleAnalysisBusy ? "#fff" : "#000"),
                padding: "10px 12px",
                borderRadius: 12,
                opacity: totalAssetsCount && !busy && !styleAnalysisBusy ? 1 : 0.4
              }}
            >
              {styleAnalysisBusy ? "Analyzing..." : manifest?.styleAnalysis?.url ? "✓ Style Analyzed" : "7. Analyze Style"}
            </button>

            <button
              type="button"
              disabled={!manifestUrl || !!busy || schemaFillBusy}
              onClick={() => void fillSchema()}
              style={{
                border: "1px solid #000",
                background: manifestUrl && !busy && !schemaFillBusy ? "#000" : "#fff",
                color: manifestUrl && !busy && !schemaFillBusy ? "#fff" : "#000",
                padding: "10px 12px",
                borderRadius: 12,
                opacity: manifestUrl && !busy && !schemaFillBusy ? 1 : 0.4
              }}
            >
              8. Fill Schema
            </button>
          </div>

          {/* Row 3: Utility buttons aligned right */}
          <div style={{ marginTop: 12, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              disabled={!manifestUrl || !projectId || !!busy}
              onClick={() => void rebuildAssets()}
              style={{
                border: "1px solid #000",
                background: "#fff",
                padding: "10px 12px",
                borderRadius: 12,
                opacity: !manifestUrl || !projectId || busy ? 0.4 : 1
              }}
            >
              Rebuild assets
            </button>

            <button
              type="button"
              disabled={!manifestUrl || !projectId || !!busy}
              onClick={() => void restoreFromBlob()}
              style={{
                border: "1px solid #000",
                background: "#fff",
                padding: "10px 12px",
                borderRadius: 12,
                opacity: !manifestUrl || !projectId || busy ? 0.4 : 1
              }}
            >
              Restore
            </button>

            <button
              type="button"
              disabled={!manifestUrl || !projectId || !!busy}
              onClick={() => void resetTags()}
              style={{
                border: "1px solid #f59e0b",
                background: "#fff",
                color: "#d97706",
                padding: "10px 12px",
                borderRadius: 12,
                opacity: !manifestUrl || !projectId || busy ? 0.4 : 1
              }}
            >
              Reset Tags
            </button>

            <button
              type="button"
              disabled={!manifestUrl || !projectId || !!busy || !totalAssetsCount}
              onClick={() => void deleteAllAssets()}
              style={{
                border: "1px solid #dc2626",
                background: "#fff",
                color: "#dc2626",
                padding: "10px 12px",
                borderRadius: 12,
                opacity: !manifestUrl || !projectId || busy || !totalAssetsCount ? 0.4 : 1
              }}
            >
              Delete All Images
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Auto pipeline: progress bar + upload button */}
          <div style={{ marginTop: 18 }}>
            {/* Upload button if no source yet */}
            {!manifest?.sourcePdf?.url && !pipelineRunning && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => fileRef.current?.click()}
                style={{
                  border: "1px solid #000",
                  background: "#000",
                  color: "#fff",
                  padding: "14px 28px",
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                Upload Source PDF
              </button>
            )}

            {/* Pipeline progress bar */}
            {(manifest?.sourcePdf?.url || pipelineRunning) && (
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, background: "#fafbfc" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {pipelineStep === "done" ? "Pipeline Complete" : pipelineRunning ? "Processing..." : pipelineResumeStep && !pipelineError ? `Paused — ready to resume` : "Ready"}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {/* Resume button (checkpoint from page reload, not from inline error) */}
                    {!pipelineRunning && !pipelineError && pipelineResumeStep && pipelineStep !== "done" && manifest?.sourcePdf?.url && (
                      <button
                        type="button"
                        onClick={() => { const step = pipelineResumeStep as PipelineStep; setPipelineResumeStep(""); void runAutoPipeline(step); }}
                        disabled={!!busy}
                        style={{
                          border: "1px solid #16a34a",
                          background: "#16a34a",
                          color: "#fff",
                          padding: "8px 16px",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: busy ? "not-allowed" : "pointer",
                          opacity: busy ? 0.5 : 1,
                        }}
                      >
                        ▶ Resume from {PIPELINE_STEPS.find(s => s.key === pipelineResumeStep)?.label}
                      </button>
                    )}
                    {!pipelineRunning && pipelineStep !== "done" && manifest?.sourcePdf?.url && (
                      <button
                        type="button"
                        onClick={() => void runAutoPipeline()}
                        disabled={!!busy}
                        style={{
                          border: "1px solid #000",
                          background: "#000",
                          color: "#fff",
                          padding: "8px 16px",
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: busy ? "not-allowed" : "pointer",
                          opacity: busy ? 0.5 : 1,
                        }}
                      >
                        ▶ Run Pipeline
                      </button>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                      {getPipelinePercent()}%
                    </span>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{
                  width: "100%",
                  height: 8,
                  background: "#e2e8f0",
                  borderRadius: 4,
                  overflow: "hidden",
                  marginBottom: 12,
                }}>
                  <div style={{
                    width: `${getPipelinePercent()}%`,
                    height: "100%",
                    background: pipelineError ? "#ef4444" : pipelineStep === "done" ? "#16a34a" : "#0f172a",
                    borderRadius: 4,
                    transition: "width 0.5s ease",
                  }} />
                </div>

                {/* Step indicators */}
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {PIPELINE_STEPS.filter(s => s.key !== "done").map((step, i) => {
                    const currentIdx = getPipelineCurrentStepIndex();
                    const isActive = pipelineStep === step.key;
                    const isDone = currentIdx > i || pipelineStep === "done";
                    return (
                      <div
                        key={step.key}
                        style={{
                          fontSize: 11,
                          padding: "3px 8px",
                          borderRadius: 6,
                          background: isActive ? "#0f172a" : isDone ? "#16a34a" : "#f1f5f9",
                          color: isActive || isDone ? "#fff" : "#64748b",
                          fontWeight: isActive ? 700 : 500,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {isDone && !isActive ? "✓ " : ""}{step.label}
                      </div>
                    );
                  })}
                </div>

                {/* Sub-progress details */}
                {pipelineRunning && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#64748b" }}>
                    {busy && <div>{busy}</div>}
                    {rasterProgress.totalPages > 0 && (
                      <div>Raster: {rasterProgress.currentPage}/{rasterProgress.totalPages} pages · {rasterProgress.uploaded} uploaded</div>
                    )}
                    {splitProgress.totalPages > 0 && (
                      <div>Detect: page {splitProgress.page}/{splitProgress.totalPages} · {splitProgress.assetsUploaded} assets</div>
                    )}
                    {taggingProgress.running && (
                      <div>Tagging: {taggingProgress.tagged}/{taggingProgress.total} assets</div>
                    )}
                  </div>
                )}

                {/* Pipeline error */}
                {pipelineError && (
                  <div style={{ marginTop: 10, fontSize: 12, color: "#ef4444", fontWeight: 600 }}>
                    Error at {PIPELINE_STEPS.find(s => s.key === pipelineResumeStep)?.label || pipelineStep}: {pipelineError}
                    <button
                      type="button"
                      onClick={() => { setPipelineError(""); void runAutoPipeline(pipelineResumeStep as PipelineStep || undefined); }}
                      style={{
                        marginLeft: 10,
                        border: "1px solid #000",
                        background: "#000",
                        color: "#fff",
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Resume from {PIPELINE_STEPS.find(s => s.key === pipelineResumeStep)?.label || "failed step"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Working Panel (step-by-step mode only) */}
      {stepByStepMode && !!busy && (
        <div style={{ marginTop: 18, border: "1px solid #000", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Working</div>
          <div style={{ marginTop: 6, fontSize: 13, opacity: 0.8 }}>{busy}</div>

          {rasterProgress.totalPages > 0 && (
            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
              Raster: {rasterProgress.currentPage}/{rasterProgress.totalPages} · {rasterProgress.uploaded}/
              {rasterProgress.totalPages}
            </div>
          )}

          {splitProgress.totalPages > 0 && (
            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
              Detect: {splitProgress.page}/{splitProgress.totalPages} · {splitProgress.assetsUploaded} assets
            </div>
          )}

          {taggingProgress.running && (
            <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
              Tagging: {taggingProgress.tagged}/{taggingProgress.total} assets
            </div>
          )}
        </div>
      )}

      {/* Error Panel */}
      {!!lastError && (
        <div style={{ marginTop: 18, border: "1px solid #000", borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 800 }}>Error</div>
          <div style={{ marginTop: 6, fontSize: 13, whiteSpace: "pre-wrap" }}>{lastError}</div>
        </div>
      )}

      {/* Settings Overlay */}
      {settingsOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.5)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}>
          <div style={{
            background: "#fff",
            borderRadius: 16,
            width: "90vw",
            maxWidth: 1100,
            maxHeight: "90vh",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
            overflow: "hidden",
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "14px 20px",
              borderBottom: "1px solid #e2e8f0",
            }}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Settings</div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                style={{
                  border: "1px solid #000",
                  background: "#fff",
                  padding: "6px 14px",
                  borderRadius: 8,
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                ✕ Close
              </button>
            </div>

            <div style={{ padding: "14px 20px", overflowY: "auto", flex: 1 }}>

            {/* Pipeline mode toggle */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              background: "#f8fafc",
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              marginBottom: 14,
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Step-by-step mode</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                  Show individual pipeline buttons instead of the automatic progress bar
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={stepByStepMode}
                  onChange={(e) => {
                    const v = e.target.checked;
                    setStepByStepMode(v);
                    localStorage.setItem("storyline-step-by-step", String(v));
                  }}
                  style={{ width: 18, height: 18, cursor: "pointer" }}
                />
              </label>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", overflow: "hidden", width: "100%" }}>
              <Tabs value={settingsTab} onChange={setSettingsTab} />
            </div>

            {/* Version History Controls + AI Helper (hidden for info-only tabs) */}
            {settingsTab !== "debugLog" && settingsTab !== "cloudState" && (<div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void saveVersionSnapshot()}
                disabled={!getCurrentSettingsContent(settingsTab).trim() || settingsBusy || !projectId || !manifestUrl}
                style={{
                  border: "1px solid #000",
                  background: settingsBusy ? "#000" : "#fff",
                  color: settingsBusy ? "#fff" : "#000",
                  padding: "6px 10px",
                  borderRadius: 8,
                  fontSize: 12,
                  cursor: (!getCurrentSettingsContent(settingsTab).trim() || settingsBusy || !projectId || !manifestUrl) ? "not-allowed" : "pointer",
                  opacity: (!getCurrentSettingsContent(settingsTab).trim() || !projectId || !manifestUrl) ? 0.5 : 1
                }}
              >
                {settingsBusy ? "💾 Saving..." : "📸 Save Version"}
              </button>
              <button
                type="button"
                onClick={() => setShowHistoryPanel((v) => !v)}
                style={{
                  border: "1px solid #000",
                  background: showHistoryPanel ? "#eee" : "#fff",
                  padding: "6px 10px",
                  borderRadius: 8,
                  fontSize: 12,
                  cursor: "pointer"
                }}
              >
                📜 History ({(settingsHistory[getHistoryKey(settingsTab)] ?? []).length})
              </button>
              <button
                type="button"
                onClick={() => setAiHelperOpen((v) => !v)}
                style={{
                  border: "1px solid #000",
                  background: aiHelperOpen ? "#000" : "#fff",
                  color: aiHelperOpen ? "#fff" : "#000",
                  padding: "6px 10px",
                  borderRadius: 8,
                  fontSize: 12,
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                🤖 AI Helper
              </button>
              <button
                type="button"
                onClick={() => setSettingsUndocked((v) => !v)}
                title={settingsUndocked ? "Dock editor" : "Expand editor fullscreen"}
                style={{
                  border: "1px solid #000",
                  background: settingsUndocked ? "#000" : "#fff",
                  color: settingsUndocked ? "#fff" : "#000",
                  padding: "6px 10px",
                  borderRadius: 8,
                  fontSize: 12,
                  cursor: "pointer"
                }}
              >
                {settingsUndocked ? "⊟ Dock" : "⊞ Expand"}
              </button>
            </div>)}

            {/* History Panel */}
            {showHistoryPanel && (
              <div style={{
                marginTop: 10,
                border: "1px solid rgba(0,0,0,0.3)",
                borderRadius: 10,
                padding: 10,
                maxHeight: 200,
                overflowY: "auto",
                background: "#fafafa"
              }}>
                <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>
                  Version History — {settingsTab.charAt(0).toUpperCase() + settingsTab.slice(1)}
                </div>
                {(settingsHistory[getHistoryKey(settingsTab)] ?? []).length === 0 ? (
                  <div style={{ fontSize: 12, color: "#666" }}>No saved versions yet. Click &quot;Save Version&quot; to create a snapshot.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(settingsHistory[getHistoryKey(settingsTab)] ?? []).map((entry, i) => (
                      <div key={i} style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "6px 8px",
                        background: "#fff",
                        border: "1px solid rgba(0,0,0,0.15)",
                        borderRadius: 6,
                        fontSize: 12
                      }}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 600 }}>
                            {new Date(entry.timestamp).toLocaleString()}
                          </span>
                          {entry.label && <span style={{ marginLeft: 8, color: "#666" }}>({entry.label})</span>}
                          <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>
                            {entry.content.length} chars
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            type="button"
                            onClick={() => restoreVersion(entry)}
                            style={{
                              border: "1px solid #000",
                              background: "#000",
                              color: "#fff",
                              padding: "4px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              cursor: "pointer"
                            }}
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteVersion(i)}
                            disabled={settingsBusy}
                            style={{
                              border: "1px solid #c00",
                              background: "#fff",
                              color: "#c00",
                              padding: "4px 8px",
                              borderRadius: 6,
                              fontSize: 11,
                              cursor: settingsBusy ? "not-allowed" : "pointer",
                              opacity: settingsBusy ? 0.5 : 1
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fullscreen Settings Editor Modal */}
            {settingsUndocked && (
              <div style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0,0,0,0.5)",
                zIndex: 999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 20
              }}>
                <div style={{
                  background: "#fff",
                  borderRadius: 16,
                  width: "90vw",
                  maxWidth: 1200,
                  height: "90vh",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
                }}>
                  {/* Header */}
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "16px 20px",
                    borderBottom: "1px solid #e5e7eb"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ fontWeight: 800, fontSize: 16 }}>
                        {settingsTab.charAt(0).toUpperCase() + settingsTab.slice(1)} Editor
                      </span>
                      <Tabs value={settingsTab} onChange={setSettingsTab} />
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        type="button"
                        onClick={() => setSettingsUndocked(false)}
                        style={{
                          border: "1px solid #000",
                          background: "#fff",
                          padding: "8px 16px",
                          borderRadius: 8,
                          fontSize: 13,
                          cursor: "pointer"
                        }}
                      >
                        ✕ Close
                      </button>
                    </div>
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, padding: 20, overflow: "hidden" }}>
                    {settingsTab === "ai" && (
                      <textarea
                        value={aiRulesDraft}
                        onChange={(e) => setAiRulesDraft(e.target.value)}
                        placeholder="Enter AI rules for analysis..."
                        style={{
                          width: "100%",
                          height: "100%",
                          border: "1px solid rgba(0,0,0,0.35)",
                          borderRadius: 12,
                          padding: 16,
                          fontSize: 14,
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                          boxSizing: "border-box",
                          resize: "none"
                        }}
                      />
                    )}
                    {settingsTab === "schema" && (
                      <textarea
                        value={schemaJsonDraft}
                        onChange={(e) => setSchemaJsonDraft(e.target.value)}
                        placeholder='{"levels": {"L1": {...}, "L2": {...}, "L3": {...}}, "categories": [...]}'
                        style={{
                          width: "100%",
                          height: "100%",
                          border: "1px solid rgba(0,0,0,0.35)",
                          borderRadius: 12,
                          padding: 16,
                          fontSize: 14,
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                          boxSizing: "border-box",
                          resize: "none"
                        }}
                      />
                    )}
                    {settingsTab === "completeness" && (
                      <textarea
                        value={completenessRulesDraft}
                        onChange={(e) => setCompletenessRulesDraft(e.target.value)}
                        placeholder='{"weights": {"OVERVIEW": 20, ...}}'
                        style={{
                          width: "100%",
                          height: "100%",
                          border: "1px solid rgba(0,0,0,0.35)",
                          borderRadius: 12,
                          padding: 16,
                          fontSize: 14,
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                          boxSizing: "border-box",
                          resize: "none"
                        }}
                      />
                    )}
                    {settingsTab === "detection" && (
                      <textarea
                        value={detectionRulesJsonDraft}
                        onChange={(e) => setDetectionRulesJsonDraft(e.target.value)}
                        placeholder='{"targets": [...], "ignore": [...], "minimumSize": {...}}'
                        style={{
                          width: "100%",
                          height: "100%",
                          border: "1px solid rgba(0,0,0,0.35)",
                          borderRadius: 12,
                          padding: 16,
                          fontSize: 14,
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                          boxSizing: "border-box",
                          resize: "none"
                        }}
                      />
                    )}
                    {settingsTab === "styleRules" && (
                      <div style={{ padding: 16, height: "100%", overflow: "auto" }}>
                        <div style={{ marginBottom: 12, fontSize: 13, color: "#666" }}>
                          Configure how Gemini 3 Pro Preview analyzes images for style information. Edit the rules below to customize analysis categories, output schema, and behavior.
                        </div>
                        <textarea
                          value={styleRulesJsonDraft}
                          onChange={(e) => setStyleRulesJsonDraft(e.target.value)}
                          placeholder='{"systemRole": "...", "analysisCategories": [...], "outputSchema": {...}, "rules": [...]}'
                          style={{
                            width: "100%",
                            height: "calc(100% - 60px)",
                            border: "1px solid rgba(0,0,0,0.35)",
                            borderRadius: 12,
                            padding: 16,
                            fontSize: 14,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            boxSizing: "border-box",
                            resize: "none"
                          }}
                        />
                      </div>
                    )}
                    {settingsTab === "style" && (
                      <div style={{ padding: 16, height: "100%", overflow: "auto" }}>
                        <div style={{ marginBottom: 12, fontSize: 13, color: "#666" }}>
                          Style analysis from Gemini 3 Pro image analysis. This data is used to fill STYLE domain fields in the schema.
                        </div>
                        <textarea
                          value={styleAnalysisDraft}
                          onChange={(e) => setStyleAnalysisDraft(e.target.value)}
                          placeholder="No style analysis yet. Run 'Analyze Style' to generate."
                          style={{
                            width: "100%",
                            height: "calc(100% - 60px)",
                            border: "1px solid rgba(0,0,0,0.35)",
                            borderRadius: 12,
                            padding: 16,
                            fontSize: 14,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            boxSizing: "border-box",
                            resize: "none"
                          }}
                        />
                      </div>
                    )}
                    {settingsTab === "taggerPrompt" && (
                      <div style={{ padding: 16, height: "100%", overflow: "auto" }}>
                        <div style={{ marginBottom: 12, fontSize: 13, color: "#666" }}>
                          LLM Core Prompt — defines how the AI should analyze and extract structured tags from images. This prompt is sent to the model for each asset.
                        </div>
                        <textarea
                          value={taggerPromptJsonDraft}
                          onChange={(e) => setTaggerPromptJsonDraft(e.target.value)}
                          placeholder='{"system": [...], "task": "...", "outputSchema": {...}, "rules": [...]}'
                          style={{
                            width: "100%",
                            height: "calc(100% - 60px)",
                            border: "1px solid rgba(0,0,0,0.35)",
                            borderRadius: 12,
                            padding: 16,
                            fontSize: 14,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            boxSizing: "border-box",
                            resize: "none"
                          }}
                        />
                      </div>
                    )}
                    {settingsTab === "taggerEnforcer" && (
                      <div style={{ padding: 16, height: "100%", overflow: "auto" }}>
                        <div style={{ marginBottom: 12, fontSize: 13, color: "#666" }}>
                          Hard Enforcement Config — post-processing rules applied after LLM response. Controls tag normalization, banned words, allowed enums, and canonical mappings.
                        </div>
                        <textarea
                          value={taggerEnforcerJsonDraft}
                          onChange={(e) => setTaggerEnforcerJsonDraft(e.target.value)}
                          placeholder='{"maxTagsPerImage": 25, "banned": [...], "allowed": {...}, "canonicalMap": {...}}'
                          style={{
                            width: "100%",
                            height: "calc(100% - 60px)",
                            border: "1px solid rgba(0,0,0,0.35)",
                            borderRadius: 12,
                            padding: 16,
                            fontSize: 14,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                            boxSizing: "border-box",
                            resize: "none"
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* AI Helper Floating Chat Window */}
            {aiHelperOpen && (
              <div style={{
                position: "fixed",
                bottom: aiHelperUndocked ? "50%" : 20,
                right: aiHelperUndocked ? "50%" : 20,
                transform: aiHelperUndocked ? "translate(50%, 50%)" : "none",
                width: aiHelperUndocked ? "80vw" : 380,
                maxWidth: aiHelperUndocked ? 900 : 380,
                height: aiHelperUndocked ? "80vh" : "auto",
                maxHeight: aiHelperUndocked ? "80vh" : 500,
                border: "2px solid #000",
                borderRadius: 16,
                background: "#fff",
                boxShadow: "0 8px 32px rgba(99,102,241,0.3)",
                display: "flex",
                flexDirection: "column",
                zIndex: 1000
              }}>
                {/* Header */}
                <div style={{
                  padding: "12px 16px",
                  borderBottom: "1px solid #e5e7eb",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "#000",
                  borderRadius: "14px 14px 0 0"
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>🤖</span>
                    <span style={{ fontWeight: 700, color: "#fff" }}>AI Helper</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <select
                      value={aiHelperProvider}
                      onChange={(e) => setAiHelperProvider(e.target.value as "gemini" | "openai")}
                      style={{
                        border: "1px solid rgba(255,255,255,0.3)",
                        background: "rgba(255,255,255,0.2)",
                        color: "#fff",
                        padding: "4px 8px",
                        borderRadius: 6,
                        fontSize: 11,
                        cursor: "pointer"
                      }}
                    >
                      <option value="gemini" style={{ color: "#000" }}>Gemini</option>
                      <option value="openai" style={{ color: "#000" }}>OpenAI</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setAiHelperUndocked((v) => !v)}
                      title={aiHelperUndocked ? "Dock panel" : "Undock & expand"}
                      style={{
                        border: "none",
                        background: "rgba(255,255,255,0.2)",
                        color: "#fff",
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 12,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      {aiHelperUndocked ? "⊟" : "⊞"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAiHelperOpen(false)}
                      style={{
                        border: "none",
                        background: "rgba(255,255,255,0.2)",
                        color: "#fff",
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        cursor: "pointer",
                        fontSize: 14,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center"
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Context Badge */}
                <div style={{
                  padding: "8px 16px",
                  background: "#f3f4f6",
                  borderBottom: "1px solid #e5e7eb",
                  fontSize: 11,
                  color: "#666"
                }}>
                  Context: <strong>{settingsTab.charAt(0).toUpperCase() + settingsTab.slice(1)}</strong> settings
                </div>

                {/* Messages */}
                <div style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  minHeight: aiHelperUndocked ? 300 : 200,
                  maxHeight: aiHelperUndocked ? "none" : 280
                }}>
                  {aiHelperMessages.length === 0 && (
                    <div style={{ color: "#888", fontSize: 12, textAlign: "center", marginTop: 20 }}>
                      Ask me anything about your {settingsTab} settings!<br />
                      <span style={{ fontSize: 11 }}>I can help write JSON, explain fields, or suggest improvements.</span>
                    </div>
                  )}
                  {aiHelperMessages.map((msg, i) => (
                    <div key={i} style={{
                      alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: "85%"
                    }}>
                      <div style={{
                        background: msg.role === "user" ? "#000" : "#f3f4f6",
                        color: msg.role === "user" ? "#fff" : "#000",
                        padding: "8px 12px",
                        borderRadius: msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                        fontSize: 13,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word"
                      }}>
                        {msg.content}
                      </div>
                      {msg.role === "assistant" && msg.content.includes("```") && (
                        <button
                          type="button"
                          onClick={() => applyAiSuggestion(msg.content)}
                          style={{
                            marginTop: 4,
                            border: "1px solid #000",
                            background: "#fff",
                            color: "#000",
                            padding: "4px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            cursor: "pointer"
                          }}
                        >
                          📋 Apply to Editor
                        </button>
                      )}
                    </div>
                  ))}
                  {aiHelperLoading && (
                    <div style={{ color: "#888", fontSize: 12, fontStyle: "italic" }}>
                      Thinking...
                    </div>
                  )}
                </div>

                {/* Input */}
                <div style={{
                  padding: 12,
                  borderTop: "1px solid #e5e7eb",
                  display: "flex",
                  gap: 8
                }}>
                  <input
                    type="text"
                    value={aiHelperInput}
                    onChange={(e) => setAiHelperInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendAiHelperMessage();
                      }
                    }}
                    placeholder="Ask about settings..."
                    disabled={aiHelperLoading}
                    style={{
                      flex: 1,
                      border: "1px solid #d1d5db",
                      borderRadius: 8,
                      padding: "8px 12px",
                      fontSize: 13,
                      outline: "none",
                      color: "#000"
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => sendAiHelperMessage()}
                    disabled={aiHelperLoading || !aiHelperInput.trim()}
                    style={{
                      border: "none",
                      background: aiHelperLoading || !aiHelperInput.trim() ? "#d1d5db" : "#000",
                      color: "#fff",
                      padding: "8px 14px",
                      borderRadius: 8,
                      fontSize: 13,
                      cursor: aiHelperLoading || !aiHelperInput.trim() ? "not-allowed" : "pointer",
                      fontWeight: 600
                    }}
                  >
                    Send
                  </button>
                </div>

                {/* Quick Actions */}
                <div style={{
                  padding: "8px 12px 12px",
                  display: "flex",
                  gap: 6,
                  flexWrap: "wrap"
                }}>
                  <button
                    type="button"
                    onClick={() => {
                      setAiHelperInput("Explain this configuration");
                      setTimeout(() => sendAiHelperMessage(), 100);
                    }}
                    disabled={aiHelperLoading}
                    style={{
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                      padding: "4px 8px",
                      borderRadius: 6,
                      fontSize: 10,
                      cursor: "pointer"
                    }}
                  >
                    Explain config
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAiHelperInput("Suggest improvements");
                      setTimeout(() => sendAiHelperMessage(), 100);
                    }}
                    disabled={aiHelperLoading}
                    style={{
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                      padding: "4px 8px",
                      borderRadius: 6,
                      fontSize: 10,
                      cursor: "pointer"
                    }}
                  >
                    Suggest improvements
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAiHelperInput("Fix JSON syntax errors");
                      setTimeout(() => sendAiHelperMessage(), 100);
                    }}
                    disabled={aiHelperLoading}
                    style={{
                      border: "1px solid #e5e7eb",
                      background: "#f9fafb",
                      padding: "4px 8px",
                      borderRadius: 6,
                      fontSize: 10,
                      cursor: "pointer"
                    }}
                  >
                    Fix JSON errors
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAiHelperMessages([]);
                    }}
                    style={{
                      border: "1px solid #fca5a5",
                      background: "#fff",
                      color: "#dc2626",
                      padding: "4px 8px",
                      borderRadius: 6,
                      fontSize: 10,
                      cursor: "pointer"
                    }}
                  >
                    Clear chat
                  </button>
                </div>
              </div>
            )}

            {settingsError && (
              <div style={{ marginTop: 10, border: "1px solid #000", borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 13 }}>Error</div>
                <div style={{ marginTop: 6, fontSize: 13, whiteSpace: "pre-wrap" }}>{settingsError}</div>
              </div>
            )}

            <div style={{ marginTop: 12 }}>
              {settingsTab === "ai" && (
                <textarea
                  value={aiRulesDraft}
                  onChange={(e) => setAiRulesDraft(e.target.value)}
                  placeholder="Enter AI rules for analysis..."
                  style={{
                    width: "100%",
                    maxWidth: "100%",
                    minHeight: 180,
                    border: "1px solid rgba(0,0,0,0.35)",
                    borderRadius: 12,
                    padding: 12,
                    fontSize: 13,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    boxSizing: "border-box",
                    display: "block"
                  }}
                />
              )}
              {settingsTab === "schema" && (
                <textarea
                  value={schemaJsonDraft}
                  onChange={(e) => setSchemaJsonDraft(e.target.value)}
                  placeholder='{"levels": {"L1": {...}, "L2": {...}, "L3": {...}}, "categories": ["OVERVIEW", "CHARACTERS", "WORLD", "LORE", "STYLE", "STORY"]}'
                  style={{
                    width: "100%",
                    maxWidth: "100%",
                    minHeight: 180,
                    border: "1px solid rgba(0,0,0,0.35)",
                    borderRadius: 12,
                    padding: 12,
                    fontSize: 13,
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    boxSizing: "border-box",
                    display: "block"
                  }}
                />
              )}
              {settingsTab === "completeness" && (
                <div>
                  <div style={{ marginBottom: 10, fontSize: 12, color: "#666" }}>
                    Define weights for calculating schema completeness. Format: <code>{`{"weights": {"OVERVIEW": 20, "CHARACTERS": 20, ...}, "OVERVIEW.IPTitle": 10, ...}`}</code>
                  </div>
                  <textarea
                    value={completenessRulesDraft}
                    onChange={(e) => setCompletenessRulesDraft(e.target.value)}
                    placeholder={`{
  "weights": {
    "OVERVIEW": 20,
    "CHARACTERS": 20,
    "WORLD": 15,
    "LORE": 15,
    "STYLE": 15,
    "STORY": 15
  }
}`}
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      minHeight: 180,
                      border: "1px solid rgba(0,0,0,0.35)",
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 13,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      boxSizing: "border-box",
                      display: "block"
                    }}
                  />
                </div>
              )}
              {settingsTab === "detection" && (
                <div>
                  <div style={{ marginBottom: 10, fontSize: 12, color: "#666" }}>
                    Rules for image detection using Gemini vision. Uses structured schema with bounding box coordinates [ymin, xmin, ymax, xmax] on 0-1000 scale.
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <button
                      type="button"
                      onClick={() => setDetectionRulesJsonDraft(DEFAULT_DETECTION_RULES)}
                      style={{
                        border: "1px solid #000",
                        background: "#000",
                        color: "#fff",
                        padding: "6px 14px",
                        borderRadius: 8,
                        fontSize: 12,
                        cursor: "pointer"
                      }}
                    >
                      Reset to Default Template
                    </button>
                  </div>
                  <textarea
                    value={detectionRulesJsonDraft}
                    onChange={(e) => setDetectionRulesJsonDraft(e.target.value)}
                    placeholder={`{
  "model": "gemini-3-flash-preview",
  "prompt": "Analyze this document page...",
  "categories": ["character", "location", "keyArt", "logo", "diagram", ...],
  "temperature": 0.2,
  "maxOutputTokens": 4000
}`}
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      minHeight: 200,
                      border: "1px solid rgba(0,0,0,0.35)",
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 13,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      boxSizing: "border-box",
                      display: "block"
                    }}
                  />
                </div>
              )}
              {settingsTab === "styleRules" && (
                <div>
                  <div style={{ marginBottom: 10, fontSize: 12, color: "#666" }}>
                    Configure how Gemini 3 Pro Preview analyzes images for style information. Edit the JSON to customize system role, analysis categories, output schema, and rules.
                  </div>
                  <textarea
                    value={styleRulesJsonDraft}
                    onChange={(e) => setStyleRulesJsonDraft(e.target.value)}
                    placeholder={`{
  "systemRole": "You are an expert visual style analyst...",
  "primaryTask": "Analyze images to extract style information...",
  "analysisCategories": ["Art/rendering style", "Color palette", ...],
  "outputSchema": { ... },
  "rules": ["Be specific and detailed", ...],
  "maxImages": 20,
  "priorityKeywords": ["style", "art", "color", ...]
}`}
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      minHeight: 300,
                      border: "1px solid rgba(0,0,0,0.35)",
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 13,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      boxSizing: "border-box",
                      display: "block"
                    }}
                  />
                </div>
              )}
              {settingsTab === "style" && (
                <div>
                  <div style={{ marginBottom: 10, fontSize: 12, color: "#666" }}>
                    Style analysis results from Gemini 3 Pro. This data is generated by analyzing tagged images and will be used to fill the STYLE domain in the schema. Click &quot;7. Analyze Style&quot; to generate or update.
                  </div>
                  {styleAnalysisDraft ? (
                    <div>
                      <div style={{ 
                        display: "flex", 
                        gap: 8, 
                        marginBottom: 12,
                        flexWrap: "wrap"
                      }}>
                        <button
                          type="button"
                          disabled={styleAnalysisBusy || !!busy}
                          onClick={() => void analyzeStyle()}
                          style={{
                            border: "1px solid #000",
                            background: "#000",
                            color: "#fff",
                            padding: "6px 14px",
                            borderRadius: 8,
                            fontSize: 12,
                            cursor: styleAnalysisBusy || busy ? "not-allowed" : "pointer",
                            opacity: styleAnalysisBusy || busy ? 0.5 : 1
                          }}
                        >
                          {styleAnalysisBusy ? "Analyzing..." : "Re-analyze Style"}
                        </button>
                      </div>
                      <textarea
                        value={styleAnalysisDraft}
                        onChange={(e) => setStyleAnalysisDraft(e.target.value)}
                        style={{
                          width: "100%",
                          maxWidth: "100%",
                          minHeight: 400,
                          border: "1px solid rgba(0,0,0,0.35)",
                          borderRadius: 12,
                          padding: 12,
                          fontSize: 13,
                          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                          boxSizing: "border-box",
                          display: "block"
                        }}
                      />
                    </div>
                  ) : (
                    <div style={{ 
                      padding: 40, 
                      textAlign: "center", 
                      background: "#faf5ff", 
                      borderRadius: 12,
                      border: "1px dashed #000"
                    }}>
                      <div style={{ fontSize: 24, marginBottom: 12 }}>🎨</div>
                      <div style={{ color: "#000", fontWeight: 600, marginBottom: 8 }}>
                        No style analysis yet
                      </div>
                      <div style={{ color: "#666", fontSize: 13, marginBottom: 16 }}>
                        Tag your assets first, then click &quot;7. Analyze Style&quot; to analyze visual patterns with Gemini 3 Pro
                      </div>
                      <button
                        type="button"
                        disabled={!totalAssetsCount || styleAnalysisBusy || !!busy}
                        onClick={() => void analyzeStyle()}
                        style={{
                          border: "none",
                          background: totalAssetsCount && !styleAnalysisBusy && !busy ? "#000" : "#ccc",
                          color: "#fff",
                          padding: "10px 20px",
                          borderRadius: 8,
                          fontSize: 14,
                          cursor: totalAssetsCount && !styleAnalysisBusy && !busy ? "pointer" : "not-allowed"
                        }}
                      >
                        {styleAnalysisBusy ? "Analyzing..." : "Analyze Style Now"}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {settingsTab === "taggerPrompt" && (
                <div>
                  <div style={{ marginBottom: 10, fontSize: 12, color: "#666", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>LLM Core Prompt — defines how the AI analyzes and extracts structured tags from images. This prompt template is sent to the model for each asset.</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Reset Tagger Prompt to default template? This will overwrite your current settings.")) {
                          setTaggerPromptJsonDraft(DEFAULT_TAGGER_PROMPT);
                        }
                      }}
                      style={{
                        border: "1px solid #000",
                        background: "#fff",
                        color: "#000",
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        marginLeft: 8
                      }}
                    >
                      ↩ Reset to Template
                    </button>
                  </div>
                  <textarea
                    value={taggerPromptJsonDraft}
                    onChange={(e) => setTaggerPromptJsonDraft(e.target.value)}
                    placeholder={`{
  "system": ["You are a strict JSON generator.", ...],
  "task": "Tag ONE cropped image asset...",
  "outputSchema": {
    "triggerCandidate": "string | null",
    "visual": { "subjectType": "...", "shot": "...", ... }
  },
  "rules": ["triggerCandidate: use name from PAGE TEXT if present", ...]
}`}
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      minHeight: 300,
                      border: "1px solid rgba(0,0,0,0.35)",
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 13,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      boxSizing: "border-box",
                      display: "block"
                    }}
                  />
                </div>
              )}
              {settingsTab === "taggerEnforcer" && (
                <div>
                  <div style={{ marginBottom: 10, fontSize: 12, color: "#666", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Hard Enforcement Config — post-processing rules applied after LLM response. Controls tag limits, banned words, allowed enums, role allowlist, and canonical mappings.</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Reset Tagger Enforcer to default template? This will overwrite your current settings.")) {
                          setTaggerEnforcerJsonDraft(DEFAULT_TAGGER_ENFORCER);
                        }
                      }}
                      style={{
                        border: "1px solid #000",
                        background: "#fff",
                        color: "#000",
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        marginLeft: 8
                      }}
                    >
                      ↩ Reset to Template
                    </button>
                  </div>
                  <textarea
                    value={taggerEnforcerJsonDraft}
                    onChange={(e) => setTaggerEnforcerJsonDraft(e.target.value)}
                    placeholder={`{
  "maxTagsPerImage": 25,
  "maxNegativeTags": 15,
  "banned": ["unknown", "misc", "other", ...],
  "defaultNegativeAlwaysInclude": ["extra-limbs", "deformed-hands", ...],
  "allowed": {
    "subjectType": ["character", "object", ...],
    "shot": ["close-up", "medium-shot", ...],
    "angle": ["eye-level", "high-angle", ...]
  },
  "roleAllowlist": ["hero", "protagonist", "antagonist", ...],
  "canonicalMap": {"orange-irises": "orange-iris", ...}
}`}
                    style={{
                      width: "100%",
                      maxWidth: "100%",
                      minHeight: 300,
                      border: "1px solid rgba(0,0,0,0.35)",
                      borderRadius: 12,
                      padding: 12,
                      fontSize: 13,
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      boxSizing: "border-box",
                      display: "block"
                    }}
                  />
                </div>
              )}
              {settingsTab === "debugLog" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 12, color: "#666" }}>Runtime log entries ({debugLog.length})</div>
                    <button
                      type="button"
                      onClick={() => setDebugLog([])}
                      style={{
                        border: "1px solid #000",
                        background: "#fff",
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontSize: 11,
                        cursor: "pointer",
                      }}
                    >
                      Clear Log
                    </button>
                  </div>
                  {debugLog.length > 0 ? (
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: "monospace",
                        whiteSpace: "pre-wrap",
                        maxHeight: 400,
                        overflow: "auto",
                        background: "#1a1a1a",
                        color: "#0f0",
                        padding: 10,
                        borderRadius: 6
                      }}
                    >
                      {debugLog.join("\n")}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, opacity: 0.6, padding: 20, textAlign: "center" }}>No log entries yet.</div>
                  )}
                </div>
              )}
              {settingsTab === "cloudState" && (
                <div style={{ fontSize: 13 }}>
                  <div style={{ marginBottom: 10, fontSize: 12, color: "#666" }}>Live project state from the manifest.</div>
                  <div>
                    <span style={{ opacity: 0.7 }}>projectId:</span> {projectId || "—"}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <span style={{ opacity: 0.7 }}>status:</span> {manifest?.status || "—"}
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <span style={{ opacity: 0.7 }}>manifestUrl:</span>
                  </div>
                  <div style={{ fontSize: 12, wordBreak: "break-all" }}>{manifestUrl || "—"}</div>
                  <div style={{ marginTop: 10 }}>
                    <span style={{ opacity: 0.7 }}>sourcePdf:</span>
                  </div>
                  <div style={{ fontSize: 12, wordBreak: "break-all" }}>{manifest?.sourcePdf?.url || "—"}</div>
                  <div style={{ marginTop: 10 }}>
                    <span style={{ opacity: 0.7 }}>extractedText:</span>
                  </div>
                  <div style={{ fontSize: 12, wordBreak: "break-all" }}>{manifest?.extractedText?.url || "—"}</div>
                  <div style={{ marginTop: 10 }}>
                    <span style={{ opacity: 0.7 }}>docAiJson:</span>
                  </div>
                  <div style={{ fontSize: 12, wordBreak: "break-all" }}>{manifest?.docAiJson?.url || "—"}</div>
                  <div style={{ marginTop: 10 }}>
                    <span style={{ opacity: 0.7 }}>pages:</span> {pagesCount}
                  </div>
                  <div style={{ marginTop: 6 }}>
                    <span style={{ opacity: 0.7 }}>assets:</span> {totalAssetsCount}
                  </div>
                </div>
              )}
            </div>
            </div>
          </div>
        </div>
      )}

      {/* Projects Panel */}
      <div style={{ marginTop: 18, border: "1px solid #000", borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 14 }}>
          <div style={{ fontWeight: 800 }}>Projects</div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              aria-label="New project"
              disabled={projectsBusy}
              onClick={async () => {
                setProjectsBusy(true);
                try {
                  const p = await createProject();
                  log(`Created new project: ${p.projectId}`);
                } catch (e) {
                  setLastError(e instanceof Error ? e.message : String(e));
                } finally {
                  setProjectsBusy(false);
                }
              }}
              style={{
                border: "1px solid #22c55e",
                background: "#22c55e",
                color: "#fff",
                padding: "6px 12px",
                borderRadius: 10,
                fontSize: 13,
                fontWeight: 600,
                cursor: projectsBusy ? "not-allowed" : "pointer",
                opacity: projectsBusy ? 0.5 : 1
              }}
            >
              + New
            </button>

            <button
              type="button"
              aria-label="Refresh projects"
              disabled={projectsBusy}
              onClick={() => void refreshProjects()}
              style={{
                border: "1px solid #000",
                background: "#fff",
                width: 36,
                height: 30,
                borderRadius: 10,
                display: "grid",
                placeItems: "center",
                opacity: projectsBusy ? 0.5 : 1
              }}
            >
              <Refresh />
            </button>

            <button
              type="button"
              aria-label={projectsOpen ? "Collapse projects" : "Expand projects"}
              onClick={() => setProjectsOpen((v) => !v)}
              style={{
                border: "1px solid #000",
                background: "#fff",
                width: 36,
                height: 30,
                borderRadius: 10,
                display: "grid",
                placeItems: "center"
              }}
            >
              <Chevron up={projectsOpen} />
            </button>
          </div>
        </div>

        {projectsOpen && (
          <div style={{ padding: "0 14px 14px 14px" }}>
            {projects.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.7 }}>No projects found.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {projects.map((p) => {
                  const active = p.projectId === projectId;
                  return (
                    <div
                      key={p.projectId}
                      style={{
                        border: "1px solid rgba(0,0,0,0.25)",
                        borderRadius: 12,
                        padding: 10,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 10,
                        background: active ? "rgba(0,0,0,0.04)" : "#fff"
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => void openProject(p)}
                        style={{
                          textAlign: "left",
                          flex: 1,
                          border: "none",
                          background: "transparent",
                          padding: 0,
                          cursor: "pointer"
                        }}
                      >
                        <div style={{ fontWeight: 800, fontSize: 13, lineHeight: "18px" }}>
                          {p.filename || "(no source)"}
                        </div>
                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                          id: {p.projectId} · {p.status} · pages: {p.pagesCount} · text: {p.hasText ? "yes" : "no"}
                        </div>
                      </button>

                      <button
                        type="button"
                        aria-label={`Delete project ${p.projectId}`}
                        disabled={projectsBusy}
                        onClick={() => void deleteProject(p.projectId)}
                        style={{
                          border: "1px solid #000",
                          background: "#fff",
                          width: 36,
                          height: 30,
                          borderRadius: 10,
                          display: "grid",
                          placeItems: "center",
                          opacity: projectsBusy ? 0.5 : 1
                        }}
                      >
                        <Trash />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 18, borderTop: "1px solid rgba(0,0,0,0.2)" }} />

      {/* Extracted Text Panel */}
      <div style={{ marginTop: 18, border: "1px solid #000", borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 14 }}>
          <div style={{ fontWeight: 800 }}>Extracted Text</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {formattedText && (
              <button
                type="button"
                disabled={textLoading}
                onClick={() => void clearFormattedText()}
                title="Clear formatted text and reformat"
                style={{
                  border: "1px solid #dc2626",
                  background: "#fff",
                  color: "#dc2626",
                  padding: "4px 10px",
                  borderRadius: 8,
                  fontSize: 12,
                  cursor: textLoading ? "not-allowed" : "pointer",
                  opacity: textLoading ? 0.5 : 1
                }}
              >
                {textLoading ? "Clearing..." : "↩ Undo Format"}
              </button>
            )}
            <button
              type="button"
              aria-label={textPanelOpen ? "Collapse text" : "Expand text"}
              onClick={() => setTextPanelOpen((v) => !v)}
              style={{
              border: "1px solid #000",
              background: "#fff",
              width: 36,
              height: 30,
              borderRadius: 10,
              display: "grid",
              placeItems: "center"
            }}
          >
            <Chevron up={textPanelOpen} />
          </button>
          </div>
        </div>

        {textPanelOpen && (
          <div style={{ padding: "0 14px 14px 14px" }}>
            {formattedText ? (
              <>
                {textEditing ? (
                  <>
                    <textarea
                      value={formattedTextDraft}
                      onChange={(e) => setFormattedTextDraft(e.target.value)}
                      style={{
                        width: "100%",
                        minHeight: 400,
                        fontSize: 13,
                        lineHeight: 1.6,
                        fontFamily: "inherit",
                        background: "#fff",
                        padding: 12,
                        borderRadius: 8,
                        border: "1px solid #2563eb",
                        resize: "vertical"
                      }}
                    />
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        disabled={textSaving}
                        onClick={() => void saveFormattedText()}
                        style={{
                          border: "1px solid #16a34a",
                          background: "#16a34a",
                          color: "#fff",
                          padding: "6px 14px",
                          borderRadius: 8,
                          fontSize: 12,
                          cursor: textSaving ? "not-allowed" : "pointer",
                          opacity: textSaving ? 0.6 : 1
                        }}
                      >
                        {textSaving ? "Saving..." : "Save"}
                      </button>
                      <button
                        type="button"
                        disabled={textSaving}
                        onClick={() => setTextEditing(false)}
                        style={{
                          border: "1px solid #000",
                          background: "#fff",
                          color: "#000",
                          padding: "6px 14px",
                          borderRadius: 8,
                          fontSize: 12,
                          cursor: textSaving ? "not-allowed" : "pointer"
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div
                      style={{
                        fontSize: 13,
                        lineHeight: 1.6,
                        whiteSpace: "pre-wrap",
                        maxHeight: 400,
                        overflow: "auto",
                        background: "#f9f9f9",
                        padding: 12,
                        borderRadius: 8,
                        border: "1px solid #ddd"
                      }}
                    >
                      {formattedText}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => {
                          setFormattedTextDraft(formattedText);
                          setTextEditing(true);
                        }}
                        style={{
                          border: "1px solid #2563eb",
                          background: "#fff",
                          color: "#2563eb",
                          padding: "6px 14px",
                          borderRadius: 8,
                          fontSize: 12,
                          cursor: "pointer"
                        }}
                      >
                        ✏️ Edit Text
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, opacity: 0.6 }}>
                Click &quot;Format Text&quot; to format and display extracted text.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pages Preview Panel */}
      {manifest?.pages?.length ? (
        <div style={{ marginTop: 18, border: "1px solid #000", borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 14 }}>
            <div style={{ fontWeight: 800 }}>Pages Preview ({manifest.pages.length})</div>
            <button
              type="button"
              aria-label={pagesPreviewOpen ? "Collapse pages" : "Expand pages"}
              onClick={() => setPagesPreviewOpen((v) => !v)}
              style={{
                border: "1px solid #000",
                background: "#fff",
                width: 36,
                height: 30,
                borderRadius: 10,
                display: "grid",
                placeItems: "center"
              }}
            >
              <Chevron up={pagesPreviewOpen} />
            </button>
          </div>
          {pagesPreviewOpen && (
            <div style={{ padding: "0 14px 14px 14px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {manifest.pages.map((page) => (
                  <div key={page.pageNumber} style={{ position: "relative" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={page.url}
                      alt={`Page ${page.pageNumber}`}
                      style={{ width: "100%", height: "auto", borderRadius: 4, border: "1px solid #ddd" }}
                    />
                    <div style={{
                      position: "absolute",
                      bottom: 4,
                      left: 4,
                      background: "rgba(0,0,0,0.7)",
                      color: "#fff",
                      fontSize: 10,
                      padding: "2px 6px",
                      borderRadius: 4
                    }}>
                      {page.pageNumber}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Assets Panel */}
      <div style={{ marginTop: 18, border: "1px solid #000", borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 14 }}>
          <div style={{ fontWeight: 800 }}>Assets</div>

          <button
            type="button"
            aria-label={assetsOpen ? "Collapse assets" : "Expand assets"}
            onClick={() => setAssetsOpen((v) => !v)}
            style={{
              border: "1px solid #000",
              background: "#fff",
              width: 36,
              height: 30,
              borderRadius: 10,
              display: "grid",
              placeItems: "center"
            }}
          >
            <Chevron up={assetsOpen} />
          </button>
        </div>

        {assetsOpen && (
          <div style={{ padding: "0 14px 14px 14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 13, opacity: 0.75 }}>
                {taggedAssetsCount} tagged / {totalAssetsCount} total
              </div>
              <button
                type="button"
                onClick={() => void generateThumbnails()}
                disabled={thumbnailsBusy || !projectId || !manifestUrl || totalAssetsCount === 0}
                style={{
                  border: "1px solid #000",
                  background: thumbnailsBusy ? "#000" : "#fff",
                  color: thumbnailsBusy ? "#fff" : "#000",
                  padding: "6px 12px",
                  borderRadius: 8,
                  fontSize: 12,
                  cursor: (thumbnailsBusy || !projectId || !manifestUrl || totalAssetsCount === 0) ? "not-allowed" : "pointer",
                  opacity: (!projectId || !manifestUrl || totalAssetsCount === 0) ? 0.5 : 1
                }}
              >
                {thumbnailsBusy ? "⏳ Generating..." : "🖼️ Generate Thumbnails"}
              </button>
            </div>

            {assetsFlat.length === 0 ? (
              <div style={{ fontSize: 13, opacity: 0.7 }}>—</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
                {assetsFlat.map(({ pageNumber, asset }) => assetCard(pageNumber, asset))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Schema Results Panel */}
      <div style={{ marginTop: 18, border: "1px solid #000", borderRadius: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 14 }}>
          <div style={{ fontWeight: 800 }}>
            Schema Results
            {schemaResultsDraft && schemaResultsDraft !== schemaResults && (
              <span style={{ marginLeft: 8, fontSize: 12, color: "#c60", fontWeight: 400 }}>(unsaved)</span>
            )}
          </div>

          <button
            type="button"
            aria-label={schemaResultsOpen ? "Collapse schema results" : "Expand schema results"}
            onClick={() => setSchemaResultsOpen((v) => !v)}
            style={{
              border: "1px solid #000",
              background: "#fff",
              width: 36,
              height: 30,
              borderRadius: 10,
              display: "grid",
              placeItems: "center"
            }}
          >
            <Chevron up={schemaResultsOpen} />
          </button>
        </div>

        {schemaResultsOpen && (
          <div style={{ padding: "0 14px 14px 14px" }}>
            {schemaResultsDraft ? (
              <>
                {/* View mode toggle and controls */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 22, padding: 3 }}>
                    <button
                      type="button"
                      onClick={() => setSchemaResultsViewMode("ui")}
                      style={{
                        border: "none",
                        background: schemaResultsViewMode === "ui" ? "#fff" : "transparent",
                        color: schemaResultsViewMode === "ui" ? "#0f172a" : "#64748b",
                        padding: "8px 16px",
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        boxShadow: schemaResultsViewMode === "ui" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                        transition: "all 0.15s ease",
                        display: "flex",
                        alignItems: "center",
                        gap: 6
                      }}
                    >
                      <span>🎨</span> UI View
                    </button>
                    <button
                      type="button"
                      onClick={() => setSchemaResultsViewMode("json")}
                      style={{
                        border: "none",
                        background: schemaResultsViewMode === "json" ? "#fff" : "transparent",
                        color: schemaResultsViewMode === "json" ? "#0f172a" : "#64748b",
                        padding: "8px 16px",
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                        boxShadow: schemaResultsViewMode === "json" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                        transition: "all 0.15s ease",
                        display: "flex",
                        alignItems: "center",
                        gap: 6
                      }}
                    >
                      <span>{ }</span> Raw JSON
                    </button>
                  </div>

                  {schemaResultsViewMode === "ui" && (
                    <>
                      <div style={{ width: 1, height: 28, background: "#e2e8f0", margin: "0 8px" }} />
                      
                      {/* Level selector - dynamically from schema */}
                      <div style={{ display: "flex", gap: 6 }}>
                        {getSchemaLevels(schemaJsonDraft).map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setSchemaResultsLevel(level)}
                            style={{
                              border: schemaResultsLevel === level ? "2px solid #0f172a" : "1px solid #e2e8f0",
                              background: schemaResultsLevel === level ? "#0f172a" : "#fff",
                              color: schemaResultsLevel === level ? "#fff" : "#64748b",
                              padding: "6px 14px",
                              borderRadius: 20,
                              fontSize: 12,
                              fontWeight: 600,
                              transition: "all 0.15s ease"
                            }}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {schemaResultsViewMode === "ui" && (
                  <>
                    {/* Completeness Score Bar */}
                    {(() => {
                      try {
                        const parsed = schemaResultsDraft ? JSON.parse(schemaResultsDraft) : {};
                        const levelData = parsed[schemaResultsLevel] || {};
                        const completeness = calculateCompleteness(levelData, completenessRulesDraft);
                        return (
                          <div style={{ 
                            marginBottom: 16, 
                            padding: "12px 16px", 
                            background: "#f8fafc", 
                            borderRadius: 12,
                            border: "1px solid #e2e8f0"
                          }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <span style={{ fontWeight: 700, fontSize: 14 }}>Completeness</span>
                                <span style={{ 
                                  fontSize: 24, 
                                  fontWeight: 800, 
                                  color: completeness.alert.color 
                                }}>
                                  {completeness.overall}%
                                </span>
                              </div>
                              <span style={{ 
                                fontSize: 12, 
                                padding: "4px 10px", 
                                borderRadius: 12, 
                                background: completeness.alert.color + "20",
                                color: completeness.alert.color,
                                fontWeight: 600
                              }}>
                                {completeness.alert.message}
                              </span>
                            </div>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                              {Object.entries(completeness.byDomain).map(([domain, pct]) => {
                                const colors = getDomainColors(schemaJsonDraft, domain);
                                return (
                                  <div 
                                    key={domain} 
                                    style={{ 
                                      display: "flex", 
                                      alignItems: "center", 
                                      gap: 6,
                                      padding: "4px 10px",
                                      borderRadius: 8,
                                      background: colors?.bg || "#f1f5f9",
                                      border: `1px solid ${colors?.accent || "#94a3b8"}30`
                                    }}
                                  >
                                    <span style={{ fontSize: 11, color: colors?.accent || "#64748b" }}>{domain}</span>
                                    <span style={{ 
                                      fontSize: 12, 
                                      fontWeight: 700, 
                                      color: pct >= 80 ? "#22c55e" : pct >= 50 ? "#eab308" : "#ef4444"
                                    }}>
                                      {pct}%
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      } catch {
                        return null;
                      }
                    })()}

                    {/* Domain tabs - dynamically from schema */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                      {getSchemaDomains(schemaJsonDraft).map((domain) => {
                        const colors = getDomainColors(schemaJsonDraft, domain);
                        const isActive = schemaResultsTab === domain;
                        const defaultIcons: Record<string, string> = {
                          OVERVIEW: "📋",
                          CHARACTERS: "👤",
                          WORLD: "🌍",
                          LORE: "📜",
                          FACTIONS: "⚔️",
                          STYLE: "🎨",
                          TONE: "🎭",
                          STORY: "📖"
                        };
                        const icon = defaultIcons[domain] || "📁";
                        return (
                          <button
                            key={domain}
                            type="button"
                            onClick={() => setSchemaResultsTab(domain)}
                            style={{
                              border: isActive ? `2px solid ${colors.accent}` : "1px solid #e2e8f0",
                              background: isActive ? colors.bg : "#fff",
                              color: isActive ? colors.accent : "#64748b",
                              padding: "8px 16px",
                              borderRadius: 24,
                              fontSize: 13,
                              fontWeight: 600,
                              transition: "all 0.15s ease",
                              display: "flex",
                              alignItems: "center",
                              gap: 6
                            }}
                          >
                            <span>{icon}</span>
                            {domain}
                          </button>
                        );
                      })}
                    </div>

                    {/* Content cards */}
                    <SchemaResultsUI
                      jsonString={schemaResultsDraft}
                      domain={schemaResultsTab}
                      level={schemaResultsLevel}
                      schemaJson={schemaJsonDraft}
                    />
                  </>
                )}

                {schemaResultsViewMode === "json" && (
                  <textarea
                    value={schemaResultsDraft}
                    onChange={(e) => setSchemaResultsDraft(e.target.value)}
                    style={{
                      width: "100%",
                      minHeight: 300,
                      fontFamily: "monospace",
                      fontSize: 12,
                      padding: 10,
                      border: "1px solid #ccc",
                      borderRadius: 6,
                      resize: "vertical",
                      boxSizing: "border-box",
                      display: "block",
                      maxWidth: "100%"
                    }}
                  />
                )}

                <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                  <button
                    type="button"
                    disabled={schemaSaveBusy || schemaResultsDraft === schemaResults}
                    onClick={() => void saveSchemaResults()}
                    style={{
                      border: "1px solid #000",
                      background: schemaResultsDraft !== schemaResults ? "#000" : "#fff",
                      color: schemaResultsDraft !== schemaResults ? "#fff" : "#000",
                      padding: "8px 16px",
                      borderRadius: 8,
                      opacity: schemaSaveBusy || schemaResultsDraft === schemaResults ? 0.4 : 1
                    }}
                  >
                    {schemaSaveBusy ? "Saving..." : "Save Results"}
                  </button>
                  <button
                    type="button"
                    disabled={schemaResultsDraft === schemaResults}
                    onClick={() => setSchemaResultsDraft(schemaResults)}
                    style={{
                      border: "1px solid #000",
                      background: "#fff",
                      padding: "8px 16px",
                      borderRadius: 8,
                      opacity: schemaResultsDraft === schemaResults ? 0.4 : 1
                    }}
                  >
                    Revert
                  </button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 13, opacity: 0.7 }}>
                No schema results yet. Click &quot;7. Fill Schema&quot; to generate.
              </div>
            )}
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        style={{ display: "none" }}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            await uploadSource(f);
            // In auto mode, start pipeline after upload
            if (!stepByStepMode) {
              // Use setTimeout to let state settle after upload
              setTimeout(() => void runAutoPipeline(), 100);
            }
          } catch (err) {
            setLastError(err instanceof Error ? err.message : String(err));
          }
        }}
      />
    </div>
  );
}
