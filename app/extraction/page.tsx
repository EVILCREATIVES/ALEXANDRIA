"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { upload } from "@vercel/blob/client";
import Link from "next/link";

type ProjectRow = {
  projectId: string;
  manifestUrl: string;
  createdAt: string;
  status: string;
  filename: string;
  pagesCount: number;
  hasText: boolean;
};

type SessionFileRow = {
  filename: string;
  url: string;
  size: number;
  uploadedAt?: string;
};

type SchemaTestSession = {
  sessionVersion: number;
  savedAt: string;
  savedBy?: string;
  sessionName?: string;
  projectId?: string;
  sourceMode: "existing" | "upload";
  twoPassMode: boolean;
  parallelMode: boolean;
  selectedModel: string;
  extractModel: string;
  synthesizeModel: string;
  selectedTemperature?: number;
  extractTemperature?: number;
  synthesizeTemperature?: number;
  activeTab?: string;
  sourceText?: string;
  sourcePageCount?: number;
  pass1Results: Record<string, unknown> | null;
  pass2Results: Record<string, unknown> | null;
};

type SchemaTab = 
  | "prompt"
  | "extractionPrompt"
  | "synthesisPrompt"
  | "schema"
  | "metadata"
  | "overview"
  | "characters"
  | "factions"
  | "world"
  | "lore"
  | "tone"
  | "style"
  | "story"
  | "aiRules"
  | "detection"
  | "taggerPrompt"
  | "taggerEnforcer"
  | "styleRules"
  | "completeness";

const SCHEMA_TABS: { key: SchemaTab; label: string; file: string; group?: string }[] = [
  { key: "prompt", label: "Prompt (Single)", file: "schema-test-prompt-template.txt", group: "prompts" },
  { key: "extractionPrompt", label: "Pass 1: Extract", file: "schema-test-extraction-prompt.txt", group: "prompts" },
  { key: "synthesisPrompt", label: "Pass 2: Synthesize", file: "schema-test-synthesis-prompt.txt", group: "prompts" },
  { key: "schema", label: "Schema JSON", file: "ipbible-v4-schema.json", group: "schema" },
  { key: "metadata", label: "Metadata", file: "ipbible-v4-metadata.ts", group: "schema" },
  { key: "overview", label: "Overview", file: "ipbible-v4-overview.ts", group: "schema" },
  { key: "characters", label: "Characters", file: "ipbible-v4-characters.ts", group: "schema" },
  { key: "factions", label: "Factions", file: "ipbible-v4-factions.ts", group: "schema" },
  { key: "world", label: "World", file: "ipbible-v4-world.ts", group: "schema" },
  { key: "lore", label: "Lore", file: "ipbible-v4-lore.ts", group: "schema" },
  { key: "tone", label: "Tone", file: "ipbible-v4-tone.ts", group: "schema" },
  { key: "style", label: "Style", file: "ipbible-v4-style.ts", group: "schema" },
  { key: "story", label: "Story", file: "ipbible-v4-story.ts", group: "schema" },
  { key: "aiRules", label: "AI Rules", file: "ai-rules-template.ts", group: "visual" },
  { key: "detection", label: "Detection", file: "detection-rules-template.json", group: "visual" },
  { key: "taggerPrompt", label: "Tagger Prompt", file: "tagger-prompt-template.json", group: "visual" },
  { key: "taggerEnforcer", label: "Tagger Enforcer", file: "tagger-enforcer-template.json", group: "visual" },
  { key: "styleRules", label: "Style Rules", file: "style-rules-template.json", group: "visual" },
  { key: "completeness", label: "Completeness", file: "completeness-rules-template.json", group: "visual" },
];

// Default schema templates (will be loaded from files)
const DEFAULT_SCHEMA_CONTENT: Record<SchemaTab, string> = {
  prompt: "",
  extractionPrompt: "",
  synthesisPrompt: "",
  schema: "{}",
  metadata: "",
  overview: "",
  characters: "",
  factions: "",
  world: "",
  lore: "",
  tone: "",
  style: "",
  story: "",
  aiRules: "",
  detection: "{}",
  taggerPrompt: "{}",
  taggerEnforcer: "{}",
  styleRules: "{}",
  completeness: "{}",
};

// ── Schema-based Asset field detection ────────────────────────────────
// Walk the JSON Schema to find which fields are Asset-typed (binary images).
// This is the single source of truth — no name-guessing.

/** Walk the JSON Schema and return a Set of normalised dot-paths whose type
 *  resolves to the Asset definition.  Text fields like Logline stay OUT
 *  of this set because the schema types them as "string". */
function buildAssetPaths(schema: Record<string, unknown>): Set<string> {
  const assetPaths = new Set<string>();
  const defs = (schema.definitions || schema.$defs || {}) as Record<string, unknown>;

  function resolve(node: Record<string, unknown> | undefined): Record<string, unknown> | null {
    if (!node) return null;
    if (node["$ref"]) {
      const name = (node["$ref"] as string).replace("#/definitions/", "");
      return (defs[name] as Record<string, unknown>) || null;
    }
    if (Array.isArray(node.oneOf)) {
      for (const opt of node.oneOf as Record<string, unknown>[]) {
        if ((opt as Record<string, unknown>).type !== "null") return resolve(opt);
      }
    }
    return node;
  }

  function isAssetType(node: Record<string, unknown>): boolean {
    const req = node.required as string[] | undefined;
    if (req && req.includes("url") && req.includes("source")) return true;
    if (node.type === "array" && node.items) {
      const r = resolve(node.items as Record<string, unknown>);
      if (r && isAssetType(r)) return true;
    }
    if (node.type === "object" && node.properties) {
      const props = node.properties as Record<string, unknown>;
      const keys = Object.keys(props);
      if (keys.length > 0 && keys.every(k => {
        const r = resolve(props[k] as Record<string, unknown>);
        return r ? isAssetType(r) : false;
      })) return true;
    }
    return false;
  }

  function walk(node: Record<string, unknown>, prefix: string) {
    const props = node.properties as Record<string, unknown> | undefined;
    if (!props) return;
    for (const [key, fieldDef] of Object.entries(props)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      const resolved = resolve(fieldDef as Record<string, unknown>);
      if (!resolved) continue;
      if (isAssetType(resolved)) { assetPaths.add(fieldPath); continue; }
      if (resolved.type === "object") walk(resolved, fieldPath);
      if (resolved.type === "array" && resolved.items) {
        const itemResolved = resolve(resolved.items as Record<string, unknown>);
        if (itemResolved && !isAssetType(itemResolved)) walk(itemResolved, `${fieldPath}[]`);
      }
    }
  }

  const topProps = schema.properties as Record<string, unknown> | undefined;
  if (topProps) {
    for (const [domainKey, domainDef] of Object.entries(topProps)) {
      if (domainKey === "version") continue;
      const resolved = resolve(domainDef as Record<string, unknown>);
      if (resolved) walk(resolved, domainKey);
    }
  }
  return assetPaths;
}

/** Check whether a data-path (with numeric indices) matches any asset path
 *  from the schema (which uses [] for arrays). */
function isAssetPath(dataPath: string, assetPaths: Set<string>): boolean {
  const normalised = dataPath.replace(/\.(\d+)(?=\.|$)/g, "[]");
  if (assetPaths.has(normalised)) return true;
  for (const ap of assetPaths) {
    if (normalised.startsWith(ap + ".") || normalised.startsWith(ap + "[]")) return true;
  }
  return false;
}

export default function SchemaTestPage() {
  // Source selection
  const [sourceMode, setSourceMode] = useState<"existing" | "upload">("existing");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [uploadedText, setUploadedText] = useState<string>("");
  const [uploadedPageCount, setUploadedPageCount] = useState<number>(0);
  const [projectText, setProjectText] = useState<string>("");
  const [projectsBusy, setProjectsBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState<string>("");

  // Settings - with tabs
  const [activeSettingsTab, setActiveSettingsTab] = useState<SchemaTab>("prompt");
  const [schemaContents, setSchemaContents] = useState<Record<SchemaTab, string>>(DEFAULT_SCHEMA_CONTENT);
  const [settingsDirty, setSettingsDirty] = useState<Record<SchemaTab, boolean>>({
    prompt: false,
    extractionPrompt: false,
    synthesisPrompt: false,
    schema: false,
    metadata: false,
    overview: false,
    characters: false,
    factions: false,
    world: false,
    lore: false,
    tone: false,
    style: false,
    story: false,
    aiRules: false,
    detection: false,
    taggerPrompt: false,
    taggerEnforcer: false,
    styleRules: false,
    completeness: false,
  });

  // Version history
  type VersionEntry = { url: string; timestamp: string; size: number; initials?: string };
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Record<SchemaTab, VersionEntry[]>>({
    prompt: [], extractionPrompt: [], synthesisPrompt: [], schema: [], metadata: [], overview: [], characters: [], factions: [],
    world: [], lore: [], tone: [], style: [], story: [],
    aiRules: [], detection: [], taggerPrompt: [], taggerEnforcer: [], styleRules: [], completeness: [],
  });
  const [savingTab, setSavingTab] = useState<SchemaTab | null>(null);

  // Test execution
  const [testBusy, setTestBusy] = useState(false);
  const [testError, setTestError] = useState<string>("");
  const [streamChars, setStreamChars] = useState(0);
  const [tokenUsage, setTokenUsage] = useState<{ inputTokens: number; outputTokens: number; maxInputPerRequest: number; requestCount: number }>({ inputTokens: 0, outputTokens: 0, maxInputPerRequest: 0, requestCount: 0 });
  const [selectedModel, setSelectedModel] = useState<string>("gemini-3-flash-preview");
  const [extractModel, setExtractModel] = useState<string>("gemini-3-flash-preview");
  const [synthesizeModel, setSynthesizeModel] = useState<string>("gemini-3-flash-preview");
  const [selectedTemperature, setSelectedTemperature] = useState<number>(0.3);
  const [extractTemperature, setExtractTemperature] = useState<number>(0.2);
  const [synthesizeTemperature, setSynthesizeTemperature] = useState<number>(0.4);
  const [parallelMode, setParallelMode] = useState(true);
  const [twoPassMode, setTwoPassMode] = useState(true);
  const [twoPassPhase, setTwoPassPhase] = useState<"idle" | "extracting" | "synthesizing">("idle");

  // Per-domain progress for parallel mode
  const ALL_DOMAINS = ["OVERVIEW", "CHARACTERS", "WORLD", "LORE", "FACTIONS", "STYLE", "TONE", "STORY"] as const;
  // Domain groups: semantically related domains processed together to reduce
  // token duplication (source text / canon JSON sent 3× instead of 8×).
  const DOMAIN_GROUPS: string[][] = [
    ["OVERVIEW", "WORLD", "LORE"],
    ["CHARACTERS", "FACTIONS"],
    ["STYLE", "TONE", "STORY"],
  ];
  type DomainStatus = "pending" | "running" | "done" | "error";
  const [domainProgress, setDomainProgress] = useState<Record<string, { status: DomainStatus; chars: number; error?: string }>>({});

  // Results
  const [results, setResults] = useState<Record<string, unknown> | null>(null);
  const [pass1Results, setPass1Results] = useState<Record<string, unknown> | null>(null);
  const [viewingPass, setViewingPass] = useState<"pass1" | "pass2">("pass2");
  // Prose field paths returned from Pass 2 (L2_MED/L2_LONG fields) — used to scope green highlights
  const [prosePaths, setProsePaths] = useState<string[]>([]);

  // Pre-compute the set of Asset-typed field paths from the schema (for skip rendering)
  const assetPaths = useMemo<Set<string>>(() => {
    try {
      const parsed = JSON.parse(schemaContents.schema);
      return buildAssetPaths(parsed);
    } catch { return new Set<string>(); }
  }, [schemaContents.schema]);

  const [resultsViewMode, setResultsViewMode] = useState<"text" | "json">("text");
  const [activeResultTab, setActiveResultTab] = useState<string>("all");
  const [savingResults, setSavingResults] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveTargetProjectId, setSaveTargetProjectId] = useState<string>("");
  const [sessionFiles, setSessionFiles] = useState<SessionFileRow[]>([]);
  const [selectedSessionFile, setSelectedSessionFile] = useState<string>("");
  const [loadingSessionList, setLoadingSessionList] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);

  // Google Docs export
  const [googleAuthed, setGoogleAuthed] = useState(false);
  const [exportingGdocs, setExportingGdocs] = useState(false);
  const [gdocsUrl, setGdocsUrl] = useState<string>("");

  // Settings overlay
  const [schemaSettingsOpen, setSchemaSettingsOpen] = useState(false);

  // ── Image pipeline state ──
  const [imagePipelineBusy, setImagePipelineBusy] = useState(false);
  const [imagePipelinePhase, setImagePipelinePhase] = useState<string>("");
  const [imagePipelineLog, setImagePipelineLog] = useState<string[]>([]);
  const [imagePipelineResult, setImagePipelineResult] = useState<{
    hasImages: boolean;
    assetsFound: number;
    tagged: number;
    styleAnalyzed: boolean;
    projectId: string;
    manifestUrl: string;
  } | null>(null);
  // Track the blob URL of the uploaded PDF for image pipeline
  const [uploadedPdfBlobUrl, setUploadedPdfBlobUrl] = useState<string>("");
  const [uploadedSourceBlob, setUploadedSourceBlob] = useState<SessionFileRow | null>(null);
  const [deletingUploadedSource, setDeletingUploadedSource] = useState(false);

  function imgLog(msg: string) {
    setImagePipelineLog(prev => [...prev.slice(-49), msg]);
  }

  /**
   * Unified image pipeline: rasterize → sample detect → if substantial images → full detect → tag → style.
   * Runs after PDF text extraction completes.
   */
  async function runImagePipeline(pdfBlobUrl: string, existingProjectId?: string, existingManifestUrl?: string) {
    setImagePipelineBusy(true);
    setImagePipelinePhase("Initializing...");
    setImagePipelineLog([]);
    setImagePipelineResult(null);

    let pid = existingProjectId || "";
    let mUrl = existingManifestUrl || "";

    try {
      // ── Step 0: Ensure we have a project ──
      if (!pid || !mUrl) {
        setImagePipelinePhase("Creating project...");
        imgLog("Creating project for image pipeline...");
        const createRes = await fetch("/api/projects/create", { method: "POST" });
        if (!createRes.ok) throw new Error("Failed to create project");
        const createJ = await createRes.json() as { ok: boolean; projectId: string; manifestUrl: string };
        pid = createJ.projectId;
        mUrl = createJ.manifestUrl;
        imgLog(`Project created: ${pid.slice(0, 8)}`);
      }

      // ── Step 1: Upload source PDF to project ──
      setImagePipelinePhase("Recording source...");
      imgLog("Recording source PDF in project...");
      const srcRes = await fetch("/api/projects/record-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, manifestUrl: mUrl, sourceUrl: pdfBlobUrl }),
      });
      if (srcRes.ok) {
        const srcJ = await srcRes.json() as { ok: boolean; manifestUrl?: string };
        if (srcJ.manifestUrl) mUrl = srcJ.manifestUrl;
      }

      // ── Step 2: Rasterize all pages ──
      setImagePipelinePhase("Rasterizing pages...");
      imgLog("Loading PDF for rasterization...");

      type PdfJsLib = {
        getDocument: (opts: { url: string; withCredentials?: boolean }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> } }> }> };
        GlobalWorkerOptions: { workerSrc: string };
      };

      const pdfjsImport = (await import("pdfjs-dist")) as unknown as PdfJsLib;
      pdfjsImport.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

      const pdf = await (pdfjsImport.getDocument({ url: pdfBlobUrl, withCredentials: false })).promise;
      const totalPages = Number(pdf.numPages) || 0;
      imgLog(`PDF has ${totalPages} pages`);

      const allPages: Array<{ pageNumber: number; url: string; width: number; height: number }> = [];

      for (let pn = 1; pn <= totalPages; pn++) {
        setImagePipelinePhase(`Rasterizing page ${pn}/${totalPages}...`);
        const page = await pdf.getPage(pn);
        const MAX_EDGE = 1500;
        const baseVp = page.getViewport({ scale: 1 });
        const longest = Math.max(baseVp.width, baseVp.height);
        const scale = longest > MAX_EDGE ? MAX_EDGE / longest : 1;
        const vp = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Cannot create canvas");
        canvas.width = Math.max(1, Math.floor(vp.width));
        canvas.height = Math.max(1, Math.floor(vp.height));
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        const pngBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(b => (b ? resolve(b) : reject(new Error("toBlob null"))), "image/png");
        });
        const file = new File([pngBlob], `page-${pn}.png`, { type: "image/png" });
        const uploaded = await upload(`projects/${pid}/pages/page-${pn}.png`, file, {
          access: "public",
          handleUploadUrl: "/api/blob",
        });

        allPages.push({ pageNumber: pn, url: uploaded.url, width: canvas.width, height: canvas.height });
        imgLog(`Rasterized page ${pn}/${totalPages}`);
      }

      // Save pages to manifest
      setImagePipelinePhase("Recording pages...");
      const recRes = await fetch("/api/projects/pages/record-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, manifestUrl: mUrl, pages: allPages }),
      });
      if (!recRes.ok) throw new Error("Failed to record pages");
      const recJ = await recRes.json() as { ok: boolean; manifestUrl?: string };
      if (recJ.manifestUrl) mUrl = recJ.manifestUrl;
      imgLog(`${allPages.length} pages recorded in manifest`);

      // ── Step 3: Sample detect — check pages 2..6 (skip cover) for images ──
      setImagePipelinePhase("Scanning for images...");
      imgLog("Sampling pages for substantial images (skipping cover)...");

      let detectionRules: Record<string, unknown> | undefined;
      if (schemaContents.detection && schemaContents.detection.trim() && schemaContents.detection !== "{}") {
        try { detectionRules = JSON.parse(schemaContents.detection); } catch { /* use default */ }
      }

      // Sample up to 8 pages spread across the document (cover + interior)
      const samplePages = allPages.slice(0, 8);
      let sampleImageCount = 0;
      let pagesWithImages = 0;

      for (const sp of samplePages) {
        imgLog(`Scanning page ${sp.pageNumber}...`);
        try {
          const dRes = await fetch("/api/projects/assets/detect-gemini", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pageUrl: sp.url,
              pageWidth: sp.width,
              pageHeight: sp.height,
              detectionRules: { ...(detectionRules || {}), secondPass: { enabled: false } },
            }),
          });
          if (dRes.ok) {
            const dJ = await dRes.json() as { boxes?: Array<{ x: number; y: number; width: number; height: number; category?: string; title?: string; description?: string }> };
            const count = dJ.boxes?.length || 0;
            sampleImageCount += count;
            if (count > 0) pagesWithImages++;
            imgLog(`  Page ${sp.pageNumber}: ${count} images`);
          } else {
            const errText = await dRes.text().catch(() => "unknown");
            imgLog(`  Page ${sp.pageNumber}: detect API error ${dRes.status} — ${errText.slice(0, 120)}`);
          }
        } catch (e) {
          imgLog(`  Page ${sp.pageNumber}: network error — ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      // Any image found → proceed with full pipeline
      const hasSubstantialImages = sampleImageCount >= 1;
      imgLog(`Sample result: ${sampleImageCount} images on ${pagesWithImages}/${samplePages.length} pages → ${hasSubstantialImages ? "SUBSTANTIAL — running full pipeline" : "NOT substantial — skipping image pipeline"}`);

      if (!hasSubstantialImages) {
        setImagePipelineResult({ hasImages: false, assetsFound: 0, tagged: 0, styleAnalyzed: false, projectId: pid, manifestUrl: mUrl });
        setImagePipelinePhase("");
        setImagePipelineBusy(false);
        // Update project selection so user can save later
        setSaveTargetProjectId(pid);
        return;
      }

      // ── Step 4: Full detect on ALL pages ──
      setImagePipelinePhase("Detecting images on all pages...");
      imgLog("=== Full detection on all pages ===");

      const allDetections = new Map<number, Array<{ x: number; y: number; width: number; height: number; category?: string; title?: string; description?: string }>>();

      for (const page of allPages) {
        setImagePipelinePhase(`Detecting page ${page.pageNumber}/${totalPages}...`);
        imgLog(`Detecting page ${page.pageNumber}...`);
        try {
          const dRes = await fetch("/api/projects/assets/detect-gemini", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pageUrl: page.url,
              pageWidth: page.width,
              pageHeight: page.height,
              detectionRules: { ...(detectionRules || {}), secondPass: { enabled: false } },
            }),
          });
          if (dRes.ok) {
            const dJ = await dRes.json() as { boxes?: Array<{ x: number; y: number; width: number; height: number; category?: string; title?: string; description?: string }> };
            const boxes = dJ.boxes || [];
            if (boxes.length > 0) allDetections.set(page.pageNumber, boxes);
            imgLog(`  Page ${page.pageNumber}: ${boxes.length} images`);
          }
        } catch (e) {
          imgLog(`  Page ${page.pageNumber}: detection error`);
        }
      }

      // ── Step 5: Crop & upload assets ──
      const totalAssets = Array.from(allDetections.values()).reduce((s, b) => s + b.length, 0);
      setImagePipelinePhase(`Cropping & uploading ${totalAssets} assets...`);
      imgLog(`Cropping ${totalAssets} detected images...`);

      let uploadedCount = 0;
      const bustUrl = (url: string) => { const u = new URL(url); u.searchParams.set("v", String(Date.now())); return u.toString(); };

      for (const page of allPages) {
        const boxes = allDetections.get(page.pageNumber);
        if (!boxes?.length) continue;

        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.crossOrigin = "anonymous";
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error(`Failed to load page ${page.pageNumber}`));
          el.src = bustUrl(page.url);
        });

        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i];
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          canvas.width = Math.max(1, Math.floor(b.width));
          canvas.height = Math.max(1, Math.floor(b.height));
          ctx.drawImage(img, b.x, b.y, b.width, b.height, 0, 0, canvas.width, canvas.height);

          const pngBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(bb => (bb ? resolve(bb) : reject(new Error("toBlob null"))), "image/png");
          });

          const assetId = `p${page.pageNumber}-img${String(i + 1).padStart(2, "0")}`;
          const imgFile = new File([pngBlob], `${assetId}.png`, { type: "image/png" });
          const imgUploaded = await upload(`projects/${pid}/assets/p${page.pageNumber}/${assetId}.png`, imgFile, {
            access: "public",
            handleUploadUrl: "/api/blob",
          });

          // Upload metadata
          const meta = { assetId, pageNumber: page.pageNumber, url: imgUploaded.url, bbox: { x: b.x, y: b.y, w: b.width, h: b.height }, title: b.title, description: b.description, category: b.category };
          const metaBlob = new Blob([JSON.stringify(meta)], { type: "text/plain" });
          const metaFile = new File([metaBlob], `${assetId}.meta.txt`, { type: "text/plain" });
          await upload(`projects/${pid}/assets/p${page.pageNumber}/${assetId}.meta.txt`, metaFile, {
            access: "public",
            handleUploadUrl: "/api/blob",
          });

          uploadedCount++;
          setImagePipelinePhase(`Uploading assets ${uploadedCount}/${totalAssets}...`);
        }
      }
      imgLog(`Uploaded ${uploadedCount} assets with metadata`);

      // Build manifest
      setImagePipelinePhase("Building asset manifest...");
      const buildRes = await fetch("/api/projects/assets/build-manifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, manifestUrl: mUrl }),
      });
      if (buildRes.ok) {
        const buildJ = await buildRes.json() as { ok: boolean; manifestUrl?: string; assetsFound?: number };
        if (buildJ.manifestUrl) mUrl = buildJ.manifestUrl;
        imgLog(`Manifest built with ${buildJ.assetsFound} assets`);
      }

      // ── Step 6: Tag assets ──
      setImagePipelinePhase("Tagging assets...");
      imgLog("Running AI tagging on all assets...");

      let taggedCount = 0;
      try {
        const tagRes = await fetch("/api/projects/assets/tag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: pid,
            manifestUrl: mUrl,
            overwrite: false,
            model: "gemini-3-flash-preview",
            aiRules: schemaContents.aiRules,
            taggerPromptJson: schemaContents.taggerPrompt,
            taggerEnforcerJson: schemaContents.taggerEnforcer,
          }),
        });
        if (tagRes.ok) {
          const tagJ = await tagRes.json() as { ok: boolean; manifestUrl?: string; tagged?: number };
          if (tagJ.manifestUrl) mUrl = tagJ.manifestUrl;
          taggedCount = tagJ.tagged || 0;
          imgLog(`Tagged ${taggedCount} assets`);
        }
      } catch (e) {
        imgLog(`Tagging error: ${e instanceof Error ? e.message : "unknown"}`);
      }

      // ── Step 7: Style analysis ──
      setImagePipelinePhase("Analyzing visual style...");
      imgLog("Running style analysis...");

      let styleOk = false;
      try {
        const styleRes = await fetch("/api/projects/style/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: pid, manifestUrl: mUrl, maxImages: 20 }),
        });
        if (styleRes.ok) {
          const styleJ = await styleRes.json() as { ok: boolean; manifestUrl?: string; analyzedImages?: number };
          if (styleJ.manifestUrl) mUrl = styleJ.manifestUrl;
          styleOk = true;
          imgLog(`Style analysis complete (${styleJ.analyzedImages} images)`);
        }
      } catch (e) {
        imgLog(`Style analysis error: ${e instanceof Error ? e.message : "unknown"}`);
      }

      setImagePipelineResult({ hasImages: true, assetsFound: totalAssets, tagged: taggedCount, styleAnalyzed: styleOk, projectId: pid, manifestUrl: mUrl });
      setSaveTargetProjectId(pid);
      imgLog("Image pipeline complete!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      imgLog(`Pipeline error: ${msg}`);
      setImagePipelineResult({ hasImages: false, assetsFound: 0, tagged: 0, styleAnalyzed: false, projectId: pid, manifestUrl: mUrl });
    } finally {
      setImagePipelinePhase("");
      setImagePipelineBusy(false);
    }
  }

  // File input ref for upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prefillHandledRef = useRef(false);

  // Helper to format date for filenames
  function formatDateForFilename(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${year}${month}${day}_${hours}${minutes}`;
  }

  // Helper to get model short name for filenames
  function getModelShortName(model: string): string {
    if (model.includes("gpt")) return "gpt52";
    if (model.includes("claude-opus")) return "claudeopus";
    if (model.includes("claude-sonnet")) return "claudesonnet";
    if (model.includes("gemini-3-flash")) return "gem3flash";
    if (model.includes("gemini-3-pro")) return "gem3pro";
    return model.replace(/-/g, "").slice(0, 10);
  }

  /** Pick the most relevant model name for display/filenames.
   *  In two-pass mode, show both extract+synth models so the filename is
   *  unambiguous regardless of which pass is being viewed. */
  function getActiveModelShort(): string {
    if (twoPassMode || pass1Results) {
      const ext = getModelShortName(extractModel);
      const syn = getModelShortName(synthesizeModel);
      return ext === syn ? ext : `${ext}+${syn}`;
    }
    return getModelShortName(selectedModel);
  }

  // Load projects on mount
  useEffect(() => {
    loadProjects();
    loadDefaultSchemas();
    checkGoogleAuth();
  }, []);

  // Load project text - wrapped in useCallback to satisfy exhaustive deps
  const loadProjectText = useCallback(async (projectId: string) => {
    try {
      const project = projects.find(p => p.projectId === projectId);
      if (!project) return;

      // Load manifest to get text URLs
      const manifestRes = await fetch(project.manifestUrl);
      if (!manifestRes.ok) return;
      
      const manifest = await manifestRes.json();
      
      // Prefer formatted text, fall back to extracted
      const textUrl = manifest.formattedText?.url || manifest.extractedText?.url;
      if (!textUrl) {
        setProjectText("");
        return;
      }

      const textRes = await fetch(textUrl);
      if (textRes.ok) {
        const text = await textRes.text();
        setProjectText(text);
      }
    } catch (e) {
      console.error("Failed to load project text:", e);
      setProjectText("");
    }
  }, [projects]);

  // Load project text when selection changes
  useEffect(() => {
    if (selectedProjectId && sourceMode === "existing") {
      loadProjectText(selectedProjectId);
    }
  }, [selectedProjectId, sourceMode, loadProjectText]);

  // Preselect project from URL (e.g. /extraction?projectId=...)
  useEffect(() => {
    if (prefillHandledRef.current || typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const preselectProjectId = params.get("projectId") || params.get("pid");

    if (!preselectProjectId) {
      prefillHandledRef.current = true;
      return;
    }

    const hasProject = projects.some((p) => p.projectId === preselectProjectId);
    if (!hasProject) {
      if (projectsBusy) return;
      prefillHandledRef.current = true;
      return;
    }

    setSourceMode("existing");
    setSelectedProjectId(preselectProjectId);
    setSaveTargetProjectId(preselectProjectId);
    prefillHandledRef.current = true;
  }, [projects, projectsBusy]);

  useEffect(() => {
    setSelectedSessionFile("");
    if (!saveTargetProjectId) {
      setSessionFiles([]);
      return;
    }
    void loadSessionFiles(saveTargetProjectId);
  }, [saveTargetProjectId]);

  async function loadProjects() {
    setProjectsBusy(true);
    try {
      const res = await fetch("/api/projects/list", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (e) {
      console.error("Failed to load projects:", e);
    } finally {
      setProjectsBusy(false);
    }
  }

  async function checkGoogleAuth() {
    try {
      const res = await fetch("/api/extraction/export-gdocs");
      if (res.ok) {
        const data = await res.json();
        setGoogleAuthed(data.authenticated === true);
      }
    } catch {
      // ignore
    }
    // Also check URL params for returning from OAuth
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("google_auth") === "success") {
        setGoogleAuthed(true);
        // Clean up URL
        const url = new URL(window.location.href);
        url.searchParams.delete("google_auth");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }

  async function loadSessionFiles(projectId: string) {
    if (!projectId) {
      setSessionFiles([]);
      return;
    }
    setLoadingSessionList(true);
    try {
      const res = await fetch(`/api/extraction/save-results?projectId=${encodeURIComponent(projectId)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to load session list");
      const data = await res.json();
      setSessionFiles(Array.isArray(data.sessions) ? data.sessions : []);
    } catch (e) {
      console.error("Failed to load schema test sessions:", e);
      setSessionFiles([]);
    } finally {
      setLoadingSessionList(false);
    }
  }

  async function loadSavedSession(filename: string) {
    if (!saveTargetProjectId || !filename) return;

    setLoadingSession(true);
    setTestError("");
    try {
      const res = await fetch(
        `/api/extraction/save-results?projectId=${encodeURIComponent(saveTargetProjectId)}&filename=${encodeURIComponent(filename)}`,
        { cache: "no-store" }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to load session");
      }

      const data = await res.json();
      const session = data.session as Partial<SchemaTestSession> & Record<string, unknown>;

      // Legacy payload fallback (plain results JSON)
      const hasSessionEnvelope = typeof session?.sessionVersion === "number";

      if (!hasSessionEnvelope) {
        setResults(session as Record<string, unknown>);
        setPass1Results(null);
        setViewingPass("pass2");
        setResultsViewMode("text");
        setActiveResultTab("all");
        return;
      }

      setTwoPassMode(session.twoPassMode ?? true);
      setParallelMode(session.parallelMode ?? true);
      if (typeof session.selectedModel === "string" && session.selectedModel) setSelectedModel(session.selectedModel);
      if (typeof session.extractModel === "string" && session.extractModel) setExtractModel(session.extractModel);
      if (typeof session.synthesizeModel === "string" && session.synthesizeModel) setSynthesizeModel(session.synthesizeModel);
      if (typeof session.selectedTemperature === "number") setSelectedTemperature(session.selectedTemperature);
      if (typeof session.extractTemperature === "number") setExtractTemperature(session.extractTemperature);
      if (typeof session.synthesizeTemperature === "number") setSynthesizeTemperature(session.synthesizeTemperature);
      if (typeof session.activeTab === "string") setActiveResultTab(session.activeTab || "all");

      if (session.sourceMode === "upload") {
        setSourceMode("upload");
        setUploadedText(typeof session.sourceText === "string" ? session.sourceText : "");
        setUploadedPageCount(typeof session.sourcePageCount === "number" ? session.sourcePageCount : 0);
      }

      const loadedPass1 = (session.pass1Results && typeof session.pass1Results === "object")
        ? (session.pass1Results as Record<string, unknown>)
        : null;
      const loadedPass2 = (session.pass2Results && typeof session.pass2Results === "object")
        ? (session.pass2Results as Record<string, unknown>)
        : null;

      setPass1Results(loadedPass1);
      setResults(loadedPass2 || loadedPass1);
      setViewingPass(loadedPass2 ? "pass2" : "pass1");
      setResultsViewMode("text");
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Failed to load session");
    } finally {
      setLoadingSession(false);
    }
  }

  async function exportToGoogleDocs() {
    if (!results) return;

    if (!googleAuthed) {
      // Open Google OAuth in a new tab to avoid losing page state
      const authWindow = window.open("/api/auth/google?returnTo=/extraction", "_blank");
      if (authWindow) {
        // Poll for when user completes auth (popup will self-close)
        const pollTimer = setInterval(async () => {
          try {
            const res = await fetch("/api/extraction/export-gdocs");
            if (res.ok) {
              const data = await res.json();
              if (data.authenticated) {
                clearInterval(pollTimer);
                setGoogleAuthed(true);
                // Auto-trigger export now that auth is done
                doGoogleDocsExport();
              }
            }
          } catch { /* ignore */ }
        }, 2000);
        // Stop polling after 5 minutes
        setTimeout(() => clearInterval(pollTimer), 300000);
      }
      return;
    }

    doGoogleDocsExport();
  }

  async function doGoogleDocsExport() {
    // Always export Pass 2 (synthesis) results when available, with Pass 1 for comparison
    const exportData = results || pass1Results;
    if (!exportData) return;
    setExportingGdocs(true);
    setGdocsUrl("");
    setTestError("");
    try {
      const project = projects.find(p => p.projectId === selectedProjectId);
      const projectName = project?.filename || "Extraction";
      const modelShort = getActiveModelShort();
      const hasBothPasses = !!(pass1Results && results);
      const passLabel = hasBothPasses ? "Pass 1 + Pass 2" : pass1Results ? "Pass 1 — Extraction" : "Full";
      const title = `${projectName} — STORYLINE (${modelShort}) — ${passLabel} — ${new Date().toLocaleDateString()}`;

      const res = await fetch("/api/extraction/export-gdocs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          results: exportData,
          schemaJson: schemaContents.schema,
          ...(hasBothPasses && { pass1Results }),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.error === "not_authenticated" || errData.error === "token_expired") {
          setGoogleAuthed(false);
          // Re-auth in new tab
          window.open("/api/auth/google?returnTo=/extraction", "_blank");
          setTestError("Google auth expired — please sign in again in the new tab, then retry export.");
          return;
        }
        throw new Error(errData.error || "Export failed");
      }

      const data = await res.json();
      setGdocsUrl(data.url);
      // Auto-open the doc in a new tab
      if (data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Export to Google Docs failed");
    } finally {
      setExportingGdocs(false);
    }
  }

  async function loadDefaultSchemas() {
    // Load each schema file
    for (const tab of SCHEMA_TABS) {
      try {
        const res = await fetch(`/api/extraction/load-template?file=${encodeURIComponent(tab.file)}`);
        if (res.ok) {
          const data = await res.json();
          setSchemaContents(prev => ({ ...prev, [tab.key]: data.content || "" }));
        }
      } catch (e) {
        console.error(`Failed to load ${tab.file}:`, e);
      }
    }
  }

  async function restoreToTemplate(tabKey: SchemaTab) {
    const tab = SCHEMA_TABS.find(t => t.key === tabKey);
    if (!tab) return;
    if (!confirm(`Restore "${tab.label}" to original template? This will discard any changes.`)) return;
    try {
      const res = await fetch(`/api/extraction/load-template?file=${encodeURIComponent(tab.file)}&builtIn=true`);
      if (res.ok) {
        const data = await res.json();
        setSchemaContents(prev => ({ ...prev, [tabKey]: data.content || "" }));
        setSettingsDirty(prev => ({ ...prev, [tabKey]: true }));
      }
    } catch (e) {
      console.error(`Failed to restore ${tab.file}:`, e);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const countExtractedPages = (text: string): number => {
      const matches = text.matchAll(/---\s*Page\s+(\d+)\s*---/gi);
      const pages = new Set<number>();
      for (const m of matches) {
        const n = Number(m[1]);
        if (!Number.isNaN(n) && n > 0) pages.add(n);
      }
      return pages.size;
    };

    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      // Upload PDF to blob first (avoids 4.5MB serverless body limit), then extract via Gemini streaming
      setPdfBusy(true);
      setUploadedText("");
      setUploadedPageCount(0);
      setPdfProgress("");
      setTestError("");
      try {
        // 1. Upload to Vercel Blob
        const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
        const blob = await upload(`schema-test/uploads/${Date.now()}-${safeFilename}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob",
        });

        setUploadedSourceBlob({
          filename: file.name,
          url: blob.url,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        });

        // Store blob URL for image pipeline
        setUploadedPdfBlobUrl(blob.url);

        // 2. Stream extraction from Gemini via SSE
        const res = await fetch("/api/extraction/extract-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: blob.url }),
        });

        const contentType = res.headers.get("content-type") || "";

        // SSE streaming response
        if (contentType.includes("text/event-stream")) {
          const reader = res.body?.getReader();
          if (!reader) throw new Error("No response body");

          const decoder = new TextDecoder();
          let buffer = "";
          let extractionBuffer = "";
          let gotDone = false;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split("\n\n");
            buffer = blocks.pop() || "";

            for (const block of blocks) {
              const line = block.trim();
              if (!line.startsWith("data: ")) continue;
              let msg: { type: string; text?: string; error?: string; totalPages?: number; message?: string };
              try { msg = JSON.parse(line.slice(6)); } catch { continue; }

              if (msg.type === "info" && msg.totalPages) {
                setPdfProgress(`Extracting 0 / ${msg.totalPages} pages...`);
              } else if (msg.type === "progress" && msg.message) {
                setPdfProgress(msg.message);
              } else if (msg.type === "chunk" && msg.text) {
                extractionBuffer += msg.text;
                const pc = countExtractedPages(extractionBuffer);
                setUploadedPageCount(pc);
                setPdfProgress(`Extracted ${pc} pages so far...`);
              } else if (msg.type === "done") {
                gotDone = true;
                if (msg.text) extractionBuffer = msg.text;
                setUploadedText(extractionBuffer);
                setUploadedPageCount(countExtractedPages(extractionBuffer));
                setPdfProgress("");
              } else if (msg.type === "error") {
                throw new Error(msg.error || "Extraction failed");
              }
            }
          }

          // Safety net: if stream ended without an explicit "done", populate text now
          if (!gotDone && extractionBuffer.trim()) {
            setUploadedText(extractionBuffer);
            setUploadedPageCount(countExtractedPages(extractionBuffer));
            setPdfProgress("");
          }

          if (!extractionBuffer.trim()) {
            throw new Error("No text extracted from PDF");
          }
        } else if (contentType.includes("application/json")) {
          // Fallback JSON response (error cases)
          const data = await res.json();
          if (!data.ok) {
            throw new Error(data.error || "Extraction failed");
          }
          const extracted = String(data.text || "");
          setUploadedText(extracted);
          setUploadedPageCount(countExtractedPages(extracted));
        } else {
          const text = await res.text();
          throw new Error(`Server returned ${res.status}: ${text.slice(0, 200)}`);
        }

        // 3. Kick off image pipeline in background (non-blocking for text extraction)
        void runImagePipeline(blob.url);
      } catch (err) {
        console.error("PDF extraction failed:", err);
        setTestError(`Failed to extract text from PDF: ${err instanceof Error ? err.message : "Unknown error"}`);
      } finally {
        setPdfBusy(false);
      }
    } else {
      // Plain text files
      setUploadedPageCount(0);
      setTestError("");
      try {
        const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-");
        const blob = await upload(`schema-test/uploads/${Date.now()}-${safeFilename}`, file, {
          access: "public",
          handleUploadUrl: "/api/blob",
        });
        setUploadedSourceBlob({
          filename: file.name,
          url: blob.url,
          size: file.size,
          uploadedAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error("Source upload to Blob failed:", err);
        setTestError(`Failed to upload source to Blob: ${err instanceof Error ? err.message : "Unknown error"}`);
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        setUploadedText(text);
      };
      reader.readAsText(file);
    }
  }

  async function deleteUploadedSourceBlob() {
    if (!uploadedSourceBlob?.url) return;
    setDeletingUploadedSource(true);
    setTestError("");
    try {
      const res = await fetch("/api/blob", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: uploadedSourceBlob.url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(data.error || "Failed to delete uploaded source");
      }
      setUploadedSourceBlob(null);
      setUploadedPdfBlobUrl("");
      setUploadedText("");
      setUploadedPageCount(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "Failed to delete uploaded source");
    } finally {
      setDeletingUploadedSource(false);
    }
  }

  function handleSchemaContentChange(value: string) {
    setSchemaContents(prev => ({ ...prev, [activeSettingsTab]: value }));
    setSettingsDirty(prev => ({ ...prev, [activeSettingsTab]: true }));
  }

  function downloadSchemaTab(tab: SchemaTab) {
    const content = schemaContents[tab];
    const tabInfo = SCHEMA_TABS.find(t => t.key === tab);
    const filename = tabInfo?.file || `${tab}.txt`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveSchemaTab(tab: SchemaTab) {
    const initials = window.prompt("Enter your initials:");
    if (!initials || !initials.trim()) return;

    setSavingTab(tab);
    try {
      const tabInfo = SCHEMA_TABS.find(t => t.key === tab);
      const res = await fetch("/api/extraction/save-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file: tabInfo?.file,
          content: schemaContents[tab],
          initials: initials.trim().toUpperCase(),
        }),
      });
      if (res.ok) {
        setSettingsDirty(prev => ({ ...prev, [tab]: false }));
        // Refresh history after save
        await loadHistory(tab);
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("Save failed:", errData.error);
        setTestError(`Failed to save ${tab}: ${errData.error || "Unknown error"}`);
      }
    } catch (e) {
      console.error("Failed to save:", e);
      setTestError(`Failed to save ${tab}: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setSavingTab(null);
    }
  }

  async function loadHistory(tab: SchemaTab) {
    try {
      const tabInfo = SCHEMA_TABS.find(t => t.key === tab);
      if (!tabInfo) return;
      
      const res = await fetch(`/api/extraction/save-template?file=${encodeURIComponent(tabInfo.file)}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(prev => ({ ...prev, [tab]: data.versions || [] }));
      }
    } catch (e) {
      console.error("Failed to load history:", e);
    }
  }

  async function restoreVersion(tab: SchemaTab, version: VersionEntry) {
    try {
      const res = await fetch(version.url);
      if (res.ok) {
        const content = await res.text();
        setSchemaContents(prev => ({ ...prev, [tab]: content }));
        setSettingsDirty(prev => ({ ...prev, [tab]: true }));
        setHistoryOpen(false);
      }
    } catch (e) {
      console.error("Failed to restore version:", e);
    }
  }

  async function runSchemaTest() {
    const sourceText = sourceMode === "existing" ? projectText : uploadedText;
    
    if (!sourceText.trim()) {
      setTestError("No source text available. Please select a project or upload text.");
      return;
    }

    if (!schemaContents.schema.trim() || schemaContents.schema === "{}") {
      setTestError("No schema JSON configured. Please configure the schema in Settings.");
      return;
    }

    // Validate prompt availability based on mode
    if (twoPassMode) {
      if (!schemaContents.extractionPrompt.trim()) {
        setTestError("No extraction prompt configured. Please configure 'Pass 1: Extract' in Settings.");
        return;
      }
    } else {
      if (!schemaContents.prompt.trim()) {
        setTestError("No prompt template configured. Please configure the Prompt in Settings. Use {{SCHEMA_JSON}}, {{METADATA_CONTEXT}}, and {{SOURCE_TEXT}} as placeholders.");
        return;
      }
    }

    setTestBusy(true);
    setTestError("");
    setResults(null);
    setPass1Results(null);
    setViewingPass(twoPassMode ? "pass1" : "pass2");
    setStreamChars(0);
    setTokenUsage({ inputTokens: 0, outputTokens: 0, maxInputPerRequest: 0, requestCount: 0 });
    setActiveResultTab("all");
    setDomainProgress({});
    setGdocsUrl("");
    setSaveSuccess(false);
    setTwoPassPhase("idle");

    const metadataPayload = {
      overview: schemaContents.overview,
      characters: schemaContents.characters,
      factions: schemaContents.factions,
      world: schemaContents.world,
      lore: schemaContents.lore,
      tone: schemaContents.tone,
      style: schemaContents.style,
      story: schemaContents.story,
      metadataMain: schemaContents.metadata,
    };

    if (twoPassMode) {
      // ---- TWO-PASS PIPELINE ----
      // Pass 1: Extraction
      setTwoPassPhase("extracting");
      const extractBody = {
        sourceText,
        schemaJson: schemaContents.schema,
        promptTemplate: schemaContents.extractionPrompt,
        model: extractModel,
        temperature: extractTemperature,
        metadata: metadataPayload,
        mode: "extract" as const,
      };

      let extractedResults: Record<string, unknown> | null;
      if (parallelMode) {
        extractedResults = await runParallel(extractBody);
      } else {
        extractedResults = await runSingle(extractBody);
      }

      if (!extractedResults || Object.keys(extractedResults).length <= 1) {
        setTestError("Pass 1 (extraction) produced no results. Cannot proceed to synthesis.");
        setTestBusy(false);
        setTwoPassPhase("idle");
        return;
      }

      // Deep-clone Pass 1 results so no shared references with Pass 2's mergedResults
      setPass1Results(JSON.parse(JSON.stringify(extractedResults)));

      // Stop here — let the user review Pass 1 before deciding to run Pass 2
      setTwoPassPhase("idle");
      setTestBusy(false);
      setViewingPass("pass1");
    } else {
      // ---- SINGLE-PASS (original behavior) ----
      const requestBody = {
        sourceText,
        schemaJson: schemaContents.schema,
        promptTemplate: schemaContents.prompt,
        model: selectedModel,
        temperature: selectedTemperature,
        metadata: metadataPayload,
      };

      if (parallelMode) {
        await runParallel(requestBody);
      } else {
        await runSingle(requestBody);
      }
    }

    setTestBusy(false);
  }

  /** Run Pass 2 (Synthesis) on existing Pass 1 results */
  async function runPass2() {
    if (!pass1Results || Object.keys(pass1Results).length <= 1) {
      setTestError("No Pass 1 results available. Run Pass 1 first.");
      return;
    }
    if (!schemaContents.synthesisPrompt.trim()) {
      setTestError("No synthesis prompt configured. Please configure 'Pass 2: Synthesize' in Settings.");
      return;
    }

    setTestBusy(true);
    setTestError("");
    setTwoPassPhase("synthesizing");
    setStreamChars(0);
    setTokenUsage({ inputTokens: 0, outputTokens: 0, maxInputPerRequest: 0, requestCount: 0 });
    setDomainProgress({});
    setProsePaths([]);

    const synthBody = {
      canonJson: JSON.stringify(pass1Results, null, 2),
      schemaJson: schemaContents.schema,
      promptTemplate: schemaContents.synthesisPrompt,
      model: synthesizeModel,
      temperature: synthesizeTemperature,
      mode: "synthesize" as const,
      metadata: {
        overview: schemaContents.overview,
        characters: schemaContents.characters,
        factions: schemaContents.factions,
        world: schemaContents.world,
        lore: schemaContents.lore,
        tone: schemaContents.tone,
        style: schemaContents.style,
        story: schemaContents.story,
        metadataMain: schemaContents.metadata,
      },
    };

    // Synthesis runs in parallel — each domain gets the full canon for
    // cross-domain context but only outputs its own domain.
    // Seed with Pass 1 data so any domains that fail still show extraction results.
    if (parallelMode) {
      await runParallel(synthBody, pass1Results);
    } else {
      await runSingle(synthBody);
    }
    setTwoPassPhase("idle");
    setViewingPass("pass2");
    setTestBusy(false);
  }

  /** Run domain groups in parallel — concurrent SSE streams merged into one result.
   *  Uses 3 semantic groups instead of 8 individual domains to reduce
   *  token duplication (source text / canon JSON sent 3× instead of 8×).
   *  Returns the final merged results object so callers can capture it
   *  directly (no ref / timing dependency). */
  async function runParallel(requestBody: Record<string, unknown>, seedResults?: Record<string, unknown>): Promise<Record<string, unknown>> {
    const modelStr = (requestBody.model as string) || selectedModel;

    // Initialize progress for all domains (shown individually in UI even though processed in groups)
    const initialProgress: Record<string, { status: DomainStatus; chars: number }> = {};
    for (const d of ALL_DOMAINS) initialProgress[d] = { status: "pending", chars: 0 };
    setDomainProgress(initialProgress);

    // Seed with existing data (e.g. Pass 1 results) so failed domains aren't lost
    const mergedResults: Record<string, unknown> = seedResults
      ? { ...seedResults }
      : { version: 4 };
    let totalChars = 0;
    const errors: string[] = [];
    const allProsePaths: string[] = [];

    // Helper: process a domain group via SSE stream (with 1 retry for transient failures)
    async function processDomainGroup(domains: string[], retryCount = 0) {
      const groupLabel = domains.join("+");
      // Mark all domains in this group as running
      setDomainProgress(prev => {
        const next = { ...prev };
        for (const d of domains) next[d] = { status: "running", chars: 0 };
        return next;
      });

      try {
        const res = await fetch("/api/extraction/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...requestBody, domains }),
        });

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("text/event-stream")) {
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error((errData as { error?: string }).error || `${groupLabel} failed`);
          }
          const data = await res.json();
          const domainResult = (data as { results: Record<string, unknown> }).results;
          Object.assign(mergedResults, domainResult);
          setResults({ ...mergedResults });
          setDomainProgress(prev => {
            const next = { ...prev };
            for (const d of domains) next[d] = { status: "done", chars: 0 };
            return next;
          });
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let groupChars = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const block of lines) {
            const line = block.trim();
            if (!line.startsWith("data: ")) continue;

            let msg: { type: string; text?: string; results?: Record<string, unknown>; error?: string; prosePaths?: string[]; usage?: { inputTokens?: number; outputTokens?: number } };
            try { msg = JSON.parse(line.slice(6)); } catch { continue; }

            if (msg.type === "chunk" && msg.text) {
              groupChars += msg.text.length;
              totalChars += msg.text.length;
              setStreamChars(totalChars);
              // Show chars distributed across domains in the group
              const perDomain = Math.round(groupChars / domains.length);
              setDomainProgress(prev => {
                const next = { ...prev };
                for (const d of domains) next[d] = { status: "running", chars: perDomain };
                return next;
              });
            } else if (msg.type === "done" && msg.results) {
              Object.assign(mergedResults, msg.results);
              setResults({ ...mergedResults });
              if (msg.prosePaths) allProsePaths.push(...msg.prosePaths);
              if (msg.usage) {
                const reqIn = msg.usage.inputTokens || 0;
                setTokenUsage(prev => ({
                  inputTokens: prev.inputTokens + reqIn,
                  outputTokens: prev.outputTokens + (msg.usage?.outputTokens || 0),
                  maxInputPerRequest: Math.max(prev.maxInputPerRequest, reqIn),
                  requestCount: prev.requestCount + 1,
                }));
              }
              const perDomainDone = Math.round(groupChars / domains.length);
              setDomainProgress(prev => {
                const next = { ...prev };
                for (const d of domains) next[d] = { status: "done", chars: perDomainDone };
                return next;
              });
            } else if (msg.type === "error") {
              throw new Error(msg.error || `${groupLabel} streaming error`);
            }
          }
        }

        // Drain any remaining data left in the buffer after stream closes
        // (the final SSE message may not have a trailing \n\n)
        if (buffer.trim()) {
          const remaining = buffer.trim();
          if (remaining.startsWith("data: ")) {
            try {
              const msg = JSON.parse(remaining.slice(6));
              if (msg.type === "done" && msg.results) {
                Object.assign(mergedResults, msg.results);
                setResults({ ...mergedResults });
                if (msg.prosePaths) allProsePaths.push(...msg.prosePaths);
                if (msg.usage) {
                  const reqIn = msg.usage.inputTokens || 0;
                  setTokenUsage(prev => ({
                    inputTokens: prev.inputTokens + reqIn,
                    outputTokens: prev.outputTokens + (msg.usage?.outputTokens || 0),
                    maxInputPerRequest: Math.max(prev.maxInputPerRequest, reqIn),
                    requestCount: prev.requestCount + 1,
                  }));
                }
                setDomainProgress(prev => {
                  const next = { ...prev };
                  for (const d of domains) next[d] = { status: "done", chars: Math.round(groupChars / domains.length) };
                  return next;
                });
              } else if (msg.type === "error") {
                throw new Error(msg.error || `${groupLabel} streaming error`);
              }
            } catch { /* ignore parse failures on partial buffer */ }
          }
        }

        // If we finished reading without a "done" message, mark done anyway
        setDomainProgress(prev => {
          const next = { ...prev };
          let changed = false;
          for (const d of domains) {
            if (prev[d]?.status === "running") { next[d] = { status: "done", chars: Math.round(groupChars / domains.length) }; changed = true; }
          }
          return changed ? next : prev;
        });
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        // Retry on 429 rate limit or 529 overloaded with exponential backoff
        if (errMsg.includes("429") || errMsg.toLowerCase().includes("rate_limit") || errMsg.toLowerCase().includes("rate limit") || errMsg.includes("529") || errMsg.toLowerCase().includes("overloaded")) {
          const isClaude = modelStr.startsWith("claude");
          const maxRetries = isClaude ? 5 : 3;
          if (retryCount < maxRetries) {
            // Claude needs longer backoff due to token-per-minute limits with large inputs
            const delay = isClaude
              ? Math.min(10000 * Math.pow(2, retryCount), 120000)  // 10s, 20s, 40s, 80s, 120s
              : Math.min(5000 * Math.pow(2, retryCount), 30000);   // 5s, 10s, 20s
            console.warn(`${groupLabel}: rate limited / overloaded, retrying in ${delay / 1000}s (attempt ${retryCount + 1}/${maxRetries})...`);
            setDomainProgress(prev => {
              const next = { ...prev };
              for (const d of domains) next[d] = { status: "running", chars: 0, error: `API busy — retrying in ${Math.round(delay / 1000)}s...` };
              return next;
            });
            await new Promise(r => setTimeout(r, delay));
            return processDomainGroup(domains, retryCount + 1);
          }
        }
        // Retry once on transient fetch failures ("Load failed", "Failed to fetch", network errors)
        if (retryCount < 1 && (errMsg.includes("Load failed") || errMsg.includes("Failed to fetch") || errMsg.includes("NetworkError"))) {
          console.warn(`${groupLabel}: transient failure, retrying in 2s...`, errMsg);
          await new Promise(r => setTimeout(r, 2000));
          return processDomainGroup(domains, retryCount + 1);
        }
        errors.push(`${groupLabel}: ${errMsg}`);
        setDomainProgress(prev => {
          const next = { ...prev };
          for (const d of domains) next[d] = { status: "error", chars: 0, error: errMsg };
          return next;
        });
      }
    }

    // For Claude models, run groups sequentially to avoid 429 rate limits
    // (3 concurrent requests × ~240K tokens each exceeds Anthropic's TPM).
    // Gemini and OpenAI can handle all 3 concurrently.
    const isClaude = modelStr.startsWith("claude");
    if (isClaude) {
      for (const group of DOMAIN_GROUPS) {
        await processDomainGroup(group);
      }
    } else {
      await Promise.allSettled(DOMAIN_GROUPS.map(group => processDomainGroup(group)));
    }

    // Final setResults in case any domain completed without triggering it
    if (Object.keys(mergedResults).length > 1) {
      setResults({ ...mergedResults });
    }
    // Propagate prose field paths from synthesis mode for green-highlight scoping
    if (allProsePaths.length > 0) {
      setProsePaths(allProsePaths);
    }
    if (errors.length > 0) {
      setTestError(`Some domains failed: ${errors.join("; ")}`);
    }
    return mergedResults;
  }

  /** Run all domains in a single AI call (original behavior).
   *  Returns the final results object so callers can capture it directly. */
  async function runSingle(requestBody: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    let finalResults: Record<string, unknown> | null = null;
    try {
      const res = await fetch("/api/extraction/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error((errData as { error?: string }).error || "Schema test failed");
        }
        const data = await res.json();
        finalResults = (data as { results: Record<string, unknown> }).results;
        setResults(finalResults);
        return finalResults;
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let totalChars = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          const line = block.trim();
          if (!line.startsWith("data: ")) continue;

          const json = line.slice(6);
          let msg: { type: string; text?: string; results?: Record<string, unknown>; error?: string; prosePaths?: string[]; usage?: { inputTokens?: number; outputTokens?: number } };
          try { msg = JSON.parse(json); } catch { continue; }

          if (msg.type === "chunk" && msg.text) {
            totalChars += msg.text.length;
            setStreamChars(totalChars);
          } else if (msg.type === "done" && msg.results) {
            finalResults = msg.results;
            setResults(msg.results);
            if (msg.prosePaths) setProsePaths(msg.prosePaths);
            if (msg.usage) {
              const reqIn = msg.usage.inputTokens || 0;
              setTokenUsage(prev => ({
                inputTokens: prev.inputTokens + reqIn,
                outputTokens: prev.outputTokens + (msg.usage?.outputTokens || 0),
                maxInputPerRequest: Math.max(prev.maxInputPerRequest, reqIn),
                requestCount: prev.requestCount + 1,
              }));
            }
          } else if (msg.type === "error") {
            throw new Error(msg.error || "Unknown streaming error");
          }
        }
      }

      // Drain remaining buffer after stream closes
      if (buffer.trim()) {
        const remaining = buffer.trim();
        if (remaining.startsWith("data: ")) {
          try {
            const msg = JSON.parse(remaining.slice(6));
            if (msg.type === "done" && msg.results) {
              finalResults = msg.results;
              setResults(msg.results);
              if (msg.prosePaths) setProsePaths(msg.prosePaths);
              if (msg.usage) {
                const reqIn = msg.usage.inputTokens || 0;
                setTokenUsage(prev => ({
                  inputTokens: prev.inputTokens + reqIn,
                  outputTokens: prev.outputTokens + (msg.usage?.outputTokens || 0),
                  maxInputPerRequest: Math.max(prev.maxInputPerRequest, reqIn),
                  requestCount: prev.requestCount + 1,
                }));
              }
            } else if (msg.type === "error") {
              throw new Error(msg.error || "Unknown streaming error");
            }
          } catch { /* ignore partial buffer */ }
        }
      }
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Unknown error");
    }
    return finalResults;
  }

  function downloadResults(format: "text" | "json") {
    if (!results) return;

    const modelShort = getActiveModelShort();
    const dateStr = formatDateForFilename();
    
    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === "json") {
      content = JSON.stringify(results, null, 2);
      filename = `schema-results_${modelShort}_${dateStr}.json`;
      mimeType = "application/json";
    } else {
      content = formatResultsAsText(results);
      filename = `schema-results_${modelShort}_${dateStr}.txt`;
      mimeType = "text/plain";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function toSessionPayload(initials: string, sessionName: string, targetProjectId: string): SchemaTestSession {
    return {
      sessionVersion: 1,
      savedAt: new Date().toISOString(),
      savedBy: initials,
      sessionName: sessionName || undefined,
      projectId: targetProjectId || undefined,
      sourceMode,
      twoPassMode,
      parallelMode,
      selectedModel,
      extractModel,
      synthesizeModel,
      selectedTemperature,
      extractTemperature,
      synthesizeTemperature,
      activeTab: activeResultTab,
      sourceText: sourceMode === "upload" ? uploadedText : undefined,
      sourcePageCount: sourceMode === "upload" ? uploadedPageCount : undefined,
      pass1Results,
      pass2Results: results,
    };
  }

  function makeSessionFilename(initials: string, sessionName: string, modelShort: string, dateStr: string): string {
    const safeSession = sessionName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    const namePart = safeSession ? `${safeSession}_` : "";
    return `schema-session_${namePart}${modelShort}_${dateStr}_${initials}.json`;
  }

  async function saveResults() {
    if (!results) {
      setTestError("No results to save");
      return;
    }

    if (!saveTargetProjectId) {
      setTestError("Please select a project to save to");
      return;
    }

    const sessionNameInput = window.prompt("Session name (optional):", "");
    if (sessionNameInput === null) return;
    const sessionName = sessionNameInput.trim();

    const initials = window.prompt("Enter your initials:");
    if (!initials || !initials.trim()) return;

    setSavingResults(true);
    const modelShort = getActiveModelShort();
    const dateStr = formatDateForFilename();
    const initialsClean = initials.trim().toUpperCase();
    const session = toSessionPayload(initialsClean, sessionName, saveTargetProjectId);

    try {
      const res = await fetch("/api/extraction/save-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: saveTargetProjectId,
          results,
          session,
          filename: makeSessionFilename(initialsClean, sessionName, modelShort, dateStr),
          initials: initialsClean,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save results");
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await loadSessionFiles(saveTargetProjectId);
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingResults(false);
    }
  }

  async function saveToNewProject() {
    if (!results) {
      setTestError("No results to save");
      return;
    }

    const projectNameInput = window.prompt("New project name:", "Extraction Session");
    if (projectNameInput === null) return;
    const projectName = projectNameInput.trim();

    const sessionNameInput = window.prompt("Session name (optional):", projectName || "");
    if (sessionNameInput === null) return;
    const sessionName = sessionNameInput.trim();

    const initials = window.prompt("Enter your initials:");
    if (!initials || !initials.trim()) return;

    setSavingResults(true);
    const modelShort = getActiveModelShort();
    const dateStr = formatDateForFilename();
    const initialsClean = initials.trim().toUpperCase();

    try {
      // Create new project first
      const createRes = await fetch("/api/projects/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: projectName || undefined }),
      });
      if (!createRes.ok) throw new Error("Failed to create new project");
      const { projectId: newProjectId, manifestUrl: newManifestUrl } = await createRes.json();

      const session = toSessionPayload(initialsClean, sessionName, newProjectId);

      const sourceToPersist = sourceText.trim();
      if (sourceToPersist && newManifestUrl) {
        const textSaveRes = await fetch("/api/projects/format-text/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: newProjectId,
            manifestUrl: newManifestUrl,
            text: sourceToPersist,
          }),
        });
        if (!textSaveRes.ok) {
          const errData = await textSaveRes.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to save source text in new project");
        }
      }

      // Save results to the new project
      const res = await fetch("/api/extraction/save-results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: newProjectId,
          results,
          session,
          filename: makeSessionFilename(initialsClean, sessionName, modelShort, dateStr),
          initials: initialsClean,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save results");
      }

      // Refresh project list and select the new project
      await loadProjects();
      setSaveTargetProjectId(newProjectId);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      await loadSessionFiles(newProjectId);
    } catch (e) {
      setTestError(e instanceof Error ? e.message : "Failed to save to new project");
    } finally {
      setSavingResults(false);
    }
  }

  // Format results as readable text
  function formatResultsAsText(data: Record<string, unknown>, indent = 0, parentPath = ""): string {
    const lines: string[] = [];
    const prefix = "  ".repeat(indent);

    for (const [key, value] of Object.entries(data)) {
      const fieldPath = parentPath ? `${parentPath}.${key}` : key;

      // Skip asset fields using schema as source of truth
      if (assetPaths.size > 0 && isAssetPath(fieldPath, assetPaths)) {
        lines.push(`${prefix}${key}: - skipped (images not analyzed)`);
        continue;
      }

      if (value === null || value === undefined) {
        lines.push(`${prefix}${key}: -`);
      } else if (typeof value === "string") {
        if (value.length > 100) {
          lines.push(`${prefix}${key}:`);
          lines.push(`${prefix}  ${value}`);
        } else {
          lines.push(`${prefix}${key}: ${value}`);
        }
      } else if (typeof value === "number" || typeof value === "boolean") {
        lines.push(`${prefix}${key}: ${value}`);
      } else if (Array.isArray(value)) {
        lines.push(`${prefix}${key}:`);
        if (value.length === 0) {
          lines.push(`${prefix}  (empty)`);
        } else {
          value.forEach((item, i) => {
            if (typeof item === "object" && item !== null) {
              lines.push(`${prefix}  [${i + 1}]`);
              lines.push(formatResultsAsText(item as Record<string, unknown>, indent + 2, `${fieldPath}.${i}`));
            } else {
              lines.push(`${prefix}  - ${item}`);
            }
          });
        }
      } else if (typeof value === "object") {
        lines.push(`${prefix}${key}:`);
        lines.push(formatResultsAsText(value as Record<string, unknown>, indent + 1, fieldPath));
      }
    }

    return lines.join("\n");
  }

  // ─── Diff detection: compare Pass 1 vs Pass 2 to find changed fields ───
  // Memoized: only recomputes when pass1Results, results, or prosePaths change.
  // When prosePaths is non-empty (synthesis mode), highlights are scoped to
  // L2_MED/L2_LONG fields only — other incidental diffs are hidden.

  /** Convert a backend prose-path pattern (e.g. "CHARACTERS.CharacterList[].SummaryBox")
   *  into a RegExp matching the diff-path format (e.g. "CHARACTERS.CharacterList.0.SummaryBox").
   *  The regex matches the field itself and any nested sub-paths. */
  function prosePathToRegex(pp: string): RegExp {
    const segments = pp.split("[]");
    const pattern = segments
      .map(s => s.replace(/\./g, "\\."))
      .join("\\.\\d+");
    return new RegExp(`^${pattern}($|\\.)`);
  }

  const changedPathsLookup = useMemo(() => {
    const changed = new Set<string>();
    if (!pass1Results || !results || viewingPass !== "pass2") {
      return { has: () => false, size: 0 } as { has: (p: string) => boolean; size: number };
    }

    function walk(a: unknown, b: unknown, path: string) {
      if (a === b) return;
      if (a === null || a === undefined) { markAll(b, path); return; }
      if (b === null || b === undefined) return;
      if (typeof a !== typeof b) { changed.add(path); return; }
      if (Array.isArray(a) && Array.isArray(b)) {
        const len = Math.max(a.length, b.length);
        for (let i = 0; i < len; i++) walk(a[i], b[i], `${path}.${i}`);
        return;
      }
      if (typeof a === "object" && typeof b === "object" && a !== null && b !== null) {
        const aObj = a as Record<string, unknown>;
        const bObj = b as Record<string, unknown>;
        const allKeys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
        for (const k of allKeys) walk(aObj[k], bObj[k], path ? `${path}.${k}` : k);
        return;
      }
      if (String(a) !== String(b)) changed.add(path);
    }

    function markAll(val: unknown, path: string) {
      if (val === null || val === undefined || val === "") return;
      changed.add(path);
      if (Array.isArray(val)) val.forEach((item, i) => markAll(item, `${path}.${i}`));
      else if (typeof val === "object") {
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) markAll(v, `${path}.${k}`);
      }
    }

    walk(pass1Results, results, "");

    // ─── Scope highlights to L2_MED/L2_LONG prose fields when available ───
    // Without this filter, any field the model incidentally reformats would
    // light up green — misleading since only prose fields are intentionally
    // rewritten in Pass 2.
    if (prosePaths.length > 0) {
      const regexes = prosePaths.map(prosePathToRegex);
      for (const p of changed) {
        if (!regexes.some(r => r.test(p))) {
          changed.delete(p);
        }
      }
    }

    // Pre-build ancestor set: for each changed path, also mark all ancestors
    // e.g. "CHARACTERS.CharacterList.0.SummaryBox" → also marks
    //       "CHARACTERS", "CHARACTERS.CharacterList", "CHARACTERS.CharacterList.0"
    const withAncestors = new Set(changed);
    for (const p of changed) {
      const parts = p.split(".");
      for (let i = 1; i < parts.length; i++) {
        withAncestors.add(parts.slice(0, i).join("."));
      }
    }

    return {
      /** True for leaf values that actually changed */
      has: (path: string) => changed.has(path),
      /** True for containers that have a changed descendant (but are not themselves changed) */
      hasDescendant: (path: string) => withAncestors.has(path) && !changed.has(path),
      size: changed.size,
    };
  }, [pass1Results, results, viewingPass, prosePaths]);

  // Green highlight style for changed fields
  const CHANGED_STYLE: React.CSSProperties = {
    background: "#dcfce7",
    borderLeft: "3px solid #22c55e",
    paddingLeft: 6,
    borderRadius: 4,
    marginLeft: -3,
  };

  // Render formatted results
  function renderFormattedResults(data: Record<string, unknown>): React.ReactNode {
    // Check if a key is a tag-type field
    const isTagField = (key: string) => {
      const k = key.toLowerCase();
      return k === "tags" || k === "storyfunctiontags" || k === "storytags" || k === "genretags" || k === "tonetags" || k === "styletags" || k.endsWith("tags");
    };
    const isTriggerField = (key: string) => {
      const k = key.toLowerCase();
      return k === "trigger";
    };
    const isNegativeField = (key: string) => {
      const k = key.toLowerCase();
      return k === "negativetags" || k === "negative" || k === "negativeprompt";
    };

    // Render a comma-separated string as individual tag chips
    const renderTagChips = (value: string, color: string, bg: string) => {
      const tags = value.split(",").map(t => t.trim()).filter(Boolean);
      return (
        <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
          {tags.map((tag, i) => (
            <span key={i} style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: 12,
              fontSize: 12,
              fontWeight: 500,
              color,
              background: bg,
              border: `1px solid ${color}22`,
            }}>
              {tag}
            </span>
          ))}
        </span>
      );
    };

    // Render array items as tag chips
    const renderArrayTagChips = (items: string[], color: string, bg: string) => (
      <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
        {items.map((tag, i) => (
          <span key={i} style={{
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 12,
            fontSize: 12,
            fontWeight: 500,
            color,
            background: bg,
            border: `1px solid ${color}22`,
          }}>
            {tag}
          </span>
        ))}
      </span>
    );

    const renderValue = (key: string, value: unknown, depth: number, path: string): React.ReactNode => {
      const isChanged = changedPathsLookup.size > 0 && changedPathsLookup.has(path);
      const highlightStyle = isChanged ? CHANGED_STYLE : {};

      // Skip asset fields using schema as source of truth
      if (assetPaths.size > 0 && isAssetPath(path, assetPaths)) {
        return (
          <div key={key} style={{ marginLeft: depth * 16, marginBottom: 4 }}>
            <span style={{ color: "#64748b", fontWeight: 500 }}>{key}:</span>{" "}
            <span style={{ color: "#94a3b8", fontStyle: "italic" }}>- skipped (images not analyzed)</span>
          </div>
        );
      }

      if (value === null || value === undefined) {
        return (
          <div key={key} style={{ marginLeft: depth * 16, marginBottom: 4 }}>
            <span style={{ color: "#64748b", fontWeight: 500 }}>{key}:</span>{" "}
            <span style={{ color: "#94a3b8" }}>-</span>
          </div>
        );
      }

      // Special rendering for tag/trigger/negative string fields
      if (typeof value === "string") {
        if (isTriggerField(key)) {
          return (
            <div key={key} style={{ marginLeft: depth * 16, marginBottom: 4, ...highlightStyle }}>
              <span style={{ color: "#1e293b", fontWeight: 500 }}>{key}:</span>{" "}
              <span style={{
                display: "inline-block",
                padding: "2px 10px",
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 600,
                color: "#854d0e",
                background: "#fef9c3",
                border: "1px solid #fde047",
              }}>
                {value}
              </span>
            </div>
          );
        }
        if (isTagField(key) && value.includes(",")) {
          return (
            <div key={key} style={{ marginLeft: depth * 16, marginBottom: 6, ...highlightStyle }}>
              <span style={{ color: "#1e293b", fontWeight: 500 }}>{key}:</span>{" "}
              {renderTagChips(value, "#1d4ed8", "#dbeafe")}
            </div>
          );
        }
        if (isNegativeField(key) && value.includes(",")) {
          return (
            <div key={key} style={{ marginLeft: depth * 16, marginBottom: 6, ...highlightStyle }}>
              <span style={{ color: "#1e293b", fontWeight: 500 }}>{key}:</span>{" "}
              {renderTagChips(value, "#64748b", "#f1f5f9")}
            </div>
          );
        }
        return (
          <div key={key} style={{ marginLeft: depth * 16, marginBottom: 4, ...highlightStyle }}>
            <span style={{ color: "#1e293b", fontWeight: 500 }}>{key}:</span>{" "}
            <span style={{ color: "#334155" }}>{value}</span>
          </div>
        );
      }

      if (typeof value === "number" || typeof value === "boolean") {
        return (
          <div key={key} style={{ marginLeft: depth * 16, marginBottom: 4, ...highlightStyle }}>
            <span style={{ color: "#1e293b", fontWeight: 500 }}>{key}:</span>{" "}
            <span style={{ color: "#0369a1" }}>{String(value)}</span>
          </div>
        );
      }

      if (Array.isArray(value)) {
        // Check if it's an array of strings that should be tag chips
        const allStrings = value.length > 0 && value.every(v => typeof v === "string");
        if (allStrings) {
          if (isTagField(key)) {
            return (
              <div key={key} style={{ marginLeft: depth * 16, marginBottom: 6, ...highlightStyle }}>
                <span style={{ color: "#1e293b", fontWeight: 500 }}>{key}:</span>{" "}
                {renderArrayTagChips(value as string[], "#1d4ed8", "#dbeafe")}
              </div>
            );
          }
          if (isNegativeField(key)) {
            return (
              <div key={key} style={{ marginLeft: depth * 16, marginBottom: 6, ...highlightStyle }}>
                <span style={{ color: "#1e293b", fontWeight: 500 }}>{key}:</span>{" "}
                {renderArrayTagChips(value as string[], "#64748b", "#f1f5f9")}
              </div>
            );
          }
        }

        return (
          <div key={key} style={{ marginLeft: depth * 16, marginBottom: 8 }}>
            <div style={{ color: "#000", fontWeight: 600, marginBottom: 4 }}>{key}:</div>
            {value.length === 0 ? (
              <div style={{ marginLeft: 16, color: "#94a3b8", fontStyle: "italic" }}>(empty)</div>
            ) : (
              value.map((item, i) => {
                const itemPath = `${path}.${i}`;
                return (
                  <div key={i} style={{
                    marginLeft: 16, marginBottom: 8, padding: 8,
                    background: "#f8fafc",
                    borderRadius: 4,
                  }}>
                    <div style={{ color: "#64748b", fontSize: 12, marginBottom: 4 }}>#{i + 1}</div>
                    {typeof item === "object" && item !== null
                      ? Object.entries(item as Record<string, unknown>).map(([k, v]) => renderValue(k, v, 0, `${itemPath}.${k}`))
                      : <span style={{ color: "#334155" }}>{String(item)}</span>}
                  </div>
                );
              })
            )}
          </div>
        );
      }

      if (typeof value === "object") {
        return (
          <div key={key} style={{ marginLeft: depth * 16, marginBottom: 8 }}>
            <div style={{ color: "#000", fontWeight: 600, marginBottom: 4, borderBottom: "1px solid #e2e8f0", paddingBottom: 4 }}>
              {key}
            </div>
            {Object.entries(value as Record<string, unknown>).map(([k, v]) => renderValue(k, v, depth + 1, `${path}.${k}`))}
          </div>
        );
      }

      return null;
    };

    return (
      <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 14, lineHeight: 1.6 }}>
        {Object.entries(data).map(([key, value]) => renderValue(key, value, 0, key))}
      </div>
    );
  }

  const sourceText = sourceMode === "existing" ? projectText : uploadedText;
  const currentTabInfo = SCHEMA_TABS.find(t => t.key === activeSettingsTab);

  // Domain tabs for results — FACTIONS only shown when it has actual faction entries
  const DOMAIN_ORDER = ["OVERVIEW", "CHARACTERS", "WORLD", "LORE", "FACTIONS", "STYLE", "TONE", "STORY"];

  // Which results to display — Pass 1 or Pass 2 (or single-pass results)
  const activeResults = (viewingPass === "pass1" && pass1Results) ? pass1Results : results;

  function getResultDomainTabs(): { key: string; label: string }[] {
    if (!activeResults) return [];
    const tabs: { key: string; label: string }[] = [{ key: "all", label: "All" }];
    for (const domain of DOMAIN_ORDER) {
      if (!(domain in activeResults)) continue;
      // FACTIONS: only show as separate tab if it has faction entries
      if (domain === "FACTIONS") {
        const factions = activeResults.FACTIONS as Record<string, unknown> | undefined;
        const factionArray = factions?.Faction as unknown[] | undefined;
        if (!factionArray || factionArray.length === 0) continue;
      }
      tabs.push({ key: domain, label: domain.charAt(0) + domain.slice(1).toLowerCase() });
    }
    // Also include any unexpected top-level keys
    for (const key of Object.keys(activeResults)) {
      if (key === "version" || key.startsWith("_")) continue;
      if (!DOMAIN_ORDER.includes(key) && !tabs.find(t => t.key === key)) {
        tabs.push({ key, label: key });
      }
    }
    return tabs;
  }

  function getFilteredResults(): Record<string, unknown> | null {
    if (!activeResults) return null;
    if (activeResultTab === "all") return activeResults;
    if (activeResultTab in activeResults) {
      return { [activeResultTab]: activeResults[activeResultTab] };
    }
    return activeResults;
  }

  const resultDomainTabs = getResultDomainTabs();
  const filteredResults = getFilteredResults();

  // Fix PDF extraction artifacts: collapse lines where every char is space-separated
  // e.g. "B A D I N F L U E N C E" → "BADINFLUENCE"
  const cleanPdfText = (text: string): string => {
    return text.replace(/^(.+)$/gm, (line) => {
      // Check if line matches the pattern: single chars separated by single spaces
      // At least 3 occurrences of "char space" pattern to qualify
      if (/^(\S ){3,}\S?$/.test(line.trim())) {
        return line.replace(/ /g, "");
      }
      // Also handle lines with words that are internally char-spaced
      // e.g. "W r i t t e n b y" → "Writtenby" — detect if >60% of non-space chars are followed by a space
      const trimmed = line.trim();
      const chars = trimmed.replace(/ /g, "");
      const singleSpacePairs = (trimmed.match(/(\S) (?=\S)/g) || []).length;
      if (chars.length > 3 && singleSpacePairs / chars.length > 0.5) {
        // Collapse single spaces, preserve double+ spaces as single space
        return line.replace(/(\S) (?=\S)/g, "$1").replace(/  +/g, " ");
      }
      return line;
    });
  };

  return (
    <div style={{ minHeight: "100vh", padding: 28, maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "#0f172a" }}>STORYLINE</h1>
          </Link>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {(() => {
            const activeProjectId = saveTargetProjectId || selectedProjectId;
            const activeProject = projects.find(p => p.projectId === activeProjectId);
            if (!activeProject) return null;
            const params = new URLSearchParams({ pid: activeProject.projectId, m: activeProject.manifestUrl });
            return (
              <a
                href={`/?${params.toString()}`}
                style={{
                  border: "1px solid #0f172a",
                  background: "#0f172a",
                  color: "#fff",
                  padding: "8px 16px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                Open in Studio →
              </a>
            );
          })()}
          <button
            type="button"
            onClick={() => setSchemaSettingsOpen(true)}
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
              gap: 6,
            }}
          >
            ⚙️ Settings
          </button>
        </div>
      </div>

      {/* Settings Overlay */}
      {schemaSettingsOpen && (
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
                onClick={() => setSchemaSettingsOpen(false)}
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
        {/* Model Configuration */}
        <div style={{
          marginBottom: 16,
          paddingBottom: 16,
          borderBottom: "1px solid #e2e8f0",
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Model Configuration</div>
          {twoPassMode ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                  Pass 1 Model (Extract)
                </label>
                <select
                  value={extractModel}
                  onChange={(e) => setExtractModel(e.target.value)}
                  style={{ width: "100%", padding: 8, border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
                >
                  <optgroup label="Google Gemini">
                    <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                    <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                  </optgroup>
                  <optgroup label="Anthropic Claude">
                    <option value="claude-opus-4-6">Claude Opus 4.6</option>
                    <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                  </optgroup>
                  <optgroup label="OpenAI">
                    <option value="gpt-5.2">GPT-5.2</option>
                  </optgroup>
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <label style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>Temp</label>
                  <input type="range" min={0} max={1} step={0.05} value={extractTemperature} onChange={(e) => setExtractTemperature(parseFloat(e.target.value))} style={{ flex: 1, height: 4, accentColor: "#000" }} />
                  <span style={{ fontSize: 11, color: "#64748b", minWidth: 28, textAlign: "right", fontFamily: "monospace" }}>{extractTemperature.toFixed(2)}</span>
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                  Pass 2 Model (Synthesize)
                </label>
                <select
                  value={synthesizeModel}
                  onChange={(e) => setSynthesizeModel(e.target.value)}
                  style={{ width: "100%", padding: 8, border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
                >
                  <optgroup label="Google Gemini">
                    <option value="gemini-3-flash-preview">Gemini 3 Flash</option>
                    <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                  </optgroup>
                  <optgroup label="Anthropic Claude">
                    <option value="claude-opus-4-6">Claude Opus 4.6</option>
                    <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                  </optgroup>
                  <optgroup label="OpenAI">
                    <option value="gpt-5.2">GPT-5.2</option>
                  </optgroup>
                </select>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                  <label style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>Temp</label>
                  <input type="range" min={0} max={1} step={0.05} value={synthesizeTemperature} onChange={(e) => setSynthesizeTemperature(parseFloat(e.target.value))} style={{ flex: 1, height: 4, accentColor: "#000" }} />
                  <span style={{ fontSize: 11, color: "#64748b", minWidth: 28, textAlign: "right", fontFamily: "monospace" }}>{synthesizeTemperature.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#64748b", marginBottom: 4 }}>
                AI Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{ width: "100%", padding: 8, border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13 }}
              >
                <optgroup label="Google Gemini">
                  <option value="gemini-3-flash-preview">Gemini 3 Flash (Default)</option>
                  <option value="gemini-3-pro-preview">Gemini 3 Pro</option>
                </optgroup>
                <optgroup label="Anthropic Claude">
                  <option value="claude-opus-4-6">Claude Opus 4.6</option>
                  <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                </optgroup>
                <optgroup label="OpenAI">
                  <option value="gpt-5.2">GPT-5.2</option>
                </optgroup>
              </select>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                <label style={{ fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" }}>Temperature</label>
                <input type="range" min={0} max={1} step={0.05} value={selectedTemperature} onChange={(e) => setSelectedTemperature(parseFloat(e.target.value))} style={{ flex: 1, height: 4, accentColor: "#000" }} />
                <span style={{ fontSize: 11, color: "#64748b", minWidth: 28, textAlign: "right", fontFamily: "monospace" }}>{selectedTemperature.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Execution Modes */}
        <div style={{
          marginBottom: 16,
          paddingBottom: 16,
          borderBottom: "1px solid #e2e8f0",
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Execution Modes</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: testBusy ? "not-allowed" : "pointer", fontSize: 13, color: "#475569" }}>
              <input
                type="checkbox"
                checked={parallelMode}
                onChange={(e) => setParallelMode(e.target.checked)}
                disabled={testBusy}
                style={{ cursor: testBusy ? "not-allowed" : "pointer" }}
              />
              <span style={{ fontWeight: 500 }}>Parallel mode</span>
              <span style={{ color: "#94a3b8", fontSize: 12 }}>— 3 grouped requests instead of 1 (~3× faster, ~60% fewer tokens)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: testBusy ? "not-allowed" : "pointer", fontSize: 13, color: "#475569" }}>
              <input
                type="checkbox"
                checked={twoPassMode}
                onChange={(e) => setTwoPassMode(e.target.checked)}
                disabled={testBusy}
                style={{ cursor: testBusy ? "not-allowed" : "pointer" }}
              />
              <span style={{ fontWeight: 500 }}>Two-pass mode</span>
              <span style={{ color: "#94a3b8", fontSize: 12 }}>— Pass 1 extracts facts, Pass 2 writes prose (higher quality)</span>
            </label>
          </div>
        </div>

        {/* Tabs Row — grouped */}
        {(["prompts", "schema", "visual"] as const).map(group => {
          const groupTabs = SCHEMA_TABS.filter(t => t.group === group);
          const groupLabel = group === "prompts" ? "Prompts" : group === "schema" ? "Schema Domains" : "Visual / Assets";
          return (
            <div key={group} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{groupLabel}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {groupTabs.map(tab => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveSettingsTab(tab.key)}
                    style={{
                      border: "1px solid #000",
                      background: activeSettingsTab === tab.key ? "#000" : "#fff",
                      color: activeSettingsTab === tab.key ? "#fff" : "#000",
                      borderRadius: 10,
                      padding: "7px 12px",
                      fontSize: 12,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      position: "relative",
                    }}
                  >
                    {tab.label}
                    {settingsDirty[tab.key] && (
                      <span style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        width: 6,
                        height: 6,
                        background: "#f97316",
                        borderRadius: "50%",
                      }} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        <div style={{ borderBottom: "1px solid #e2e8f0", marginBottom: 16 }} />

        {/* Active Tab Editor */}
        <div>
          {/* Tab Actions */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b" }}>
              {currentTabInfo?.label}
              {settingsDirty[activeSettingsTab] && (
                <span style={{ 
                  marginLeft: 8, 
                  fontSize: 12, 
                  color: "#f97316",
                  fontWeight: 500,
                }}>
                  (unsaved changes)
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => saveSchemaTab(activeSettingsTab)}
                disabled={!settingsDirty[activeSettingsTab]}
                style={{
                  padding: "6px 14px",
                  border: "1px solid #16a34a",
                  background: settingsDirty[activeSettingsTab] ? "#16a34a" : "#e2e8f0",
                  color: settingsDirty[activeSettingsTab] ? "#fff" : "#94a3b8",
                  borderRadius: 6,
                  cursor: settingsDirty[activeSettingsTab] ? "pointer" : "not-allowed",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                {savingTab === activeSettingsTab ? "Saving..." : "💾 Save"}
              </button>
              <button
                onClick={() => {
                  setHistoryOpen(!historyOpen);
                  if (!historyOpen) loadHistory(activeSettingsTab);
                }}
                style={{
                  padding: "6px 14px",
                  border: "1px solid #000",
                  background: historyOpen ? "#000" : "#f8fafc",
                  color: historyOpen ? "#fff" : "#000",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                📜 History
              </button>
              <button
                onClick={() => downloadSchemaTab(activeSettingsTab)}
                style={{
                  padding: "6px 14px",
                  border: "1px solid #0369a1",
                  background: "#f0f9ff",
                  color: "#0369a1",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                ⬇️ Download
              </button>
              <button
                onClick={() => restoreToTemplate(activeSettingsTab)}
                style={{
                  padding: "6px 14px",
                  border: "1px solid #dc2626",
                  background: "#fef2f2",
                  color: "#dc2626",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                }}
              >
                🔄 Restore Template
              </button>
            </div>
          </div>

          {/* History Panel */}
          {historyOpen && (
            <div style={{
              marginBottom: 12,
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              padding: 12,
              background: "#f8fafc",
              maxHeight: 200,
              overflowY: "auto",
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#1e293b" }}>
                Version History - {currentTabInfo?.label}
              </div>
              {history[activeSettingsTab].length === 0 ? (
                <div style={{ fontSize: 13, color: "#94a3b8" }}>
                  No saved versions yet. Click Save to create a version.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {history[activeSettingsTab].map((version, i) => (
                    <div key={i} style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "8px 12px",
                      background: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 6,
                      fontSize: 13,
                    }}>
                      <div>
                        <span style={{ fontWeight: 500 }}>
                          {new Date(version.timestamp).toLocaleString()}
                        </span>
                        {version.initials && (
                          <span style={{
                            marginLeft: 8,
                            padding: "1px 6px",
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            color: "#000",
                            background: "#f8fafc",
                            border: "1px solid #e2e8f0",
                          }}>
                            {version.initials}
                          </span>
                        )}
                        <span style={{ color: "#94a3b8", marginLeft: 8 }}>
                          ({Math.round(version.size / 1024)}KB)
                        </span>
                      </div>
                      <button
                        onClick={() => restoreVersion(activeSettingsTab, version)}
                        style={{
                          padding: "4px 10px",
                          border: "1px solid #000",
                          background: "#000",
                          color: "#fff",
                          borderRadius: 4,
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: 500,
                        }}
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Prompt tab help text */}
          {activeSettingsTab === "prompt" && (
            <div style={{
              marginBottom: 12,
              padding: 10,
              background: "#eff6ff",
              border: "1px solid #bfdbfe",
              borderRadius: 8,
              fontSize: 13,
              color: "#1e40af",
              lineHeight: 1.5,
            }}>
              <strong>Placeholders:</strong> Use these in your prompt template — they will be replaced at runtime:<br />
              <code style={{ background: "#dbeafe", padding: "1px 4px", borderRadius: 3 }}>{"{{SCHEMA_JSON}}"}</code> → the Schema JSON definition&nbsp;&nbsp;
              <code style={{ background: "#dbeafe", padding: "1px 4px", borderRadius: 3 }}>{"{{METADATA_CONTEXT}}"}</code> → domain metadata fields&nbsp;&nbsp;
              <code style={{ background: "#dbeafe", padding: "1px 4px", borderRadius: 3 }}>{"{{SOURCE_TEXT}}"}</code> → the source material to analyze
            </div>
          )}

          {/* Textarea Editor */}
          <textarea
            value={schemaContents[activeSettingsTab]}
            onChange={(e) => handleSchemaContentChange(e.target.value)}
            style={{
              width: "100%",
              height: 350,
              padding: 12,
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              fontFamily: "monospace",
              fontSize: 13,
              resize: "vertical",
              boxSizing: "border-box",
              lineHeight: 1.5,
            }}
            placeholder={`Enter ${currentTabInfo?.label} content...`}
          />
        </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== SOURCE TEXT SECTION ===== */}
      <div style={{ 
        border: "1px solid #e2e8f0", 
        borderRadius: 12, 
        padding: 16,
        marginBottom: 24 
      }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: 16, fontWeight: 600 }}>Source Text</h3>

            {/* Source Mode Toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => setSourceMode("existing")}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  border: "1px solid #e2e8f0",
                  background: sourceMode === "existing" ? "#000" : "#fff",
                  color: sourceMode === "existing" ? "#fff" : "#1e293b",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                📁 Use Existing Project
              </button>
              <button
                onClick={() => setSourceMode("upload")}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  border: "1px solid #e2e8f0",
                  background: sourceMode === "upload" ? "#000" : "#fff",
                  color: sourceMode === "upload" ? "#fff" : "#1e293b",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                📤 Upload New Source
              </button>
            </div>

            {/* Existing Project Selector */}
            {sourceMode === "existing" && (
              <div>
                <select
                  value={selectedProjectId}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value);
                    setSaveTargetProjectId(e.target.value);
                  }}
                  disabled={projectsBusy}
                  style={{
                    width: "100%",
                    padding: 10,
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    marginBottom: 12,
                    fontSize: 14,
                  }}
                >
                  <option value="">Select a project...</option>
                  {projects
                    .filter(p => p.hasText)
                    .map(p => (
                      <option key={p.projectId} value={p.projectId}>
                        {p.filename} ({p.projectId.slice(0, 8)})
                      </option>
                    ))}
                </select>
                {projectsBusy && <div style={{ color: "#64748b" }}>Loading projects...</div>}
              </div>
            )}

            {/* Upload Text */}
            {sourceMode === "upload" && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.json,.pdf,application/pdf"
                  onChange={handleFileUpload}
                  style={{ display: "none" }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pdfBusy}
                  style={{
                    width: "100%",
                    padding: 16,
                    border: "2px dashed #e2e8f0",
                    background: pdfBusy ? "#f1f5f9" : "#fff",
                    borderRadius: 8,
                    cursor: pdfBusy ? "not-allowed" : "pointer",
                    marginBottom: 12,
                  }}
                >
                  {pdfBusy ? `⏳ ${pdfProgress || "Extracting text from PDF..."}` : "📎 Click to upload file (.pdf, .txt, .md, .json)"}
                </button>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
                  {uploadedPageCount > 0 ? `Pages ${uploadedPageCount}` : pdfBusy ? pdfProgress : ""}
                </div>
                {uploadedSourceBlob && (
                  <div style={{
                    marginBottom: 10,
                    padding: 10,
                    border: "1px solid #d1d5db",
                    borderRadius: 8,
                    background: "#f8fafc",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}>
                    <div style={{ fontSize: 12, color: "#334155", fontWeight: 600 }}>
                      ✅ Auto-saved to Blob: {uploadedSourceBlob.filename}
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      {(uploadedSourceBlob.size / 1024).toFixed(1)} KB
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <a
                        href={uploadedSourceBlob.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 12, color: "#0369a1", fontWeight: 600 }}
                      >
                        View uploaded file
                      </a>
                      <button
                        type="button"
                        onClick={deleteUploadedSourceBlob}
                        disabled={deletingUploadedSource || pdfBusy}
                        style={{
                          border: "1px solid #dc2626",
                          background: "#fef2f2",
                          color: "#dc2626",
                          borderRadius: 6,
                          padding: "4px 10px",
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: deletingUploadedSource || pdfBusy ? "not-allowed" : "pointer",
                        }}
                      >
                        {deletingUploadedSource ? "Deleting..." : "Delete from Blob"}
                      </button>
                    </div>
                  </div>
                )}
                <textarea
                  value={uploadedText}
                  onChange={(e) => setUploadedText(e.target.value)}
                  placeholder="Or paste text here..."
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    height: 150,
                    padding: "12px 16px",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    resize: "vertical",
                    fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
                    fontSize: 13,
                    lineHeight: 1.6,
                    color: "#1e293b",
                  }}
                />
              </div>
            )}

            {/* Image Pipeline Progress */}
            {(imagePipelineBusy || imagePipelineResult) && sourceMode === "upload" && (
              <div style={{
                marginTop: 12,
                padding: 14,
                border: `1px solid ${imagePipelineBusy ? "#93c5fd" : imagePipelineResult?.hasImages ? "#86efac" : "#e2e8f0"}`,
                borderRadius: 8,
                background: imagePipelineBusy ? "#eff6ff" : imagePipelineResult?.hasImages ? "#f0fdf4" : "#f8fafc",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>
                    {imagePipelineBusy ? "🔄 Image Pipeline" : imagePipelineResult?.hasImages ? "✅ Images Processed" : "ℹ️ No Substantial Images"}
                  </span>
                  {imagePipelinePhase && <span style={{ fontSize: 12, color: "#64748b" }}>{imagePipelinePhase}</span>}
                </div>
                {imagePipelineResult && !imagePipelineBusy && (
                  <div style={{ fontSize: 12, color: "#475569" }}>
                    {imagePipelineResult.hasImages ? (
                      <>
                        {imagePipelineResult.assetsFound} images detected · {imagePipelineResult.tagged} tagged
                        {imagePipelineResult.styleAnalyzed && " · Style analyzed"}
                        {" · "}
                        <a
                          href={`/?pid=${encodeURIComponent(imagePipelineResult.projectId)}&m=${encodeURIComponent(imagePipelineResult.manifestUrl)}`}
                          style={{ color: "#0369a1", fontWeight: 600 }}
                        >
                          Open in Studio →
                        </a>
                      </>
                    ) : (
                      "PDF has no substantial images — proceeding with text extraction only."
                    )}
                  </div>
                )}
                {imagePipelineLog.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ fontSize: 11, color: "#64748b", cursor: "pointer" }}>
                      Pipeline log ({imagePipelineLog.length} entries)
                    </summary>
                    <pre style={{
                      marginTop: 6,
                      maxHeight: 150,
                      overflow: "auto",
                      fontSize: 11,
                      color: "#475569",
                      background: "#fff",
                      padding: 8,
                      borderRadius: 6,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}>
                      {imagePipelineLog.join("\n")}
                    </pre>
                  </details>
                )}
              </div>
            )}

            {/* Source Preview (only for existing projects — upload mode already shows the textarea) */}
            {sourceText && sourceMode === "existing" && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 6 }}>
                  Source Preview ({sourceText.length.toLocaleString()} chars)
                </div>
                <div style={{
                  maxHeight: 300,
                  overflow: "auto",
                  padding: "16px 20px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  fontSize: 13,
                  fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: "#1e293b",
                }}>
                  {cleanPdfText(sourceText.slice(0, 5000))}
                  {sourceText.length > 5000 && "\n\n..."}
                </div>
              </div>
            )}
      </div>

      {/* ===== RUN TEST SECTION ===== */}
      <div style={{ 
        border: "1px solid #e2e8f0", 
        borderRadius: 12, 
        padding: 16,
        marginBottom: 24 
      }}>
          {/* Run Test Button */}
          <button
            onClick={runSchemaTest}
            disabled={testBusy || pdfBusy || !sourceText.trim()}
            style={{
              width: "100%",
              padding: "14px 24px",
              border: "none",
              background: (testBusy || pdfBusy) ? "#94a3b8" : "#000",
              color: "#fff",
              borderRadius: 8,
              cursor: (testBusy || pdfBusy) ? "not-allowed" : "pointer",
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            {pdfBusy
              ? "⏳ Waiting for full PDF extraction..."
              : testBusy
                ? twoPassPhase === "extracting"
                  ? `⏳ Pass 1: Extracting... ${streamChars > 0 ? `(${Math.round(streamChars / 1000)}k chars)` : ""}`
                  : twoPassPhase === "synthesizing"
                    ? `⏳ Pass 2: Synthesizing... ${streamChars > 0 ? `(${Math.round(streamChars / 1000)}k chars)` : ""}`
                    : `⏳ Generating... ${streamChars > 0 ? `(${Math.round(streamChars / 1000)}k chars)` : ""}`
                : `▶️ ${twoPassMode ? "Run Pass 1 (Extract)" : `Run Schema Test${parallelMode ? " (Parallel)" : ""}`}`}
          </button>

          {/* Token usage display */}
          {(tokenUsage.inputTokens > 0 || tokenUsage.outputTokens > 0) && (
            <div style={{
              marginTop: 8,
              padding: "6px 12px",
              borderRadius: 6,
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              fontSize: 12,
              color: "#166534",
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}>
              <span>📊 <strong>Tokens:</strong></span>
              {tokenUsage.requestCount > 1 ? (
                <>
                  <span>In: {tokenUsage.maxInputPerRequest.toLocaleString()} × {tokenUsage.requestCount} reqs</span>
                  <span>Out: {tokenUsage.outputTokens.toLocaleString()}</span>
                  <span>Total: {(tokenUsage.inputTokens + tokenUsage.outputTokens).toLocaleString()}</span>
                </>
              ) : (
                <>
                  <span>In: {tokenUsage.inputTokens.toLocaleString()}</span>
                  <span>Out: {tokenUsage.outputTokens.toLocaleString()}</span>
                  <span>Total: {(tokenUsage.inputTokens + tokenUsage.outputTokens).toLocaleString()}</span>
                </>
              )}
              {tokenUsage.maxInputPerRequest > 200000 && (
                <span style={{ color: "#b45309", fontWeight: 600 }}>⚠️ Long context pricing</span>
              )}
            </div>
          )}

          {/* Two-pass phase indicator */}
          {twoPassMode && twoPassPhase !== "idle" && (
            <div style={{
              marginTop: 12,
              padding: "10px 14px",
              borderRadius: 8,
              background: twoPassPhase === "extracting" ? "#dbeafe" : "#fef3c7",
              color: twoPassPhase === "extracting" ? "#1d4ed8" : "#92400e",
              fontSize: 13,
              fontWeight: 600,
              textAlign: "center",
            }}>
              {twoPassPhase === "extracting"
                ? "🔍 Pass 1 of 2 — Extracting facts from source material..."
                : "✍️ Pass 2 of 2 — Synthesizing prose from extracted data..."}
            </div>
          )}

          {/* Per-domain progress (parallel mode) */}
          {parallelMode && Object.keys(domainProgress).length > 0 && (
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
              {ALL_DOMAINS.map(d => {
                const p = domainProgress[d];
                if (!p) return null;
                const bg = p.status === "done" ? "#dcfce7" : p.status === "running" ? "#dbeafe" : p.status === "error" ? "#fee2e2" : "#f1f5f9";
                const fg = p.status === "done" ? "#16a34a" : p.status === "running" ? "#2563eb" : p.status === "error" ? "#dc2626" : "#94a3b8";
                const icon = p.status === "done" ? "✅" : p.status === "running" ? "⏳" : p.status === "error" ? "❌" : "⏸️";
                return (
                  <div
                    key={d}
                    title={p.error || undefined}
                    style={{
                      padding: "6px 8px",
                      borderRadius: 6,
                      background: bg,
                      color: fg,
                      fontSize: 11,
                      fontWeight: 600,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {icon} {d}{p.status === "running" && p.chars > 0 ? ` (${Math.round(p.chars / 1000)}k)` : ""}
                    {p.status === "error" && p.error && (
                      <div style={{ fontSize: 10, fontWeight: 400, marginTop: 2, whiteSpace: "normal", lineHeight: 1.3 }}>
                        {p.error.length > 120 ? p.error.slice(0, 120) + "…" : p.error}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {testError && (
            <div style={{ 
              marginTop: 12, 
              padding: 12, 
              background: "#fef2f2", 
              border: "1px solid #fecaca", 
              borderRadius: 8,
              color: "#dc2626",
              fontSize: 13,
              maxHeight: 200,
              overflowY: "auto",
            }}>
              {testError.includes("; ") ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {testError.replace(/^Some domains failed: /, "").split("; ").map((err, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>{err}</li>
                  ))}
                </ul>
              ) : testError}
            </div>
          )}
      </div>

      {/* ===== RESULTS SECTION ===== */}
      <div style={{ 
        border: "1px solid #e2e8f0", 
        borderRadius: 12, 
        padding: 16,
      }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Results</h3>

              {/* Pass 1 / Pass 2 toggle (only when two-pass results exist) */}
              {pass1Results && results && (
                <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden", marginLeft: 12 }}>
                  <button
                    onClick={() => setViewingPass("pass1")}
                    style={{
                      padding: "6px 12px", border: "none",
                      background: viewingPass === "pass1" ? "#2563eb" : "#fff",
                      color: viewingPass === "pass1" ? "#fff" : "#64748b",
                      cursor: "pointer", fontSize: 12, fontWeight: 500,
                    }}
                  >
                    Pass 1 (Extract)
                  </button>
                  <button
                    onClick={() => setViewingPass("pass2")}
                    style={{
                      padding: "6px 12px", border: "none", borderLeft: "1px solid #e2e8f0",
                      background: viewingPass === "pass2" ? "#000" : "#fff",
                      color: viewingPass === "pass2" ? "#fff" : "#64748b",
                      cursor: "pointer", fontSize: 12, fontWeight: 500,
                    }}
                  >
                    Pass 2 (Synthesize)
                  </button>
                </div>
              )}

              {/* Run Pass 2 button — shown when Pass 1 results exist */}
              {pass1Results && twoPassMode && !testBusy && (
                <button
                  onClick={runPass2}
                  style={{
                    marginLeft: 8,
                    padding: "6px 14px",
                    border: "none",
                    background: "#000",
                    color: "#fff",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {results && viewingPass === "pass2" ? "🔄 Re-run Pass 2" : "▶️ Run Pass 2"}
                </button>
              )}
              
              {activeResults && (
                <div style={{ display: "flex", gap: 8 }}>
                  {/* View Mode Toggle */}
                  <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: 6, overflow: "hidden" }}>
                    <button
                      onClick={() => setResultsViewMode("text")}
                      style={{
                        padding: "6px 12px",
                        border: "none",
                        background: resultsViewMode === "text" ? "#000" : "#fff",
                        color: resultsViewMode === "text" ? "#fff" : "#64748b",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      📄 Text
                    </button>
                    <button
                      onClick={() => setResultsViewMode("json")}
                      style={{
                        padding: "6px 12px",
                        border: "none",
                        borderLeft: "1px solid #e2e8f0",
                        background: resultsViewMode === "json" ? "#000" : "#fff",
                        color: resultsViewMode === "json" ? "#fff" : "#64748b",
                        cursor: "pointer",
                        fontSize: 12,
                        fontWeight: 500,
                      }}
                    >
                      {"{ } JSON"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Domain Tabs */}
            {activeResults && resultDomainTabs.length > 1 && (
              <div style={{ display: "flex", gap: 4, marginBottom: 16, flexWrap: "wrap" }}>
                {resultDomainTabs.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveResultTab(tab.key)}
                    style={{
                      padding: "6px 14px",
                      border: "1px solid",
                      borderColor: activeResultTab === tab.key ? "#000" : "#e2e8f0",
                      background: activeResultTab === tab.key ? "#000" : "#fff",
                      color: activeResultTab === tab.key ? "#fff" : "#64748b",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: activeResultTab === tab.key ? 600 : 500,
                      transition: "all 0.15s",
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            {/* Project & Session Loader — always visible */}
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={saveTargetProjectId}
                onChange={(e) => setSaveTargetProjectId(e.target.value)}
                style={{
                  padding: "6px 8px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  fontSize: 12,
                  maxWidth: 200,
                }}
              >
                <option value="">Select project...</option>
                {projects.map(p => (
                  <option key={p.projectId} value={p.projectId}>
                    {p.filename} ({p.projectId.slice(0, 8)})
                  </option>
                ))}
              </select>
              <select
                value={selectedSessionFile}
                onChange={(e) => setSelectedSessionFile(e.target.value)}
                disabled={!saveTargetProjectId || loadingSessionList}
                style={{
                  padding: "6px 8px",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  fontSize: 12,
                  maxWidth: 260,
                }}
              >
                <option value="">
                  {loadingSessionList
                    ? "Loading sessions..."
                    : sessionFiles.length > 0
                      ? "Load saved session..."
                      : "No saved sessions"}
                </option>
                {sessionFiles.map((f) => (
                  <option key={f.filename} value={f.filename}>
                    {f.filename}
                  </option>
                ))}
              </select>
              <button
                onClick={() => loadSavedSession(selectedSessionFile)}
                disabled={loadingSession || !saveTargetProjectId || !selectedSessionFile}
                style={{
                  padding: "6px 12px",
                  border: "1px solid #2563eb",
                  background: "#eff6ff",
                  color: "#2563eb",
                  borderRadius: 6,
                  cursor: loadingSession || !saveTargetProjectId || !selectedSessionFile ? "not-allowed" : "pointer",
                  fontSize: 12,
                  fontWeight: 500,
                  opacity: !saveTargetProjectId || !selectedSessionFile ? 0.5 : 1,
                }}
              >
                {loadingSession ? "⏳ Loading..." : "📂 Load Session"}
              </button>
            </div>

            {/* Results Content */}
            {!activeResults ? (
              <div style={{ 
                display: "flex", 
                flexDirection: "column", 
                alignItems: "center", 
                justifyContent: "center", 
                height: 150,
                color: "#94a3b8",
              }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>🧪</div>
                <div>Run a schema test or load a saved session</div>
              </div>
            ) : (
              <div>
                {/* Download/Save Actions */}
                <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                  <button
                    onClick={() => downloadResults("text")}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #0369a1",
                      background: "#f0f9ff",
                      color: "#0369a1",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    ⬇️ Download Text
                  </button>
                  <button
                    onClick={() => downloadResults("json")}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #0369a1",
                      background: "#f0f9ff",
                      color: "#0369a1",
                      borderRadius: 6,
                      cursor: "pointer",
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    ⬇️ Download JSON
                  </button>
                  <button
                    onClick={saveResults}
                    disabled={savingResults || !saveTargetProjectId}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #16a34a",
                      background: saveSuccess ? "#16a34a" : "#f0fdf4",
                      color: saveSuccess ? "#fff" : "#16a34a",
                      borderRadius: 6,
                      cursor: savingResults || !saveTargetProjectId ? "not-allowed" : "pointer",
                      fontSize: 12,
                      fontWeight: 500,
                      opacity: !saveTargetProjectId ? 0.5 : 1,
                    }}
                  >
                    {savingResults ? "⏳ Saving..." : saveSuccess ? "✅ Saved!" : "💾 Save to Project"}
                  </button>
                  <button
                    onClick={saveToNewProject}
                    disabled={savingResults}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #000",
                      background: "#f8fafc",
                      color: "#000",
                      borderRadius: 6,
                      cursor: savingResults ? "not-allowed" : "pointer",
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    ➕ Save to New Project
                  </button>
                  <button
                    onClick={exportToGoogleDocs}
                    disabled={exportingGdocs}
                    style={{
                      padding: "6px 12px",
                      border: "1px solid #4285f4",
                      background: exportingGdocs ? "#e2e8f0" : "#eef4ff",
                      color: "#4285f4",
                      borderRadius: 6,
                      cursor: exportingGdocs ? "not-allowed" : "pointer",
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    {exportingGdocs ? "⏳ Exporting..." : googleAuthed ? "📄 Export to Google Docs" : "🔑 Sign in & Export to Google Docs"}
                  </button>
                  {gdocsUrl && (
                    <a
                      href={gdocsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: "6px 12px",
                        border: "1px solid #4285f4",
                        background: "#4285f4",
                        color: "#fff",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        textDecoration: "none",
                      }}
                    >
                      🔗 Open Doc
                    </a>
                  )}
                </div>

                {/* Results Display */}
                <div style={{
                  maxHeight: 600,
                  overflow: "auto",
                  padding: 12,
                  background: "#f8fafc",
                  borderRadius: 8,
                }}>
                  {resultsViewMode === "json" ? (
                    <pre style={{ 
                      margin: 0, 
                      fontFamily: "monospace", 
                      fontSize: 12, 
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}>
                      {JSON.stringify(activeResultTab === "all" ? activeResults : filteredResults, null, 2)}
                    </pre>
                  ) : (
                    renderFormattedResults(filteredResults || activeResults)
                  )}
                </div>
              </div>
            )}
      </div>
    </div>
  );
}
