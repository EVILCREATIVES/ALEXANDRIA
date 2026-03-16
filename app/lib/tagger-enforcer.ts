/**
 * Tagger Enforcer - Hard enforcement rules applied after LLM response
 * Separates post-processing logic from LLM prompt generation
 */

// ============ Types ============

export type SubjectType = "character" | "prop" | "weapon" | "object" | "logo" | "diagram" | "environment" | "other";
export type Shot =
  | "extreme-close-up"
  | "close-up"
  | "medium-shot"
  | "three-quarter-shot"
  | "full-body"
  | "wide-shot"
  | "establishing-shot"
  | "two-shot"
  | "group-shot"
  | "insert-shot"
  | "other";
export type Angle =
  | "eye-level"
  | "high-angle"
  | "low-angle"
  | "birdseye-view"
  | "dutch-angle"
  | "over-the-shoulder"
  | "front-view"
  | "three-quarter-view"
  | "profile-view"
  | "back-view"
  | "other";

export type KnownEntity = { canonical: string; aliases: string[] };

export type LLMCoreOutput = {
  triggerCandidate: string | null;
  triggerEvidence: string | null;
  ownerRelationship: string | null;  // For props/weapons: who owns it
  roles: string[];
  textConstraints: string[];
  visual: {
    subjectType: SubjectType;
    shot: Shot;
    angle: Angle;
    pose: string[];
    attributes: string[];
    objects: string[];
    environment: string[];
    styleVisibleOnly: string[];
  };
  semanticTags?: string[];  // High-level concepts from detection description
  negativeSuggestions: string[];
  rationale: string;
};

export type EnforcerConfig = {
  maxTagsPerImage: number;
  maxNegativeTags: number;
  minNegativeTags: number;
  banned: string[];
  bannedPrefixes?: string[];  // Strip tags starting with these (e.g., "attr-", "obj-")
  categoryNegatives: Record<string, string[]>;
  allowed: {
    subjectType: readonly SubjectType[];
    shot: readonly Shot[];
    angle: readonly Angle[];
    styleVisibleOnly: readonly string[];
  };
  roleAllowlist: readonly string[];
  canonicalMap: Record<string, string>;
  singularizeMap: Record<string, string>;
  synonymMap: Record<string, string>;
  tagPrefixes: {
    pose: string;
    attributes: string;
    objects: string;
    environment: string;
    style: string;
    subjectType: string;
    shot: string;
    angle: string;
  };
  simplifyTags?: boolean;
};

export type EnforceContext = {
  knownEntities: KnownEntity[];
  leadCharacters: string[];
};

export type FinalTagging = {
  trigger: string;
  tags: string[];
  negativeTags: string[];
  rationale: string;
  meta: {
    subjectType: SubjectType;
    shot: Shot;
    angle: Angle;
    roles: string[];
    textConstraints: string[];
    triggerCandidate: string | null;
  };
};

// ============ Default Config ============

export const DEFAULT_ENFORCER_CONFIG: EnforcerConfig = {
  maxTagsPerImage: 25,
  maxNegativeTags: 15,
  minNegativeTags: 3,
  banned: [
    "unknown", "misc", "other", "untitled", "image", "picture", "photo",
    "page", "figure", "img", "asset", "generic", "undefined"
  ],
  bannedPrefixes: ["attr-", "obj-", "env-"],
  categoryNegatives: {
    character: ["extra-limbs", "deformed-hands", "bad-anatomy", "wrong-fingers", "asymmetric-eyes"],
    prop: ["blurry", "pixelated", "distorted", "low-resolution", "cropped"],
    weapon: ["blurry", "pixelated", "distorted", "low-resolution", "cropped"],
    location: ["floating-objects", "impossible-geometry", "blurry", "low-resolution"],
    environment: ["floating-objects", "impossible-geometry", "blurry", "low-resolution"],
    logo: ["blurry", "pixelated", "cropped", "distorted", "low-resolution"],
    diagram: ["blurry", "unreadable", "cropped", "distorted"],
    keyArt: ["extra-limbs", "bad-anatomy", "blurry", "low-quality"],
    object: ["blurry", "pixelated", "distorted", "low-resolution"],
    default: ["blurry", "low-quality", "pixelated"]
  },
  allowed: {
    subjectType: ["character", "prop", "weapon", "object", "logo", "diagram", "environment", "other"],
    shot: [
      "extreme-close-up", "close-up", "medium-shot", "three-quarter-shot",
      "full-body", "wide-shot", "establishing-shot", "two-shot", "group-shot",
      "insert-shot", "other"
    ],
    angle: [
      "eye-level", "high-angle", "low-angle", "birdseye-view", "dutch-angle",
      "over-the-shoulder", "front-view", "three-quarter-view", "profile-view",
      "back-view", "other"
    ],
    styleVisibleOnly: [
      "flat-color", "vector-art", "cel-shaded", "painterly", "realistic",
      "high-contrast", "warm-tones", "dark-palette"
    ]
  },
  roleAllowlist: [
    "hero", "protagonist", "antagonist", "villain", "mentor", "sidekick",
    "love-interest", "rival", "lead", "king", "queen"
  ],
  canonicalMap: {
    "orange-irises": "orange-iris",
    "black-pupils": "black-pupil",
    "black-spheres": "black-sphere",
    "graphic-illustration": "graphic-art"
  },
  singularizeMap: {
    "irises": "iris",
    "pupils": "pupil",
    "spheres": "sphere"
  },
  synonymMap: {
    "graphic-illustration": "graphic-art",
    "graphic-art-style": "graphic-art"
  },
  tagPrefixes: {
    pose: "",
    attributes: "",
    objects: "",
    environment: "",
    style: "",
    subjectType: "type-",
    shot: "",
    angle: ""
  },
  simplifyTags: true
};

// ============ Helpers ============

function normTag(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "-").replace(/_+/g, "-").replace(/-+/g, "-");
}

function normTrigger(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "_").replace(/-+/g, "_").replace(/_+/g, "_");
}

function clampEnum<T extends string>(val: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof val === "string" && allowed.includes(val as T)) {
    return val as T;
  }
  return fallback;
}

function dedupePreserveOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    if (!seen.has(it)) {
      seen.add(it);
      out.push(it);
    }
  }
  return out;
}

function stripBanned(tags: string[], banned: string[], bannedPrefixes: string[] = []): string[] {
  const bannedSet = new Set(banned.map(normTag));
  return tags.filter((t) => {
    // Check exact match
    if (bannedSet.has(t)) return false;
    // Check prefix match
    for (const prefix of bannedPrefixes) {
      if (t.startsWith(prefix)) return false;
    }
    return true;
  });
}

function applyMaps(tag: string, cfg: EnforcerConfig): string {
  let t = normTag(tag);
  if (!t) return t;

  // Singularize last token if present in map
  const parts = t.split("-").filter(Boolean);
  if (parts.length) {
    const last = parts[parts.length - 1];
    const sing = cfg.singularizeMap[last];
    if (sing) parts[parts.length - 1] = sing;
    t = parts.join("-");
  }

  // Canonical + synonyms
  t = cfg.canonicalMap[t] ?? t;
  t = cfg.synonymMap[t] ?? t;
  return t;
}

function resolveCanonicalTrigger(candidate: string | null, ctx: EnforceContext): string | null {
  if (!candidate) return null;
  const cand = normTrigger(candidate);

  // Exact canonical match
  if (ctx.knownEntities.some((e) => e.canonical === cand)) return cand;
  if (ctx.leadCharacters.includes(cand)) return cand;

  // Alias match
  for (const e of ctx.knownEntities) {
    for (const a of e.aliases) {
      if (normTrigger(a) === cand) return e.canonical;
    }
  }
  return cand;
}

function enforceLeadRule(trigger: string, roles: string[], ctx: EnforceContext): string {
  if (!roles.includes("lead")) return trigger;
  // If leadCharacters is defined, trigger MUST be one of them
  if (ctx.leadCharacters.length > 0 && !ctx.leadCharacters.includes(trigger)) {
    // Keep deterministic: first lead as fallback
    return ctx.leadCharacters[0];
  }
  return trigger;
}

function buildNegativeTags(core: LLMCoreOutput, cfg: EnforcerConfig): string[] {
  // Get category-appropriate negatives (character vs location vs logo, etc.)
  const subjectType = core?.visual?.subjectType ?? "other";
  const categoryNegs = cfg.categoryNegatives[subjectType] ?? cfg.categoryNegatives["default"] ?? [];
  
  const base = categoryNegs.map(normTag);
  const suggested = (core.negativeSuggestions ?? []).map((t) => applyMaps(t, cfg));
  
  // Filter out anatomical negatives for non-character assets
  const isCharacterLike = ["character", "keyArt"].includes(subjectType);
  const anatomicalTerms = ["deformed-hands", "extra-limbs", "bad-anatomy", "wrong-fingers", "asymmetric-eyes"];
  const filteredSuggested = isCharacterLike 
    ? suggested 
    : suggested.filter(t => !anatomicalTerms.some(at => t.includes(at)));
  
  const constraintNegs = (core.textConstraints ?? []).map((c) => {
    const x = normTag(c);
    // Common patterns: "never smiles" -> "smiling"
    if (x.includes("never-smile") || x.includes("never-smiles")) return "smiling";
    if (x.includes("no-smile")) return "smiling";
    return x;
  });

  let neg = dedupePreserveOrder([...base, ...filteredSuggested, ...constraintNegs]);
  neg = stripBanned(neg, cfg.banned);
  neg = neg.filter(Boolean).slice(0, cfg.maxNegativeTags);

  // Enforce min count using category-appropriate negatives
  while (neg.length < cfg.minNegativeTags) {
    const fill = categoryNegs[(neg.length) % categoryNegs.length];
    const v = normTag(fill);
    if (!neg.includes(v)) neg.push(v);
    else break; // Avoid infinite loop
    neg = dedupePreserveOrder(neg).slice(0, cfg.maxNegativeTags);
  }
  return neg;
}

function enforceMinCoverage(tags: string[], core: LLMCoreOutput, cfg: EnforcerConfig): string[] {
  const out = [...tags];
  // Ensure at least 2 attribute tags if visible in core
  const attrPrefix = cfg.tagPrefixes.attributes;
  const attrCount = out.filter((t) => t.startsWith(attrPrefix)).length;
  if ((core.visual?.attributes?.length ?? 0) >= 2 && attrCount < 2) {
    const attrs = core.visual.attributes.slice(0, 2).map((a) => `${attrPrefix}${applyMaps(a, cfg)}`);
    for (const a of attrs) if (!out.includes(a)) out.push(a);
  }
  return dedupePreserveOrder(out);
}

// ============ Main Enforcer ============

export function enforceTagging(
  coreRaw: unknown,
  ctx: EnforceContext,
  cfg: EnforcerConfig = DEFAULT_ENFORCER_CONFIG
): FinalTagging {
  const core = coreRaw as LLMCoreOutput;
  const prefixes = cfg.tagPrefixes;

  const subjectType = clampEnum(core?.visual?.subjectType, cfg.allowed.subjectType, "other");
  const shot = clampEnum(core?.visual?.shot, cfg.allowed.shot, "other");
  const angle = clampEnum(core?.visual?.angle, cfg.allowed.angle, "other");

  const roles = dedupePreserveOrder((core?.roles ?? []).map(normTag)).filter((r) => cfg.roleAllowlist.includes(r));
  const textConstraints = dedupePreserveOrder((core?.textConstraints ?? []).map(normTag));

  // Trigger resolution + lead enforcement
  const triggerResolved = resolveCanonicalTrigger(core?.triggerCandidate ?? null, ctx);
  const trigger0 = normTrigger(triggerResolved || "unknown_entity");
  const trigger = enforceLeadRule(trigger0, roles, ctx);

  // Build tags
  const tags: string[] = [];

  // Required slot tags
  tags.push(`${prefixes.subjectType}${subjectType}`);
  tags.push(`${prefixes.shot}${shot}`);
  tags.push(`${prefixes.angle}${angle}`);

  // Roles (text-derived)
  for (const r of roles) tags.push(r);

  // Pose
  for (const p of core?.visual?.pose ?? []) tags.push(`${prefixes.pose}${applyMaps(p, cfg)}`);

  // Attributes
  for (const a of core?.visual?.attributes ?? []) tags.push(`${prefixes.attributes}${applyMaps(a, cfg)}`);

  // Objects
  for (const o of core?.visual?.objects ?? []) tags.push(`${prefixes.objects}${applyMaps(o, cfg)}`);

  // Environment
  for (const e of core?.visual?.environment ?? []) tags.push(`${prefixes.environment}${applyMaps(e, cfg)}`);

  // Style (visible-only, clamp to allowlist)
  for (const s of core?.visual?.styleVisibleOnly ?? []) {
    const st = applyMaps(s, cfg);
    if (cfg.allowed.styleVisibleOnly.includes(st)) tags.push(`${prefixes.style}${st}`);
  }

  // Semantic tags from detection description (high-level concepts)
  for (const sem of core?.semanticTags ?? []) {
    const semTag = applyMaps(sem, cfg);
    if (semTag && !tags.includes(semTag)) tags.push(semTag);
  }

  // Add owner relationship tag for props/weapons (e.g., "nel-weapon", "aria-item")
  const ownerRelationship = core?.ownerRelationship;
  if (ownerRelationship && ["prop", "weapon", "object"].includes(subjectType)) {
    const ownerTag = `${normTag(ownerRelationship)}-${subjectType === "weapon" ? "weapon" : "item"}`;
    if (!tags.includes(ownerTag)) tags.push(ownerTag);
  }

  // Normalize + ban + dedupe + max
  let finalTags = tags.map((t) => applyMaps(t, cfg));
  finalTags = stripBanned(finalTags, cfg.banned, cfg.bannedPrefixes);
  finalTags = finalTags.filter(Boolean);
  finalTags = dedupePreserveOrder(finalTags);

  // Enforce minimum coverage rules
  finalTags = enforceMinCoverage(finalTags, core, cfg);

  // Cap
  finalTags = finalTags.slice(0, cfg.maxTagsPerImage);

  // Negative tags
  const negativeTags = buildNegativeTags(core, cfg);

  // Rationale (keep from model, but ensure not empty)
  const rationale = (core?.rationale ?? "").trim() || "No rationale provided.";

  return {
    trigger,
    tags: finalTags,
    negativeTags,
    rationale,
    meta: {
      subjectType,
      shot,
      angle,
      roles,
      textConstraints,
      triggerCandidate: core?.triggerCandidate ?? null
    }
  };
}

/**
 * Parse enforcer config from JSON string, falling back to defaults
 */
export function parseEnforcerConfig(jsonStr: string): EnforcerConfig {
  try {
    const parsed = JSON.parse(jsonStr);
    // Merge with defaults to ensure all fields exist
    return {
      ...DEFAULT_ENFORCER_CONFIG,
      ...parsed,
      allowed: {
        ...DEFAULT_ENFORCER_CONFIG.allowed,
        ...(parsed.allowed || {})
      },
      tagPrefixes: {
        ...DEFAULT_ENFORCER_CONFIG.tagPrefixes,
        ...(parsed.tagPrefixes || {})
      }
    };
  } catch {
    return DEFAULT_ENFORCER_CONFIG;
  }
}
