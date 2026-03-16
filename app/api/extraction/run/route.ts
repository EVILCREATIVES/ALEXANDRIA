import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

export const runtime = "nodejs";
export const maxDuration = 800; // Vercel Pro max — streaming keeps connection alive

/** Hard-close the stream 30 s before Vercel kills the function */
const SAFETY_MARGIN_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 15_000; // keep SSE connection alive while waiting for the first AI chunk

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const CLAUDE_AI_KEY = process.env.CLAUDE_AI_KEY || "";

// Allowed models
const GEMINI_MODELS = [
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
] as const;

const OPENAI_MODELS = [
  "o3-mini",
  "gpt-5.2",
] as const;

const CLAUDE_MODELS = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
] as const;

const ALL_MODELS = [...GEMINI_MODELS, ...OPENAI_MODELS, ...CLAUDE_MODELS] as const;
type ModelType = typeof ALL_MODELS[number];

const DEFAULT_MODEL = "gemini-3-pro-preview";

/**
 * Run a schema test against source text using the V4 schema.
 * Uses Server-Sent Events (SSE) streaming so Vercel's idle timeout
 * resets with every chunk — no more 300s wall-clock deaths.
 *
 * Stream protocol:
 *   data: {"type":"chunk","text":"..."}\n\n     — partial token
 *   data: {"type":"done","results":{...}}\n\n   — final parsed JSON
 *   data: {"type":"error","error":"..."}\n\n    — fatal error
 */
export async function POST(req: NextRequest) {
  // --- Validate inputs (non-streaming errors returned as normal JSON) ---
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body" }, { status: 400 });
  }

  const { sourceText, schemaJson, metadata, model: requestedModel, promptTemplate, domains, mode, canonJson, temperature: requestedTemperature } = body as {
    sourceText?: string; schemaJson?: string; metadata?: Record<string, string>;
    model?: string; promptTemplate?: string; domains?: string[];
    mode?: "extract" | "synthesize" | "single"; canonJson?: string;
    temperature?: number;
  };

  const runMode = mode || "single";
  // Clamp temperature to [0, 1]; default varies by mode
  const defaultTemp = runMode === "extract" ? 0.2 : runMode === "synthesize" ? 0.4 : 0.3;
  const temperature = (typeof requestedTemperature === "number" && requestedTemperature >= 0 && requestedTemperature <= 1)
    ? requestedTemperature
    : defaultTemp;

  /** Which domains to extract (default: all 8) */
  const ALL_DOMAINS = ["OVERVIEW", "CHARACTERS", "WORLD", "LORE", "FACTIONS", "STYLE", "TONE", "STORY"];
  const requestedDomains: string[] = (domains && Array.isArray(domains) && domains.length > 0)
    ? domains.map(d => d.toUpperCase()).filter(d => ALL_DOMAINS.includes(d))
    : ALL_DOMAINS;
  const isDomainSubset = requestedDomains.length < ALL_DOMAINS.length;

  // --- Mode-specific validation ---
  if (runMode === "synthesize") {
    // Synthesis mode: needs canonJson + promptTemplate
    if (!canonJson || typeof canonJson !== "string") {
      return NextResponse.json({ ok: false, error: "Missing canonJson for synthesis mode" }, { status: 400 });
    }
    if (!promptTemplate || typeof promptTemplate !== "string" || !promptTemplate.trim()) {
      return NextResponse.json({ ok: false, error: "Missing synthesis promptTemplate" }, { status: 400 });
    }
  } else {
    // Extract or single mode: needs sourceText + schemaJson + promptTemplate
    if (!sourceText || typeof sourceText !== "string") {
      return NextResponse.json({ ok: false, error: "Missing sourceText" }, { status: 400 });
    }
    if (!schemaJson || typeof schemaJson !== "string") {
      return NextResponse.json({ ok: false, error: "Missing schemaJson" }, { status: 400 });
    }
    if (!promptTemplate || typeof promptTemplate !== "string" || !promptTemplate.trim()) {
      return NextResponse.json({ ok: false, error: "Missing promptTemplate — configure it in the Prompt settings tab" }, { status: 400 });
    }
  }

  let schemaDefinition: unknown = null;
  if (schemaJson) {
    try {
      schemaDefinition = JSON.parse(schemaJson);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid schemaJson - must be valid JSON" }, { status: 400 });
    }
  }

  const metadataContext = metadata ? buildMetadataContext(metadata, requestedDomains) : "";

  const selectedModel: ModelType = (requestedModel && ALL_MODELS.includes(requestedModel as ModelType))
    ? requestedModel as ModelType
    : DEFAULT_MODEL;

  // --- Build the prompt based on mode ---
  let prompt: string;
  let systemMessage: string;
  let prosePathsForClient: string[] = [];

  if (runMode === "synthesize") {
    // Synthesis mode: inject canon JSON into the synthesis prompt
    // When domains param is provided, scope output to those domains only
    const synthDomainFilter = isDomainSubset
      ? `\n\n## DOMAIN SCOPE — IMPORTANT\nOnly rewrite prose fields for the following domain(s): ${requestedDomains.join(", ")}.  ` +
        `You are given the FULL extracted canon for cross-domain context, but your flat-map output must ONLY contain keys starting with: ${requestedDomains.join(", ")}. ` +
        `Do NOT output fields from other domains.\n`
      : "";

    // --- Prose-field scoping: only rewrite L2_LONG and L2_MED fields ---
    // Read limitKey annotations directly from the domain template metadata (TS files)
    // which are the single source of truth for field length classes.
    let proseFieldHint = "";
    const proseTargets = new Set(["L2_LONG", "L2_MED"]);
    const prosePaths = metadata
      ? extractProseFieldPathsFromMetadata(metadata, proseTargets)
      : [];
    if (prosePaths.length > 0) {
      // When running a domain subset, filter paths to requested domains
      const relevantPaths = isDomainSubset
        ? prosePaths.filter(p => requestedDomains.some(d => p.toUpperCase().startsWith(d)))
        : prosePaths;
      prosePathsForClient = relevantPaths;
      if (relevantPaths.length > 0) {
        proseFieldHint = `\n\n## PROSE FIELDS TO REWRITE — ${relevantPaths.length} FIELD PATHS (EVERY ONE IS MANDATORY)\n` +
          `You MUST output a rewritten value for ALL ${relevantPaths.length} paths below. Do NOT skip any.\n` +
          `For paths containing [], you MUST output one key per array element using zero-based indices.\n` +
          `Example: if CharacterList has 3 entries and "CHARACTERS.CharacterList[].SummaryBox" is listed,\n` +
          `output: "CHARACTERS.CharacterList[0].SummaryBox", "CHARACTERS.CharacterList[1].SummaryBox", "CHARACTERS.CharacterList[2].SummaryBox"\n\n` +
          relevantPaths.map((p, i) => `${i + 1}. ${p}`).join("\n") + "\n\n" +
          `COMPLETENESS CHECK: Count the keys in your flat-map output. It must cover every array element for every path above.\n`;
      }
    }

    // --- Strip stale "FINAL INSTRUCTION" blocks from saved prompts that
    // told the model to rewrite everything.  The "TARGET PROSE FIELDS"
    // section is left intact — it carries per-field writing guidance. ---
    let cleanedPrompt = (promptTemplate || "");
    cleanedPrompt = cleanedPrompt.replace(
      /## FINAL INSTRUCTION[\s\S]*?(?={{CANON_JSON}}|$)/i,
      ""
    );

    // Insert prose field list + domain filter BEFORE the canon JSON so the
    // model sees what to rewrite before it reads the data (better attention).
    prompt = cleanedPrompt
      .replace("{{CANON_JSON}}", (proseFieldHint + synthDomainFilter + "\n" + (canonJson || "{}")));
    systemMessage = "You are an expert narrative-schema writer and narrative designer. Return ONLY valid JSON — a FLAT object mapping dot-path field names to rewritten prose strings. " +
      "Do NOT return the full canon JSON structure. Output ONLY the fields listed in 'PROSE FIELDS TO REWRITE' as a flat key→value map. " +
      `There are ${prosePathsForClient.length || 'multiple'} field paths to rewrite — expand arrays with zero-based indices and rewrite ALL instances. ` +
      "Even if a field already looks adequate or short, you MUST rewrite it with richer, publication-ready prose. " +
      "ZERO-HALLUCINATION RULE: You may ONLY use facts already present in the input JSON. NEVER invent, infer, or speculate. " +
      "If the input is sparse, write shorter — a brief truthful passage is always better than a longer fabricated one.";
  } else {
    // Extract or single mode: original behavior
    // When processing a domain subset we inject an extra instruction so the
    // model only outputs the requested domains, dramatically reducing output
    // tokens and latency.
    const domainReminders: Record<string, string> = {
      STORY: "\nREMINDER — EPISODE COMPLETENESS (MANDATORY):\nStep 1: Count how many distinct episodes, chapters, or installments appear in the source material.\nStep 2: Create EXACTLY that many Episode objects in EpisodePack.Episode[].\nStep 3: For EACH Episode, populate KeyCharacters[], KeyLocations[], and LoreDependencies[]. NEVER leave these arrays empty.\nThe Episode array in the template is a PATTERN showing the shape of ONE entry. You MUST repeat that shape for EVERY episode in the source.\nIf source has 9 episodes → output 9. If source has 4 → output 4. NEVER truncate to 1 or 2.\n",
      WORLD: "\nREMINDER — WORLD COMPLETENESS: You MUST include the Stage object (the primary macro setting). You MUST include EVERY distinct location from the source in the Locations[] array. Do NOT skip locations or abbreviate the array.\n",
      CHARACTERS: "\nREMINDER — CHARACTER COMPLETENESS: CharacterList[] MUST contain EVERY character from the source material. Do NOT stop at 2–3 characters. Sort by: lead → antagonist → supporting → background_recurring.\n",
    };

    // Always inject episode reminder — not just for domain subsets
    const includesStory = requestedDomains.includes("STORY") || !isDomainSubset;
    const episodeReminder = includesStory ? domainReminders.STORY : "";

    const domainFilter = isDomainSubset
      ? `\n\n## DOMAIN SCOPE — IMPORTANT\nOnly output the following domain(s): ${requestedDomains.join(", ")}.  ` +
        `Return a JSON object with "version": 4 and ONLY the keys: ${requestedDomains.map(d => `"${d}"`).join(", ")}. ` +
        `Do NOT output any other domains. Keep the same field structure shown in the schema for the requested domain(s).\n` +
        requestedDomains.map(d => domainReminders[d] || "").join("")
      : episodeReminder;

    const schemaJsonForPrompt = isDomainSubset
      ? filterSchemaToDomainsJson(schemaDefinition, requestedDomains)
      : JSON.stringify(schemaDefinition, null, 2);

    const promptWithPlaceholders = ((promptTemplate || "") + domainFilter)
      .replace("{{SCHEMA_JSON}}", schemaJsonForPrompt)
      .replace("{{METADATA_CONTEXT}}", metadataContext)
      .replaceAll("{{SOURCE_TEXT}}", "(source text appended at end)");

    prompt = `${promptWithPlaceholders}\n\n## SOURCE MATERIAL TO ANALYZE (FULL TEXT — DO NOT SKIP ANY PART):\n${sourceText}`;
    systemMessage = "You are an expert narrative-schema creator. Return ONLY valid JSON. CRITICAL: you MUST output EVERY item for every array — every character, every location, every episode, every arc, every beat. The JSON template shows 1 example item per array as a PATTERN; you must fill ALL items from the source. If the source has 9 episodes, output 9 Episode objects. Do NOT abbreviate or summarize arrays to fewer items than exist in the source material. For EVERY Episode in EpisodePack, you MUST fill KeyCharacters[], KeyLocations[], and LoreDependencies[] — never leave these empty for any episode.";
  }

  // --- SSE streaming response ---
  const encoder = new TextEncoder();
  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };

      // Heartbeat keeps the SSE connection alive while waiting for the
      // first AI token (Vercel's idle-timeout is 300 s, but proxies can
      // be stricter).
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, HEARTBEAT_INTERVAL_MS);

      // AbortController lets us cancel the AI call if we run out of time
      const abort = new AbortController();

      // Safety timer: close gracefully before Vercel's hard kill
      const safetyTimer = setTimeout(() => {
        abort.abort();
        send({ type: "error", error: "Approaching Vercel timeout — stream closed to preserve partial results. Try a smaller source text or a faster model." });
        controller.close();
      }, maxDuration * 1000 - SAFETY_MARGIN_MS);

      try {
        let fullText = "";
        // Token usage tracking
        let inputTokens = 0;
        let outputTokens = 0;

        if (OPENAI_MODELS.includes(selectedModel as typeof OPENAI_MODELS[number])) {
          // ---- OpenAI streaming ----
          if (!OPENAI_API_KEY) { send({ type: "error", error: "OPENAI_API_KEY not configured" }); controller.close(); return; }

          const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
          const streamResponse = await openai.chat.completions.create({
            model: selectedModel,
            messages: [
              { role: "system", content: systemMessage },
              { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            max_completion_tokens: 65536,
            temperature,
            stream: true,
            stream_options: { include_usage: true },
          }, { signal: abort.signal });

          for await (const chunk of streamResponse) {
            if (abort.signal.aborted) break;
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              fullText += delta;
              send({ type: "chunk", text: delta });
            }
            // Capture usage from the final chunk
            if (chunk.usage) {
              inputTokens = chunk.usage.prompt_tokens || 0;
              outputTokens = chunk.usage.completion_tokens || 0;
            }
            // Check for finish
            const finishReason = chunk.choices?.[0]?.finish_reason;
            if (finishReason === "length") {
              send({ type: "error", error: "OpenAI response was truncated (hit token limit). The schema output is too large." });
              controller.close();
              return;
            }
          }
        } else if (CLAUDE_MODELS.includes(selectedModel as typeof CLAUDE_MODELS[number])) {
          // ---- Anthropic Claude streaming ----
          if (!CLAUDE_AI_KEY) { send({ type: "error", error: "CLAUDE_AI_KEY not configured" }); controller.close(); return; }

          // Opus 4.6 supports 128K output; Sonnet 4.6 supports 64K
          const claudeMaxTokens = selectedModel.includes("opus") ? 128000 : 64000;

          const claudeRequestBody = JSON.stringify({
            model: selectedModel,
            max_tokens: claudeMaxTokens,
            stream: true,
            temperature,
            system: systemMessage,
            messages: [
              { role: "user", content: prompt }
            ],
          });

          // Retry loop for 429 rate limit errors (up to 5 retries with longer exponential backoff)
          let anthRes: Response | null = null;
          for (let attempt = 0; attempt <= 5; attempt++) {
            anthRes = await fetch("https://api.anthropic.com/v1/messages", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": CLAUDE_AI_KEY,
                "anthropic-version": "2023-06-01",
                "anthropic-beta": "context-1m-2025-08-07",
              },
              body: claudeRequestBody,
              signal: abort.signal,
            });

            if (anthRes.status === 429 && attempt < 5) {
              const retryAfter = anthRes.headers.get("retry-after");
              const delay = retryAfter ? Math.min(parseInt(retryAfter, 10) * 1000, 120000) : Math.min(10000 * Math.pow(2, attempt), 120000);
              send({ type: "chunk", text: `\n[Rate limited — retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/5)...]\n` });
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
            break;
          }

          if (!anthRes || !anthRes.ok) {
            const errText = anthRes ? await anthRes.text().catch(() => "") : "No response";
            send({ type: "error", error: `Claude API error ${anthRes?.status || "?"}: ${errText.slice(0, 300)}` });
            controller.close();
            return;
          }

          const reader = anthRes.body?.getReader();
          if (!reader) {
            send({ type: "error", error: "Claude response body missing" });
            controller.close();
            return;
          }

          const decoder = new TextDecoder();
          let buffer = "";

          // Helper: parse all SSE events from a buffer string
          function processClaudeEvents(raw: string) {
            const events = raw.split("\n\n");
            // The last element might be incomplete — return it as leftover
            const leftover = events.pop() || "";

            for (const event of events) {
              const lines = event.split("\n");
              for (const line of lines) {
                if (!line.startsWith("data:") && !line.startsWith("data :")) continue;
                const json = line.replace(/^data:\s*/, "").trim();
                if (!json || json === "[DONE]") continue;

                let msg: Record<string, unknown>;
                try {
                  msg = JSON.parse(json);
                } catch {
                  continue;
                }

                if (msg.type === "message_start") {
                  const message = msg.message as Record<string, unknown> | undefined;
                  const usage = message?.usage as { input_tokens?: number } | undefined;
                  if (usage?.input_tokens) {
                    inputTokens = usage.input_tokens;
                    console.log(`[claude-stream] message_start: input_tokens=${inputTokens}`);
                  }
                } else if (msg.type === "content_block_delta") {
                  const delta = msg.delta as { type?: string; text?: string } | undefined;
                  const text = (delta?.type === "text_delta") ? (delta.text || "") : "";
                  if (text) {
                    fullText += text;
                    send({ type: "chunk", text });
                  }
                } else if (msg.type === "message_delta") {
                  const usage = msg.usage as { output_tokens?: number } | undefined;
                  if (usage?.output_tokens) {
                    outputTokens = usage.output_tokens;
                    console.log(`[claude-stream] message_delta: output_tokens=${outputTokens}`);
                  }
                } else if (msg.type === "error") {
                  const err = msg.error as { message?: string } | undefined;
                  throw new Error(err?.message || "Claude streaming error");
                }
              }
            }
            return leftover;
          }

          while (true) {
            if (abort.signal.aborted) break;
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            buffer = processClaudeEvents(buffer);
          }

          // Drain any remaining buffer after stream closes
          // (message_delta with output_tokens is often in the final chunk)
          if (buffer.trim()) {
            // Ensure trailing \n\n so the last event gets parsed
            processClaudeEvents(buffer + "\n\n");
          }

          console.log(`[claude-stream] Final token counts: input=${inputTokens}, output=${outputTokens}`);
        } else {
          // ---- Gemini streaming (with retry) ----
          if (!GEMINI_API_KEY) { send({ type: "error", error: "GEMINI_API_KEY not configured" }); controller.close(); return; }

          const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
          const model = genAI.getGenerativeModel(
            {
              model: selectedModel,
              systemInstruction: systemMessage,
              generationConfig: {
                responseMimeType: "application/json",
                maxOutputTokens: 65536,
                temperature,
              }
            },
            { timeout: maxDuration * 1000 - SAFETY_MARGIN_MS } // match Vercel function limit (800s minus 30s safety)
          );

          // Retry loop for transient fetch failures (up to 3 retries with exponential backoff)
          const MAX_GEMINI_RETRIES = 3;
          let lastGeminiError: unknown = null;
          let geminiStreamDone = false;

          for (let attempt = 0; attempt <= MAX_GEMINI_RETRIES; attempt++) {
            if (abort.signal.aborted) break;
            try {
              const result = await model.generateContentStream(prompt);

              for await (const chunk of result.stream) {
                if (abort.signal.aborted) break;
                const chunkText = chunk.text();
                if (chunkText) {
                  fullText += chunkText;
                  send({ type: "chunk", text: chunkText });
                }
                // Capture usage metadata from Gemini chunks (may only appear on last chunk)
                const um = chunk.usageMetadata;
                if (um) {
                  if (um.promptTokenCount) inputTokens = um.promptTokenCount;
                  if (um.candidatesTokenCount) outputTokens = um.candidatesTokenCount;
                }
              }

              // Aggregated response always has usage metadata (fallback if chunks didn't)
              try {
                const aggResponse = await result.response;
                const um = aggResponse.usageMetadata;
                if (um) {
                  if (um.promptTokenCount) inputTokens = um.promptTokenCount;
                  if (um.candidatesTokenCount) outputTokens = um.candidatesTokenCount;
                }
              } catch { /* stream may already be consumed */ }

              geminiStreamDone = true;
              break; // success — exit retry loop
            } catch (geminiErr: unknown) {
              lastGeminiError = geminiErr;
              const errMsg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
              const isRetryable = /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network|503|429|unavailable/i.test(errMsg);

              if (!isRetryable || attempt >= MAX_GEMINI_RETRIES || abort.signal.aborted) {
                throw geminiErr; // non-retryable or exhausted retries — bubble up
              }

              // Reset accumulated text for retry (we start fresh)
              fullText = "";
              const delay = Math.min(5000 * Math.pow(2, attempt), 30000);
              console.warn(`[gemini-stream] Attempt ${attempt + 1}/${MAX_GEMINI_RETRIES + 1} failed: ${errMsg}. Retrying in ${delay}ms…`);
              send({ type: "chunk", text: `\n[Gemini connection error — retrying in ${Math.round(delay / 1000)}s (attempt ${attempt + 1}/${MAX_GEMINI_RETRIES})…]\n` });
              await new Promise(r => setTimeout(r, delay));
            }
          }

          if (!geminiStreamDone && !abort.signal.aborted) {
            const errMsg = lastGeminiError instanceof Error ? lastGeminiError.message : String(lastGeminiError);
            throw new Error(`Gemini streaming failed after ${MAX_GEMINI_RETRIES + 1} attempts: ${errMsg}`);
          }
        }

        // --- Post-process the accumulated text ---
        let cleanedText = fullText.trim();
        if (cleanedText.startsWith("```json")) cleanedText = cleanedText.slice(7);
        else if (cleanedText.startsWith("```")) cleanedText = cleanedText.slice(3);
        if (cleanedText.endsWith("```")) cleanedText = cleanedText.slice(0, -3);
        cleanedText = cleanedText.trim();

        let parsedResults: Record<string, unknown>;
        try {
          parsedResults = JSON.parse(cleanedText);
        } catch {
          // --- Attempt JSON repair ---
          const repaired = repairJson(cleanedText);
          try {
            parsedResults = JSON.parse(repaired);
          } catch {
            send({ type: "done", results: { _rawText: cleanedText, _parseError: "Failed to parse AI response as JSON" } });
            controller.close();
            return;
          }
        }

        // --- Synthesis mode: the model returns a flat prose-field map.
        // Merge those values back into the original canon JSON. ---
        if (runMode === "synthesize" && canonJson) {
          // Detect flat-map output: keys look like "OVERVIEW.Synopsis" or
          // "CHARACTERS.CharacterList[0].SummaryBox" (contain dots).
          const keys = Object.keys(parsedResults);
          const looksLikeFlatMap = keys.length > 0 && keys.some(k => k.includes("."));
          if (looksLikeFlatMap) {
            try {
              const originalCanon = JSON.parse(canonJson);
              parsedResults = mergeProseFieldsIntoCanon(
                originalCanon,
                parsedResults as Record<string, string>
              );
              console.log(`[extraction] Merged ${keys.length} prose fields into canon JSON`);

              // When running a domain subset, only return the requested domains
              // so parallel groups don't clobber each other via Object.assign
              // on the client (each group's merge contains the full canon, but
              // only its own domains have synthesized prose).
              if (isDomainSubset && requestedDomains.length > 0) {
                const scoped: Record<string, unknown> = {};
                if (parsedResults.version !== undefined) scoped.version = parsedResults.version;
                for (const d of requestedDomains) {
                  if (d in parsedResults) scoped[d] = parsedResults[d];
                }
                parsedResults = scoped;
              }
            } catch (mergeErr) {
              console.error("[extraction] Failed to merge prose fields:", mergeErr);
              // Fall through — send whatever we got
            }
          }
        }

        // --- Auto-wrap: if running a domain subset and the expected domain
        // key is missing, the AI returned the fields at the top level.
        // Wrap them under the domain key so they merge correctly. ---
        if (isDomainSubset && requestedDomains.length === 1) {
          const expectedDomain = requestedDomains[0];
          if (!(expectedDomain in parsedResults)) {
            // Check if the result has fields that don't look like domain keys
            const domainSet = new Set(["OVERVIEW", "CHARACTERS", "WORLD", "LORE", "FACTIONS", "STYLE", "TONE", "STORY"]);
            const nonMetaKeys = Object.keys(parsedResults).filter(k => k !== "version" && !k.startsWith("_"));
            const hasNoDomainKeys = nonMetaKeys.length > 0 && nonMetaKeys.every(k => !domainSet.has(k));
            if (hasNoDomainKeys) {
              // Strip version/meta from inner, keep it at top
              const inner = { ...parsedResults };
              delete inner.version;
              parsedResults = { version: parsedResults.version ?? 4, [expectedDomain]: inner };
            }
          }
        }

        // --- Safety: ensure all requested domains are present as keys.
        // For multi-domain groups the AI might occasionally return some
        // domains under slightly different casing. Normalise to match. ---
        if (isDomainSubset && requestedDomains.length > 1) {
          const resultKeys = new Set(Object.keys(parsedResults).map(k => k.toUpperCase()));
          for (const d of requestedDomains) {
            if (!resultKeys.has(d)) {
              // Try case-insensitive match
              const match = Object.keys(parsedResults).find(k => k.toUpperCase() === d);
              if (match && match !== d) {
                parsedResults[d] = parsedResults[match];
                delete parsedResults[match];
              }
            }
          }
        }

        markImagesAsSkipped(parsedResults, schemaDefinition ? buildAssetPaths(schemaDefinition as Record<string, unknown>) : new Set<string>());
        const usage = (inputTokens || outputTokens) ? { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens } : undefined;
        if (usage) console.log(`[extraction] Token usage — model: ${selectedModel}, input: ${inputTokens.toLocaleString()}, output: ${outputTokens.toLocaleString()}, total: ${usage.totalTokens.toLocaleString()}`);
        send({ type: "done", results: parsedResults, domains: requestedDomains, ...(prosePathsForClient.length > 0 && { prosePaths: prosePathsForClient }), ...(usage && { usage }) });
      } catch (err) {
        if (!abort.signal.aborted) {
          console.error("Schema test streaming error:", err);
          send({ type: "error", error: err instanceof Error ? err.message : String(err) });
        }
      } finally {
        clearInterval(heartbeat);
        clearTimeout(safetyTimer);
        try { controller.close(); } catch { /* already closed by safety timer */ }
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Build context from metadata domain files.
 * When `scopeDomains` is provided, only include metadata for those domains
 * and skip the global metadataMain to avoid redundancy (domain-specific files
 * already carry per-field definitions with constraints and AI instructions).
 */
function buildMetadataContext(metadata: Record<string, string>, scopeDomains?: string[]): string {
  const sections: string[] = [];

  // Include global metadata only when running ALL domains (no scope filter).
  // For domain-grouped requests, the per-domain sections below already
  // contain the field-level constraints, so metadataMain is redundant.
  if (metadata.metadataMain && !scopeDomains) {
    sections.push(`## FIELD METADATA (defines field types, constraints, AI instructions):\n${extractMetadataInfo(metadata.metadataMain)}`);
  }

  const domains = ["overview", "characters", "factions", "world", "lore", "tone", "style", "story"];
  for (const domain of domains) {
    if (scopeDomains && !scopeDomains.includes(domain.toUpperCase())) continue;
    if (metadata[domain]) {
      sections.push(`## ${domain.toUpperCase()} DOMAIN FIELDS:\n${extractMetadataInfo(metadata[domain])}`);
    }
  }

  return sections.length > 0 ? `\n${sections.join("\n\n")}\n` : "";
}

/**
 * Return JSON string of schema filtered to only the requested domains.
 * Keeps top-level non-domain keys (schemaId, version, uiRendering, etc.)
 * but strips field definitions for domains outside the requested set.
 * Also resolves $ref references inline so the AI model doesn't need to
 * dereference JSON Schema pointers.
 */

/**
 * Merge a flat prose-field map (dot-path → value) into a full canon JSON object.
 *
 * Supports paths like:
 *   "OVERVIEW.Synopsis"                              → canon.OVERVIEW.Synopsis
 *   "CHARACTERS.CharacterList[0].SummaryBox"        → canon.CHARACTERS.CharacterList[0].SummaryBox
 *   "WORLD.Locations[2].SummaryBox"                 → canon.WORLD.Locations[2].SummaryBox
 *
 * If a path points to a location that doesn't exist (e.g. index out of range),
 * the entry is silently skipped.
 */
function mergeProseFieldsIntoCanon(
  canon: Record<string, unknown>,
  proseMap: Record<string, string>
): Record<string, unknown> {
  const merged = JSON.parse(JSON.stringify(canon)); // deep clone

  for (const [dotPath, value] of Object.entries(proseMap)) {
    if (typeof value !== "string") continue;

    // Parse the dot-path into segments:  "CHARACTERS.CharacterList[0].SummaryBox"
    // → ["CHARACTERS", "CharacterList", 0, "SummaryBox"]
    const segments: (string | number)[] = [];
    for (const part of dotPath.split(".")) {
      // Handle array indices: "CharacterList[0]" → "CharacterList", 0
      const arrMatch = part.match(/^([A-Za-z_]+)\[(\d+)\]$/);
      if (arrMatch) {
        segments.push(arrMatch[1], parseInt(arrMatch[2], 10));
      } else {
        segments.push(part);
      }
    }

    // Walk the object tree and set the value
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cursor: any = merged;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (cursor == null || typeof cursor !== "object") { cursor = null; break; }
      cursor = (cursor as Record<string, unknown>)[seg as string] ?? (cursor as unknown[])[seg as number];
    }
    if (cursor != null && typeof cursor === "object") {
      const lastSeg = segments[segments.length - 1];
      (cursor as Record<string, unknown>)[lastSeg as string] = value;
    }
  }

  return merged;
}

/**
 * Parse domain template metadata (TS source strings) to find field paths
 * whose `limitKey` matches one of the target length classes (e.g. "L2_LONG", "L2_MED").
 *
 * The domain template files use this format:
 *   "OVERVIEW.Synopsis": { limitKey: "L2_LONG", ... }
 *   "CHARACTERS.CharacterList[].SummaryBox": { limitKey: "L2_LONG", ... }
 *
 * This is the authoritative source of truth — no schema-template.json needed.
 */
function extractProseFieldPathsFromMetadata(
  metadata: Record<string, string>,
  targets: Set<string>
): string[] {
  const paths: string[] = [];
  const domainKeys = ["overview", "characters", "world", "lore", "factions", "style", "tone", "story"];

  for (const key of domainKeys) {
    const content = metadata[key];
    if (!content) continue;

    // Parse each entry: track current field path, then match its limitKey
    let currentPath: string | null = null;

    // Find all "DOMAIN.Field": { ... limitKey: "X" } pairs by scanning line-by-line
    const lines = content.split("\n");
    for (const line of lines) {
      // Match field path declarations like: "OVERVIEW.Synopsis": {
      const pathMatch = line.match(/^\s*"([A-Z][A-Za-z]+(?:\[\])?(?:\.[A-Za-z]+(?:\[\])?)*)"\s*:\s*\{/);
      if (pathMatch) {
        currentPath = pathMatch[1];
      }
      // Match limitKey within current field block
      const limitMatch = line.match(/limitKey:\s*"(L[0-9]_[A-Z]+)"/);
      if (limitMatch && currentPath && targets.has(limitMatch[1])) {
        paths.push(currentPath);
        currentPath = null; // consumed
      }
      // Reset on closing brace (end of field block)
      if (line.match(/^\s*\},?\s*$/) && currentPath) {
        currentPath = null;
      }
    }
  }

  return paths;
}

function filterSchemaToDomainsJson(schema: unknown, domains: string[]): string {
  if (!schema || typeof schema !== "object") return JSON.stringify(schema, null, 2);
  const s = schema as Record<string, unknown>;
  const filtered: Record<string, unknown> = {};
  const domainSet = new Set(domains.map(d => d.toUpperCase()));
  const allDomains = new Set(["OVERVIEW", "CHARACTERS", "WORLD", "LORE", "FACTIONS", "STYLE", "TONE", "STORY"]);
  for (const [key, value] of Object.entries(s)) {
    // Keep the key if it's a requested domain OR if it's not a domain key at all
    if (domainSet.has(key.toUpperCase()) || !allDomains.has(key.toUpperCase())) {
      filtered[key] = value;
    }
  }
  // Resolve $ref references so models see flat definitions
  const definitions = (s.definitions || s.$defs) as Record<string, unknown> | undefined;
  if (definitions) {
    const resolved = JSON.parse(JSON.stringify(filtered));
    resolveRefs(resolved, definitions);
    return JSON.stringify(resolved, null, 2);
  }
  return JSON.stringify(filtered, null, 2);
}

/**
 * Recursively resolve {"$ref": "#/definitions/Foo"} inline using the definitions map.
 * Mutates the object in place. Handles circular refs by capping depth.
 */
function resolveRefs(obj: unknown, definitions: Record<string, unknown>, depth = 0): void {
  if (!obj || typeof obj !== "object" || depth > 10) return;
  if (Array.isArray(obj)) {
    for (const item of obj) resolveRefs(item, definitions, depth);
    return;
  }
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const val = record[key];
    if (val && typeof val === "object") {
      if (Array.isArray(val)) {
        // Resolve refs inside array items (e.g. "items": {"$ref": "..."})
        for (const item of val) resolveRefs(item, definitions, depth);
      } else {
        const ref = (val as Record<string, unknown>)["$ref"];
        if (typeof ref === "string" && ref.startsWith("#/definitions/")) {
          const defName = ref.replace("#/definitions/", "");
          const def = definitions[defName];
          if (def && typeof def === "object") {
            record[key] = JSON.parse(JSON.stringify(def));
            resolveRefs(record[key], definitions, depth + 1);
          }
        } else {
          // Check for oneOf/anyOf arrays that might contain $refs
          const oneOf = (val as Record<string, unknown>)["oneOf"] || (val as Record<string, unknown>)["anyOf"];
          if (Array.isArray(oneOf)) {
            for (let i = 0; i < oneOf.length; i++) {
              const item = oneOf[i] as Record<string, unknown>;
              if (item && item["$ref"] && typeof item["$ref"] === "string" && (item["$ref"] as string).startsWith("#/definitions/")) {
                const defName = (item["$ref"] as string).replace("#/definitions/", "");
                const def = definitions[defName];
                if (def && typeof def === "object") {
                  oneOf[i] = JSON.parse(JSON.stringify(def));
                  resolveRefs(oneOf[i], definitions, depth + 1);
                }
              }
            }
          }
          // Also resolve "items": {"$ref": "..."}
          const items = (val as Record<string, unknown>)["items"];
          if (items && typeof items === "object" && !Array.isArray(items)) {
            const itemRef = (items as Record<string, unknown>)["$ref"];
            if (typeof itemRef === "string" && itemRef.startsWith("#/definitions/")) {
              const defName = itemRef.replace("#/definitions/", "");
              const def = definitions[defName];
              if (def && typeof def === "object") {
                (val as Record<string, unknown>)["items"] = JSON.parse(JSON.stringify(def));
                resolveRefs((val as Record<string, unknown>)["items"], definitions, depth + 1);
              }
            }
          }
          resolveRefs(val, definitions, depth);
        }
      }
    }
  }
}

/**
 * Extract useful metadata from TypeScript field definitions
 */
function extractMetadataInfo(content: string): string {
  // Extract field definitions - simplified for prompt context
  const fieldMatches = content.match(/"[^"]+"\s*:\s*\{[^}]+\}/g);
  if (!fieldMatches) return content.slice(0, 20000);
  
  // Include all fields, cap at 20000 chars to fit in context
  return fieldMatches.join("\n").slice(0, 20000);
}

/**
 * Walk the JSON Schema and return a Set of normalised dot-paths whose type
 * resolves to the Asset definition (binary image references).
 * Text fields like Logline are NOT included — the schema types them as "string".
 *
 * Paths use "[]" for array items: e.g. "OVERVIEW.ImagesList[].Images.SupportingImages[]"
 */
function buildAssetPaths(schema: Record<string, unknown>): Set<string> {
  const assetPaths = new Set<string>();
  const defs = (schema.definitions || schema.$defs || {}) as Record<string, unknown>;

  /** Resolve a $ref or oneOf to the concrete schema node */
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

  /** Check whether a resolved schema node IS the Asset type or contains only Asset fields */
  function isAssetType(node: Record<string, unknown>): boolean {
    // Direct Asset definition — has required: ["url","source"]
    const req = node.required as string[] | undefined;
    if (req && req.includes("url") && req.includes("source")) return true;
    // Array of Assets
    if (node.type === "array" && node.items) {
      const itemResolved = resolve(node.items as Record<string, unknown>);
      if (itemResolved && isAssetType(itemResolved)) return true;
    }
    // Object whose EVERY property is asset-typed (e.g. CharacterImages, LocationImages)
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

  /** Recursively walk schema properties, building dot-paths */
  function walk(node: Record<string, unknown>, prefix: string) {
    const props = node.properties as Record<string, unknown> | undefined;
    if (!props) return;
    for (const [key, fieldDef] of Object.entries(props)) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      const resolved = resolve(fieldDef as Record<string, unknown>);
      if (!resolved) continue;

      if (isAssetType(resolved)) {
        assetPaths.add(fieldPath);
        continue;
      }
      // Recurse into objects
      if (resolved.type === "object") {
        walk(resolved, fieldPath);
      }
      // Recurse into array items (non-asset arrays — e.g. CharacterList)
      if (resolved.type === "array" && resolved.items) {
        const itemResolved = resolve(resolved.items as Record<string, unknown>);
        if (itemResolved && !isAssetType(itemResolved)) {
          walk(itemResolved, `${fieldPath}[]`);
        }
      }
    }
  }

  // Start from top-level domain refs
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

/**
 * Check whether a data-path (with numeric indices) matches any asset path
 * from the schema (which uses [] for arrays).
 * E.g. "OVERVIEW.ImagesList.0.Images" matches "OVERVIEW.ImagesList[].Images"
 */
function isAssetPath(dataPath: string, assetPaths: Set<string>): boolean {
  // Normalise numeric indices to [] for matching
  const normalised = dataPath.replace(/\.(\d+)(?=\.|$)/g, "[]");
  // Check exact match
  if (assetPaths.has(normalised)) return true;
  // Check if any asset path is a prefix (handles nested sub-fields of asset containers)
  for (const ap of assetPaths) {
    if (normalised.startsWith(ap + ".") || normalised.startsWith(ap + "[]")) return true;
  }
  return false;
}

/**
 * Recursively mark asset/image fields as null (skipped), using the JSON schema
 * as the source of truth.  Only fields whose schema type resolves to Asset are
 * nulled — text fields like Logline are left untouched.
 *
 * Modifies the object in place.
 */
function markImagesAsSkipped(obj: unknown, assetPaths: Set<string>, currentPath = ""): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      markImagesAsSkipped(obj[i], assetPaths, `${currentPath}.${i}`);
    }
    return;
  }

  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === "version") continue;
    const fieldPath = currentPath ? `${currentPath}.${key}` : key;

    if (isAssetPath(fieldPath, assetPaths)) {
      record[key] = null;
      continue;
    }

    if (typeof record[key] === "object" && record[key] !== null) {
      markImagesAsSkipped(record[key], assetPaths, fieldPath);
    }
  }
}

/**
 * Attempt common repairs on malformed JSON from AI models.
 * Handles:
 *  - Trailing commas before } or ]
 *  - Dangling quotes / duplicate quotes ("value" " ] → "value" ])
 *  - Bare strings without keys inside objects (AI merges two answers)
 *  - Missing closing braces/brackets (simple count-based)
 */
function repairJson(text: string): string {
  let s = text;

  // 1. Remove BOM / zero-width chars
  s = s.replace(/^\uFEFF/, "");

  // 2. Fix duplicate-quote artefacts: "word" " → "word"
  //    e.g.  "COMMUNISM" " ]  →  "COMMUNISM" ]
  s = s.replace(/"(\s*)" /g, '"$1');

  // 3. Remove bare strings inside objects — lines that are just
  //    "some text", without a preceding "key": pattern.
  //    e.g.  "In her escape, Molly ...",  (no key)
  //    These are invalid JSON entries the AI produces when it
  //    forgets a field name or merges two fields.
  s = s.replace(/,\s*"(?![^"]*"\s*:)[^"]*"\s*(?=,|\s*[}\]])/g, "");

  // 4. Remove trailing commas before ] or }
  s = s.replace(/,(\s*[}\]])/g, "$1");

  // 5. Ensure balanced braces/brackets — append missing closers
  let braces = 0, brackets = 0;
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
  }
  // Remove trailing commas/whitespace before appending closers
  s = s.replace(/[,\s]+$/, "");
  while (brackets > 0) { s += "]"; brackets--; }
  while (braces > 0) { s += "}"; braces--; }

  return s;
}

/**
 * Replace the 2-episode concrete example in the prompt template with a
 * single abstract pattern entry.  This prevents Gemini from copying the
 * literal 2 episodes and instead forces it to create one entry per
 * episode/chapter/installment found in the source material.
 */
