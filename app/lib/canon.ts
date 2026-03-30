/**
 * Canon — Hard Canon data model for IP Bibles
 *
 * Aligned with IP Bible V4 Schema domains:
 *   OVERVIEW, CHARACTERS, LOCATIONS (from WORLD), LORE, FACTIONS, TONE, STYLE
 *
 * Plus a PUBLICATIONS registry for tracking all works-in-progress.
 *
 * Blob path: canon/{canonId}/manifest.json
 */

import { put } from "@vercel/blob";

// ─── Core Types ─────────────────────────────────────────────────────

export type CanonType = "hard" | "soft";

export interface CanonAsset {
  url: string;
  caption?: string;
  source?: "uploaded" | "extracted" | "generated";
}

// ─── OVERVIEW ───────────────────────────────────────────────────────

export interface CanonOverview {
  ipTitle: string;
  logline: string;
  concept: string;
  mainCharacter: string;
  whatUpAgainst: string;
  synopsis: string;
  heroImage?: CanonAsset;
}

// ─── CHARACTERS ─────────────────────────────────────────────────────

export type CharacterRole = "lead" | "antagonist" | "supporting" | "background_recurring";

export interface CanonCharacter {
  characterId: string;
  name: string;
  roleType: CharacterRole;
  storyFunctionTags: string[];
  logline: string;
  howTheyLook: string[];       // bullets
  howTheySpeak: string[];      // bullets
  summaryBox: string;
  distinctiveness: string;
  leadImage?: CanonAsset;
  fullBodyImage?: CanonAsset;
  // Deep fields
  want?: string;
  need?: string;
  ghost?: string;
  flaw?: string;
  arc?: string;
}

// ─── LOCATIONS (derived from WORLD domain) ──────────────────────────

export type LocationRole = "power-centre" | "frontier" | "sanctuary" | "battleground" | "home" | "unknown" | "other";

export interface CanonLocation {
  locationId: string;
  name: string;
  locationType: string;        // city, planet, realm, etc.
  roles: string[];             // location function tags
  setting: string;             // the wider context
  settingSummary: string;
  distinctiveness: string;
  heroImage?: CanonAsset;
  secondaryImages?: CanonAsset[];
  // Deep fields
  narrativeRole?: string;
  whatHappensHere?: string;
  atmosphere?: string;
}

// ─── LORE ───────────────────────────────────────────────────────────

export interface LoreEntry {
  entryId: string;
  name: string;
  loreType: string;            // system, belief, history, technology, etc.
  summary: string;
  themes: string[];
  heroImage?: CanonAsset;
  // Structured lore sections
  details?: string;
}

export interface CanonLore {
  overviewThemes: string;
  loreOverview: string;
  whoRunsThings: string;
  howTheWorldWorks: string;
  whatPeopleBelieve: string;
  whereItsBreaking: string;
  heroImage?: CanonAsset;
  entries: LoreEntry[];
}

// ─── FACTIONS ───────────────────────────────────────────────────────

export type FactionType = "GOVERNMENT" | "CORPORATION" | "CRIMINAL" | "RELIGIOUS" | "MILITARY" | "SOCIAL" | "IDEOLOGICAL" | "OTHER";

export interface CanonFaction {
  factionId: string;
  name: string;
  factionType: FactionType;
  logline: string;
  whoTheyAre: string;
  whatTheyWant: string;
  howTheyOperate: string[];    // bullets
  whatTheyControl: string[];   // bullets
  internalPressure: string[];  // bullets
  heroImage?: CanonAsset;
}

// ─── TONE ───────────────────────────────────────────────────────────

export interface CanonTone {
  toneOverview: string;
  genreSignals: string[];
  whatToExpect: string[];       // bullets
  audienceHooks: string[];
  reality: string[];            // bullets
  whatItIsNot: string[];        // bullets
}

// ─── STYLE ──────────────────────────────────────────────────────────

export interface CanonStyle {
  creativeVision: string;
  signsAndSymbols: string[];    // bullets
  boundaries: string[];         // bullets
  formats?: string;
  heroImages?: CanonAsset[];
  compImages?: CanonAsset[];
  compTexts?: string[];
}

// ─── PUBLICATIONS ───────────────────────────────────────────────────

export type PublicationFormat = "novel" | "film" | "series" | "comic" | "webtoon" | "video" | "game" | "podcast" | "script" | "animation" | "other";
export type PublicationStatus = "concept" | "development" | "production" | "published";

export interface CanonPublication {
  publicationId: string;
  title: string;
  format: PublicationFormat;
  status: PublicationStatus;
  logline?: string;
  notes?: string;
  heroImage?: CanonAsset;
  createdAt: string;
  updatedAt: string;
}

// ─── Canon Manifest (root document) ─────────────────────────────────

export type CanonDomain = "overview" | "characters" | "locations" | "lore" | "factions" | "tone" | "style" | "publications";

export interface CanonManifest {
  canonId: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  // Optional link to a project or memo
  linkedProjectId?: string;
  linkedMemoId?: string;

  overview: CanonOverview;
  characters: CanonCharacter[];
  locations: CanonLocation[];
  lore: CanonLore;
  factions: CanonFaction[];
  tone: CanonTone;
  style: CanonStyle;
  publications: CanonPublication[];
}

// ─── Factory ────────────────────────────────────────────────────────

export function newCanonManifest(canonId: string, title: string): CanonManifest {
  return {
    canonId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title,
    overview: {
      ipTitle: title,
      logline: "",
      concept: "",
      mainCharacter: "",
      whatUpAgainst: "",
      synopsis: "",
    },
    characters: [],
    locations: [],
    lore: {
      overviewThemes: "",
      loreOverview: "",
      whoRunsThings: "",
      howTheWorldWorks: "",
      whatPeopleBelieve: "",
      whereItsBreaking: "",
      entries: [],
    },
    factions: [],
    tone: {
      toneOverview: "",
      genreSignals: [],
      whatToExpect: [],
      audienceHooks: [],
      reality: [],
      whatItIsNot: [],
    },
    style: {
      creativeVision: "",
      signsAndSymbols: [],
      boundaries: [],
    },
    publications: [],
  };
}

// ─── Blob Storage ───────────────────────────────────────────────────

export function canonManifestPath(canonId: string) {
  return `canon/${canonId}/manifest.json`;
}

export async function saveCanonManifest(manifest: CanonManifest): Promise<string> {
  manifest.updatedAt = new Date().toISOString();
  const blob = await put(canonManifestPath(manifest.canonId), JSON.stringify(manifest, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
  });
  return blob.url;
}

export async function fetchCanonManifest(url: string): Promise<CanonManifest> {
  const u = new URL(url);
  const cleanUrl = `${u.origin}${u.pathname}`;
  const res = await fetch(`${cleanUrl}?v=${Date.now()}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!res.ok) throw new Error(`Failed to fetch canon manifest: ${res.statusText}`);
  const raw = (await res.json()) as Partial<CanonManifest>;
  // Ensure all required arrays exist (older manifests may lack newer fields)
  const defaults = newCanonManifest(raw.canonId || "", raw.title || "");
  return {
    ...defaults,
    ...raw,
    characters: Array.isArray(raw.characters) ? raw.characters : [],
    locations: Array.isArray(raw.locations) ? raw.locations : [],
    factions: Array.isArray(raw.factions) ? raw.factions : [],
    publications: Array.isArray(raw.publications) ? raw.publications : [],
    lore: {
      ...defaults.lore,
      ...(raw.lore || {}),
      entries: Array.isArray(raw.lore?.entries) ? raw.lore.entries : [],
    },
    tone: {
      ...defaults.tone,
      ...(raw.tone || {}),
      genreSignals: Array.isArray(raw.tone?.genreSignals) ? raw.tone.genreSignals : [],
      whatToExpect: Array.isArray(raw.tone?.whatToExpect) ? raw.tone.whatToExpect : [],
      audienceHooks: Array.isArray(raw.tone?.audienceHooks) ? raw.tone.audienceHooks : [],
      reality: Array.isArray(raw.tone?.reality) ? raw.tone.reality : [],
      whatItIsNot: Array.isArray(raw.tone?.whatItIsNot) ? raw.tone.whatItIsNot : [],
    },
    style: {
      ...defaults.style,
      ...(raw.style || {}),
      signsAndSymbols: Array.isArray(raw.style?.signsAndSymbols) ? raw.style.signsAndSymbols : [],
      boundaries: Array.isArray(raw.style?.boundaries) ? raw.style.boundaries : [],
    },
  };
}
