"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { DEFAULT_DETECTION_RULES } from "./lib/default-templates";

/* ───────── Types ───────── */
type AssetBBox = { x: number; y: number; w: number; h: number };

type PageAsset = {
  assetId: string;
  url: string;
  thumbnailUrl?: string;
  bbox: AssetBBox;
  title?: string;
  description?: string;
  category?: string;
  geo?: { lat: number; lng: number; placeName?: string };
  dateInfo?: { date?: string; era?: string; label?: string };
};

type SettingsHistoryEntry = {
  timestamp: string;
  label?: string;
  content: string;
};

type SettingsHistory = {
  aiRules?: SettingsHistoryEntry[];
  detectionRulesJson?: SettingsHistoryEntry[];
};

type Manifest = {
  projectId: string;
  createdAt: string;
  status: "empty" | "uploaded" | "processed";
  sourcePdf?: { url: string; filename: string };
  extractedText?: { url: string };
  formattedText?: { url: string };
  docAiJson?: { url: string };
  pages?: Array<{
    pageNumber: number;
    url: string;
    width: number;
    height: number;
    assets?: PageAsset[];
    deletedAssetIds?: string[];
  }>;
  settings: {
    aiRules: string;
    uiFieldsJson: string;
    taggingJson: string;
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

/* ───────── Helpers ───────── */
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
  return { pid: url.searchParams.get("pid") || "", m: url.searchParams.get("m") || "" };
}

function bust(url: string) {
  const u = new URL(url);
  u.searchParams.set("v", String(Date.now()));
  return u.toString();
}

function setPdfJsWorker(pdfjs: PdfJsLib) {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
}

/* ───────── Icon components ───────── */
function Chevron({ up }: { up: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={up ? "M6 14l6-6 6 6" : "M6 10l6 6 6-6"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Trash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M10 11v7M14 11v7M9 7l1-2h4l1 2M6 7l1 14h10l1-14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Refresh() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 12a9 9 0 10-3 6.7M21 12v-6m0 6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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

/* ───────── Map View ───────── */
function MapView({ assets }: { assets: (PageAsset & { pageNumber: number })[] }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  const geoAssets = useMemo(() => assets.filter((a) => a.geo), [assets]);

  useEffect(() => {
    if (!mapRef.current || geoAssets.length === 0) return;
    if (mapInstanceRef.current) return; // already initialized

    // Load Leaflet dynamically
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      const L = (window as unknown as Record<string, unknown>).L as {
        map: (el: HTMLElement) => {
          setView: (center: [number, number], zoom: number) => unknown;
          remove: () => void;
        };
        tileLayer: (url: string, opts: Record<string, unknown>) => { addTo: (map: unknown) => void };
        marker: (latlng: [number, number]) => { addTo: (map: unknown) => { bindPopup: (html: string) => void } };
        latLngBounds: (points: [number, number][]) => unknown;
      };
      if (!L || !mapRef.current) return;

      const map = L.map(mapRef.current).setView([20, 0], 2);
      mapInstanceRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://openstreetmap.org">OSM</a>',
        maxZoom: 18,
      }).addTo(map);

      const points: [number, number][] = [];
      for (const asset of geoAssets) {
        if (!asset.geo) continue;
        const pos: [number, number] = [asset.geo.lat, asset.geo.lng];
        points.push(pos);
        const thumb = asset.thumbnailUrl || asset.url;
        const popup = `<div style="text-align:center;max-width:200px"><img src="${thumb}" style="width:100%;max-height:120px;object-fit:cover;border-radius:4px;margin-bottom:4px"/><div style="font-weight:600;font-size:12px">${asset.title || asset.assetId}</div><div style="font-size:11px;color:#666">${asset.geo.placeName || ""}</div>${asset.dateInfo?.label ? `<div style="font-size:11px;color:#888">📅 ${asset.dateInfo.label}</div>` : ""}</div>`;
        L.marker(pos).addTo(map).bindPopup(popup);
      }

      if (points.length > 1) {
        (map as unknown as { fitBounds: (b: unknown, o: Record<string, unknown>) => void }).fitBounds(L.latLngBounds(points), { padding: [40, 40] });
      } else if (points.length === 1) {
        (map as unknown as { setView: (c: [number, number], z: number) => void }).setView(points[0], 6);
      }
    };
    document.head.appendChild(script);

    return () => {
      if (mapInstanceRef.current) {
        (mapInstanceRef.current as { remove: () => void }).remove();
        mapInstanceRef.current = null;
      }
    };
  }, [geoAssets]);

  if (geoAssets.length === 0) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "#8a7e6b" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No geographic data yet</div>
        <div style={{ fontSize: 13 }}>Click &quot;Enrich Geo/Timeline&quot; to analyze assets for location and time context.</div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "#8a7e6b", marginBottom: 8 }}>
        {geoAssets.length} of {assets.length} assets have geographic data
      </div>
      <div ref={mapRef} style={{ width: "100%", height: 500, borderRadius: 8, border: "1px solid #e5e0d5" }} />
    </div>
  );
}

/* ───────── Timeline View ───────── */
function TimelineView({ assets }: { assets: (PageAsset & { pageNumber: number })[] }) {
  const timeAssets = useMemo(() => {
    const withDate = assets.filter((a) => a.dateInfo);
    // Sort by date string (ISO-ish), then by era
    return withDate.sort((a, b) => {
      const da = a.dateInfo?.date || a.dateInfo?.era || "";
      const db = b.dateInfo?.date || b.dateInfo?.era || "";
      return da.localeCompare(db);
    });
  }, [assets]);

  if (timeAssets.length === 0) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "#8a7e6b" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No timeline data yet</div>
        <div style={{ fontSize: 13 }}>Click &quot;Enrich Geo/Timeline&quot; to analyze assets for location and time context.</div>
      </div>
    );
  }

  // Group by era for visual separation
  const groups: { era: string; items: typeof timeAssets }[] = [];
  let currentEra = "";
  for (const asset of timeAssets) {
    const era = asset.dateInfo?.era || "Unknown Era";
    if (era !== currentEra) {
      currentEra = era;
      groups.push({ era, items: [] });
    }
    groups[groups.length - 1].items.push(asset);
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: "#8a7e6b", marginBottom: 16 }}>
        {timeAssets.length} of {assets.length} assets have temporal data
      </div>
      <div style={{ position: "relative", paddingLeft: 32 }}>
        {/* Vertical line */}
        <div style={{ position: "absolute", left: 11, top: 0, bottom: 0, width: 2, background: "#e5e0d5" }} />

        {groups.map((group) => (
          <div key={group.era} style={{ marginBottom: 24 }}>
            {/* Era label */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, marginLeft: -32 }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%", background: "#1a1510",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#d4c5a9", fontSize: 10, fontWeight: 700, flexShrink: 0
              }}>
                ●
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1510", letterSpacing: 0.5 }}>
                {group.era}
              </div>
            </div>

            {/* Assets in this era */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {group.items.map((asset) => (
                <div key={asset.assetId} style={{
                  display: "flex", gap: 10, padding: 10, background: "#f8f6f3",
                  borderRadius: 8, border: "1px solid #e5e0d5", position: "relative"
                }}>
                  {/* Timeline dot connector */}
                  <div style={{
                    position: "absolute", left: -26, top: 16,
                    width: 10, height: 10, borderRadius: "50%",
                    background: "#d4c5a9", border: "2px solid #e5e0d5"
                  }} />
                  <img
                    src={asset.thumbnailUrl || asset.url}
                    alt={asset.title || asset.assetId}
                    style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                    loading="lazy"
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1510", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {asset.title || asset.assetId}
                    </div>
                    <div style={{ fontSize: 11, color: "#065f46", fontWeight: 500, marginTop: 2 }}>
                      {asset.dateInfo?.label || asset.dateInfo?.date || ""}
                    </div>
                    {asset.geo?.placeName && (
                      <div style={{ fontSize: 11, color: "#8a7e6b", marginTop: 1 }}>
                        📍 {asset.geo.placeName}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: "#a89e8c", marginTop: 2 }}>
                      Page {asset.pageNumber}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────── Settings Tabs ───────── */
function SettingsTabs({
  value,
  onChange
}: {
  value: "ai" | "detection" | "debugLog" | "cloudState";
  onChange: (v: "ai" | "detection" | "debugLog" | "cloudState") => void;
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
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", minWidth: 0, flex: 1, overflow: "hidden" }}>
      <button type="button" onClick={() => onChange("ai")} style={tabStyle(value === "ai")}>AI Rules</button>
      <button type="button" onClick={() => onChange("detection")} style={tabStyle(value === "detection")}>Detection</button>
      <div style={{ width: 1, height: 20, background: "#ccc" }} />
      <button type="button" onClick={() => onChange("debugLog")} style={tabStyle(value === "debugLog")}>Debug Log</button>
      <button type="button" onClick={() => onChange("cloudState")} style={tabStyle(value === "cloudState")}>Cloud State</button>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════════ */
export default function Page() {
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── Core state ── */
  const [busy, setBusy] = useState("");
  const [projectId, setProjectId] = useState("");
  const [manifestUrl, setManifestUrl] = useState("");
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const manifestRef = useRef<Manifest | null>(null);
  const manifestUrlRef = useRef("");
  const [lastError, setLastError] = useState("");

  /* ── UI panels ── */
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [projectsBusy, setProjectsBusy] = useState(false);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [startupOpen, setStartupOpen] = useState(true);
  const [startupProjectId, setStartupProjectId] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"ai" | "detection" | "debugLog" | "cloudState">("ai");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  /* ── Settings drafts ── */
  const [aiRulesDraft, setAiRulesDraft] = useState("");
  const [detectionRulesJsonDraft, setDetectionRulesJsonDraft] = useState("");
  const [settingsHistory, setSettingsHistory] = useState<SettingsHistory>({});

  /* ── Pipeline ── */
  type PipelineStep = "upload" | "rasterize" | "detect" | "done";
  const PIPELINE_STEPS: { key: PipelineStep; label: string }[] = [
    { key: "upload", label: "Upload Source" },
    { key: "rasterize", label: "Rasterize Pages" },
    { key: "detect", label: "Detect Images" },
    { key: "done", label: "Complete" },
  ];
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const pipelineRunningRef = useRef(false);
  const [pipelineStep, setPipelineStep] = useState<PipelineStep | "">("");
  const [pipelineError, setPipelineError] = useState("");
  const [pipelineResumeStep, setPipelineResumeStep] = useState<PipelineStep | "">("");

  const [rasterProgress, setRasterProgress] = useState({ running: false, currentPage: 0, totalPages: 0, uploaded: 0 });
  const [splitProgress, setSplitProgress] = useState({ running: false, page: 0, totalPages: 0, assetsUploaded: 0 });

  /* ── Assets ── */
  const [assetsOpen, setAssetsOpen] = useState(true);
  const [pagesPreviewOpen, setPagesPreviewOpen] = useState(false);
  const [deletingAssets, setDeletingAssets] = useState<Record<string, boolean>>({});
  const [thumbnailsBusy, setThumbnailsBusy] = useState(false);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "map" | "timeline">("grid");

  /* ── Debug ── */
  const [debugLogOpen, setDebugLogOpen] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const selectedStartupProject = useMemo(
    () => projects.find((p) => p.projectId === startupProjectId) || null,
    [projects, startupProjectId]
  );

  function log(msg: string) {
    const ts = new Date().toLocaleTimeString();
    setDebugLog((prev) => [...prev, `[${ts}] ${msg}`]);
  }

  /* ── getCurrentSettingsContent ── */
  function getCurrentSettingsContent(tab: typeof settingsTab): string {
    switch (tab) {
      case "ai": return aiRulesDraft;
      case "detection": return detectionRulesJsonDraft;
      default: return "";
    }
  }

  function getHistoryKey(tab: typeof settingsTab): keyof SettingsHistory {
    switch (tab) {
      case "ai": return "aiRules";
      case "detection": return "detectionRulesJson";
      default: return "aiRules";
    }
  }

  /* ── Save version snapshot ── */
  async function saveVersionSnapshot(label?: string) {
    const key = getHistoryKey(settingsTab);
    const content = getCurrentSettingsContent(settingsTab);
    const entry: SettingsHistoryEntry = { timestamp: new Date().toISOString(), label, content };
    const updatedHistory: SettingsHistory = { ...settingsHistory, [key]: [...(settingsHistory[key] || []), entry] };
    setSettingsHistory(updatedHistory);
    await saveSettingsWithHistory(updatedHistory);
  }

  /* ── Save settings globally ── */
  async function saveSettingsWithHistory(historyToSave: SettingsHistory) {
    setSettingsBusy(true);
    setSettingsError("");
    try {
      const r = await fetch("/api/projects/settings/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiRules: aiRulesDraft,
          detectionRulesJson: detectionRulesJsonDraft,
          history: historyToSave
        })
      });
      if (!r.ok) throw new Error(await readErrorText(r));
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) throw new Error(j.error || "Save failed");
    } catch (e) {
      setSettingsError(e instanceof Error ? e.message : String(e));
    } finally {
      setSettingsBusy(false);
    }
  }

  /* ── Restore/delete version ── */
  function restoreVersion(entry: SettingsHistoryEntry) {
    switch (settingsTab) {
      case "ai": setAiRulesDraft(entry.content); break;
      case "detection": setDetectionRulesJsonDraft(entry.content); break;
    }
  }

  async function deleteVersion(index: number) {
    const key = getHistoryKey(settingsTab);
    const arr = [...(settingsHistory[key] || [])];
    arr.splice(index, 1);
    const updatedHistory = { ...settingsHistory, [key]: arr };
    setSettingsHistory(updatedHistory);
    await saveSettingsWithHistory(updatedHistory);
  }


  /* ════════════════════════════════════════════════════════════════════════════
     CORE API FUNCTIONS
     ════════════════════════════════════════════════════════════════════════════ */

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

  async function loadGlobalSettings() {
    try {
      const res = await fetch("/api/projects/settings/load", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as {
        ok: boolean;
        settings?: {
          aiRules: string;
          detectionRulesJson: string;
        };
        history?: SettingsHistory;
      };
      if (data.ok && data.settings) {
        setAiRulesDraft(data.settings.aiRules || "");
        setDetectionRulesJsonDraft(data.settings.detectionRulesJson || "{}");
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
      if (!res.ok) throw new Error(await readErrorText(res));
      const data = (await res.json()) as { ok: boolean; processed?: number; skipped?: number; errors?: number; manifestUrl?: string; error?: string };
      if (!data.ok) throw new Error(data.error || "Failed to generate thumbnails");
      log(`Thumbnails: ${data.processed ?? 0} generated, ${data.skipped ?? 0} skipped, ${data.errors ?? 0} errors`);
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

  async function enrichAssets() {
    if (!projectId || !manifestUrl) return;
    setEnrichBusy(true);
    setLastError("");
    log("Starting geo/timeline enrichment...");
    try {
      const res = await fetch("/api/projects/assets/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl })
      });
      if (!res.ok) throw new Error(await readErrorText(res));
      const data = (await res.json()) as { ok: boolean; enriched?: number; total?: number; manifestUrl?: string; error?: string };
      if (!data.ok) throw new Error(data.error || "Enrichment failed");
      log(`Enrichment complete: ${data.enriched ?? 0}/${data.total ?? 0} assets enriched`);
      if (data.manifestUrl) {
        setManifestUrl(data.manifestUrl);
        manifestUrlRef.current = data.manifestUrl;
        setUrlParams(projectId, data.manifestUrl);
        await loadManifest(data.manifestUrl);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLastError(msg);
      log(`Enrichment error: ${msg}`);
    } finally {
      setEnrichBusy(false);
    }
  }

  /* Keep refs in sync */
  useEffect(() => { manifestUrlRef.current = manifestUrl; }, [manifestUrl]);

  /* Mount: load settings + restore project from URL */
  useEffect(() => {
    loadGlobalSettings().catch(() => {});
    const { pid, m } = getUrlParams();
    if (pid && m) {
      setProjectId(pid);
      setManifestUrl(m);
      manifestUrlRef.current = m;
      loadManifest(m)
        .then(() => {
          try {
            const raw = localStorage.getItem("alexandria-pipeline-checkpoint");
            if (raw) {
              const cp = JSON.parse(raw) as { projectId: string; manifestUrl: string; completedStep: string; timestamp: number };
              if (cp.projectId === pid && (Date.now() - cp.timestamp) < 86400000) {
                const stepKeys: PipelineStep[] = ["rasterize", "detect"];
                const completedIdx = stepKeys.indexOf(cp.completedStep as PipelineStep);
                if (completedIdx >= 0 && completedIdx < stepKeys.length - 1) {
                  const nextStep = stepKeys[completedIdx + 1];
                  if (cp.manifestUrl) { setManifestUrl(cp.manifestUrl); manifestUrlRef.current = cp.manifestUrl; }
                  setPipelineResumeStep(nextStep);
                  setPipelineStep(cp.completedStep as PipelineStep);
                  log(`[Pipeline] Found checkpoint. Ready to resume from "${PIPELINE_STEPS.find(s => s.key === nextStep)?.label}".`);
                }
              } else {
                localStorage.removeItem("alexandria-pipeline-checkpoint");
              }
            }
          } catch { /* ignore */ }
        })
        .catch((e) => setLastError(e instanceof Error ? e.message : String(e)));
    }
    refreshProjects().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createProject() {
    const r = await fetch("/api/projects/create", { method: "POST" });
    if (!r.ok) throw new Error(`Create project failed: ${await readErrorText(r)}`);
    const j = (await r.json()) as { ok: boolean; projectId?: string; manifestUrl?: string; error?: string };
    if (!j.ok || !j.projectId || !j.manifestUrl) throw new Error(j.error || "Create project failed");
    setProjectId(j.projectId);
    setManifestUrl(j.manifestUrl);
    setUrlParams(j.projectId, j.manifestUrl);
    await loadManifest(j.manifestUrl);
    await refreshProjects();
    return { projectId: j.projectId, manifestUrl: j.manifestUrl };
  }

  async function uploadSource(file: File) {
    setLastError("");
    setBusy("Uploading source...");
    try {
      localStorage.removeItem("alexandria-pipeline-checkpoint");
    } catch { /* ignore */ }
    setPipelineResumeStep("");
    setPipelineStep("");
    setPipelineError("");
    setManifest(null);

    try {
      const p = await createProject();
      const blob = await upload(`projects/${p.projectId}/source/source.pdf`, file, {
        access: "public",
        handleUploadUrl: "/api/blob"
      });
      const r = await fetch("/api/projects/record-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.projectId, manifestUrl: p.manifestUrl, sourcePdfUrl: blob.url, filename: file.name })
      });
      if (!r.ok) throw new Error(`Record source failed: ${await readErrorText(r)}`);
      const j = (await r.json()) as { ok: boolean; manifestUrl?: string; error?: string };
      if (!j.ok || !j.manifestUrl) throw new Error(j.error || "Record source failed");
      setManifestUrl(j.manifestUrl);
      setUrlParams(p.projectId, j.manifestUrl);
      await loadManifest(j.manifestUrl);
      await refreshProjects();
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

      const allPages: Array<{ pageNumber: number; url: string; width: number; height: number }> = [];

      // Render all pages first (must be sequential due to pdf.js), then upload in parallel batches
      const renderedPages: Array<{ pageNumber: number; blob: Blob; width: number; height: number }> = [];

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber++) {
        setRasterProgress((p) => ({ ...p, currentPage: pageNumber }));
        const page = await pdf.getPage(pageNumber);
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
        renderedPages.push({ pageNumber, blob: pngBlob, width: canvas.width, height: canvas.height });
      }

      // Upload in parallel batches of 4
      const UPLOAD_BATCH = 4;
      for (let i = 0; i < renderedPages.length; i += UPLOAD_BATCH) {
        const batch = renderedPages.slice(i, i + UPLOAD_BATCH);
        const results = await Promise.all(batch.map(async (rp) => {
          const f = new File([rp.blob], `page-${rp.pageNumber}.png`, { type: "image/png" });
          const uploaded = await upload(`projects/${projectId}/pages/page-${rp.pageNumber}.png`, f, {
            access: "public",
            handleUploadUrl: "/api/blob"
          });
          setRasterProgress((p) => ({ ...p, uploaded: p.uploaded + 1 }));
          log(`Uploaded page ${rp.pageNumber}/${totalPages}`);
          return { pageNumber: rp.pageNumber, url: uploaded.url, width: rp.width, height: rp.height };
        }));
        allPages.push(...results);
      }

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

  async function splitImages() {
    setLastError("");
    const mUrl = pipelineRunningRef.current ? manifestUrlRef.current : manifestUrl;
    const m = pipelineRunningRef.current ? manifestRef.current : manifest;
    if (!projectId || !mUrl) return setLastError("Missing projectId/manifestUrl");
    if (!m?.pages?.length) return setLastError("No page PNGs — run Rasterize first");
    if ((busy || splitProgress.running) && !pipelineRunningRef.current) return;

    const pages = m.pages;
    let detectionRules: Record<string, unknown> | undefined;
    if (detectionRulesJsonDraft.trim()) {
      try { detectionRules = JSON.parse(detectionRulesJsonDraft) as Record<string, unknown>; }
      catch { return setLastError("Invalid Detection Rules JSON"); }
    }

    setBusy("Detecting images...");
    setSplitProgress({ running: true, page: 0, totalPages: pages.length, assetsUploaded: 0 });
    log("Starting image detection with Gemini...");

    try {
      const allResults: Map<number, Array<{ x: number; y: number; width: number; height: number; category?: string; title?: string; description?: string }>> = new Map();

      // Detect images on pages in parallel batches of 3
      log("=== Detecting images on all pages (parallel) ===");
      const DETECT_BATCH = 3;
      for (let i = 0; i < pages.length; i += DETECT_BATCH) {
        const batch = pages.slice(i, i + DETECT_BATCH);
        await Promise.all(batch.map(async (page) => {
          setSplitProgress((s) => ({ ...s, page: Math.max(s.page, page.pageNumber) }));
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
          if (!detectRes.ok) { log(`Detection failed page ${page.pageNumber}: ${await readErrorText(detectRes)}`); return; }

          const detected = (await detectRes.json()) as { boxes?: Array<{ x: number; y: number; width: number; height: number; category?: string; title?: string; description?: string }>; error?: string };
          const boxes = detected.boxes ?? [];
          log(`Page ${page.pageNumber}: ${boxes.length} images found`);
          if (boxes.length > 0) allResults.set(page.pageNumber, boxes);
        }));
      }

      // Crop and upload assets in parallel
      log("=== Cropping and uploading assets (parallel) ===");
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

        // Crop all assets from this page first
        const croppedAssets: Array<{ assetId: string; pngBlob: Blob; bbox: AssetBBox; title?: string; description?: string; category?: string }> = [];
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
          croppedAssets.push({ assetId, pngBlob, bbox, title: b.title, description: b.description, category: b.category });
        }

        // Upload all assets from this page in parallel (batches of 4)
        const ASSET_BATCH = 4;
        for (let i = 0; i < croppedAssets.length; i += ASSET_BATCH) {
          const batch = croppedAssets.slice(i, i + ASSET_BATCH);
          await Promise.all(batch.map(async (asset) => {
            const imageFile = new File([asset.pngBlob], `${asset.assetId}.png`, { type: "image/png" });
            const uploaded = await upload(`projects/${projectId}/assets/p${page.pageNumber}/${asset.assetId}.png`, imageFile, {
              access: "public",
              handleUploadUrl: "/api/blob"
            });

            const metadata = { assetId: asset.assetId, pageNumber: page.pageNumber, url: uploaded.url, bbox: asset.bbox, title: asset.title, description: asset.description, category: asset.category };
            await upload(`projects/${projectId}/assets/p${page.pageNumber}/${asset.assetId}.meta.txt`,
              new File([JSON.stringify(metadata)], `${asset.assetId}.meta.txt`, { type: "text/plain" }), {
              access: "public",
              handleUploadUrl: "/api/blob"
            });

            setSplitProgress((s) => ({ ...s, assetsUploaded: s.assetsUploaded + 1 }));
            log(`Uploaded asset ${asset.assetId}`);
          }));
        }
      }

      log("=== Building manifest from metadata ===");
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

      const totalDetected = Array.from(allResults.values()).reduce((sum, b) => sum + b.length, 0);
      log(`Detection complete: ${totalDetected} assets on ${allResults.size} pages`);
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
      const j = (await r.json()) as { ok: boolean; manifestUrl?: string; error?: string; pagesFound?: number; assetsFound?: number };
      if (!r.ok || !j.ok || !j.manifestUrl) throw new Error(j.error || `Restore failed (${r.status})`);
      log(`Restore complete: ${j.pagesFound} pages, ${j.assetsFound} assets`);
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
    if (!window.confirm("Delete ALL extracted images? This cannot be undone.")) return;
    setBusy("Deleting all images...");
    log("Deleting all assets...");
    try {
      const r = await fetch("/api/projects/assets/delete-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl })
      });
      const j = (await r.json()) as { ok: boolean; manifestUrl?: string; error?: string };
      if (!r.ok || !j.ok || !j.manifestUrl) throw new Error(j.error || "Delete all failed");
      setManifestUrl(j.manifestUrl);
      setUrlParams(projectId, j.manifestUrl);
      await loadManifest(j.manifestUrl);
      log("All assets deleted");
      await refreshProjects();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`Delete-all error: ${msg}`);
      setLastError(msg);
    } finally {
      setBusy("");
    }
  }

  async function deleteProject(targetProjectId: string) {
    if (!window.confirm(`Delete project ${targetProjectId}?`)) return;
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
        clearUrlParams();
      }
      await refreshProjects();
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setProjectsBusy(false);
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
      setDeletingAssets((m) => { const copy = { ...m }; delete copy[key]; return copy; });
    }
  }

  /* ── Auto-pipeline ── */
  async function runAutoPipeline(startFrom?: PipelineStep) {
    if (pipelineRunning) return;
    setPipelineRunning(true);
    pipelineRunningRef.current = true;
    setPipelineError("");
    setPipelineResumeStep("");
    setLastError("");

    async function refreshManifestForPipeline() {
      const url = manifestUrlRef.current;
      if (!url) return;
      await loadManifest(url);
    }
    function saveCheckpoint(completedStep: PipelineStep) {
      try {
        localStorage.setItem("alexandria-pipeline-checkpoint", JSON.stringify({ projectId, manifestUrl: manifestUrlRef.current, completedStep, timestamp: Date.now() }));
      } catch { /* ignore */ }
    }
    function clearCheckpoint() {
      try { localStorage.removeItem("alexandria-pipeline-checkpoint"); } catch { /* ignore */ }
    }

    const stepKeys: PipelineStep[] = ["rasterize", "detect"];
    const startIdx = startFrom ? stepKeys.indexOf(startFrom) : 0;

    try {
      if (startIdx <= 0) {
        setPipelineStep("rasterize");
        log("[Pipeline] Rasterizing pages...");
        await rasterizeToPngs();
        await refreshManifestForPipeline();
        saveCheckpoint("rasterize");
      }
      if (startIdx <= 1) {
        setPipelineStep("detect");
        log("[Pipeline] Detecting images...");
        await splitImages();
        await refreshManifestForPipeline();
        saveCheckpoint("detect");
      }
      setPipelineStep("done");
      clearCheckpoint();
      log("[Pipeline] Complete!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPipelineError(msg);
      if (pipelineStep) setPipelineResumeStep(pipelineStep as PipelineStep);
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
      setLastError(e instanceof Error ? e.message : String(e));
      await refreshProjects();
    }
  }

  async function openStartupPreviousProject() {
    if (!selectedStartupProject) return;
    await openProject(selectedStartupProject);
    setStartupOpen(false);
  }


  /* ── Computed ── */
  const allAssets = useMemo(() => {
    if (!manifest?.pages) return [];
    const result: (PageAsset & { pageNumber: number })[] = [];
    for (const page of manifest.pages) {
      if (!page.assets) continue;
      for (const a of page.assets) {
        result.push({ ...a, pageNumber: page.pageNumber });
      }
    }
    return result;
  }, [manifest]);

  const totalAssets = allAssets.length;
  const totalPages = manifest?.pages?.length || 0;
  const formattedTextUrl = manifest?.formattedText?.url || "";
  const extractedTextUrl = manifest?.extractedText?.url || "";

  /* ════════════════════════════════════════════════════════════════════════════
     RENDER
     ════════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100vh", background: "#f8f6f3", color: "#1a1a1a" }}>

      {/* ═══════ STARTUP SCREEN ═══════ */}
      {startupOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "linear-gradient(135deg, #1a1510 0%, #2c2218 50%, #1a1510 100%)",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <div style={{ textAlign: "center", maxWidth: 540, padding: 40 }}>
            <h1 style={{ fontSize: 48, fontWeight: 200, letterSpacing: 12, color: "#d4c5a9", marginBottom: 8 }}>ALEXANDRIA</h1>
            <p style={{ fontSize: 14, color: "#8a7e6b", marginBottom: 40, letterSpacing: 2 }}>AI-POWERED ARCHIVAL &amp; RESEARCH</p>

            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 32 }}>
              <button
                type="button"
                onClick={() => { setStartupOpen(false); fileRef.current?.click(); }}
                style={{
                  padding: "14px 32px", fontSize: 15, fontWeight: 500,
                  background: "#d4c5a9", color: "#1a1510", border: "none", borderRadius: 8,
                  cursor: "pointer", letterSpacing: 1
                }}
              >
                INGEST NEW SOURCE
              </button>
            </div>

            {projects.length > 0 && (
              <div style={{ marginTop: 24, textAlign: "left", background: "rgba(255,255,255,0.05)", borderRadius: 12, padding: 20 }}>
                <p style={{ fontSize: 12, color: "#8a7e6b", marginBottom: 12, letterSpacing: 1 }}>PREVIOUS ARCHIVES</p>
                <select
                  value={startupProjectId}
                  onChange={(e) => setStartupProjectId(e.target.value)}
                  style={{
                    width: "100%", padding: "10px 12px", fontSize: 14,
                    background: "#2c2218", color: "#d4c5a9", border: "1px solid #4a3f30",
                    borderRadius: 6, marginBottom: 12
                  }}
                >
                  <option value="">Select an archive...</option>
                  {projects.map((p) => (
                    <option key={p.projectId} value={p.projectId}>
                      {p.filename || p.projectId} — {p.pagesCount} pages — {p.status}
                    </option>
                  ))}
                </select>
                {selectedStartupProject && (
                  <button
                    type="button"
                    onClick={openStartupPreviousProject}
                    style={{
                      width: "100%", padding: "10px 0", fontSize: 14,
                      background: "transparent", color: "#d4c5a9", border: "1px solid #4a3f30",
                      borderRadius: 6, cursor: "pointer"
                    }}
                  >
                    Open Archive
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════ TOP BAR ═══════ */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 24px", background: "#1a1510", color: "#d4c5a9",
        borderBottom: "1px solid #2c2218"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1 style={{ fontSize: 20, fontWeight: 300, letterSpacing: 6, margin: 0 }}>ALEXANDRIA</h1>
          {manifest?.sourcePdf?.filename && (
            <span style={{ fontSize: 12, color: "#8a7e6b" }}>/ {manifest.sourcePdf.filename}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setSettingsOpen(true)}
            style={{ padding: "6px 14px", fontSize: 12, background: "transparent", color: "#d4c5a9", border: "1px solid #4a3f30", borderRadius: 6, cursor: "pointer" }}>
            Settings
          </button>
          <button type="button" onClick={() => setDebugLogOpen(!debugLogOpen)}
            style={{ padding: "6px 14px", fontSize: 12, background: "transparent", color: "#d4c5a9", border: "1px solid #4a3f30", borderRadius: 6, cursor: "pointer" }}>
            Log
          </button>
          <button type="button" onClick={() => { setProjectId(""); setManifestUrl(""); setManifest(null); clearUrlParams(); setStartupOpen(true); }}
            style={{ padding: "6px 14px", fontSize: 12, background: "transparent", color: "#d4c5a9", border: "1px solid #4a3f30", borderRadius: 6, cursor: "pointer" }}>
            Home
          </button>
        </div>
      </header>

      {/* ═══════ ERROR BAR ═══════ */}
      {lastError && (
        <div style={{ padding: "10px 24px", background: "#7f1d1d", color: "#fca5a5", fontSize: 13, display: "flex", justifyContent: "space-between" }}>
          <span>{lastError}</span>
          <button type="button" onClick={() => setLastError("")} style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer" }}><XIcon /></button>
        </div>
      )}

      {/* ═══════ BUSY BAR ═══════ */}
      {busy && (
        <div style={{ padding: "10px 24px", background: "#d4c5a9", color: "#1a1510", fontSize: 13, fontWeight: 500 }}>
          ⏳ {busy}
        </div>
      )}

      {/* ═══════ PIPELINE PROGRESS ═══════ */}
      {pipelineRunning && (
        <div style={{ padding: "12px 24px", background: "#2c2218", color: "#d4c5a9" }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 8 }}>
            {PIPELINE_STEPS.map((s, i) => {
              const currentIdx = getPipelineCurrentStepIndex();
              const isDone = i < currentIdx || pipelineStep === "done";
              const isCurrent = i === currentIdx;
              return (
                <span key={s.key} style={{
                  fontSize: 12, fontWeight: isCurrent ? 700 : 400,
                  color: isDone ? "#22c55e" : isCurrent ? "#d4c5a9" : "#5a5040",
                }}>
                  {isDone ? "✓ " : isCurrent ? "▸ " : ""}{s.label}
                </span>
              );
            })}
          </div>
          <div style={{ height: 4, background: "#4a3f30", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "#d4c5a9", width: `${getPipelinePercent()}%`, transition: "width 0.3s" }} />
          </div>
          {rasterProgress.running && (
            <div style={{ fontSize: 12, color: "#8a7e6b", marginTop: 6 }}>
              Rasterizing page {rasterProgress.currentPage}/{rasterProgress.totalPages} ({rasterProgress.uploaded} uploaded)
            </div>
          )}
          {splitProgress.running && (
            <div style={{ fontSize: 12, color: "#8a7e6b", marginTop: 6 }}>
              Detecting page {splitProgress.page}/{splitProgress.totalPages} ({splitProgress.assetsUploaded} assets extracted)
            </div>
          )}
          {pipelineError && (
            <div style={{ fontSize: 12, color: "#ef4444", marginTop: 6 }}>Error: {pipelineError}</div>
          )}
        </div>
      )}

      {/* Resume bar */}
      {pipelineResumeStep && !pipelineRunning && (
        <div style={{ padding: "10px 24px", background: "#422006", color: "#fbbf24", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Pipeline paused. Resume from: {PIPELINE_STEPS.find(s => s.key === pipelineResumeStep)?.label}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => runAutoPipeline(pipelineResumeStep as PipelineStep)}
              style={{ padding: "4px 12px", fontSize: 12, background: "#fbbf24", color: "#422006", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600 }}>
              Resume
            </button>
            <button type="button" onClick={() => { setPipelineResumeStep(""); setPipelineError(""); localStorage.removeItem("alexandria-pipeline-checkpoint"); }}
              style={{ padding: "4px 12px", fontSize: 12, background: "transparent", color: "#fbbf24", border: "1px solid #fbbf24", borderRadius: 4, cursor: "pointer" }}>
              Dismiss
            </button>
          </div>
        </div>
      )}


      {/* ═══════ MAIN CONTENT ═══════ */}
      <div style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ── CONTROLS ROW ── */}
        {projectId && (
          <div style={{
            display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20,
            padding: "16px 20px", background: "#fff", borderRadius: 12,
            border: "1px solid #e5e0d5", boxShadow: "0 1px 3px rgba(0,0,0,0.04)"
          }}>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy}
              style={{ padding: "8px 16px", fontSize: 13, background: "#1a1510", color: "#d4c5a9", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}>
              Upload Source
            </button>
            <button type="button" onClick={() => rasterizeToPngs()} disabled={!!busy}
              style={{ padding: "8px 16px", fontSize: 13, background: "#fff", color: "#1a1510", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}>
              Rasterize Pages
            </button>
            <button type="button" onClick={() => splitImages()} disabled={!!busy}
              style={{ padding: "8px 16px", fontSize: 13, background: "#fff", color: "#1a1510", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}>
              Detect Images
            </button>
            <div style={{ width: 1, height: 28, background: "#e5e0d5", alignSelf: "center" }} />
            <button type="button" onClick={() => runAutoPipeline()} disabled={!!busy || pipelineRunning}
              style={{ padding: "8px 16px", fontSize: 13, background: "#065f46", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}>
              ▶ Run Full Pipeline
            </button>
            <div style={{ flex: 1 }} />
            <button type="button" onClick={() => generateThumbnails()} disabled={!!busy || thumbnailsBusy}
              style={{ padding: "8px 16px", fontSize: 13, background: "#fff", color: "#1a1510", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}>
              {thumbnailsBusy ? "Generating..." : "Gen Thumbnails"}
            </button>
            <button type="button" onClick={() => rebuildAssets()} disabled={!!busy}
              style={{ padding: "8px 16px", fontSize: 13, background: "#fff", color: "#1a1510", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}>
              Rebuild Index
            </button>
            <button type="button" onClick={() => restoreFromBlob()} disabled={!!busy}
              style={{ padding: "8px 16px", fontSize: 13, background: "#fff", color: "#1a1510", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}>
              Restore
            </button>
            <button type="button" onClick={() => deleteAllAssets()} disabled={!!busy}
              style={{ padding: "8px 16px", fontSize: 13, background: "#fff", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 6, cursor: "pointer" }}>
              Delete All Assets
            </button>
          </div>
        )}

        {/* ── STATS ROW ── */}
        {projectId && manifest && (
          <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
            {[
              { label: "Pages", value: totalPages },
              { label: "Images Extracted", value: totalAssets },
              { label: "Status", value: manifest.status },
            ].map((s) => (
              <div key={s.label} style={{
                flex: 1, padding: "16px 20px", background: "#fff", borderRadius: 12,
                border: "1px solid #e5e0d5"
              }}>
                <div style={{ fontSize: 12, color: "#8a7e6b", marginBottom: 4, letterSpacing: 1, textTransform: "uppercase" }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 600, color: "#1a1510" }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {projectId && (formattedTextUrl || extractedTextUrl) && (
          <div style={{ marginBottom: 20, background: "#fff", borderRadius: 12, border: "1px solid #e5e0d5", padding: "14px 20px" }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1510", marginBottom: 8 }}>Generated Outputs</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8, fontSize: 13 }}>
              <a href={formattedTextUrl || "#"} target="_blank" rel="noreferrer" style={{ color: formattedTextUrl ? "#065f46" : "#8a7e6b", pointerEvents: formattedTextUrl ? "auto" : "none" }}>
                {formattedTextUrl ? "Open Formatted Text" : "Formatted Text not generated"}
              </a>
              <a href={extractedTextUrl || "#"} target="_blank" rel="noreferrer" style={{ color: extractedTextUrl ? "#065f46" : "#8a7e6b", pointerEvents: extractedTextUrl ? "auto" : "none" }}>
                {extractedTextUrl ? "Open Extracted Text" : "Extracted Text not generated"}
              </a>
            </div>
          </div>
        )}

        {/* ── RASTERIZE PROGRESS ── */}
        {rasterProgress.running && !pipelineRunning && (
          <div style={{ marginBottom: 16, padding: "12px 20px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13 }}>
            Rasterizing page {rasterProgress.currentPage}/{rasterProgress.totalPages} — {rasterProgress.uploaded} uploaded
          </div>
        )}
        {splitProgress.running && !pipelineRunning && (
          <div style={{ marginBottom: 16, padding: "12px 20px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 13 }}>
            Detecting page {splitProgress.page}/{splitProgress.totalPages} — {splitProgress.assetsUploaded} assets extracted
          </div>
        )}

        {/* ═══════ PAGES PREVIEW ═══════ */}
        {projectId && totalPages > 0 && (
          <div style={{ marginBottom: 20, background: "#fff", borderRadius: 12, border: "1px solid #e5e0d5", overflow: "hidden" }}>
            <button type="button" onClick={() => setPagesPreviewOpen(!pagesPreviewOpen)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#1a1510" }}>
              <span>📄 Source Pages ({totalPages})</span>
              <Chevron up={pagesPreviewOpen} />
            </button>
            {pagesPreviewOpen && (
              <div style={{ padding: "0 20px 20px", display: "flex", gap: 8, overflowX: "auto" }}>
                {manifest?.pages?.map((p) => (
                  <img key={p.pageNumber} src={p.url} alt={`Page ${p.pageNumber}`}
                    style={{ height: 160, borderRadius: 6, border: "1px solid #e5e0d5", flexShrink: 0 }} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════ ARCHIVE — EXTRACTED IMAGES ═══════ */}
        {projectId && (
          <div style={{ marginBottom: 20, background: "#fff", borderRadius: 12, border: "1px solid #e5e0d5", overflow: "hidden" }}>
            <button type="button" onClick={() => setAssetsOpen(!assetsOpen)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#1a1510" }}>
              <span>🖼️ Archive — Extracted Images ({totalAssets})</span>
              <Chevron up={assetsOpen} />
            </button>
            {assetsOpen && (
              <div style={{ padding: "0 20px 20px" }}>
                {totalAssets === 0 ? (
                  <p style={{ color: "#8a7e6b", fontSize: 14 }}>No images extracted yet. Upload a source and run the pipeline.</p>
                ) : (
                  <>
                    {/* View mode tabs + enrich button */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                      {(["grid", "map", "timeline"] as const).map((mode) => (
                        <button key={mode} type="button" onClick={() => setViewMode(mode)}
                          style={{
                            padding: "6px 14px", fontSize: 12, fontWeight: viewMode === mode ? 600 : 400,
                            background: viewMode === mode ? "#1a1510" : "#fff",
                            color: viewMode === mode ? "#d4c5a9" : "#1a1510",
                            border: "1px solid #1a1510", borderRadius: 6, cursor: "pointer",
                            textTransform: "capitalize"
                          }}>
                          {mode === "grid" ? "🖼️ Grid" : mode === "map" ? "🗺️ Map" : "📅 Timeline"}
                        </button>
                      ))}
                      <div style={{ flex: 1 }} />
                      <button type="button" onClick={() => enrichAssets()} disabled={!!busy || enrichBusy}
                        style={{ padding: "6px 14px", fontSize: 12, background: "#065f46", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}>
                        {enrichBusy ? "Enriching..." : "🔍 Enrich Geo/Timeline"}
                      </button>
                    </div>

                    {/* GRID VIEW */}
                    {viewMode === "grid" && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
                        {allAssets.map((asset) => (
                          <div key={asset.assetId} style={{
                            background: "#f8f6f3", borderRadius: 10, border: "1px solid #e5e0d5",
                            overflow: "hidden", position: "relative"
                          }}>
                            <div style={{ position: "relative", background: "#e5e0d5" }}>
                              <img
                                src={asset.thumbnailUrl || asset.url}
                                alt={asset.title || asset.assetId}
                                style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }}
                                loading="lazy"
                                onError={(e) => {
                                  if (!asset.thumbnailUrl) return;
                                  const img = e.currentTarget;
                                  if (img.dataset.fallbackApplied === "1") return;
                                  img.dataset.fallbackApplied = "1";
                                  img.src = asset.url;
                                }}
                              />
                              <button type="button" onClick={() => deleteAsset(asset.pageNumber, asset.assetId)}
                                disabled={!!deletingAssets[`${asset.pageNumber}-${asset.assetId}`]}
                                style={{
                                  position: "absolute", top: 6, right: 6,
                                  background: "rgba(0,0,0,0.6)", color: "#fff", border: "none",
                                  borderRadius: 4, width: 28, height: 28, cursor: "pointer",
                                  display: "flex", alignItems: "center", justifyContent: "center"
                                }}>
                                <Trash />
                              </button>
                              {asset.category && (
                                <span style={{
                                  position: "absolute", bottom: 6, left: 6,
                                  background: "rgba(0,0,0,0.6)", color: "#fff",
                                  padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500
                                }}>
                                  {asset.category}
                                </span>
                              )}
                            </div>
                            <div style={{ padding: "10px 12px" }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1510", marginBottom: 2 }}>
                                {asset.title || asset.assetId}
                              </div>
                              {asset.description && (
                                <div style={{ fontSize: 12, color: "#6b6355", lineHeight: 1.4 }}>
                                  {asset.description}
                                </div>
                              )}
                              <div style={{ fontSize: 11, color: "#a89e8c", marginTop: 6 }}>
                                Page {asset.pageNumber} • {asset.assetId}
                                {asset.geo?.placeName && <> • 📍 {asset.geo.placeName}</>}
                                {asset.dateInfo?.label && <> • 📅 {asset.dateInfo.label}</>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* MAP VIEW */}
                    {viewMode === "map" && <MapView assets={allAssets} />}

                    {/* TIMELINE VIEW */}
                    {viewMode === "timeline" && <TimelineView assets={allAssets} />}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════ PROJECTS LIST ═══════ */}
        {projectId && (
          <div style={{ marginBottom: 20, background: "#fff", borderRadius: 12, border: "1px solid #e5e0d5", overflow: "hidden" }}>
            <button type="button" onClick={() => setProjectsOpen(!projectsOpen)}
              style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "none", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, color: "#1a1510" }}>
              <span>📁 All Archives ({projects.length})</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {projectsBusy && <span style={{ fontSize: 12, color: "#8a7e6b" }}>Loading...</span>}
                <button type="button" onClick={(e) => { e.stopPropagation(); refreshProjects(); }}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#1a1510" }}><Refresh /></button>
                <Chevron up={projectsOpen} />
              </span>
            </button>
            {projectsOpen && (
              <div style={{ padding: "0 20px 20px" }}>
                {projects.length === 0 ? (
                  <p style={{ color: "#8a7e6b", fontSize: 14 }}>No archives yet.</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e5e0d5" }}>
                        <th style={{ textAlign: "left", padding: "8px 4px", color: "#8a7e6b", fontWeight: 500 }}>File</th>
                        <th style={{ textAlign: "left", padding: "8px 4px", color: "#8a7e6b", fontWeight: 500 }}>Pages</th>
                        <th style={{ textAlign: "left", padding: "8px 4px", color: "#8a7e6b", fontWeight: 500 }}>Status</th>
                        <th style={{ textAlign: "right", padding: "8px 4px" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((p) => (
                        <tr key={p.projectId} style={{
                          borderBottom: "1px solid #f0ede6",
                          background: p.projectId === projectId ? "#f8f6f3" : "transparent"
                        }}>
                          <td style={{ padding: "8px 4px" }}>
                            <button type="button" onClick={() => openProject(p)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#1a1510", fontWeight: p.projectId === projectId ? 700 : 400, textDecoration: "underline", fontSize: 13 }}>
                              {p.filename || p.projectId}
                            </button>
                          </td>
                          <td style={{ padding: "8px 4px" }}>{p.pagesCount}</td>
                          <td style={{ padding: "8px 4px" }}>{p.status}</td>
                          <td style={{ padding: "8px 4px", textAlign: "right" }}>
                            <button type="button" onClick={() => deleteProject(p.projectId)}
                              style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626" }}>
                              <Trash />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </div>


      {/* ═══════ SETTINGS OVERLAY ═══════ */}
      {settingsOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, display: "flex" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={() => setSettingsOpen(false)} />
          <div style={{
            position: "relative", margin: "auto", width: "90%", maxWidth: 900, maxHeight: "85vh",
            background: "#fff", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column"
          }}>
            {/* Settings header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #e5e0d5" }}>
              <SettingsTabs value={settingsTab} onChange={setSettingsTab} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 16 }}>
                <button type="button"
                  onClick={async () => {
                    setSettingsBusy(true);
                    try { await saveSettingsWithHistory(settingsHistory); }
                    finally { setSettingsBusy(false); }
                  }}
                  disabled={settingsBusy}
                  style={{ padding: "6px 16px", fontSize: 12, background: "#1a1510", color: "#d4c5a9", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>
                  {settingsBusy ? "Saving..." : "Save"}
                </button>
                <button type="button" onClick={() => setSettingsOpen(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#1a1510" }}>
                  <XIcon />
                </button>
              </div>
            </div>

            {settingsError && (
              <div style={{ padding: "8px 24px", background: "#7f1d1d", color: "#fca5a5", fontSize: 12 }}>{settingsError}</div>
            )}

            {/* Settings body */}
            <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
              {settingsTab === "ai" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>AI Rules</label>
                    <button type="button" onClick={() => saveVersionSnapshot()} style={{ fontSize: 11, color: "#8a7e6b", background: "none", border: "none", cursor: "pointer" }}>
                      Save Snapshot
                    </button>
                  </div>
                  <textarea
                    value={aiRulesDraft}
                    onChange={(e) => setAiRulesDraft(e.target.value)}
                    style={{ width: "100%", minHeight: 300, fontFamily: "monospace", fontSize: 13, padding: 12, border: "1px solid #e5e0d5", borderRadius: 8, resize: "vertical" }}
                  />
                </div>
              )}

              {settingsTab === "detection" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>Detection Rules JSON</label>
                    <button type="button" onClick={() => setDetectionRulesJsonDraft(DEFAULT_DETECTION_RULES)} style={{ fontSize: 11, color: "#8a7e6b", background: "none", border: "none", cursor: "pointer" }}>
                      Reset to Default
                    </button>
                  </div>
                  <textarea
                    value={detectionRulesJsonDraft}
                    onChange={(e) => setDetectionRulesJsonDraft(e.target.value)}
                    style={{ width: "100%", minHeight: 300, fontFamily: "monospace", fontSize: 13, padding: 12, border: "1px solid #e5e0d5", borderRadius: 8, resize: "vertical" }}
                  />
                </div>
              )}

              {settingsTab === "debugLog" && (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <label style={{ fontSize: 13, fontWeight: 600 }}>Debug Log</label>
                    <button type="button" onClick={() => setDebugLog([])} style={{ fontSize: 11, color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}>Clear</button>
                  </div>
                  <div style={{
                    fontFamily: "monospace", fontSize: 12, background: "#1a1510", color: "#d4c5a9",
                    padding: 16, borderRadius: 8, maxHeight: 400, overflow: "auto", whiteSpace: "pre-wrap"
                  }}>
                    {debugLog.length === 0 ? "No log entries yet." : debugLog.join("\n")}
                  </div>
                </div>
              )}

              {settingsTab === "cloudState" && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>Cloud State (Manifest JSON)</label>
                  <div style={{
                    fontFamily: "monospace", fontSize: 11, background: "#f8f6f3",
                    padding: 16, borderRadius: 8, maxHeight: 400, overflow: "auto", whiteSpace: "pre-wrap",
                    border: "1px solid #e5e0d5"
                  }}>
                    {manifest ? JSON.stringify(manifest, null, 2) : "No project loaded."}
                  </div>
                </div>
              )}

              {/* History panel */}
              {["ai", "detection"].includes(settingsTab) && (
                <div style={{ marginTop: 24 }}>
                  <button type="button" onClick={() => {}}
                    style={{ fontSize: 12, color: "#8a7e6b", background: "none", border: "none", cursor: "pointer", marginBottom: 8 }}>
                    Version History ({(settingsHistory[getHistoryKey(settingsTab)] || []).length})
                  </button>
                  {(settingsHistory[getHistoryKey(settingsTab)] || []).map((entry, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: "1px solid #f0ede6", fontSize: 12 }}>
                      <span style={{ color: "#6b6355" }}>
                        {new Date(entry.timestamp).toLocaleString()} {entry.label && `— ${entry.label}`}
                      </span>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" onClick={() => restoreVersion(entry)} style={{ fontSize: 11, color: "#2563eb", background: "none", border: "none", cursor: "pointer" }}>Restore</button>
                        <button type="button" onClick={() => deleteVersion(i)} style={{ fontSize: 11, color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════ DEBUG LOG PANEL (floating) ═══════ */}
      {debugLogOpen && !settingsOpen && (
        <div style={{
          position: "fixed", bottom: 16, right: 16, width: 480, maxHeight: 320,
          background: "#1a1510", color: "#d4c5a9", borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.3)", zIndex: 8000,
          display: "flex", flexDirection: "column", overflow: "hidden"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid #2c2218" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Debug Log</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setDebugLog([])} style={{ fontSize: 11, color: "#8a7e6b", background: "none", border: "none", cursor: "pointer" }}>Clear</button>
              <button type="button" onClick={() => setDebugLogOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#d4c5a9" }}><XIcon /></button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "8px 16px", fontFamily: "monospace", fontSize: 11, whiteSpace: "pre-wrap" }}>
            {debugLog.length === 0 ? "No log entries yet." : debugLog.join("\n")}
          </div>
        </div>
      )}

      {/* ═══════ HIDDEN FILE INPUT ═══════ */}
      <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          e.target.value = "";
          setStartupOpen(false);
          uploadSource(file).then(() => runAutoPipeline()).catch((err) => setLastError(err instanceof Error ? err.message : String(err)));
        }}
      />
    </div>
  );
}
