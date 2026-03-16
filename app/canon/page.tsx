"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Users, MapPin, ScrollText, Shield, Palette, Music,
  ChevronRight, ChevronDown, Plus, Save, ArrowLeft, Loader2,
  Swords, Crown, Eye, Ghost, Heart, Star, Sparkles,
  FileText, Film, Gamepad2, Mic, PenTool, Monitor, BookMarked,
  X, Check, Edit3
} from "lucide-react";

// ─── Types (mirrors canon.ts) ───────────────────────────────────────

type CanonAsset = { url: string; caption?: string };

type CanonOverview = {
  ipTitle: string; logline: string; concept: string;
  mainCharacter: string; whatUpAgainst: string; synopsis: string;
  heroImage?: CanonAsset;
};

type CanonCharacter = {
  characterId: string; name: string; roleType: string;
  storyFunctionTags: string[]; logline: string;
  howTheyLook: string[]; howTheySpeak: string[];
  summaryBox: string; distinctiveness: string;
  leadImage?: CanonAsset; want?: string; need?: string;
  ghost?: string; flaw?: string; arc?: string;
};

type CanonLocation = {
  locationId: string; name: string; locationType: string;
  roles: string[]; setting: string; settingSummary: string;
  distinctiveness: string; heroImage?: CanonAsset;
  narrativeRole?: string; whatHappensHere?: string; atmosphere?: string;
};

type LoreEntry = {
  entryId: string; name: string; loreType: string;
  summary: string; themes: string[]; details?: string;
};

type CanonLore = {
  overviewThemes: string; loreOverview: string;
  whoRunsThings: string; howTheWorldWorks: string;
  whatPeopleBelieve: string; whereItsBreaking: string;
  entries: LoreEntry[];
};

type CanonFaction = {
  factionId: string; name: string; factionType: string;
  logline: string; whoTheyAre: string; whatTheyWant: string;
  howTheyOperate: string[]; whatTheyControl: string[];
  internalPressure: string[]; heroImage?: CanonAsset;
};

type CanonTone = {
  toneOverview: string; genreSignals: string[];
  whatToExpect: string[]; audienceHooks: string[];
  reality: string[]; whatItIsNot: string[];
};

type CanonStyle = {
  creativeVision: string; signsAndSymbols: string[];
  boundaries: string[]; formats?: string;
};

type PublicationFormat = "novel" | "film" | "series" | "comic" | "webtoon" | "video" | "game" | "podcast" | "script" | "animation" | "other";
type PublicationStatus = "concept" | "development" | "production" | "published";

type CanonPublication = {
  publicationId: string; title: string; format: PublicationFormat;
  status: PublicationStatus; logline?: string; notes?: string;
  createdAt: string; updatedAt: string;
};

type CanonManifest = {
  canonId: string; createdAt: string; updatedAt: string;
  title: string; linkedProjectId?: string; linkedMemoId?: string;
  overview: CanonOverview; characters: CanonCharacter[];
  locations: CanonLocation[]; lore: CanonLore;
  factions: CanonFaction[]; tone: CanonTone;
  style: CanonStyle; publications: CanonPublication[];
};

type CanonRow = {
  canonId: string; manifestUrl: string; title: string;
  createdAt: string; updatedAt: string;
  characterCount: number; locationCount: number;
  factionCount: number; publicationCount: number;
};

type CanonDomain = "overview" | "characters" | "locations" | "lore" | "factions" | "tone" | "style" | "publications";

// ─── Domain Config ──────────────────────────────────────────────────

const DOMAINS: { key: CanonDomain; label: string; icon: React.ReactNode; color: string; glow: string }[] = [
  { key: "overview",      label: "OVERVIEW",       icon: <BookOpen size={20} />,    color: "#E8B931", glow: "rgba(232,185,49,0.3)" },
  { key: "characters",    label: "CHARACTERS",     icon: <Users size={20} />,       color: "#E05555", glow: "rgba(224,85,85,0.3)" },
  { key: "locations",     label: "LOCATIONS",      icon: <MapPin size={20} />,      color: "#4ECDC4", glow: "rgba(78,205,196,0.3)" },
  { key: "lore",          label: "LORE",           icon: <ScrollText size={20} />,  color: "#9B59B6", glow: "rgba(155,89,182,0.3)" },
  { key: "factions",      label: "FACTIONS",       icon: <Shield size={20} />,      color: "#E67E22", glow: "rgba(230,126,34,0.3)" },
  { key: "tone",          label: "TONE",           icon: <Music size={20} />,       color: "#3498DB", glow: "rgba(52,152,219,0.3)" },
  { key: "style",         label: "STYLE",          icon: <Palette size={20} />,     color: "#1ABC9C", glow: "rgba(26,188,156,0.3)" },
  { key: "publications",  label: "PUBLICATIONS",   icon: <BookMarked size={20} />,  color: "#F39C12", glow: "rgba(243,156,18,0.3)" },
];

const ROLE_ICONS: Record<string, React.ReactNode> = {
  lead: <Crown size={14} />,
  antagonist: <Swords size={14} />,
  supporting: <Heart size={14} />,
  background_recurring: <Eye size={14} />,
};

const PUB_FORMAT_ICONS: Record<string, React.ReactNode> = {
  novel: <BookOpen size={16} />,
  film: <Film size={16} />,
  series: <Monitor size={16} />,
  comic: <PenTool size={16} />,
  webtoon: <PenTool size={16} />,
  video: <Film size={16} />,
  game: <Gamepad2 size={16} />,
  podcast: <Mic size={16} />,
  script: <FileText size={16} />,
  animation: <Sparkles size={16} />,
  other: <Star size={16} />,
};

const STATUS_COLORS: Record<string, string> = {
  concept: "#9B59B6",
  development: "#E8B931",
  production: "#E67E22",
  published: "#27AE60",
};

// ─── Main Component ─────────────────────────────────────────────────

export default function CanonPage() {
  const [view, setView] = useState<"list" | "editor">("list");
  const [canons, setCanons] = useState<CanonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [manifest, setManifest] = useState<CanonManifest | null>(null);
  const [manifestUrl, setManifestUrl] = useState("");
  const [activeDomain, setActiveDomain] = useState<CanonDomain>("overview");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  // ── List ──
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/canon/list");
      const data = await res.json();
      if (data.ok) setCanons(data.canons || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/canon/list");
        const data = await res.json();
        if (!cancelled && data.ok) setCanons(data.canons || []);
      } catch { /* ignore */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Create ──
  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/canon/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() }),
      });
      const data = await res.json();
      if (data.ok) {
        setNewTitle("");
        await loadList();
      }
    } catch { /* ignore */ }
    setCreating(false);
  };

  // ── Load ──
  const handleLoad = async (url: string) => {
    setLoading(true);
    try {
      const res = await fetch("/api/canon/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifestUrl: url }),
      });
      const data = await res.json();
      if (data.ok) {
        setManifest(data.manifest);
        setManifestUrl(url);
        setActiveDomain("overview");
        setDirty(false);
        setView("editor");
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  // ── Save ──
  const handleSave = async () => {
    if (!manifest || !manifestUrl) return;
    setSaving(true);
    try {
      const res = await fetch("/api/canon/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifestUrl, manifest }),
      });
      const data = await res.json();
      if (data.ok) {
        setManifestUrl(data.manifestUrl);
        setDirty(false);
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  // ── Update helper ──
  const update = (fn: (m: CanonManifest) => void) => {
    if (!manifest) return;
    const clone = JSON.parse(JSON.stringify(manifest)) as CanonManifest;
    fn(clone);
    setManifest(clone);
    setDirty(true);
  };

  // ── Render ──
  if (view === "list") {
    return <CanonListView
      canons={canons} loading={loading}
      newTitle={newTitle} setNewTitle={setNewTitle}
      creating={creating} handleCreate={handleCreate}
      handleLoad={handleLoad}
    />;
  }

  if (!manifest) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e0e0e8", display: "flex" }}>
      {/* ── Sidebar ── */}
      <nav style={{
        width: 240, minHeight: "100vh", background: "#12121a",
        borderRight: "1px solid #1e1e2e", display: "flex", flexDirection: "column",
        padding: "16px 0", flexShrink: 0,
      }}>
        <button
          onClick={() => { setView("list"); setManifest(null); }}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
            background: "none", border: "none", color: "#888", cursor: "pointer",
            fontSize: 13, marginBottom: 16,
          }}
        >
          <ArrowLeft size={16} /> Back to Canons
        </button>

        <div style={{ padding: "0 16px 16px", borderBottom: "1px solid #1e1e2e" }}>
          <h2 style={{
            fontSize: 16, fontWeight: 700, margin: 0,
            background: "linear-gradient(135deg, #E8B931 0%, #E05555 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            letterSpacing: "0.05em",
          }}>
            {manifest.title}
          </h2>
          <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>CANON BIBLE</div>
        </div>

        <div style={{ flex: 1, padding: "12px 0", overflow: "auto" }}>
          {DOMAINS.map((d) => {
            const active = activeDomain === d.key;
            return (
              <button
                key={d.key}
                onClick={() => setActiveDomain(d.key)}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "10px 16px", border: "none",
                  background: active ? `${d.glow}` : "transparent",
                  color: active ? d.color : "#777",
                  cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400,
                  letterSpacing: "0.08em", textAlign: "left",
                  borderLeft: active ? `3px solid ${d.color}` : "3px solid transparent",
                  transition: "all 0.15s ease",
                }}
              >
                {d.icon}
                {d.label}
                {d.key === "characters" && manifest.characters.length > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.6 }}>{manifest.characters.length}</span>
                )}
                {d.key === "locations" && manifest.locations.length > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.6 }}>{manifest.locations.length}</span>
                )}
                {d.key === "factions" && manifest.factions.length > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.6 }}>{manifest.factions.length}</span>
                )}
                {d.key === "publications" && manifest.publications.length > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: 11, opacity: 0.6 }}>{manifest.publications.length}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Save button */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #1e1e2e" }}>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            style={{
              width: "100%", padding: "10px 0", border: "none", borderRadius: 8,
              background: dirty ? "linear-gradient(135deg, #E8B931 0%, #E05555 100%)" : "#1e1e2e",
              color: dirty ? "#000" : "#555", fontWeight: 600, fontSize: 13,
              cursor: dirty ? "pointer" : "default", display: "flex",
              alignItems: "center", justifyContent: "center", gap: 8,
              letterSpacing: "0.05em",
            }}
          >
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            {saving ? "SAVING..." : dirty ? "SAVE CANON" : "SAVED"}
          </button>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main style={{ flex: 1, padding: "32px 48px", overflow: "auto", maxHeight: "100vh" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeDomain}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {activeDomain === "overview" && <OverviewPanel overview={manifest.overview} update={update} />}
            {activeDomain === "characters" && <CharactersPanel characters={manifest.characters} update={update} />}
            {activeDomain === "locations" && <LocationsPanel locations={manifest.locations} update={update} />}
            {activeDomain === "lore" && <LorePanel lore={manifest.lore} update={update} />}
            {activeDomain === "factions" && <FactionsPanel factions={manifest.factions} update={update} />}
            {activeDomain === "tone" && <TonePanel tone={manifest.tone} update={update} />}
            {activeDomain === "style" && <StylePanel style={manifest.style} update={update} />}
            {activeDomain === "publications" && <PublicationsPanel publications={manifest.publications} update={update} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

// ─── List View ──────────────────────────────────────────────────────

function CanonListView({ canons, loading, newTitle, setNewTitle, creating, handleCreate, handleLoad }: {
  canons: CanonRow[]; loading: boolean;
  newTitle: string; setNewTitle: (s: string) => void;
  creating: boolean; handleCreate: () => void;
  handleLoad: (url: string) => void;
}) {
  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0f", color: "#e0e0e8",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: "60px 24px",
    }}>
      <h1 style={{
        fontSize: 36, fontWeight: 800, margin: "0 0 8px",
        background: "linear-gradient(135deg, #E8B931 0%, #E05555 50%, #9B59B6 100%)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        letterSpacing: "0.08em",
      }}>
        CANON
      </h1>
      <p style={{ color: "#666", fontSize: 14, margin: "0 0 40px", letterSpacing: "0.15em" }}>
        HARD CANON — IP BIBLE BUILDER
      </p>

      {/* Create */}
      <div style={{
        display: "flex", gap: 12, marginBottom: 40, width: "100%", maxWidth: 600,
      }}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="New canon title..."
          style={{
            flex: 1, padding: "12px 16px", background: "#12121a",
            border: "1px solid #1e1e2e", borderRadius: 8, color: "#e0e0e8",
            fontSize: 14, outline: "none",
          }}
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newTitle.trim()}
          style={{
            padding: "12px 24px", border: "none", borderRadius: 8,
            background: "linear-gradient(135deg, #E8B931 0%, #E05555 100%)",
            color: "#000", fontWeight: 600, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8, letterSpacing: "0.05em",
          }}
        >
          {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
          CREATE
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ color: "#555", display: "flex", alignItems: "center", gap: 8 }}>
          <Loader2 size={16} className="spin" /> Loading canons...
        </div>
      ) : canons.length === 0 ? (
        <div style={{ color: "#444", fontSize: 14 }}>No canons yet. Create your first one above.</div>
      ) : (
        <div style={{ width: "100%", maxWidth: 700, display: "flex", flexDirection: "column", gap: 12 }}>
          {canons.map((c) => (
            <button
              key={c.canonId}
              onClick={() => handleLoad(c.manifestUrl)}
              style={{
                display: "flex", alignItems: "center", gap: 16, padding: "16px 20px",
                background: "#12121a", border: "1px solid #1e1e2e", borderRadius: 12,
                color: "#e0e0e8", cursor: "pointer", textAlign: "left", width: "100%",
                transition: "border-color 0.15s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#E8B931")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#1e1e2e")}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 10,
                background: "linear-gradient(135deg, #E8B93120, #E0555520)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, fontWeight: 800, color: "#E8B931",
              }}>
                {c.title.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{c.title}</div>
                <div style={{ fontSize: 11, color: "#555", display: "flex", gap: 16 }}>
                  {c.characterCount > 0 && <span>{c.characterCount} characters</span>}
                  {c.locationCount > 0 && <span>{c.locationCount} locations</span>}
                  {c.factionCount > 0 && <span>{c.factionCount} factions</span>}
                  {c.publicationCount > 0 && <span>{c.publicationCount} publications</span>}
                  <span>Updated {new Date(c.updatedAt).toLocaleDateString()}</span>
                </div>
              </div>
              <ChevronRight size={16} style={{ color: "#444" }} />
            </button>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}

// ─── Domain Header ──────────────────────────────────────────────────

function DomainHeader({ domain, subtitle }: { domain: CanonDomain; subtitle?: string }) {
  const cfg = DOMAINS.find((d) => d.key === domain)!;
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: `${cfg.glow}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: cfg.color,
        }}>
          {cfg.icon}
        </div>
        <h2 style={{
          fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "0.08em", color: cfg.color,
        }}>
          {cfg.label}
        </h2>
      </div>
      {subtitle && <p style={{ margin: 0, color: "#555", fontSize: 13 }}>{subtitle}</p>}
    </div>
  );
}

// ─── Editable Field ─────────────────────────────────────────────────

function Field({ label, value, onChange, multiline, placeholder, color }: {
  label: string; value: string; onChange: (v: string) => void;
  multiline?: boolean; placeholder?: string; color?: string;
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = focused ? (color || "#E8B931") : "#1e1e2e";

  const shared: React.CSSProperties = {
    width: "100%", padding: "10px 14px", background: "#0e0e16",
    border: `1px solid ${borderColor}`, borderRadius: 8, color: "#e0e0e8",
    fontSize: 14, outline: "none", fontFamily: "inherit", transition: "border-color 0.15s",
    resize: multiline ? "vertical" as const : "none" as const,
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: "block", fontSize: 11, fontWeight: 600, color: "#555",
        marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value} onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder={placeholder} rows={3} style={shared}
        />
      ) : (
        <input
          value={value} onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder={placeholder} style={shared}
        />
      )}
    </div>
  );
}

function BulletField({ label, items, onChange, placeholder, color }: {
  label: string; items: string[]; onChange: (items: string[]) => void;
  placeholder?: string; color?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{
        display: "block", fontSize: 11, fontWeight: 600, color: "#555",
        marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        {label}
      </label>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <span style={{ color: color || "#E8B931", marginTop: 10, fontSize: 8 }}>●</span>
          <input
            value={item}
            onChange={(e) => { const c = [...items]; c[i] = e.target.value; onChange(c); }}
            placeholder={placeholder}
            style={{
              flex: 1, padding: "8px 12px", background: "#0e0e16",
              border: "1px solid #1e1e2e", borderRadius: 6, color: "#e0e0e8",
              fontSize: 13, outline: "none",
            }}
          />
          <button
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            style={{
              background: "none", border: "none", color: "#555", cursor: "pointer", padding: 4,
            }}
          >
            <X size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange([...items, ""])}
        style={{
          background: "none", border: "1px dashed #1e1e2e", borderRadius: 6,
          color: "#555", padding: "6px 12px", cursor: "pointer", fontSize: 12,
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <Plus size={12} /> Add item
      </button>
    </div>
  );
}

// ─── Card wrapper ───────────────────────────────────────────────────

function Card({ children, style: s }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "#12121a", border: "1px solid #1e1e2e", borderRadius: 12,
      padding: 24, marginBottom: 16, ...s,
    }}>
      {children}
    </div>
  );
}

// ─── Expandable list item ───────────────────────────────────────────

function ExpandableItem({ title, subtitle, icon, color, expanded, onToggle, onDelete, children }: {
  title: string; subtitle?: string; icon?: React.ReactNode; color: string;
  expanded: boolean; onToggle: () => void; onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={onToggle}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: `${color}15`, display: "flex", alignItems: "center",
          justifyContent: "center", color, flexShrink: 0,
        }}>
          {icon || <Star size={16} />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#e0e0e8" }}>{title || "(unnamed)"}</div>
          {subtitle && <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{subtitle}</div>}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{ background: "none", border: "none", color: "#444", cursor: "pointer", padding: 4 }}
        >
          <X size={14} />
        </button>
        <motion.div animate={{ rotate: expanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronRight size={16} style={{ color: "#555" }} />
        </motion.div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ paddingTop: 16, borderTop: "1px solid #1e1e2e", marginTop: 16 }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// DOMAIN PANELS
// ═══════════════════════════════════════════════════════════════════

// ─── Overview ───────────────────────────────────────────────────────

function OverviewPanel({ overview, update }: { overview: CanonOverview; update: (fn: (m: CanonManifest) => void) => void }) {
  const color = "#E8B931";
  return (
    <>
      <DomainHeader domain="overview" subtitle="The essence of your IP — title, logline, concept, and core conflict" />
      <Card>
        <Field label="IP Title" value={overview.ipTitle} color={color}
          onChange={(v) => update((m) => { m.overview.ipTitle = v; })} placeholder="The title of your intellectual property" />
        <Field label="Logline" value={overview.logline} color={color}
          onChange={(v) => update((m) => { m.overview.logline = v; })} placeholder="Max 12 words. Active voice." />
        <Field label="Concept" value={overview.concept} multiline color={color}
          onChange={(v) => update((m) => { m.overview.concept = v; })} placeholder="Max 40 words — the compelling narrative summary" />
        <Field label="Main Character" value={overview.mainCharacter} multiline color={color}
          onChange={(v) => update((m) => { m.overview.mainCharacter = v; })} placeholder="Who they are, what they want, what haunts them" />
        <Field label="What They're Up Against" value={overview.whatUpAgainst} multiline color={color}
          onChange={(v) => update((m) => { m.overview.whatUpAgainst = v; })} placeholder="The threat — how it attacks and why it won't stop" />
        <Field label="Synopsis" value={overview.synopsis} multiline color={color}
          onChange={(v) => update((m) => { m.overview.synopsis = v; })} placeholder="2-3 paragraphs — how the plot moves and why it matters" />
      </Card>
    </>
  );
}

// ─── Characters ─────────────────────────────────────────────────────

function CharactersPanel({ characters, update }: { characters: CanonCharacter[]; update: (fn: (m: CanonManifest) => void) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const color = "#E05555";

  const addCharacter = () => update((m) => {
    m.characters.push({
      characterId: crypto.randomUUID(), name: "", roleType: "supporting",
      storyFunctionTags: [], logline: "", howTheyLook: [], howTheySpeak: [],
      summaryBox: "", distinctiveness: "",
    });
  });

  return (
    <>
      <DomainHeader domain="characters" subtitle="Cast of characters — leads, antagonists, supporting, recurring" />
      {characters.map((ch, i) => (
        <ExpandableItem
          key={ch.characterId}
          title={ch.name}
          subtitle={`${ch.roleType} ${ch.storyFunctionTags.length > 0 ? "— " + ch.storyFunctionTags.join(", ") : ""}`}
          icon={ROLE_ICONS[ch.roleType] || <Users size={16} />}
          color={color}
          expanded={expanded === ch.characterId}
          onToggle={() => setExpanded(expanded === ch.characterId ? null : ch.characterId)}
          onDelete={() => update((m) => { m.characters = m.characters.filter((c) => c.characterId !== ch.characterId); })}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Name" value={ch.name} color={color}
              onChange={(v) => update((m) => { m.characters[i].name = v; })} placeholder="Full canon name" />
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Role Type
              </label>
              <select
                value={ch.roleType}
                onChange={(e) => update((m) => { m.characters[i].roleType = e.target.value as CanonCharacter["roleType"]; })}
                style={{
                  width: "100%", padding: "10px 14px", background: "#0e0e16",
                  border: "1px solid #1e1e2e", borderRadius: 8, color: "#e0e0e8",
                  fontSize: 14, outline: "none",
                }}
              >
                <option value="lead">Lead</option>
                <option value="antagonist">Antagonist</option>
                <option value="supporting">Supporting</option>
                <option value="background_recurring">Background / Recurring</option>
              </select>
            </div>
          </div>
          <Field label="Logline" value={ch.logline} color={color}
            onChange={(v) => update((m) => { m.characters[i].logline = v; })} placeholder="Max 12 words — the identity line" />
          <Field label="Summary Box" value={ch.summaryBox} multiline color={color}
            onChange={(v) => update((m) => { m.characters[i].summaryBox = v; })} placeholder="Who they are, what they want, what haunts them" />
          <BulletField label="How They Look" items={ch.howTheyLook} color={color}
            onChange={(items) => update((m) => { m.characters[i].howTheyLook = items; })} placeholder="Physical cue or style detail" />
          <BulletField label="How They Speak" items={ch.howTheySpeak} color={color}
            onChange={(items) => update((m) => { m.characters[i].howTheySpeak = items; })} placeholder="Voice trait or verbal habit" />
          <Field label="Distinctiveness" value={ch.distinctiveness} multiline color={color}
            onChange={(v) => update((m) => { m.characters[i].distinctiveness = v; })} placeholder="What makes them singular" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Want (external goal)" value={ch.want || ""} color={color}
              onChange={(v) => update((m) => { m.characters[i].want = v; })} placeholder="What they're trying to achieve" />
            <Field label="Need (internal)" value={ch.need || ""} color={color}
              onChange={(v) => update((m) => { m.characters[i].need = v; })} placeholder="The lesson they must learn" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Ghost (backstory trauma)" value={ch.ghost || ""} color={color}
              onChange={(v) => update((m) => { m.characters[i].ghost = v; })} placeholder="What haunts them" />
            <Field label="Flaw" value={ch.flaw || ""} color={color}
              onChange={(v) => update((m) => { m.characters[i].flaw = v; })} placeholder="Their defining weakness" />
          </div>
          <Field label="Arc" value={ch.arc || ""} multiline color={color}
            onChange={(v) => update((m) => { m.characters[i].arc = v; })} placeholder="START → END transformation" />
        </ExpandableItem>
      ))}
      <AddButton label="Add Character" onClick={addCharacter} color={color} />
    </>
  );
}

// ─── Locations ──────────────────────────────────────────────────────

function LocationsPanel({ locations, update }: { locations: CanonLocation[]; update: (fn: (m: CanonManifest) => void) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const color = "#4ECDC4";

  const addLocation = () => update((m) => {
    m.locations.push({
      locationId: crypto.randomUUID(), name: "", locationType: "",
      roles: [], setting: "", settingSummary: "", distinctiveness: "",
    });
  });

  return (
    <>
      <DomainHeader domain="locations" subtitle="World geography — stages, cities, realms, and key settings" />
      {locations.map((loc, i) => (
        <ExpandableItem
          key={loc.locationId}
          title={loc.name}
          subtitle={loc.locationType ? `${loc.locationType} ${loc.roles.length > 0 ? "— " + loc.roles.join(", ") : ""}` : undefined}
          icon={<MapPin size={16} />}
          color={color}
          expanded={expanded === loc.locationId}
          onToggle={() => setExpanded(expanded === loc.locationId ? null : loc.locationId)}
          onDelete={() => update((m) => { m.locations = m.locations.filter((l) => l.locationId !== loc.locationId); })}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Name" value={loc.name} color={color}
              onChange={(v) => update((m) => { m.locations[i].name = v; })} placeholder="Location name" />
            <Field label="Type" value={loc.locationType} color={color}
              onChange={(v) => update((m) => { m.locations[i].locationType = v; })} placeholder="city, planet, realm..." />
          </div>
          <Field label="Setting" value={loc.setting} color={color}
            onChange={(v) => update((m) => { m.locations[i].setting = v; })} placeholder="The wider context beyond the story" />
          <Field label="Setting Summary" value={loc.settingSummary} multiline color={color}
            onChange={(v) => update((m) => { m.locations[i].settingSummary = v; })} placeholder="What life is like here" />
          <Field label="Distinctiveness" value={loc.distinctiveness} multiline color={color}
            onChange={(v) => update((m) => { m.locations[i].distinctiveness = v; })} placeholder="What makes this place singular" />
          <Field label="Narrative Role" value={loc.narrativeRole || ""} color={color}
            onChange={(v) => update((m) => { m.locations[i].narrativeRole = v; })} placeholder="How this place shapes the story" />
          <Field label="What Happens Here" value={loc.whatHappensHere || ""} multiline color={color}
            onChange={(v) => update((m) => { m.locations[i].whatHappensHere = v; })} placeholder="Key events and activities" />
          <Field label="Atmosphere" value={loc.atmosphere || ""} multiline color={color}
            onChange={(v) => update((m) => { m.locations[i].atmosphere = v; })} placeholder="Mood, feel, sensory details" />
        </ExpandableItem>
      ))}
      <AddButton label="Add Location" onClick={addLocation} color={color} />
    </>
  );
}

// ─── Lore ───────────────────────────────────────────────────────────

function LorePanel({ lore, update }: { lore: CanonLore; update: (fn: (m: CanonManifest) => void) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const color = "#9B59B6";

  const addEntry = () => update((m) => {
    m.lore.entries.push({
      entryId: crypto.randomUUID(), name: "", loreType: "",
      summary: "", themes: [],
    });
  });

  return (
    <>
      <DomainHeader domain="lore" subtitle="World rules, systems, beliefs, and history — the hidden architecture" />
      <Card>
        <Field label="Overview Themes" value={lore.overviewThemes} color={color}
          onChange={(v) => update((m) => { m.lore.overviewThemes = v; })} placeholder="3-5 words: dominant pressures or ideas" />
        <Field label="Lore Overview" value={lore.loreOverview} multiline color={color}
          onChange={(v) => update((m) => { m.lore.loreOverview = v; })} placeholder="Who runs things, how the world works, what people believe" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Field label="Who Runs Things" value={lore.whoRunsThings} multiline color={color}
            onChange={(v) => update((m) => { m.lore.whoRunsThings = v; })} placeholder="Who holds control and how" />
          <Field label="How The World Works" value={lore.howTheWorldWorks} multiline color={color}
            onChange={(v) => update((m) => { m.lore.howTheWorldWorks = v; })} placeholder="Daily life and systems" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Field label="What People Believe" value={lore.whatPeopleBelieve} multiline color={color}
            onChange={(v) => update((m) => { m.lore.whatPeopleBelieve = v; })} placeholder="Beliefs, myths, values" />
          <Field label="Where It's Breaking" value={lore.whereItsBreaking} multiline color={color}
            onChange={(v) => update((m) => { m.lore.whereItsBreaking = v; })} placeholder="Pressure points, cracks in the system" />
        </div>
      </Card>

      <h3 style={{ fontSize: 16, fontWeight: 600, color: "#777", marginBottom: 16, letterSpacing: "0.08em" }}>
        LORE ENTRIES
      </h3>
      {lore.entries.map((entry, i) => (
        <ExpandableItem
          key={entry.entryId}
          title={entry.name}
          subtitle={entry.loreType || undefined}
          icon={<ScrollText size={16} />}
          color={color}
          expanded={expanded === entry.entryId}
          onToggle={() => setExpanded(expanded === entry.entryId ? null : entry.entryId)}
          onDelete={() => update((m) => { m.lore.entries = m.lore.entries.filter((e) => e.entryId !== entry.entryId); })}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Name" value={entry.name} color={color}
              onChange={(v) => update((m) => { m.lore.entries[i].name = v; })} placeholder="Entry name" />
            <Field label="Type" value={entry.loreType} color={color}
              onChange={(v) => update((m) => { m.lore.entries[i].loreType = v; })} placeholder="system, belief, history, technology..." />
          </div>
          <Field label="Summary" value={entry.summary} multiline color={color}
            onChange={(v) => update((m) => { m.lore.entries[i].summary = v; })} placeholder="What this lore establishes" />
          <BulletField label="Themes" items={entry.themes} color={color}
            onChange={(items) => update((m) => { m.lore.entries[i].themes = items; })} placeholder="Theme or concept" />
          <Field label="Details" value={entry.details || ""} multiline color={color}
            onChange={(v) => update((m) => { m.lore.entries[i].details = v; })} placeholder="Deep dive — extended detail" />
        </ExpandableItem>
      ))}
      <AddButton label="Add Lore Entry" onClick={addEntry} color={color} />
    </>
  );
}

// ─── Factions ───────────────────────────────────────────────────────

function FactionsPanel({ factions, update }: { factions: CanonFaction[]; update: (fn: (m: CanonManifest) => void) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const color = "#E67E22";

  const addFaction = () => update((m) => {
    m.factions.push({
      factionId: crypto.randomUUID(), name: "", factionType: "OTHER",
      logline: "", whoTheyAre: "", whatTheyWant: "",
      howTheyOperate: [], whatTheyControl: [], internalPressure: [],
    });
  });

  return (
    <>
      <DomainHeader domain="factions" subtitle="Organisations, groups, and power structures that shape the world" />
      {factions.map((f, i) => (
        <ExpandableItem
          key={f.factionId}
          title={f.name}
          subtitle={f.factionType}
          icon={<Shield size={16} />}
          color={color}
          expanded={expanded === f.factionId}
          onToggle={() => setExpanded(expanded === f.factionId ? null : f.factionId)}
          onDelete={() => update((m) => { m.factions = m.factions.filter((x) => x.factionId !== f.factionId); })}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Name" value={f.name} color={color}
              onChange={(v) => update((m) => { m.factions[i].name = v; })} placeholder="Faction name" />
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Faction Type
              </label>
              <select
                value={f.factionType}
                onChange={(e) => update((m) => { m.factions[i].factionType = e.target.value as CanonFaction["factionType"]; })}
                style={{
                  width: "100%", padding: "10px 14px", background: "#0e0e16",
                  border: "1px solid #1e1e2e", borderRadius: 8, color: "#e0e0e8",
                  fontSize: 14, outline: "none",
                }}
              >
                {["GOVERNMENT","CORPORATION","CRIMINAL","RELIGIOUS","MILITARY","SOCIAL","IDEOLOGICAL","OTHER"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>
          <Field label="Logline" value={f.logline} color={color}
            onChange={(v) => update((m) => { m.factions[i].logline = v; })} placeholder="Who they are, what they control, why they matter" />
          <Field label="Who They Are" value={f.whoTheyAre} multiline color={color}
            onChange={(v) => update((m) => { m.factions[i].whoTheyAre = v; })} placeholder="What this group actually is in practice" />
          <Field label="What They Want" value={f.whatTheyWant} color={color}
            onChange={(v) => update((m) => { m.factions[i].whatTheyWant = v; })} placeholder="Their main goal or agenda" />
          <BulletField label="How They Operate" items={f.howTheyOperate} color={color}
            onChange={(items) => update((m) => { m.factions[i].howTheyOperate = items; })} placeholder="Method of influence" />
          <BulletField label="What They Control" items={f.whatTheyControl} color={color}
            onChange={(items) => update((m) => { m.factions[i].whatTheyControl = items; })} placeholder="Territory, systems, resources" />
          <BulletField label="Internal Pressure" items={f.internalPressure} color={color}
            onChange={(items) => update((m) => { m.factions[i].internalPressure = items; })} placeholder="Cracks and tensions inside" />
        </ExpandableItem>
      ))}
      <AddButton label="Add Faction" onClick={addFaction} color={color} />
    </>
  );
}

// ─── Tone ───────────────────────────────────────────────────────────

function TonePanel({ tone, update }: { tone: CanonTone; update: (fn: (m: CanonManifest) => void) => void }) {
  const color = "#3498DB";
  return (
    <>
      <DomainHeader domain="tone" subtitle="The emotional experience — what it feels like to be in this story" />
      <Card>
        <Field label="Tone Overview" value={tone.toneOverview} multiline color={color}
          onChange={(v) => update((m) => { m.tone.toneOverview = v; })} placeholder="What it feels like to experience this story" />
        <BulletField label="Genre Signals" items={tone.genreSignals} color={color}
          onChange={(items) => update((m) => { m.tone.genreSignals = items; })} placeholder="Recognisable pattern (not a label)" />
        <BulletField label="What To Expect" items={tone.whatToExpect} color={color}
          onChange={(items) => update((m) => { m.tone.whatToExpect = items; })} placeholder="Type of moment or scene" />
        <BulletField label="Audience Hooks" items={tone.audienceHooks} color={color}
          onChange={(items) => update((m) => { m.tone.audienceHooks = items; })} placeholder="Why people will care" />
        <BulletField label="Reality Rules" items={tone.reality} color={color}
          onChange={(items) => update((m) => { m.tone.reality = items; })} placeholder="Realism level / clarity rule" />
        <BulletField label="What It's NOT" items={tone.whatItIsNot} color={color}
          onChange={(items) => update((m) => { m.tone.whatItIsNot = items; })} placeholder="Adjacent tone to avoid" />
      </Card>
    </>
  );
}

// ─── Style ──────────────────────────────────────────────────────────

function StylePanel({ style, update }: { style: CanonStyle; update: (fn: (m: CanonManifest) => void) => void }) {
  const color = "#1ABC9C";
  return (
    <>
      <DomainHeader domain="style" subtitle="Visual identity — if someone saw one frame, what should they feel?" />
      <Card>
        <Field label="Creative Vision" value={style.creativeVision} multiline color={color}
          onChange={(v) => update((m) => { m.style.creativeVision = v; })} placeholder="Emotional impact and visual identity" />
        <BulletField label="Signs & Symbols" items={style.signsAndSymbols} color={color}
          onChange={(items) => update((m) => { m.style.signsAndSymbols = items; })} placeholder="Recurring motif or signature moment" />
        <BulletField label="Boundaries" items={style.boundaries} color={color}
          onChange={(items) => update((m) => { m.style.boundaries = items; })} placeholder="Always do / never do" />
        <Field label="Formats" value={style.formats || ""} multiline color={color}
          onChange={(v) => update((m) => { m.style.formats = v; })} placeholder="How the visual approach changes across formats" />
      </Card>
    </>
  );
}

// ─── Publications ───────────────────────────────────────────────────

function PublicationsPanel({ publications, update }: { publications: CanonPublication[]; update: (fn: (m: CanonManifest) => void) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const color = "#F39C12";

  const addPub = () => update((m) => {
    m.publications.push({
      publicationId: crypto.randomUUID(), title: "", format: "novel",
      status: "concept", createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  const FORMATS: PublicationFormat[] = ["novel", "film", "series", "comic", "webtoon", "video", "game", "podcast", "script", "animation", "other"];
  const STATUSES: PublicationStatus[] = ["concept", "development", "production", "published"];

  return (
    <>
      <DomainHeader domain="publications" subtitle="All works-in-progress — novels, films, comics, games, scripts, and more" />

      {/* Stats bar */}
      {publications.length > 0 && (
        <div style={{
          display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap",
        }}>
          {STATUSES.map((s) => {
            const count = publications.filter((p) => p.status === s).length;
            if (count === 0) return null;
            return (
              <div key={s} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 14px", background: "#12121a",
                border: "1px solid #1e1e2e", borderRadius: 20,
                fontSize: 12, color: STATUS_COLORS[s],
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: STATUS_COLORS[s],
                }} />
                {count} {s}
              </div>
            );
          })}
        </div>
      )}

      {publications.map((pub, i) => (
        <ExpandableItem
          key={pub.publicationId}
          title={pub.title}
          subtitle={`${pub.format} — ${pub.status}`}
          icon={PUB_FORMAT_ICONS[pub.format] || <Star size={16} />}
          color={STATUS_COLORS[pub.status] || color}
          expanded={expanded === pub.publicationId}
          onToggle={() => setExpanded(expanded === pub.publicationId ? null : pub.publicationId)}
          onDelete={() => update((m) => { m.publications = m.publications.filter((p) => p.publicationId !== pub.publicationId); })}
        >
          <Field label="Title" value={pub.title} color={color}
            onChange={(v) => update((m) => { m.publications[i].title = v; m.publications[i].updatedAt = new Date().toISOString(); })}
            placeholder="Publication title" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Format
              </label>
              <select
                value={pub.format}
                onChange={(e) => update((m) => { m.publications[i].format = e.target.value as PublicationFormat; m.publications[i].updatedAt = new Date().toISOString(); })}
                style={{
                  width: "100%", padding: "10px 14px", background: "#0e0e16",
                  border: "1px solid #1e1e2e", borderRadius: 8, color: "#e0e0e8",
                  fontSize: 14, outline: "none",
                }}
              >
                {FORMATS.map((f) => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#555", marginBottom: 6, letterSpacing: "0.1em", textTransform: "uppercase" }}>
                Status
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => update((m) => { m.publications[i].status = s; m.publications[i].updatedAt = new Date().toISOString(); })}
                    style={{
                      flex: 1, padding: "8px 0", border: `1px solid ${pub.status === s ? STATUS_COLORS[s] : "#1e1e2e"}`,
                      borderRadius: 6, background: pub.status === s ? `${STATUS_COLORS[s]}20` : "transparent",
                      color: pub.status === s ? STATUS_COLORS[s] : "#555",
                      cursor: "pointer", fontSize: 11, fontWeight: 600,
                      letterSpacing: "0.05em", textTransform: "uppercase",
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <Field label="Logline" value={pub.logline || ""} color={color}
            onChange={(v) => update((m) => { m.publications[i].logline = v; m.publications[i].updatedAt = new Date().toISOString(); })}
            placeholder="One-line summary of this publication" />
          <Field label="Notes" value={pub.notes || ""} multiline color={color}
            onChange={(v) => update((m) => { m.publications[i].notes = v; m.publications[i].updatedAt = new Date().toISOString(); })}
            placeholder="Working notes, deadlines, collaborators..." />
        </ExpandableItem>
      ))}
      <AddButton label="Add Publication" onClick={addPub} color={color} />
    </>
  );
}

// ─── Shared Add Button ──────────────────────────────────────────────

function AddButton({ label, onClick, color }: { label: string; onClick: () => void; color: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "12px 20px",
        background: "transparent", border: `1px dashed ${color}40`,
        borderRadius: 12, color, cursor: "pointer", fontSize: 13,
        fontWeight: 600, letterSpacing: "0.05em", width: "100%",
        justifyContent: "center", transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `${color}10`; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <Plus size={16} /> {label}
    </button>
  );
}
