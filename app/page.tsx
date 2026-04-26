"use client";

import React, { Component, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { DEFAULT_DETECTION_RULES } from "./lib/default-templates";

/* ───────── Error Boundary to catch & display render crashes ───────── */
class ErrorBoundary extends Component<
  { children: React.ReactNode },
  { error: Error | null; info: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, info: "" };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("🔴 ErrorBoundary caught:", error, info.componentStack);
    this.setState({ info: info.componentStack || "" });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: "monospace", background: "#1a0000", color: "#ff6b6b", minHeight: "100vh" }}>
          <h2 style={{ color: "#ff4444" }}>⚠️ Render Error Caught</h2>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.6 }}>
            <strong>Message:</strong> {this.state.error.message}{"\n\n"}
            <strong>Stack:</strong>{"\n"}{this.state.error.stack}{"\n\n"}
            <strong>Component Stack:</strong>{"\n"}{this.state.info}
          </pre>
          <button onClick={() => this.setState({ error: null, info: "" })}
            style={{ marginTop: 20, padding: "10px 20px", cursor: "pointer", background: "#ff4444", color: "#fff", border: "none", borderRadius: 6, fontSize: 14 }}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  author?: string;
  metadata?: Record<string, string>;
  geo?: { lat: number; lng: number; placeName?: string; continent?: string; country?: string; region?: string; city?: string };
  geoPreserved?: { lat: number; lng: number; placeName?: string; continent?: string; country?: string; region?: string; city?: string };
  dateInfo?: { date?: string; era?: string; label?: string };
  tags?: string[];
  negativeTags?: string[];
  trigger?: string;
  tagRationale?: string;
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
  sources?: Array<{ sourceId: string; url: string; filename: string; uploadedAt: string }>;
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

/* ───────── Asset Detail Overlay ───────── */
function AssetDetailOverlay({ asset, onClose }: { asset: PageAsset & { pageNumber: number }; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const hasGeo = asset.geo && (asset.geo.lat != null && asset.geo.lng != null);
  const hasGeoPreserved = asset.geoPreserved && (asset.geoPreserved.lat != null && asset.geoPreserved.lng != null);
  const hasDate = asset.dateInfo && (asset.dateInfo.label || asset.dateInfo.era || asset.dateInfo.date);
  const hasMeta = asset.metadata && Object.keys(asset.metadata).length > 0;
  const hasTags = asset.tags && asset.tags.length > 0;
  const hasNegTags = asset.negativeTags && asset.negativeTags.length > 0;

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 20,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: "#faf8f5", borderRadius: 16, maxWidth: 720, width: "100%",
        maxHeight: "90vh", overflow: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}>
        {/* Image */}
        <div style={{ position: "relative", background: "#e5e0d5", borderRadius: "16px 16px 0 0", overflow: "hidden" }}>
          <img
            src={asset.url}
            alt={asset.title || asset.assetId}
            style={{ width: "100%", maxHeight: 420, objectFit: "contain", display: "block" }}
          />
          <button type="button" onClick={onClose} style={{
            position: "absolute", top: 12, right: 12,
            background: "rgba(0,0,0,0.6)", color: "#fff", border: "none",
            borderRadius: 8, width: 36, height: 36, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>✕</button>
          {asset.category && (
            <span style={{
              position: "absolute", bottom: 12, left: 12,
              background: "rgba(0,0,0,0.7)", color: "#fff",
              padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              textTransform: "capitalize",
            }}>
              {asset.category}
            </span>
          )}
        </div>

        {/* Content */}
        <div style={{ padding: "20px 24px 24px" }}>
          {/* Title & ID */}
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a1510", margin: 0 }}>
            {asset.title || asset.assetId}
          </h2>
          <div style={{ fontSize: 12, color: "#a89e8c", marginTop: 4 }}>
            {asset.assetId} • Page {asset.pageNumber}
          </div>

          {/* Author */}
          {asset.author && (
            <div style={{ fontSize: 14, color: "#6b5d4d", marginTop: 6, fontWeight: 500 }}>
              ✍️ {asset.author}
            </div>
          )}

          {/* Description */}
          {asset.description && (
            <p style={{ fontSize: 14, color: "#4a4237", lineHeight: 1.6, margin: "12px 0 0" }}>
              {asset.description}
            </p>
          )}

          {/* Info Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 20 }}>
            {/* Geo */}
            <div style={{ background: "#f0ede7", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#8a7e6b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>📍 Location</div>
              {hasGeo ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1510" }}>{asset.geo!.placeName || "Unknown"}</div>
                  {(asset.geo!.city || asset.geo!.region || asset.geo!.country || asset.geo!.continent) && (
                    <div style={{ fontSize: 11, color: "#6b5d4d", marginTop: 2 }}>
                      {[asset.geo!.city, asset.geo!.region, asset.geo!.country, asset.geo!.continent].filter(Boolean).join(" › ")}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "#8a7e6b", marginTop: 2 }}>{asset.geo!.lat.toFixed(4)}, {asset.geo!.lng.toFixed(4)}</div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: "#b5a998", fontStyle: "italic" }}>Not determined</div>
              )}
            </div>

            {/* Date */}
            <div style={{ background: "#f0ede7", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#8a7e6b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>📅 Time Period</div>
              {hasDate ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1510" }}>{asset.dateInfo!.label || asset.dateInfo!.era || ""}</div>
                  {asset.dateInfo!.date && <div style={{ fontSize: 11, color: "#8a7e6b", marginTop: 2 }}>{asset.dateInfo!.date}</div>}
                  {asset.dateInfo!.era && asset.dateInfo!.label && <div style={{ fontSize: 11, color: "#8a7e6b", marginTop: 2 }}>{asset.dateInfo!.era}</div>}
                </>
              ) : (
                <div style={{ fontSize: 13, color: "#b5a998", fontStyle: "italic" }}>Not determined</div>
              )}
            </div>
          </div>

          {/* Bounding Box */}
          <div style={{ background: "#f0ede7", borderRadius: 10, padding: "12px 14px", marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#8a7e6b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>📐 Bounding Box</div>
            <div style={{ fontSize: 12, color: "#4a4237", fontFamily: "monospace" }}>
              x: {asset.bbox.x} &nbsp; y: {asset.bbox.y} &nbsp; w: {asset.bbox.w} &nbsp; h: {asset.bbox.h}
            </div>
          </div>

          {/* Metadata */}
          {hasMeta && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#8a7e6b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>🔬 Content Metadata</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                {Object.entries(asset.metadata || {}).map(([k, v]) => (
                  <div key={k} style={{ background: "#f0ede7", borderRadius: 8, padding: "8px 12px" }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#8a7e6b", textTransform: "uppercase" }}>{k}</div>
                    <div style={{ fontSize: 13, color: "#1a1510", marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {hasTags && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#8a7e6b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>🏷️ Tags</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(asset.tags || []).map((tag) => (
                  <span key={tag} style={{
                    fontSize: 12, background: "#dcd5c8", color: "#3a3428",
                    padding: "3px 10px", borderRadius: 12,
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* Negative Tags */}
          {hasNegTags && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#8a7e6b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>🚫 Negative Tags</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {(asset.negativeTags || []).map((tag) => (
                  <span key={tag} style={{
                    fontSize: 12, background: "#f5e0e0", color: "#8a3a3a",
                    padding: "3px 10px", borderRadius: 12,
                  }}>{tag}</span>
                ))}
              </div>
            </div>
          )}

          {/* Tag Rationale */}
          {asset.tagRationale && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#8a7e6b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>💬 Tag Rationale</div>
              <div style={{ fontSize: 12, color: "#4a4237", lineHeight: 1.5, background: "#f0ede7", borderRadius: 8, padding: "10px 14px" }}>
                {asset.tagRationale}
              </div>
            </div>
          )}

          {/* URLs */}
          <div style={{ marginTop: 16, borderTop: "1px solid #e5e0d5", paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#8a7e6b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>🔗 URLs</div>
            <div style={{ fontSize: 11, color: "#8a7e6b", wordBreak: "break-all", lineHeight: 1.6 }}>
              <div><strong>Full:</strong> <a href={asset.url} target="_blank" rel="noopener noreferrer" style={{ color: "#6b5d4d" }}>{asset.url}</a></div>
              {asset.thumbnailUrl && (
                <div style={{ marginTop: 4 }}><strong>Thumb:</strong> <a href={asset.thumbnailUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#6b5d4d" }}>{asset.thumbnailUrl}</a></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────── Map View (Google Maps) ───────── */
function MapView({ assets, onSelect }: { assets: (PageAsset & { pageNumber: number })[]; onSelect?: (a: PageAsset & { pageNumber: number }) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [geoMode, setGeoMode] = useState<"subject" | "preserved">("subject");
  const gmReady = useRef(false);

  const geoAssets = useMemo(() => {
    return assets.filter((a) => geoMode === "subject" ? a.geo : a.geoPreserved);
  }, [assets, geoMode]);
  const assetsRef = useRef(geoAssets);
  const onSelectRef = useRef(onSelect);

  useEffect(() => { assetsRef.current = geoAssets; }, [geoAssets]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  // Load Google Maps script once
  useEffect(() => {
    if (gmReady.current || (window as unknown as Record<string, unknown>).google) { gmReady.current = true; return; }
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAP || "";
    if (!apiKey) return;
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=marker&v=weekly`;
    script.async = true;
    script.onload = () => { gmReady.current = true; };
    document.head.appendChild(script);
  }, []);

  // Build/rebuild map whenever geoAssets change
  useEffect(() => {
    if (geoAssets.length === 0) return;

    // Cleanup previous markers
    for (const m of markersRef.current) m.map = null;
    markersRef.current = [];
    if (infoWindowRef.current) infoWindowRef.current.close();

    const tryInit = () => {
      const g = (window as unknown as { google?: { maps?: typeof google.maps } }).google?.maps;
      if (!g || !mapRef.current) return false;

      // Create map once, reuse on subsequent calls
      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new g.Map(mapRef.current, {
          center: { lat: 20, lng: 0 },
          zoom: 2,
          mapId: "alexandria-map",
          mapTypeControl: true,
          streetViewControl: true,
        });
        infoWindowRef.current = new g.InfoWindow();
      }

      const map = mapInstanceRef.current;
      const bounds = new g.LatLngBounds();

      for (const asset of assetsRef.current) {
        const geo = geoMode === "subject" ? asset.geo : asset.geoPreserved;
        if (!geo) continue;
        const pos = { lat: geo.lat, lng: geo.lng };
        bounds.extend(pos);

        const marker = new g.marker.AdvancedMarkerElement({ map, position: pos, title: asset.title || asset.assetId });

        marker.addListener("click", () => {
          const thumb = asset.thumbnailUrl || asset.url;
          const safeTitle = (asset.title || asset.assetId).replace(/"/g, "&quot;").replace(/</g, "&lt;");
          const safePn = (geo.placeName || "").replace(/"/g, "&quot;").replace(/</g, "&lt;");
          const content = document.createElement("div");
          content.style.cssText = "text-align:center;max-width:220px;font-family:system-ui";
          content.innerHTML = `<img src="${thumb}" style="width:100%;max-height:120px;object-fit:cover;border-radius:4px;margin-bottom:4px"/><div style="font-weight:600;font-size:12px">${safeTitle}</div><div style="font-size:11px;color:#666">${safePn}</div>${asset.dateInfo?.label ? `<div style="font-size:11px;color:#888">📅 ${asset.dateInfo.label}</div>` : ""}${asset.author ? `<div style="font-size:11px;color:#888">✍️ ${asset.author.replace(/"/g, "&quot;").replace(/</g, "&lt;")}</div>` : ""}`;
          const btn = document.createElement("button");
          btn.textContent = "View Details";
          btn.style.cssText = "margin-top:6px;padding:3px 10px;font-size:11px;background:#1a1510;color:#fff;border:none;border-radius:4px;cursor:pointer";
          btn.onclick = () => { if (onSelectRef.current) onSelectRef.current(asset); };
          content.appendChild(btn);
          infoWindowRef.current!.setContent(content);
          infoWindowRef.current!.open(map, marker);
        });

        markersRef.current.push(marker);
      }

      if (markersRef.current.length > 1) {
        map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
      } else if (markersRef.current.length === 1) {
        map.setCenter(bounds.getCenter());
        map.setZoom(6);
      }
      return true;
    };

    if (!tryInit()) {
      const interval = setInterval(() => {
        if (tryInit()) clearInterval(interval);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [geoAssets, geoMode]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const m of markersRef.current) m.map = null;
      markersRef.current = [];
    };
  }, []);

  const hasSubject = assets.some(a => a.geo);
  const hasPreserved = assets.some(a => a.geoPreserved);

  if (!hasSubject && !hasPreserved) {
    return (
      <div style={{ padding: "40px 20px", textAlign: "center", color: "#8a7e6b" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🗺️</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No geographic data yet</div>
        <div style={{ fontSize: 13 }}>Re-detect images to generate location data, or no matching assets with current filters.</div>
      </div>
    );
  }

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px", fontSize: 11, borderRadius: 4, cursor: "pointer", border: "none",
    background: active ? "#1a1510" : "#e5e0d5", color: active ? "#fff" : "#6b5d4d", fontWeight: active ? 600 : 400,
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: "#8a7e6b" }}>
          {geoAssets.length} of {assets.length} assets have geographic data
        </span>
        {hasSubject && hasPreserved && (
          <span style={{ display: "inline-flex", gap: 4, marginLeft: "auto" }}>
            <button type="button" onClick={() => setGeoMode("subject")} style={toggleStyle(geoMode === "subject")}>📍 Subject Location</button>
            <button type="button" onClick={() => setGeoMode("preserved")} style={toggleStyle(geoMode === "preserved")}>🏛️ Preserved At</button>
          </span>
        )}
      </div>
      <div ref={mapRef} style={{ width: "100%", height: 500, borderRadius: 8, border: "1px solid #e5e0d5" }} />
    </div>
  );
}

/* ───────── Timeline View ───────── */
function TimelineView({ assets, onSelect }: { assets: (PageAsset & { pageNumber: number })[]; onSelect?: (a: PageAsset & { pageNumber: number }) => void }) {
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
        <div style={{ fontSize: 13 }}>Re-detect images to generate timeline data, or no matching assets with current filters.</div>
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
                <div key={asset.assetId} onClick={() => onSelect?.(asset)} style={{
                  display: "flex", gap: 10, padding: 10, background: "#f8f6f3",
                  borderRadius: 8, border: "1px solid #e5e0d5", position: "relative",
                  cursor: onSelect ? "pointer" : undefined,
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
                    {asset.author && (
                      <div style={{ fontSize: 11, color: "#8a7e6b", marginTop: 1 }}>
                        ✍️ {asset.author}
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

/* ───────── Asset Filter Bar ───────── */
type AssetFilterState = { continent?: string; country?: string; region?: string; city?: string; author?: string; category?: string };

function AssetFilterBar({ assets, filter, onChange }: {
  assets: (PageAsset & { pageNumber: number })[];
  filter: AssetFilterState;
  onChange: (f: AssetFilterState) => void;
}) {
  const options = useMemo(() => {
    const continents = new Set<string>();
    const countries = new Set<string>();
    const regions = new Set<string>();
    const cities = new Set<string>();
    const authors = new Set<string>();
    const categories = new Set<string>();

    for (const a of assets) {
      for (const g of [a.geo, a.geoPreserved]) {
        if (g?.continent) continents.add(g.continent);
        if (g?.country) countries.add(g.country);
        if (g?.region) regions.add(g.region);
        if (g?.city) cities.add(g.city);
      }
      if (a.author) authors.add(a.author);
      if (a.category) categories.add(a.category);
    }

    // Filter cascading: if continent selected, only show countries in that continent, etc.
    let filtered = assets;
    const geoMatch = (a: typeof assets[0], field: string, val: string) => {
      const gf = field as keyof NonNullable<typeof a.geo>;
      return a.geo?.[gf] === val || a.geoPreserved?.[gf] === val;
    };
    if (filter.continent) filtered = filtered.filter(a => geoMatch(a, "continent", filter.continent!));
    if (filter.country) filtered = filtered.filter(a => geoMatch(a, "country", filter.country!));
    if (filter.region) filtered = filtered.filter(a => geoMatch(a, "region", filter.region!));

    const filteredCountries = new Set<string>();
    const filteredRegions = new Set<string>();
    const filteredCities = new Set<string>();
    for (const a of filtered) {
      for (const g of [a.geo, a.geoPreserved]) {
        if (g?.country) filteredCountries.add(g.country);
        if (g?.region) filteredRegions.add(g.region);
        if (g?.city) filteredCities.add(g.city);
      }
    }

    return {
      continents: [...continents].sort(),
      countries: [...(filter.continent ? filteredCountries : countries)].sort(),
      regions: [...(filter.continent || filter.country ? filteredRegions : regions)].sort(),
      cities: [...(filter.continent || filter.country || filter.region ? filteredCities : cities)].sort(),
      authors: [...authors].sort(),
      categories: [...categories].sort(),
    };
  }, [assets, filter.continent, filter.country, filter.region]);

  const selStyle: React.CSSProperties = {
    padding: "4px 8px", fontSize: 11, borderRadius: 5,
    border: "1px solid #d4c5a9", background: "#fff", color: "#1a1510",
    cursor: "pointer", minWidth: 0, maxWidth: 150,
  };

  const hasFilter = filter.continent || filter.country || filter.region || filter.city || filter.author || filter.category;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "#8a7e6b" }}>Filter:</span>

      {options.continents.length > 0 && (
        <select value={filter.continent || ""} onChange={e => onChange({ ...filter, continent: e.target.value || undefined, country: undefined, region: undefined, city: undefined })} style={selStyle}>
          <option value="">All Continents</option>
          {options.continents.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      )}
      {options.countries.length > 0 && (
        <select value={filter.country || ""} onChange={e => onChange({ ...filter, country: e.target.value || undefined, region: undefined, city: undefined })} style={selStyle}>
          <option value="">All Countries</option>
          {options.countries.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      )}
      {options.regions.length > 0 && (
        <select value={filter.region || ""} onChange={e => onChange({ ...filter, region: e.target.value || undefined, city: undefined })} style={selStyle}>
          <option value="">All Regions</option>
          {options.regions.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      )}
      {options.cities.length > 0 && (
        <select value={filter.city || ""} onChange={e => onChange({ ...filter, city: e.target.value || undefined })} style={selStyle}>
          <option value="">All Cities</option>
          {options.cities.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      )}
      {options.authors.length > 0 && (
        <select value={filter.author || ""} onChange={e => onChange({ ...filter, author: e.target.value || undefined })} style={selStyle}>
          <option value="">All Authors</option>
          {options.authors.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      )}
      {options.categories.length > 0 && (
        <select value={filter.category || ""} onChange={e => onChange({ ...filter, category: e.target.value || undefined })} style={selStyle}>
          <option value="">All Types</option>
          {options.categories.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      )}
      {hasFilter && (
        <button type="button" onClick={() => onChange({})}
          style={{ padding: "3px 8px", fontSize: 10, background: "#e5e0d5", color: "#6b5d4d", border: "none", borderRadius: 4, cursor: "pointer" }}>
          ✕ Clear
        </button>
      )}
    </div>
  );
}

function applyAssetFilter(assets: (PageAsset & { pageNumber: number })[], filter: AssetFilterState): (PageAsset & { pageNumber: number })[] {
  let result = assets;
  const gm = (a: typeof assets[0], f: string, v: string) => {
    const k = f as keyof NonNullable<typeof a.geo>;
    return a.geo?.[k] === v || a.geoPreserved?.[k] === v;
  };
  if (filter.continent) result = result.filter(a => gm(a, "continent", filter.continent!));
  if (filter.country) result = result.filter(a => gm(a, "country", filter.country!));
  if (filter.region) result = result.filter(a => gm(a, "region", filter.region!));
  if (filter.city) result = result.filter(a => gm(a, "city", filter.city!));
  if (filter.author) result = result.filter(a => a.author === filter.author);
  if (filter.category) result = result.filter(a => a.category === filter.category);
  return result;
}

/* ───────── Settings Tabs ───────── */
function SettingsTabs({
  value,
  onChange
}: {
  value: "ai" | "detection" | "tools" | "debugLog" | "cloudState";
  onChange: (v: "ai" | "detection" | "tools" | "debugLog" | "cloudState") => void;
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
      <button type="button" onClick={() => onChange("tools")} style={tabStyle(value === "tools")}>Tools</button>
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
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── Core state ── */
  const [busy, setBusy] = useState("");
  const [projectId, setProjectId] = useState("");
  const [manifestUrl, setManifestUrl] = useState("");
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const manifestRef = useRef<Manifest | null>(null);
  const manifestUrlRef = useRef("");
  const projectIdRef = useRef("");
  const [lastError, setLastError] = useState("");

  /* ── UI panels ── */
  const [projectsOpen, setProjectsOpen] = useState(true);
  const [projectsBusy, setProjectsBusy] = useState(false);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [startupOpen, setStartupOpen] = useState(true);
  const [startupProjectId, setStartupProjectId] = useState("");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"ai" | "detection" | "tools" | "debugLog" | "cloudState">("ai");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  /* ── Sources panel ── */
  const [sourcesOpen, setSourcesOpen] = useState(false);

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
  const [splitProgress, setSplitProgress] = useState({ running: false, page: 0, totalPages: 0, completedPages: 0, assetsUploaded: 0 });

  /* ── Assets ── */
  const [assetsOpen, setAssetsOpen] = useState(true);
  const [pagesPreviewOpen, setPagesPreviewOpen] = useState(false);
  const [deletingAssets, setDeletingAssets] = useState<Record<string, boolean>>({});
  const [thumbnailsBusy, setThumbnailsBusy] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "map" | "timeline">("grid");
  const [selectedAsset, setSelectedAsset] = useState<(PageAsset & { pageNumber: number }) | null>(null);
  const [assetFilter, setAssetFilter] = useState<{ continent?: string; country?: string; region?: string; city?: string; author?: string; category?: string }>({});

  /* ── Debug ── */
  const [debugLogOpen, setDebugLogOpen] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  /* ── Chat ── */
  type ChatMessage = { role: "user" | "assistant"; content: string };
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatProvider, setChatProvider] = useState<"gemini" | "claude">("gemini");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Global error catcher: captures uncaught errors with full stack traces ──
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      const msg = `🔴 UNCAUGHT ERROR: ${event.message}\nFile: ${event.filename}:${event.lineno}:${event.colno}\nStack: ${event.error?.stack || "N/A"}`;
      console.error(msg);
      setLastError(msg);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const err = event.reason;
      const msg = `🔴 UNHANDLED PROMISE: ${err instanceof Error ? `${err.message}\nStack: ${err.stack}` : String(err)}`;
      console.error(msg);
      setLastError(msg);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  const selectedStartupProject = useMemo(
    () => projects.find((p) => p.projectId === startupProjectId) || null,
    [projects, startupProjectId]
  );

  /** Wrapper around fetch that includes the endpoint in error messages */
  async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (e) {
      const method = init?.method || "GET";
      throw new Error(`${method} ${url} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function log(msg: string) {
    const ts = new Date().toLocaleTimeString();
    setDebugLog((prev) => [...prev, `[${ts}] ${msg}`]);
  }

  /* ── Chat ── */
  async function sendChat() {
    const text = chatInput.trim();
    if (!text || chatBusy) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput("");
    setChatBusy(true);

    const sourceTextUrl = manifest?.formattedText?.url || manifest?.extractedText?.url || "";
    const totalPages = manifest?.pages?.length || 0;
    const totalAssets = manifest?.pages?.reduce((n, p) => n + (p.assets?.length || 0), 0) || 0;
    const projectContext = manifest?.sourcePdf?.filename
      ? `File: ${manifest.sourcePdf.filename}, ${totalPages} pages, ${totalAssets} extracted images`
      : "";

    try {
      const res = await apiFetch("/api/projects/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          provider: chatProvider,
          sourceTextUrl,
          projectContext,
        }),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text();
        setChatMessages((prev) => [...prev, { role: "assistant", content: `Error: ${errText}` }]);
        setChatBusy(false);
        return;
      }
      // Stream SSE
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload) as { t?: string; error?: string };
            if (parsed.error) { assistantText += parsed.error; }
            else if (parsed.t) { assistantText += parsed.t; }
          } catch { /* skip */ }
        }
        setChatMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: assistantText };
          return copy;
        });
      }
    } catch (err) {
      setChatMessages((prev) => [...prev, { role: "assistant", content: `Error: ${err instanceof Error ? err.message : String(err)}` }]);
    } finally {
      setChatBusy(false);
    }
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
      const r = await apiFetch("/api/projects/settings/save", {
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
    const mRes = await apiFetch("/api/projects/manifest/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manifestUrl: url })
    });
    if (!mRes.ok) throw new Error(`Failed to read manifest: ${await readErrorText(mRes)}`);
    const payload = (await mRes.json()) as { ok: boolean; manifest?: Manifest; error?: string };
    if (!payload.ok || !payload.manifest) throw new Error(payload.error || "Bad manifest read response");

    const m = payload.manifest;
    // Normalize: ensure pages and nested arrays are never undefined
    if (m.pages) {
      for (const p of m.pages) {
        if (!Array.isArray(p.assets)) p.assets = [];
        if (!Array.isArray(p.deletedAssetIds)) p.deletedAssetIds = [];
        for (const a of p.assets) {
          if (a.tags && !Array.isArray(a.tags)) a.tags = [];
          if (a.negativeTags && !Array.isArray(a.negativeTags)) a.negativeTags = [];
          if (a.metadata && typeof a.metadata !== "object") a.metadata = undefined;
        }
      }
    }
    if (!Array.isArray(m.sources)) m.sources = [];
    setManifest(m);
    manifestRef.current = m;
    return m;
  }

  async function refreshProjects() {
    setProjectsBusy(true);
    try {
      const r = await apiFetch("/api/projects/list", { cache: "no-store" });
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
      const res = await apiFetch("/api/projects/settings/load", { cache: "no-store" });
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
      const res = await apiFetch("/api/projects/assets/generate-thumbnails", {
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

  /* Keep refs in sync */
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);
  useEffect(() => { manifestUrlRef.current = manifestUrl; }, [manifestUrl]);

  /* Mount: load settings + restore project from URL */
  useEffect(() => {
    loadGlobalSettings().catch(() => {});
    const { pid, m } = getUrlParams();
    if (pid && m) {
      setStartupOpen(false);
      setProjectId(pid);
      projectIdRef.current = pid;
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
    const r = await apiFetch("/api/projects/create", { method: "POST" });
    if (!r.ok) throw new Error(`Create project failed: ${await readErrorText(r)}`);
    const j = (await r.json()) as { ok: boolean; projectId?: string; manifestUrl?: string; error?: string };
    if (!j.ok || !j.projectId || !j.manifestUrl) throw new Error(j.error || "Create project failed");
    setProjectId(j.projectId);
    projectIdRef.current = j.projectId;
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

    try {
      // If no project yet, create one
      let pid = projectId;
      let mUrl = manifestUrl;
      if (!pid) {
        const p = await createProject();
        pid = p.projectId;
        mUrl = p.manifestUrl;
      } else {
        setManifest(null);
      }

      const sourceId = `src-${Date.now()}`;
      const blob = await upload(`projects/${pid}/source/${sourceId}.pdf`, file, {
        access: "public",
        handleUploadUrl: "/api/blob"
      });
      const r = await apiFetch("/api/projects/record-source", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, manifestUrl: mUrl, sourcePdfUrl: blob.url, filename: file.name, sourceId })
      });
      if (!r.ok) throw new Error(`Record source failed: ${await readErrorText(r)}`);
      const j = (await r.json()) as { ok: boolean; manifestUrl?: string; error?: string };
      if (!j.ok || !j.manifestUrl) throw new Error(j.error || "Record source failed");
      setManifestUrl(j.manifestUrl);
      manifestUrlRef.current = j.manifestUrl;
      setUrlParams(pid, j.manifestUrl);
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
    const pid = pipelineRunningRef.current ? projectIdRef.current : projectId;
    if (!pid || !mUrl) return setLastError("Missing projectId/manifestUrl");
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
          const uploaded = await upload(`projects/${pid}/pages/page-${rp.pageNumber}.png`, f, {
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
      const r = await apiFetch("/api/projects/pages/record-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, manifestUrl: mUrl, pages: allPages })
      });
      if (!r.ok) throw new Error(await readErrorText(r));
      const j = (await r.json()) as { ok: boolean; manifestUrl?: string; error?: string };
      if (!j.ok || !j.manifestUrl) throw new Error(j.error || "Record bulk pages failed");

      log(`All ${allPages.length} pages saved successfully`);
      setManifestUrl(j.manifestUrl);
      manifestUrlRef.current = j.manifestUrl;
      setUrlParams(pid, j.manifestUrl);
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
    const pid = pipelineRunningRef.current ? projectIdRef.current : projectId;
    if (!pid || !mUrl) return setLastError("Missing projectId/manifestUrl");
    if (!m?.pages?.length) return setLastError("No page PNGs — run Rasterize first");
    if ((busy || splitProgress.running) && !pipelineRunningRef.current) return;

    const pages = m.pages;
    let detectionRules: Record<string, unknown> | undefined;
    if (detectionRulesJsonDraft.trim()) {
      try { detectionRules = JSON.parse(detectionRulesJsonDraft) as Record<string, unknown>; }
      catch { return setLastError("Invalid Detection Rules JSON"); }
    }

    setBusy("Detecting images...");
    setSplitProgress({ running: true, page: 0, totalPages: pages.length, completedPages: 0, assetsUploaded: 0 });
    log("Starting image detection with Gemini...");

    try {
      const allResults: Map<number, Array<{ x: number; y: number; width: number; height: number; category?: string; title?: string; description?: string; author?: string; metadata?: Record<string, string>; geo?: { lat: number; lng: number; placeName: string; continent?: string; country?: string; region?: string; city?: string } | null; geoPreserved?: { lat: number; lng: number; placeName: string; continent?: string; country?: string; region?: string; city?: string } | null; dateInfo?: { date?: string; era?: string; label: string } | null }>> = new Map();

      // Detect images on pages in parallel batches of 3
      log("=== Detecting images on all pages (parallel) ===");
      const DETECT_BATCH = 3;
      for (let i = 0; i < pages.length; i += DETECT_BATCH) {
        const batch = pages.slice(i, i + DETECT_BATCH);
        await Promise.all(batch.map(async (page) => {
          setSplitProgress((s) => ({ ...s, page: page.pageNumber }));
          log(`Detecting on page ${page.pageNumber}...`);

          try {
            const detectRes = await apiFetch("/api/projects/assets/detect-gemini", {
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

            const detected = (await detectRes.json()) as { boxes?: Array<{ x: number; y: number; width: number; height: number; category?: string; title?: string; description?: string; metadata?: Record<string, string>; geo?: { lat: number; lng: number; placeName: string } | null; dateInfo?: { date?: string; era?: string; label: string } | null }>; error?: string };
            const boxes = detected.boxes ?? [];
            log(`Page ${page.pageNumber}: ${boxes.length} images found`);
            if (boxes.length > 0) allResults.set(page.pageNumber, boxes);
          } finally {
            setSplitProgress((s) => ({ ...s, completedPages: Math.min(s.totalPages, s.completedPages + 1) }));
          }
        }));
      }

      // ═══ Edge-stitch pass: merge images spanning consecutive pages ═══
      log("=== Checking for images spanning consecutive pages ===");
      const EDGE_THRESHOLD = 0.03; // 3% of page dimension = "touching edge"
      const OVERLAP_MIN = 0.25; // horizontal overlap must be ≥25% to be considered same image
      const sortedPageNums = [...allResults.keys()].sort((a, b) => a - b);

      for (let pi = 0; pi < sortedPageNums.length - 1; pi++) {
        const pnA = sortedPageNums[pi];
        const pnB = sortedPageNums[pi + 1];
        if (pnB !== pnA + 1) continue; // not consecutive

        // Guard: a prior merge may have deleted one of these pages
        if (!allResults.has(pnA) || !allResults.has(pnB)) continue;

        const pageA = pages.find(p => p.pageNumber === pnA);
        const pageB = pages.find(p => p.pageNumber === pnB);
        if (!pageA || !pageB) continue;

        const boxesA = allResults.get(pnA)!;
        const boxesB = allResults.get(pnB)!;

        // Find boxes on page A touching the bottom edge
        const bottomEdge = boxesA.map((b, i) => ({ b, i, bottomRatio: (b.y + b.height) / pageA.height }))
          .filter(e => e.bottomRatio >= 1 - EDGE_THRESHOLD);

        // Find boxes on page B touching the top edge
        const topEdge = boxesB.map((b, i) => ({ b, i, topRatio: b.y / pageB.height }))
          .filter(e => e.topRatio <= EDGE_THRESHOLD);

        if (bottomEdge.length === 0 || topEdge.length === 0) continue;

        // Check horizontal overlap for matching pairs
        const mergeIndices: { aIdx: number; bIdx: number }[] = [];
        for (const a of bottomEdge) {
          for (const b of topEdge) {
            const aLeft = a.b.x / pageA.width;
            const aRight = (a.b.x + a.b.width) / pageA.width;
            const bLeft = b.b.x / pageB.width;
            const bRight = (b.b.x + b.b.width) / pageB.width;
            const overlapLeft = Math.max(aLeft, bLeft);
            const overlapRight = Math.min(aRight, bRight);
            const overlap = Math.max(0, overlapRight - overlapLeft);
            const minWidth = Math.min(aRight - aLeft, bRight - bLeft);
            if (minWidth > 0 && overlap / minWidth >= OVERLAP_MIN) {
              mergeIndices.push({ aIdx: a.i, bIdx: b.i });
              log(`Found spanning image: p${pnA}-img${a.i + 1} ↔ p${pnB}-img${b.i + 1}`);
            }
          }
        }

        if (mergeIndices.length === 0) continue;

        // Load both page images for stitching
        const [imgA, imgB] = await Promise.all([pageA, pageB].map(pg =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.crossOrigin = "anonymous";
            el.onload = () => resolve(el);
            el.onerror = () => reject(new Error(`Failed to load p${pg.pageNumber}`));
            el.src = bust(pg.url);
          })
        ));

        // Process merges (reverse order so splice indices stay valid)
        const aIndicesToRemove = new Set<number>();
        const bIndicesToRemove = new Set<number>();

        for (const { aIdx, bIdx } of mergeIndices) {
          const bA = boxesA[aIdx];
          const bB = boxesB[bIdx];

          // Combined bounding box on stitched canvas (pageA stacked above pageB)
          const stitchX = Math.min(bA.x, bB.x);
          const stitchY = bA.y;
          const stitchRight = Math.max(bA.x + bA.width, bB.x + bB.width);
          const stitchBottom = pageA.height + bB.y + bB.height;
          const stitchW = stitchRight - stitchX;
          const stitchH = stitchBottom - stitchY;

          // Create stitched canvas and crop
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.floor(stitchW));
          canvas.height = Math.max(1, Math.floor(stitchH));
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          // Draw portion from page A
          const aPartH = pageA.height - bA.y;
          ctx.drawImage(imgA, stitchX, bA.y, stitchW, aPartH, 0, 0, stitchW, aPartH);
          // Draw portion from page B
          const bPartH = bB.y + bB.height;
          ctx.drawImage(imgB, stitchX, 0, stitchW, bPartH, 0, aPartH, stitchW, bPartH);

          const pngBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(bb => bb ? resolve(bb) : reject(new Error("toBlob null")), "image/png");
          });

          // Pick richer metadata from the two halves
          const best = (bA.title || bA.description || "").length >= (bB.title || bB.description || "").length ? bA : bB;
          const mergedBox = {
            x: stitchX, y: stitchY, width: stitchW, height: stitchH,
            category: best.category, title: best.title ? `${best.title} (merged)` : undefined,
            description: best.description, author: best.author, metadata: best.metadata,
            geo: best.geo, geoPreserved: (best as typeof boxesA[0]).geoPreserved,
            dateInfo: best.dateInfo,
            _merged: true, _mergedBlob: pngBlob, _mergedPageA: pnA, _mergedPageB: pnB,
          };

          // Add merged to page A's results
          boxesA.push(mergedBox as typeof boxesA[0]);
          aIndicesToRemove.add(aIdx);
          bIndicesToRemove.add(bIdx);
          log(`Merged p${pnA}-img${aIdx + 1} + p${pnB}-img${bIdx + 1} → stitched (${canvas.width}×${canvas.height})`);
        }

        // Remove the original halves (reverse order)
        const newBoxesA = boxesA.filter((_, i) => !aIndicesToRemove.has(i));
        const newBoxesB = boxesB.filter((_, i) => !bIndicesToRemove.has(i));
        if (newBoxesA.length > 0) allResults.set(pnA, newBoxesA); else allResults.delete(pnA);
        if (newBoxesB.length > 0) allResults.set(pnB, newBoxesB); else allResults.delete(pnB);
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
        const croppedAssets: Array<{ assetId: string; pngBlob: Blob; bbox: AssetBBox; title?: string; description?: string; category?: string; author?: string; metadata?: Record<string, string>; geo?: { lat: number; lng: number; placeName: string; continent?: string; country?: string; region?: string; city?: string } | null; geoPreserved?: { lat: number; lng: number; placeName: string; continent?: string; country?: string; region?: string; city?: string } | null; dateInfo?: { date?: string; era?: string; label: string } | null }> = [];
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i] as typeof boxes[0] & { _merged?: boolean; _mergedBlob?: Blob };
          const bbox: AssetBBox = { x: b.x, y: b.y, w: b.width, h: b.height };

          let pngBlob: Blob;
          if (b._merged && b._mergedBlob) {
            // Already stitched during edge-merge pass
            pngBlob = b._mergedBlob;
          } else {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Cannot create canvas 2D context");
            canvas.width = Math.max(1, Math.floor(bbox.w));
            canvas.height = Math.max(1, Math.floor(bbox.h));
            ctx.drawImage(img, bbox.x, bbox.y, bbox.w, bbox.h, 0, 0, canvas.width, canvas.height);
            pngBlob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((bb) => (bb ? resolve(bb) : reject(new Error("toBlob returned null"))), "image/png");
            });
          }

          const suffix = b._merged ? "merged" : String(i + 1).padStart(2, "0");
          const assetId = `p${page.pageNumber}-img${suffix}`;
          croppedAssets.push({ assetId, pngBlob, bbox, title: b.title, description: b.description, category: b.category, author: b.author, metadata: b.metadata, geo: b.geo, geoPreserved: b.geoPreserved, dateInfo: b.dateInfo });
        }

        // Upload all assets from this page in parallel (batches of 4)
        const ASSET_BATCH = 4;
        for (let i = 0; i < croppedAssets.length; i += ASSET_BATCH) {
          const batch = croppedAssets.slice(i, i + ASSET_BATCH);
          await Promise.all(batch.map(async (asset) => {
            const imageFile = new File([asset.pngBlob], `${asset.assetId}.png`, { type: "image/png" });
            const uploaded = await upload(`projects/${pid}/assets/p${page.pageNumber}/${asset.assetId}.png`, imageFile, {
              access: "public",
              handleUploadUrl: "/api/blob"
            });

            const metadata = { assetId: asset.assetId, pageNumber: page.pageNumber, url: uploaded.url, bbox: asset.bbox, title: asset.title, description: asset.description, category: asset.category, author: asset.author, metadata: asset.metadata, geo: asset.geo, geoPreserved: asset.geoPreserved, dateInfo: asset.dateInfo };
            await upload(`projects/${pid}/assets/p${page.pageNumber}/${asset.assetId}.meta.txt`,
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
      const buildRes = await apiFetch("/api/projects/assets/build-manifest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, manifestUrl: mUrl })
      });
      if (!buildRes.ok) throw new Error(await readErrorText(buildRes));
      const buildResult = (await buildRes.json()) as { ok: boolean; manifestUrl?: string; assetsFound?: number; error?: string };
      if (!buildResult.ok || !buildResult.manifestUrl) throw new Error(buildResult.error || "Build manifest failed");

      setManifestUrl(buildResult.manifestUrl);
      manifestUrlRef.current = buildResult.manifestUrl;
      setUrlParams(pid, buildResult.manifestUrl);
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
      const r = await apiFetch("/api/projects/assets/rebuild-index", {
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
      const r = await apiFetch("/api/projects/restore", {
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

  async function enrichAssets() {
    setLastError("");
    if (!projectId || !manifestUrl) return;
    setBusy("Enriching geo & date...");
    log("Starting geo/date enrichment...");
    try {
      const r = await apiFetch("/api/projects/assets/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl: manifestUrlRef.current || manifestUrl })
      });
      const j = (await r.json()) as { ok: boolean; enriched?: number; total?: number; manifestUrl?: string; errors?: string[]; error?: string };
      if (!r.ok || !j.ok) throw new Error(j.error || `Enrich failed (${r.status})`);
      if (j.manifestUrl) {
        setManifestUrl(j.manifestUrl);
        manifestUrlRef.current = j.manifestUrl;
        setUrlParams(projectId, j.manifestUrl);
        await loadManifest(j.manifestUrl);
      }
      log(`Enrichment complete: ${j.enriched ?? 0}/${j.total ?? 0} assets got geo/date data`);
      if (j.errors?.length) log(`Enrichment errors: ${j.errors.join("; ")}`);
      await refreshProjects();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`Enrich error: ${msg}`);
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
      const r = await apiFetch("/api/projects/assets/delete-all", {
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
      const r = await apiFetch("/api/projects/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: targetProjectId })
      });
      if (!r.ok) throw new Error(await readErrorText(r));
      if (targetProjectId === projectId) {
        setProjectId("");
        projectIdRef.current = "";
        setManifestUrl("");
        setManifest(null);
        clearUrlParams();
        router.push("/");
      }
      await refreshProjects();
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setProjectsBusy(false);
    }
  }

  async function deleteSource(sourceId: string, filename: string) {
    if (!projectId || !manifestUrl) return;
    if (!window.confirm(`Delete source "${filename}"? If this is the active source, extracted pages/images/text will also be cleared.`)) return;

    setLastError("");
    setBusy("Deleting source...");
    try {
      const mUrl = manifestUrlRef.current || manifestUrl;
      const r = await apiFetch("/api/projects/sources/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, manifestUrl: mUrl, sourceId })
      });
      const j = (await r.json()) as { ok: boolean; manifestUrl?: string; error?: string };
      if (!r.ok || !j.ok || !j.manifestUrl) throw new Error(j.error || "Delete source failed");

      setManifestUrl(j.manifestUrl);
      manifestUrlRef.current = j.manifestUrl;
      setUrlParams(projectId, j.manifestUrl);
      await loadManifest(j.manifestUrl);
      await refreshProjects();
      log(`Deleted source: ${filename}`);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
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
      const r = await apiFetch("/api/projects/assets/delete", {
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
        localStorage.setItem("alexandria-pipeline-checkpoint", JSON.stringify({ projectId: projectIdRef.current, manifestUrl: manifestUrlRef.current, completedStep, timestamp: Date.now() }));
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
    const stepSegment = 100 / (PIPELINE_STEPS.length - 1); // weight per step
    let base = idx * stepSegment;
    // Add sub-progress within current step
    if (pipelineStep === "rasterize" && rasterProgress.running && rasterProgress.totalPages > 0) {
      base += (rasterProgress.currentPage / rasterProgress.totalPages) * stepSegment;
    } else if (pipelineStep === "detect" && splitProgress.running && splitProgress.totalPages > 0) {
      base += (splitProgress.completedPages / splitProgress.totalPages) * stepSegment;
    }
    return Math.min(99, Math.round(base));
  }

  function getDetectionPercent(): number {
    if (!splitProgress.running || splitProgress.totalPages <= 0) return 0;
    return Math.min(100, Math.round((splitProgress.completedPages / splitProgress.totalPages) * 100));
  }

  function getPipelineLabel(): string {
    if (pipelineStep === "done") return "Complete!";
    if (pipelineStep === "upload") return "Uploading source...";
    if (pipelineStep === "rasterize") {
      if (rasterProgress.running) return `Rasterizing page ${rasterProgress.currentPage} of ${rasterProgress.totalPages}`;
      return "Rasterizing pages...";
    }
    if (pipelineStep === "detect") {
      if (splitProgress.running) return `Detecting images — ${splitProgress.completedPages}/${splitProgress.totalPages} pages (${splitProgress.assetsUploaded} extracted)`;
      return "Detecting images...";
    }
    return busy || "Processing...";
  }

  async function openProject(p: ProjectRow) {
    setLastError("");
    setProjectId(p.projectId);
    projectIdRef.current = p.projectId;
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
      if (!Array.isArray(page.assets)) continue;
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
    <ErrorBoundary>
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
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={openStartupPreviousProject}
                      style={{
                        flex: 1, padding: "10px 0", fontSize: 14,
                        background: "transparent", color: "#d4c5a9", border: "1px solid #4a3f30",
                        borderRadius: 6, cursor: "pointer"
                      }}
                    >
                      Open Archive
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteProject(selectedStartupProject.projectId)}
                      disabled={projectsBusy}
                      style={{
                        padding: "10px 14px", fontSize: 13,
                        background: "transparent", color: "#fca5a5", border: "1px solid #7f1d1d",
                        borderRadius: 6, cursor: projectsBusy ? "not-allowed" : "pointer"
                      }}
                    >
                      Delete
                    </button>
                  </div>
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
          <h1
            onClick={() => { setProjectId(""); projectIdRef.current = ""; setManifestUrl(""); setManifest(null); clearUrlParams(); setStartupOpen(true); }}
            style={{ fontSize: 20, fontWeight: 300, letterSpacing: 6, margin: 0, cursor: "pointer" }}
          >ALEXANDRIA</h1>
          {manifest?.sourcePdf?.filename && (
            <span style={{ fontSize: 12, color: "#8a7e6b" }}>/ {manifest.sourcePdf.filename}</span>
          )}
        </div>
        {projectId && (
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => setSourcesOpen(true)}
              style={{ padding: "6px 14px", fontSize: 12, background: "transparent", color: "#d4c5a9", border: "1px solid #4a3f30", borderRadius: 6, cursor: "pointer" }}>
              Sources {manifest?.sources?.length ? `(${manifest.sources.length})` : ""}
            </button>
            <button type="button" onClick={() => setSettingsOpen(true)}
              style={{ padding: "6px 14px", fontSize: 12, background: "transparent", color: "#d4c5a9", border: "1px solid #4a3f30", borderRadius: 6, cursor: "pointer" }}>
              Settings
            </button>
            <button type="button" onClick={() => deleteProject(projectId)} disabled={projectsBusy}
              style={{ padding: "6px 14px", fontSize: 12, background: "transparent", color: "#fca5a5", border: "1px solid #7f1d1d", borderRadius: 6, cursor: projectsBusy ? "not-allowed" : "pointer" }}>
              Delete Project
            </button>
          </div>
        )}
      </header>

      {/* ═══════ ERROR BAR ═══════ */}
      {lastError && (
        <div style={{ padding: "10px 24px", background: "#7f1d1d", color: "#fca5a5", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 120, overflow: "auto", flex: 1 }}>{lastError}</span>
          <button type="button" onClick={() => setLastError("")} style={{ background: "none", border: "none", color: "#fca5a5", cursor: "pointer", flexShrink: 0 }}><XIcon /></button>
        </div>
      )}

      {/* ═══════ FULL-SCREEN PROGRESS OVERLAY ═══════ */}
      {(pipelineRunning || (busy && pipelineStep)) && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 8500,
          background: "rgba(26,21,16,0.92)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column"
        }}>
          {/* Animated spinner */}
          <div style={{
            width: 120, height: 120, borderRadius: "50%",
            border: "4px solid #2c2218", borderTopColor: "#d4c5a9",
            animation: "spin 1s linear infinite", marginBottom: 32
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

          {/* Percentage */}
          <div style={{ fontSize: 64, fontWeight: 200, color: "#d4c5a9", letterSpacing: 4, marginBottom: 8 }}>
            {getPipelinePercent()}%
          </div>

          {/* Step label */}
          <div style={{ fontSize: 16, color: "#8a7e6b", marginBottom: 24, letterSpacing: 1 }}>
            {getPipelineLabel()}
          </div>

          {/* Progress bar */}
          <div style={{ width: 400, maxWidth: "80vw", height: 6, background: "#2c2218", borderRadius: 3, overflow: "hidden" }}>
            <div style={{
              height: "100%", background: "linear-gradient(90deg, #d4c5a9, #e8d5b0)",
              width: `${getPipelinePercent()}%`, transition: "width 0.5s ease",
              borderRadius: 3
            }} />
          </div>

          {/* Step indicators */}
          <div style={{ display: "flex", gap: 24, marginTop: 24 }}>
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

          {pipelineError && (
            <div style={{ fontSize: 13, color: "#ef4444", marginTop: 16, maxWidth: 500, textAlign: "center" }}>Error: {pipelineError}</div>
          )}
        </div>
      )}

      {/* ═══════ BUSY BAR (non-pipeline) ═══════ */}
      {busy && !pipelineStep && (
        <div style={{ padding: "10px 24px", background: "#d4c5a9", color: "#1a1510", fontSize: 13, fontWeight: 500 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span>⏳ {busy}</span>
            {splitProgress.running && (
              <span style={{ fontSize: 12, opacity: 0.85 }}>
                {splitProgress.completedPages}/{splitProgress.totalPages} pages • {splitProgress.assetsUploaded} assets
              </span>
            )}
          </div>
          {splitProgress.running && (
            <div style={{ marginTop: 8, height: 6, background: "rgba(26,21,16,0.18)", borderRadius: 999, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%",
                  width: `${getDetectionPercent()}%`,
                  background: "#1a1510",
                  transition: "width 0.35s ease",
                }}
              />
            </div>
          )}
        </div>
      )}


      {/* ═══════ MAIN CONTENT ═══════ */}
      <div style={{ padding: "20px 24px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ── UPLOAD / ADD SOURCE ── */}
        {projectId && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={!!busy}
              style={{
                padding: "12px 28px", fontSize: 14, fontWeight: 600,
                background: "#1a1510", color: "#d4c5a9", border: "none", borderRadius: 8,
                cursor: busy ? "not-allowed" : "pointer", letterSpacing: 1
              }}>
              {totalAssets > 0 || (manifest?.sources?.length || 0) > 0 ? "＋ ADD SOURCE" : "UPLOAD SOURCE"}
            </button>
            {pipelineResumeStep && !pipelineRunning && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "#422006", color: "#fbbf24", borderRadius: 8, fontSize: 13 }}>
                <span>Pipeline paused — {PIPELINE_STEPS.find(s => s.key === pipelineResumeStep)?.label}</span>
                <button type="button" onClick={() => runAutoPipeline(pipelineResumeStep as PipelineStep)}
                  style={{ padding: "4px 12px", fontSize: 12, background: "#fbbf24", color: "#422006", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600 }}>
                  Resume
                </button>
                <button type="button" onClick={() => { setPipelineResumeStep(""); setPipelineError(""); localStorage.removeItem("alexandria-pipeline-checkpoint"); }}
                  style={{ padding: "4px 10px", fontSize: 12, background: "transparent", color: "#fbbf24", border: "1px solid #fbbf24", borderRadius: 4, cursor: "pointer" }}>
                  ✕
                </button>
              </div>
            )}
            <div style={{ flex: 1 }} />
            {totalAssets > 0 && (
              <span style={{ fontSize: 13, color: "#8a7e6b" }}>
                {totalPages} pages • {totalAssets} images
              </span>
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
                      <button type="button" onClick={() => enrichAssets()} disabled={!!busy}
                        style={{ padding: "6px 14px", fontSize: 12, background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}>
                        🌍 Enrich Geo
                      </button>
                      <button type="button" onClick={() => splitImages()} disabled={!!busy}
                        style={{ padding: "6px 14px", fontSize: 12, background: "#854d0e", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}>
                        {busy ? "Working..." : "🔄 Re-Detect Images"}
                      </button>
                    </div>

                    {/* FILTER BAR */}
                    <AssetFilterBar assets={allAssets} filter={assetFilter} onChange={setAssetFilter} />

                    {/* GRID VIEW */}
                    {viewMode === "grid" && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
                        {applyAssetFilter(allAssets, assetFilter).map((asset) => (
                          <div key={asset.assetId} onClick={() => setSelectedAsset(asset)} style={{
                            background: "#f8f6f3", borderRadius: 10, border: "1px solid #e5e0d5",
                            overflow: "hidden", position: "relative", cursor: "pointer",
                            transition: "box-shadow 0.15s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.12)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}
                          >
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
                              <button type="button" onClick={(e) => { e.stopPropagation(); deleteAsset(asset.pageNumber, asset.assetId); }}
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
                              {asset.metadata && typeof asset.metadata === "object" && Object.keys(asset.metadata).length > 0 && (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                                  {Object.entries(asset.metadata).map(([k, v]) => (
                                    <span key={k} style={{
                                      fontSize: 10, background: "#e8e3d9", color: "#5a5245",
                                      padding: "1px 6px", borderRadius: 3
                                    }}>
                                      {k}: {v}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div style={{ fontSize: 11, color: "#a89e8c", marginTop: 6 }}>
                                Page {asset.pageNumber} • {asset.assetId}
                                {asset.author && <> • ✍️ {asset.author}</>}
                                {asset.geo?.placeName && <> • 📍 {asset.geo.placeName}</>}
                                {asset.dateInfo?.label && <> • 📅 {asset.dateInfo.label}</>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* MAP VIEW */}
                    {viewMode === "map" && <MapView assets={applyAssetFilter(allAssets, assetFilter)} onSelect={setSelectedAsset} />}

                    {/* TIMELINE VIEW */}
                    {viewMode === "timeline" && <TimelineView assets={applyAssetFilter(allAssets, assetFilter)} onSelect={setSelectedAsset} />}
                  </>
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

              {settingsTab === "tools" && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 16 }}>Pipeline & Maintenance Tools</label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => { setSettingsOpen(false); rasterizeToPngs(); }} disabled={!!busy}
                        style={{ padding: "8px 16px", fontSize: 13, background: "#fff", color: "#1a1510", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}>
                        Rasterize Pages
                      </button>
                      <button type="button" onClick={() => { setSettingsOpen(false); splitImages(); }} disabled={!!busy}
                        style={{ padding: "8px 16px", fontSize: 13, background: "#fff", color: "#1a1510", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}>
                        Detect Images
                      </button>
                      <button type="button" onClick={() => { setSettingsOpen(false); enrichAssets(); }} disabled={!!busy}
                        style={{ padding: "8px 16px", fontSize: 13, background: "#1e3a5f", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
                        🌍 Enrich Geo &amp; Date
                      </button>
                      <button type="button" onClick={() => { setSettingsOpen(false); runAutoPipeline(); }} disabled={!!busy || pipelineRunning}
                        style={{ padding: "8px 16px", fontSize: 13, background: "#065f46", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}>
                        ▶ Run Full Pipeline
                      </button>
                    </div>
                    <div style={{ width: "100%", height: 1, background: "#e5e0d5", margin: "8px 0" }} />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => { setSettingsOpen(false); generateThumbnails(); }} disabled={!!busy || thumbnailsBusy}
                        style={{ padding: "8px 16px", fontSize: 13, background: "#fff", color: "#1a1510", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}>
                        {thumbnailsBusy ? "Generating..." : "Gen Thumbnails"}
                      </button>
                      <button type="button" onClick={() => { setSettingsOpen(false); rebuildAssets(); }} disabled={!!busy}
                        style={{ padding: "8px 16px", fontSize: 13, background: "#fff", color: "#1a1510", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}>
                        Rebuild Index
                      </button>
                      <button type="button" onClick={() => { setSettingsOpen(false); restoreFromBlob(); }} disabled={!!busy}
                        style={{ padding: "8px 16px", fontSize: 13, background: "#fff", color: "#1a1510", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer" }}>
                        Restore
                      </button>
                    </div>
                    <div style={{ width: "100%", height: 1, background: "#e5e0d5", margin: "8px 0" }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => { setSettingsOpen(false); deleteAllAssets(); }} disabled={!!busy}
                        style={{ padding: "8px 16px", fontSize: 13, background: "#fff", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 6, cursor: "pointer" }}>
                        Delete All Assets
                      </button>
                    </div>
                  </div>
                  {(formattedTextUrl || extractedTextUrl) && (
                    <div style={{ marginTop: 24 }}>
                      <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 8 }}>Generated Outputs</label>
                      <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
                        {formattedTextUrl && <a href={formattedTextUrl} target="_blank" rel="noreferrer" style={{ color: "#065f46" }}>Open Formatted Text</a>}
                        {extractedTextUrl && <a href={extractedTextUrl} target="_blank" rel="noreferrer" style={{ color: "#065f46" }}>Open Extracted Text</a>}
                      </div>
                    </div>
                  )}
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

      {/* ═══════ SOURCES MODAL ═══════ */}
      {sourcesOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9000, display: "flex" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={() => setSourcesOpen(false)} />
          <div style={{
            position: "relative", margin: "auto", width: "90%", maxWidth: 600, maxHeight: "70vh",
            background: "#fff", borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column"
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #e5e0d5" }}>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Sources</span>
              <button type="button" onClick={() => setSourcesOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#1a1510" }}><XIcon /></button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
              {(!manifest?.sources || manifest.sources.length === 0) ? (
                <p style={{ color: "#8a7e6b", fontSize: 14 }}>No sources uploaded yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {manifest.sources.map((src) => (
                    <div key={src.sourceId} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "12px 16px", background: "#f8f6f3", borderRadius: 8, border: "1px solid #e5e0d5"
                    }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1510" }}>{src.filename}</div>
                        <div style={{ fontSize: 12, color: "#8a7e6b", marginTop: 2 }}>
                          Uploaded {new Date(src.uploadedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button type="button"
                        onClick={() => deleteSource(src.sourceId, src.filename)}
                        style={{
                          background: "none", border: "none", cursor: "pointer", color: "#dc2626",
                          padding: "6px 10px", borderRadius: 4
                        }}>
                        <Trash />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => { setSourcesOpen(false); deleteProject(projectId); }} disabled={projectsBusy}
                style={{
                  marginTop: 12, padding: "10px 20px", fontSize: 13, fontWeight: 600,
                  background: "#fff", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 6,
                  cursor: projectsBusy ? "not-allowed" : "pointer", width: "100%"
                }}>
                Delete This Project
              </button>
              <button type="button" onClick={() => { setSourcesOpen(false); fileRef.current?.click(); }}
                style={{
                  marginTop: 16, padding: "10px 20px", fontSize: 13, fontWeight: 600,
                  background: "#1a1510", color: "#d4c5a9", border: "none", borderRadius: 6,
                  cursor: "pointer", width: "100%"
                }}>
                ＋ Add Source
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ CHAT WIDGET ═══════ */}
      {projectId && !startupOpen && (
        <>
          {/* Floating chat button */}
          {!chatOpen && (
            <button type="button" onClick={() => setChatOpen(true)}
              style={{
                position: "fixed", bottom: 24, right: 24, zIndex: 8000,
                width: 56, height: 56, borderRadius: "50%",
                background: "#1a1510", color: "#d4c5a9", border: "none",
                cursor: "pointer", fontSize: 24, display: "flex",
                alignItems: "center", justifyContent: "center",
                boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              }}>
              💬
            </button>
          )}

          {/* Chat panel */}
          {chatOpen && (
            <div style={{
              position: "fixed", bottom: 24, right: 24, zIndex: 8000,
              width: 400, maxWidth: "calc(100vw - 48px)", height: 520, maxHeight: "calc(100vh - 100px)",
              background: "#fff", borderRadius: 16, border: "1px solid #e5e0d5",
              boxShadow: "0 8px 40px rgba(0,0,0,0.2)",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}>
              {/* Chat header */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px", borderBottom: "1px solid #e5e0d5",
                background: "#1a1510", color: "#d4c5a9", borderRadius: "16px 16px 0 0",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>Chat</span>
                  <select
                    value={chatProvider}
                    onChange={(e) => setChatProvider(e.target.value as "gemini" | "claude")}
                    style={{
                      fontSize: 11, padding: "2px 6px", borderRadius: 4,
                      background: "#2c2218", color: "#d4c5a9", border: "1px solid #4a3f30",
                      cursor: "pointer",
                    }}>
                    <option value="gemini">Gemini 3.1</option>
                    <option value="claude">Claude 4.6</option>
                  </select>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {chatMessages.length > 0 && (
                    <button type="button"
                      onClick={() => setChatMessages([])}
                      style={{ background: "none", border: "none", color: "#8a7e6b", cursor: "pointer", fontSize: 11, padding: "2px 6px" }}>
                      Clear
                    </button>
                  )}
                  <button type="button" onClick={() => setChatOpen(false)}
                    style={{ background: "none", border: "none", color: "#d4c5a9", cursor: "pointer", padding: 2 }}>
                    <XIcon />
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {chatMessages.length === 0 && (
                  <div style={{ textAlign: "center", color: "#8a7e6b", fontSize: 13, marginTop: 40 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>📜</div>
                    Ask anything about your source document
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} style={{
                    alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                    padding: "10px 14px", borderRadius: 12,
                    background: msg.role === "user" ? "#1a1510" : "#f0ede7",
                    color: msg.role === "user" ? "#d4c5a9" : "#1a1510",
                    fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word",
                  }}>
                    {msg.content || (chatBusy && i === chatMessages.length - 1 ? "..." : "")}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <form onSubmit={(e) => { e.preventDefault(); sendChat(); }}
                style={{
                  display: "flex", gap: 8, padding: "12px 16px",
                  borderTop: "1px solid #e5e0d5", background: "#faf8f5",
                }}>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={chatBusy ? "Thinking..." : "Ask about the source..."}
                  disabled={chatBusy}
                  style={{
                    flex: 1, padding: "10px 14px", fontSize: 13,
                    border: "1px solid #e5e0d5", borderRadius: 8,
                    outline: "none", background: "#fff", color: "#1a1510",
                  }}
                />
                <button type="submit" disabled={chatBusy || !chatInput.trim()}
                  style={{
                    padding: "10px 16px", fontSize: 13, fontWeight: 600,
                    background: chatBusy || !chatInput.trim() ? "#e5e0d5" : "#1a1510",
                    color: chatBusy || !chatInput.trim() ? "#8a7e6b" : "#d4c5a9",
                    border: "none", borderRadius: 8, cursor: chatBusy ? "not-allowed" : "pointer",
                  }}>
                  ↑
                </button>
              </form>
            </div>
          )}
        </>
      )}

      {/* ═══════ ASSET DETAIL OVERLAY ═══════ */}
      {selectedAsset && <AssetDetailOverlay asset={selectedAsset} onClose={() => setSelectedAsset(null)} />}

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
    </ErrorBoundary>
  );
}
