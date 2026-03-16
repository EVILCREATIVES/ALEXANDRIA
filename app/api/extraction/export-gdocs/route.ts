import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

/**
 * Check if the user has valid Google tokens stored
 */
export async function GET(req: NextRequest) {
  const tokensCookie = req.cookies.get("google_tokens");
  if (!tokensCookie?.value) {
    return NextResponse.json({ ok: true, authenticated: false });
  }

  try {
    const tokens = JSON.parse(tokensCookie.value);
    const isExpired = tokens.expiry_date && Date.now() > tokens.expiry_date;
    return NextResponse.json({
      ok: true,
      authenticated: !isExpired || !!tokens.refresh_token,
    });
  } catch {
    return NextResponse.json({ ok: true, authenticated: false });
  }
}

/**
 * Export schema test results to Google Docs.
 * Expects JSON body: { title, results }
 * Uses the stored Google OAuth tokens from the cookie.
 */
export async function POST(req: NextRequest) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { ok: false, error: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured" },
      { status: 500 }
    );
  }

  // Get tokens from cookie
  const tokensCookie = req.cookies.get("google_tokens");
  if (!tokensCookie?.value) {
    return NextResponse.json(
      { ok: false, error: "not_authenticated", message: "Please sign in with Google first" },
      { status: 401 }
    );
  }

  let tokens: { access_token: string; refresh_token?: string; expiry_date?: number };
  try {
    tokens = JSON.parse(tokensCookie.value);
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_tokens", message: "Invalid stored tokens. Please re-authenticate." },
      { status: 401 }
    );
  }

  const body = await req.json();
  const { title, results, schemaJson, pass1Results: pass1Raw } = body;

  if (!results) {
    return NextResponse.json({ ok: false, error: "Missing results" }, { status: 400 });
  }

  // Pass 1 data for comparison (when doing Pass 1 + Pass 2 combined export)
  const pass1Data: Record<string, unknown> | null = (pass1Raw && typeof pass1Raw === "object") ? pass1Raw as Record<string, unknown> : null;

  console.log(`[export-gdocs] pass1Data present: ${!!pass1Data}`);

  // Build asset-field set from schema (source of truth for which fields are images)
  let assetPaths = new Set<string>();
  if (schemaJson && typeof schemaJson === "string") {
    try {
      assetPaths = buildAssetPaths(JSON.parse(schemaJson));
    } catch { /* fall back to empty set — nothing skipped */ }
  }

  const docTitle = title || `Schema Test Results — ${new Date().toLocaleDateString()}`;

  try {
    // Set up OAuth client with stored tokens
    const host = req.headers.get("host") || "localhost:3000";
    const protocol = host.startsWith("localhost") ? "http" : "https";
    const redirectUri = `${protocol}://${host}/api/auth/google/callback`;

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    oauth2Client.setCredentials(tokens);

    // Refresh token if expired
    if (tokens.expiry_date && Date.now() > tokens.expiry_date && tokens.refresh_token) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      oauth2Client.setCredentials(credentials);
    }

    const docs = google.docs({ version: "v1", auth: oauth2Client });

    // 1. Create the document
    const createRes = await docs.documents.create({
      requestBody: { title: docTitle },
    });

    const documentId = createRes.data.documentId;
    if (!documentId) {
      throw new Error("Failed to create Google Doc — no documentId returned");
    }

    // 2. Build document content from results
    const requests = buildDocRequests(results, docTitle, assetPaths, pass1Data);

    // 3. Batch update with formatted content
    if (requests.length > 0) {
      await docs.documents.batchUpdate({
        documentId,
        requestBody: { requests },
      });
    }

    const docUrl = `https://docs.google.com/document/d/${documentId}/edit`;

    return NextResponse.json({ ok: true, documentId, url: docUrl });
  } catch (err) {
    console.error("Export to Google Docs error:", err);

    // Check if it's an auth error
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("invalid_grant") || errMsg.includes("Token has been expired")) {
      return NextResponse.json(
        { ok: false, error: "token_expired", message: "Google auth expired. Please re-authenticate." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { ok: false, error: errMsg },
      { status: 500 }
    );
  }
}

// ─── Helpers to build Google Docs API requests ───────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

type LineStyle = "title" | "h1" | "h2" | "h3" | "body" | "label" | "separator" | "spacer";

type Line = { text: string; style: LineStyle; highlight?: boolean };

type DocRequest = {
  insertText?: { location: { index: number }; text: string };
  updateParagraphStyle?: {
    range: { startIndex: number; endIndex: number };
    paragraphStyle: Record<string, unknown>;
    fields: string;
  };
  updateTextStyle?: {
    range: { startIndex: number; endIndex: number };
    textStyle: Record<string, unknown>;
    fields: string;
  };
  createParagraphBullets?: {
    range: { startIndex: number; endIndex: number };
    bulletPreset: string;
  };
};

/** Walk the JSON Schema and return a Set of normalised dot-paths whose type
 *  resolves to the Asset definition (binary image references). */
function buildAssetPaths(schema: Record<string, unknown>): Set<string> {
  const paths = new Set<string>();
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
      if (isAssetType(resolved)) { paths.add(fieldPath); continue; }
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
  return paths;
}

function isAssetPath(dataPath: string, assetPaths: Set<string>): boolean {
  const normalised = dataPath.replace(/\.(\d+)(?=\.|$)/g, "[]");
  if (assetPaths.has(normalised)) return true;
  for (const ap of assetPaths) {
    if (normalised.startsWith(ap + ".") || normalised.startsWith(ap + "[]")) return true;
  }
  return false;
}

/** Keys we skip entirely (images via schema, internal metadata via prefix) */
function shouldSkipKey(key: string, path: string, assetPaths: Set<string>): boolean {
  if (key.startsWith("_")) return true;
  return assetPaths.size > 0 && isAssetPath(path, assetPaths);
}

/** Find a human-readable name for an object (character, location, etc.) */
function findItemName(obj: Record<string, unknown>): string | null {
  const nameFields = [
    "Name", "name", "Title", "title", "IPTitle",
    "NameLabel", "EventTitle", "ArcName", "EpisodeId",
    "Character", "Label", "label", "FactionName", "EntryTitle",
  ];
  for (const f of nameFields) {
    if (typeof obj[f] === "string" && (obj[f] as string).trim()) {
      return obj[f] as string;
    }
  }
  return null;
}

/** Find a subtitle for an object */
function findItemSubtitle(obj: Record<string, unknown>): string | null {
  const fields = ["Role", "role", "RoleType", "Type", "EntryType", "FactionType"];
  for (const f of fields) {
    if (typeof obj[f] === "string" && (obj[f] as string).trim()) {
      return obj[f] as string;
    }
  }
  return null;
}

/** Look up a value in a nested object by dot-path (supports numeric array indices) */
function getValueAtPath(obj: Record<string, unknown>, dataPath: string): unknown {
  let cursor: unknown = obj;
  for (const part of dataPath.split(".")) {
    if (cursor == null || typeof cursor !== "object") return undefined;
    if (/^\d+$/.test(part)) {
      cursor = (cursor as unknown[])[parseInt(part, 10)];
    } else {
      cursor = (cursor as Record<string, unknown>)[part];
    }
  }
  return cursor;
}

/** Emit a string field, showing Pass 1 → Pass 2 comparison when value changed */
function emitStringField(
  key: string, value: string, fieldPath: string,
  lines: Line[], pass1Data: Record<string, unknown> | null,
  indent = ""
) {
  if (pass1Data) {
    const pass1Value = getValueAtPath(pass1Data, fieldPath);
    // Only show comparison when Pass 1 had meaningful content that was rewritten
    if (typeof pass1Value === "string" && pass1Value.trim() !== "" && pass1Value !== value) {
      // Pass 1 (normal)
      lines.push({ text: `${indent}${humanize(key)} [extracted]: `, style: "label" });
      lines.push({ text: `${pass1Value}\n`, style: "body" });
      // Pass 2 (green highlight)
      lines.push({ text: `${indent}${humanize(key)} [rewritten]: `, style: "label", highlight: true });
      lines.push({ text: `${value}\n`, style: "body", highlight: true });
      return;
    }
  }
  // Unchanged or no comparison data
  lines.push({ text: `${indent}${humanize(key)}: `, style: "label" });
  lines.push({ text: `${value}\n`, style: "body" });
}

/** Human-readable key: "SummaryBox" → "Summary Box" */
function humanize(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
}

function buildDocRequests(
  results: Record<string, unknown>,
  title: string,
  assetPaths: Set<string>,
  pass1Data: Record<string, unknown> | null,
): DocRequest[] {
  const lines: Line[] = [];

  lines.push({ text: title + "\n", style: "title" });
  lines.push({ text: `Generated: ${new Date().toLocaleString()}\n`, style: "body" });
  lines.push({ text: "\n", style: "spacer" });

  // --- Domain order ---
  const DOMAIN_ORDER = ["OVERVIEW", "CHARACTERS", "WORLD", "LORE", "FACTIONS", "STYLE", "TONE", "STORY"];
  const record = results as Record<string, any>;

  // Process domains in canonical order, then any extras
  const orderedKeys = [
    ...DOMAIN_ORDER.filter(d => d in record),
    ...Object.keys(record).filter(k => !DOMAIN_ORDER.includes(k)),
  ];

  for (const domain of orderedKeys) {
    const value = record[domain];
    if (!value || typeof value !== "object") continue;

    // ═══ DOMAIN HEADING ═══
    lines.push({ text: `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`, style: "body" });
    lines.push({ text: `${domain}\n`, style: "h1" });
    lines.push({ text: "\n", style: "spacer" });

    formatDomainContent(value as Record<string, unknown>, lines, assetPaths, domain, pass1Data);

    lines.push({ text: "\n", style: "spacer" });
  }

  // --- Build the insert + style requests ---
  const fullText = lines.map(l => l.text).join("");
  const requests: DocRequest[] = [];

  requests.push({
    insertText: {
      location: { index: 1 },
      text: fullText,
    },
  });

  // Apply styles
  let idx = 1;
  for (const line of lines) {
    const endIdx = idx + line.text.length;

    switch (line.style) {
      case "title":
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: idx, endIndex: endIdx },
            paragraphStyle: { namedStyleType: "TITLE" },
            fields: "namedStyleType",
          },
        });
        break;
      case "h1":
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: idx, endIndex: endIdx },
            paragraphStyle: { namedStyleType: "HEADING_1" },
            fields: "namedStyleType",
          },
        });
        break;
      case "h2":
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: idx, endIndex: endIdx },
            paragraphStyle: { namedStyleType: "HEADING_2" },
            fields: "namedStyleType",
          },
        });
        break;
      case "h3":
        requests.push({
          updateParagraphStyle: {
            range: { startIndex: idx, endIndex: endIdx },
            paragraphStyle: { namedStyleType: "HEADING_3" },
            fields: "namedStyleType",
          },
        });
        break;
      case "label":
        requests.push({
          updateTextStyle: {
            range: { startIndex: idx, endIndex: endIdx },
            textStyle: { bold: true },
            fields: "bold",
          },
        });
        break;
      case "separator":
        requests.push({
          updateTextStyle: {
            range: { startIndex: idx, endIndex: endIdx },
            textStyle: {
              foregroundColor: { color: { rgbColor: { red: 0.7, green: 0.7, blue: 0.7 } } },
              fontSize: { magnitude: 8, unit: "PT" },
            },
            fields: "foregroundColor,fontSize",
          },
        });
        break;
    }

    // Green background for Pass 2 prose changes
    if (line.highlight) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: idx, endIndex: endIdx },
          textStyle: {
            backgroundColor: { color: { rgbColor: { red: 0.82, green: 0.94, blue: 0.82 } } },
          },
          fields: "backgroundColor",
        },
      });
    }

    idx = endIdx;
  }

  return requests;
}

/** Format the contents of a single domain */
function formatDomainContent(data: Record<string, unknown>, lines: Line[], assetPaths: Set<string>, parentPath: string, pass1Data: Record<string, unknown> | null) {
  // Separate scalar fields from object/array-of-objects fields
  const scalarFields: [string, unknown][] = [];
  const objectArrayFields: [string, unknown[]][] = [];
  const nestedObjects: [string, Record<string, unknown>][] = [];

  for (const [key, value] of Object.entries(data)) {
    if (shouldSkipKey(key, `${parentPath}.${key}`, assetPaths)) continue;
    if (value === null || value === undefined || value === "") continue;

    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      if (value.every(v => typeof v === "object" && v !== null && !Array.isArray(v))) {
        objectArrayFields.push([key, value as unknown[]]);
      } else if (value.every(v => typeof v === "string")) {
        scalarFields.push([key, value]);
      } else {
        objectArrayFields.push([key, value as unknown[]]);
      }
    } else if (typeof value === "object") {
      nestedObjects.push([key, value as Record<string, unknown>]);
    } else {
      scalarFields.push([key, value]);
    }
  }

  // 1) Scalar fields first (simple key: value)
  for (const [key, value] of scalarFields) {
    if (Array.isArray(value)) {
      lines.push({ text: `${humanize(key)}: `, style: "label" });
      lines.push({ text: `${(value as string[]).join(", ")}\n`, style: "body" });
    } else if (typeof value === "string") {
      emitStringField(key, value, `${parentPath}.${key}`, lines, pass1Data);
    } else {
      lines.push({ text: `${humanize(key)}: `, style: "label" });
      lines.push({ text: `${String(value)}\n`, style: "body" });
    }
  }

  if (scalarFields.length > 0 && (nestedObjects.length > 0 || objectArrayFields.length > 0)) {
    lines.push({ text: "\n", style: "spacer" });
  }

  // 2) Nested objects (e.g., Stage, AestheticLanguage)
  for (const [key, obj] of nestedObjects) {
    lines.push({ text: `${humanize(key)}\n`, style: "h2" });
    formatObjectFields(obj, lines, assetPaths, `${parentPath}.${key}`, pass1Data);
    lines.push({ text: "\n", style: "spacer" });
  }

  // 3) Arrays of objects (e.g., CharacterList, Locations, Episodes)
  for (const [key, arr] of objectArrayFields) {
    lines.push({ text: `${humanize(key)}\n`, style: "h2" });
    lines.push({ text: "\n", style: "spacer" });

    arr.forEach((item, i) => {
      if (typeof item !== "object" || item === null) {
        lines.push({ text: `• ${String(item)}\n`, style: "body" });
        return;
      }

      const obj = item as Record<string, unknown>;
      const name = findItemName(obj);
      const subtitle = findItemSubtitle(obj);

      // ─── Item heading with name or number ───
      const heading = name
        ? `${name}${subtitle ? ` — ${subtitle}` : ""}`
        : `#${i + 1}${subtitle ? ` — ${subtitle}` : ""}`;
      lines.push({ text: `${heading}\n`, style: "h3" });

      formatObjectFields(obj, lines, assetPaths, `${parentPath}.${key}.${i}`, pass1Data);

      // Separator between items
      if (i < arr.length - 1) {
        lines.push({ text: `──────────────────────────────────\n`, style: "separator" });
      }
    });

    lines.push({ text: "\n", style: "spacer" });
  }
}

/** Format the fields of a single object */
function formatObjectFields(obj: Record<string, unknown>, lines: Line[], assetPaths: Set<string>, parentPath: string, pass1Data: Record<string, unknown> | null) {
  for (const [key, value] of Object.entries(obj)) {
    const fieldPath = `${parentPath}.${key}`;
    if (shouldSkipKey(key, fieldPath, assetPaths)) continue;
    if (value === null || value === undefined || value === "") continue;

    // Skip name/role fields already used in heading
    const lk = key.toLowerCase();
    if (lk === "name" || lk === "roletype" || lk === "factionname" || lk === "entrytitle") continue;

    if (typeof value === "string") {
      emitStringField(key, value, fieldPath, lines, pass1Data);
    } else if (typeof value === "number" || typeof value === "boolean") {
      lines.push({ text: `${humanize(key)}: `, style: "label" });
      lines.push({ text: `${String(value)}\n`, style: "body" });
    } else if (Array.isArray(value)) {
      if (value.length === 0) continue;
      if (value.every(v => typeof v === "string")) {
        lines.push({ text: `${humanize(key)}: `, style: "label" });
        lines.push({ text: `${(value as string[]).join(", ")}\n`, style: "body" });
      } else if (value.every(v => typeof v === "object" && v !== null)) {
        // Nested array of objects (e.g., Relationships, Locations sub-items)
        lines.push({ text: `${humanize(key)}:\n`, style: "label" });
        value.forEach((sub, si) => {
          if (typeof sub === "object" && sub !== null) {
            const subObj = sub as Record<string, unknown>;
            const subName = findItemName(subObj);
            const subPath = `${fieldPath}.${si}`;
            if (subName) {
              lines.push({ text: `  • ${subName}: `, style: "label" });
              // Collect remaining fields inline
              const parts: string[] = [];
              for (const [sk, sv] of Object.entries(subObj)) {
                if (shouldSkipKey(sk, `${subPath}.${sk}`, assetPaths)) continue;
                if (sk.toLowerCase() === "name" || sk.toLowerCase() === "title") continue;
                if (sv === null || sv === undefined || sv === "") continue;
                if (typeof sv === "string") parts.push(sv);
                else if (Array.isArray(sv) && sv.every(x => typeof x === "string")) parts.push(sv.join(", "));
                else parts.push(String(sv));
              }
              lines.push({ text: `${parts.join(" — ")}\n`, style: "body" });
            } else {
              const flat = Object.entries(subObj)
                .filter(([k, v]) => !shouldSkipKey(k, `${subPath}.${k}`, assetPaths) && v !== null && v !== undefined && v !== "")
                .map(([k, v]) => `${humanize(k)}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                .join(" | ");
              lines.push({ text: `  • ${flat}\n`, style: "body" });
            }
          } else {
            lines.push({ text: `  • ${String(sub)}\n`, style: "body" });
          }
        });
      }
    } else if (typeof value === "object") {
      // Nested object
      const subObj = value as Record<string, unknown>;
      const subEntries = Object.entries(subObj).filter(
        ([k, v]) => !shouldSkipKey(k, `${fieldPath}.${k}`, assetPaths) && v !== null && v !== undefined && v !== ""
      );
      if (subEntries.length === 0) continue;

      lines.push({ text: `${humanize(key)}:\n`, style: "label" });
      for (const [sk, sv] of subEntries) {
        if (typeof sv === "string") {
          emitStringField(sk, sv, `${fieldPath}.${sk}`, lines, pass1Data, "  ");
        } else if (Array.isArray(sv) && sv.every(x => typeof x === "string")) {
          lines.push({ text: `  ${humanize(sk)}: ${(sv as string[]).join(", ")}\n`, style: "body" });
        } else if (typeof sv === "number" || typeof sv === "boolean") {
          lines.push({ text: `  ${humanize(sk)}: ${String(sv)}\n`, style: "body" });
        } else if (typeof sv === "object" && sv !== null) {
          lines.push({ text: `  ${humanize(sk)}: ${JSON.stringify(sv)}\n`, style: "body" });
        }
      }
    }
  }
}
