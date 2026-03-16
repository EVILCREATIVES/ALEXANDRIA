"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { upload } from "@vercel/blob/client";
import Link from "next/link";

// ─── Types (mirrored from lib/memos.ts for client use) ─────────────
type WorkType = "diary" | "novel" | "nonfiction";
type PointOfView = "first" | "third";
type NoteType = "text" | "audio" | "image";

interface MemoSettings {
  workType: WorkType;
  pointOfView: PointOfView;
  title: string;
  authorName?: string;
  genre?: string;
  tone?: string;
  customInstructions?: string;
  model?: string;
  language?: string;
  writerPersona?: string;
  creativeDirectives?: string;
  sourceInterpretation?: string;
  narrativeStyle?: string;
  evaluatorInstructions?: string;
}

interface MemoNote {
  noteId: string;
  createdAt: string;
  date: string;
  type: NoteType;
  content: string;
  audioUrl?: string;
  audioDuration?: number;
  imageUrl?: string;
  imageCaption?: string;
}

interface StoryVersion {
  versionId: string;
  createdAt: string;
  storyUrl: string;
  wordCount: number;
  notesIncorporated: string[];
  changelog: string;
}

interface MemoManifest {
  memoId: string;
  createdAt: string;
  updatedAt: string;
  settings: MemoSettings;
  notes: MemoNote[];
  memory: Array<{ entryId: string; type: string; label: string; content: string }>;
  storyVersions: StoryVersion[];
  currentStory?: string;
  currentStoryUrl?: string;
  lastGeneratedAt?: string;
  pendingNoteIds?: string[];
}

type ProjectRow = {
  memoId: string;
  manifestUrl: string;
  title: string;
  workType: string;
  createdAt: string;
  updatedAt: string;
  notesCount: number;
  hasStory: boolean;
};

// ─── Views ──────────────────────────────────────────────────────────
type View = "setup" | "workspace";
type Tab = "notes" | "story" | "scribe" | "settings";
type SettingsTab = "general" | "writer" | "creative" | "sources" | "style" | "model";

const WORK_TYPES: Array<{ value: WorkType; label: string; desc: string }> = [
  { value: "diary", label: "Diary / Journal", desc: "A personal, day-by-day account" },
  { value: "novel", label: "Novel / Fiction", desc: "A fictional narrative with characters and plot" },
  { value: "nonfiction", label: "Non-Fiction", desc: "Essays, memoir, reports, or other factual works" },
];

const POV_OPTIONS: Array<{ value: PointOfView; label: string; desc: string }> = [
  { value: "first", label: "First person", desc: '"I walked into the room…"' },
  { value: "third", label: "Third person", desc: '"She walked into the room…"' },
];

// ─── Helpers ────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }
function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function groupByDate(notes: MemoNote[]): Map<string, MemoNote[]> {
  const map = new Map<string, MemoNote[]>();
  for (const n of notes) {
    const existing = map.get(n.date) || [];
    existing.push(n);
    map.set(n.date, existing);
  }
  return map;
}

// ─── Audio Recorder Hook ────────────────────────────────────────────
function useAudioRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
    chunks.current = [];
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
    mr.start();
    mediaRecorder.current = mr;
    setRecording(true);
    setSeconds(0);
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }, []);

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const mr = mediaRecorder.current!;
      mr.onstop = () => {
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        for (const track of mr.stream.getTracks()) track.stop();
        resolve(blob);
      };
      mr.stop();
      if (timer.current) clearInterval(timer.current);
      setRecording(false);
    });
  }, []);

  return { recording, seconds, start, stop };
}

// ─── Component ──────────────────────────────────────────────────────
export default function MemosPage() {
  // ── Global State ──
  const [view, setView] = useState<View>("setup");
  const [projectList, setProjectList] = useState<ProjectRow[]>([]);
  const [listBusy, setListBusy] = useState(false);
  const [manifest, setManifest] = useState<MemoManifest | null>(null);
  const [manifestUrl, setManifestUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("notes");

  // ── Setup Wizard State ──
  const [setupStep, setSetupStep] = useState<1 | 2 | 3>(1);
  const [workType, setWorkType] = useState<WorkType>("novel");
  const [pov, setPov] = useState<PointOfView>("third");
  const [title, setTitle] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [genre, setGenre] = useState("");
  const [tone, setTone] = useState("");

  // ── Note Input State ──
  const [noteText, setNoteText] = useState("");
  const [noteDate, setNoteDate] = useState(today());
  const audioRec = useAudioRecorder();

  // ── Story State ──
  const [storyText, setStoryText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState("");
  const [storyDirty, setStoryDirty] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const storyBottomRef = useRef<HTMLDivElement>(null);

  // ── Settings State ──
  const [settingsJson, setSettingsJson] = useState("");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  // Individual settings fields for the tabbed UI
  const [sTitle, setSTitle] = useState("");
  const [sAuthorName, setSAuthorName] = useState("");
  const [sWorkType, setSWorkType] = useState<WorkType>("novel");
  const [sPov, setSPov] = useState<PointOfView>("third");
  const [sGenre, setSGenre] = useState("");
  const [sTone, setSTone] = useState("");
  const [sCustomInstructions, setSCustomInstructions] = useState("");
  const [sModel, setSModel] = useState("");
  const [sLanguage, setSLanguage] = useState("");
  const [sWriterPersona, setSWriterPersona] = useState("");
  const [sCreativeDirectives, setSCreativeDirectives] = useState("");
  const [sSourceInterpretation, setSSourceInterpretation] = useState("");
  const [sNarrativeStyle, setSNarrativeStyle] = useState("");
  const [sEvaluatorInstructions, setSEvaluatorInstructions] = useState("");

  // ── Scribe Chat State ──
  type ChatMsg = { role: "user" | "assistant"; content: string };
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  // ─── Load memo list on mount ──────────────────────────────────────
  useEffect(() => {
    loadProjectList();
  }, []);

  async function loadProjectList() {
    setListBusy(true);
    try {
      const res = await fetch("/api/memos/list");
      if (!res.ok) throw new Error("Failed to load projects");
      const data = (await res.json()) as { ok: boolean; projects: ProjectRow[] };
      setProjectList(data.projects || []);
    } catch (e) {
      console.error(e);
    } finally {
      setListBusy(false);
    }
  }

  // ─── Open an existing memo ────────────────────────────────────────
  async function openMemo(mUrl: string) {
    setBusy("Loading...");
    setError("");
    try {
      const res = await fetch("/api/memos/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifestUrl: mUrl }),
      });
      if (!res.ok) throw new Error("Failed to load memo");
      const data = (await res.json()) as { ok: boolean; manifest: MemoManifest };
      setManifest(data.manifest);
      setManifestUrl(mUrl);
      setStoryText(data.manifest.currentStory || "");
      setSettingsJson(JSON.stringify(data.manifest.settings, null, 2));
      populateSettingsFields(data.manifest.settings);
      setView("workspace");
      setTab(data.manifest.notes.length > 0 ? "notes" : "notes");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  // ─── Delete a project ─────────────────────────────────────────────
  async function deleteProject(memoId: string) {
    if (!confirm("Delete this project and all its notes, stories, and files? This cannot be undone.")) return;
    setBusy("Deleting project...");
    setError("");
    try {
      const res = await fetch("/api/memos/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoId }),
      });
      if (!res.ok) throw new Error("Failed to delete project");
      await loadProjectList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  // ─── Delete a note ────────────────────────────────────────────────
  async function deleteNote(noteId: string) {
    if (!confirm("Delete this note? This cannot be undone.")) return;
    if (!manifestUrl) return;
    setBusy("Deleting note...");
    setError("");
    try {
      const res = await fetch("/api/memos/delete-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifestUrl, noteId }),
      });
      if (!res.ok) throw new Error("Failed to delete note");
      const data = (await res.json()) as { ok: boolean; manifestUrl: string };
      setManifestUrl(data.manifestUrl);
      await reloadManifest(data.manifestUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  // ─── Create new memo ──────────────────────────────────────────────
  async function createMemo() {
    if (!title.trim()) { setError("Please enter a title"); return; }
    setBusy("Creating...");
    setError("");
    try {
      const settings: MemoSettings = {
        workType,
        pointOfView: pov,
        title: title.trim(),
        authorName: authorName.trim() || undefined,
        genre: genre.trim() || undefined,
        tone: tone.trim() || undefined,
      };
      const res = await fetch("/api/memos/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error("Failed to create memo");
      const data = (await res.json()) as { ok: boolean; memoId: string; manifestUrl: string };
      await openMemo(data.manifestUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  // ─── Add a text note ──────────────────────────────────────────────
  async function addTextNote() {
    if (!noteText.trim() || !manifestUrl) return;
    setBusy("Adding note...");
    setError("");
    try {
      const res = await fetch("/api/memos/add-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manifestUrl,
          note: { date: noteDate, type: "text", content: noteText.trim() },
        }),
      });
      if (!res.ok) throw new Error("Failed to add note");
      const data = (await res.json()) as { ok: boolean; manifestUrl: string };
      setManifestUrl(data.manifestUrl);
      setNoteText("");
      await reloadManifest(data.manifestUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  // ─── Add an audio note (record → upload → transcribe → save) ─────
  async function finishAudioNote() {
    if (!manifestUrl) return;
    setBusy("Processing audio...");
    setError("");
    try {
      const blob = await audioRec.stop();

      // Upload audio to blob storage
      setBusy("Uploading audio...");
      const file = new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" });
      const uploaded = await upload(`memos/${manifest!.memoId}/audio/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob",
      });

      // Transcribe
      setBusy("Transcribing...");
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.readAsDataURL(blob);
      });

      const tRes = await fetch("/api/memos/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioBase64: base64, mimeType: "audio/webm" }),
      });
      const tData = (await tRes.json()) as { ok: boolean; transcript?: string; error?: string };
      const transcript = tData.transcript || "(no transcript)";

      // Save note
      setBusy("Saving note...");
      const res = await fetch("/api/memos/add-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manifestUrl,
          note: {
            date: noteDate,
            type: "audio",
            content: transcript,
            audioUrl: uploaded.url,
            audioDuration: audioRec.seconds,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to save audio note");
      const data = (await res.json()) as { ok: boolean; manifestUrl: string };
      setManifestUrl(data.manifestUrl);
      await reloadManifest(data.manifestUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  // ─── Add an image note ────────────────────────────────────────────
  async function addImageNote(file: File) {
    if (!manifestUrl) return;
    setBusy("Uploading image...");
    setError("");
    try {
      // Upload
      const uploaded = await upload(`memos/${manifest!.memoId}/images/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob",
      });

      // Describe
      setBusy("Analyzing image...");
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.readAsDataURL(file);
      });

      const dRes = await fetch("/api/memos/describe-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType: file.type }),
      });
      const dData = (await dRes.json()) as { ok: boolean; caption?: string };
      const caption = dData.caption || "";

      // Save note
      setBusy("Saving note...");
      const res = await fetch("/api/memos/add-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manifestUrl,
          note: {
            date: noteDate,
            type: "image",
            content: caption || "(image uploaded)",
            imageUrl: uploaded.url,
            imageCaption: caption,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to save image note");
      const data = (await res.json()) as { ok: boolean; manifestUrl: string };
      setManifestUrl(data.manifestUrl);
      await reloadManifest(data.manifestUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  // ─── Scribe Chat ─────────────────────────────────────────────────
  async function sendScribeMessage() {
    const text = chatInput.trim();
    if (!text || !manifestUrl || chatStreaming) return;

    const userMsg: ChatMsg = { role: "user", content: text };
    const allMsgs = [...chatMessages, userMsg];
    setChatMessages(allMsgs);
    setChatInput("");
    setChatStreaming(true);

    // Add placeholder assistant message
    const placeholder: ChatMsg = { role: "assistant", content: "" };
    setChatMessages([...allMsgs, placeholder]);

    try {
      const res = await fetch("/api/memos/scribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifestUrl, messages: allMsgs }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Scribe error" })) as { error?: string };
        throw new Error(err.error || `Scribe failed (${res.status})`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as { type: string; text?: string; error?: string };
            if (evt.type === "delta" && evt.text) {
              assistantText += evt.text;
              setChatMessages([...allMsgs, { role: "assistant", content: assistantText }]);
            } else if (evt.type === "error") {
              throw new Error(evt.error || "Scribe error");
            }
          } catch (e) {
            if (e instanceof Error && e.message.includes("Scribe")) throw e;
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scribe error");
      // Remove empty placeholder on error
      setChatMessages((prev) => prev.filter((m) => m.content !== "" || m.role !== "assistant"));
    } finally {
      setChatStreaming(false);
    }
  }

  // ─── Generate / Update Story ──────────────────────────────────────
  function requestGenerate() {
    setShowLangPicker(true);
  }

  async function generateStory(languageOverride?: string) {
    if (!manifestUrl) return;
    setShowLangPicker(false);
    setGenerating(true);
    setGenStatus("Preparing...");
    setError("");
    setTab("story");
    try {
      const res = await fetch("/api/memos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifestUrl, language: languageOverride || undefined }),
      });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({ error: "Unknown error" }))) as { error?: string };
        throw new Error(errData.error || `Generate failed (${res.status})`);
      }

      // Read SSE stream
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6)) as {
              type: string;
              text?: string;
              message?: string;
              error?: string;
              manifestUrl?: string;
              wordCount?: number;
            };

            if (evt.type === "status") setGenStatus(evt.message || "");
            else if (evt.type === "delta") {
              fullText += evt.text || "";
              setStoryText(fullText);
            } else if (evt.type === "complete") {
              setManifestUrl(evt.manifestUrl || manifestUrl);
              setGenStatus(`Done — ${evt.wordCount} words`);
              setStoryDirty(false);
              await reloadManifest(evt.manifestUrl || manifestUrl);
            } else if (evt.type === "error") {
              throw new Error(evt.error || "Generation error");
            }
          } catch (parseErr) {
            // Skip unparseable SSE
            if (parseErr instanceof Error && parseErr.message !== "Generation error" && !parseErr.message.includes("Generation error")) continue;
            throw parseErr;
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setGenStatus("");
    } finally {
      setGenerating(false);
    }
  }

  // ─── Save Story Edit (manual save as new version) ─────────────────
  async function saveStoryEdit() {
    if (!manifestUrl || !storyText.trim()) return;
    setBusy("Saving version...");
    setError("");
    try {
      const res = await fetch("/api/memos/save-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifestUrl, action: "save", storyText }),
      });
      if (!res.ok) throw new Error("Failed to save story");
      const data = (await res.json()) as { ok: boolean; manifestUrl: string };
      setManifestUrl(data.manifestUrl);
      setStoryDirty(false);
      await reloadManifest(data.manifestUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  // ─── Load a specific version ──────────────────────────────────────
  async function loadVersion(versionId: string) {
    if (!manifestUrl) return;
    setBusy("Loading version...");
    setError("");
    try {
      const res = await fetch("/api/memos/save-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifestUrl, action: "load", versionId }),
      });
      if (!res.ok) throw new Error("Failed to load version");
      const data = (await res.json()) as { ok: boolean; manifestUrl: string; storyText: string };
      setManifestUrl(data.manifestUrl);
      setStoryText(data.storyText);
      setStoryDirty(false);
      await reloadManifest(data.manifestUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  // ─── Delete a version ─────────────────────────────────────────────
  async function deleteVersion(versionId: string) {
    if (!manifestUrl) return;
    if (!confirm("Delete this version? This cannot be undone.")) return;
    setBusy("Deleting version...");
    setError("");
    try {
      const res = await fetch("/api/memos/save-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifestUrl, action: "delete", versionId }),
      });
      if (!res.ok) throw new Error("Failed to delete version");
      const data = (await res.json()) as { ok: boolean; manifestUrl: string; currentStory: string };
      setManifestUrl(data.manifestUrl);
      setStoryText(data.currentStory || "");
      setStoryDirty(false);
      await reloadManifest(data.manifestUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  // ─── Save Settings ────────────────────────────────────────────────
  function populateSettingsFields(s: MemoSettings) {
    setSTitle(s.title || "");
    setSAuthorName(s.authorName || "");
    setSWorkType(s.workType || "novel");
    setSPov(s.pointOfView || "third");
    setSGenre(s.genre || "");
    setSTone(s.tone || "");
    setSCustomInstructions(s.customInstructions || "");
    setSModel(s.model || "");
    setSLanguage(s.language || "");
    setSWriterPersona(s.writerPersona || "");
    setSCreativeDirectives(s.creativeDirectives || "");
    setSSourceInterpretation(s.sourceInterpretation || "");
    setSNarrativeStyle(s.narrativeStyle || "");
    setSEvaluatorInstructions(s.evaluatorInstructions || "");
  }

  function buildSettingsFromFields(): Partial<MemoSettings> {
    return {
      title: sTitle,
      authorName: sAuthorName || undefined,
      workType: sWorkType,
      pointOfView: sPov,
      genre: sGenre || undefined,
      tone: sTone || undefined,
      customInstructions: sCustomInstructions || undefined,
      model: sModel || undefined,
      language: sLanguage || undefined,
      writerPersona: sWriterPersona || undefined,
      creativeDirectives: sCreativeDirectives || undefined,
      sourceInterpretation: sSourceInterpretation || undefined,
      narrativeStyle: sNarrativeStyle || undefined,
      evaluatorInstructions: sEvaluatorInstructions || undefined,
    };
  }

  async function saveSettings() {
    if (!manifestUrl) return;
    setBusy("Saving settings...");
    setError("");
    try {
      const settings = buildSettingsFromFields();
      const res = await fetch("/api/memos/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifestUrl, settings }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      const data = (await res.json()) as { ok: boolean; manifestUrl: string };
      setManifestUrl(data.manifestUrl);
      await reloadManifest(data.manifestUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  // ─── Reload manifest from URL ─────────────────────────────────────
  async function reloadManifest(url: string) {
    try {
      const res = await fetch("/api/memos/load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifestUrl: url }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { ok: boolean; manifest: MemoManifest };
      setManifest(data.manifest);
      setStoryText(data.manifest.currentStory || "");
      setSettingsJson(JSON.stringify(data.manifest.settings, null, 2));
      populateSettingsFields(data.manifest.settings);
    } catch { /* ignore */ }
  }

  // Scroll story to bottom on new content during generation
  useEffect(() => {
    if (generating && storyBottomRef.current) {
      storyBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [storyText, generating]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

  // ─── Shared style helpers for settings ────────────────────────────
  const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 4, marginTop: 12 };
  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, boxSizing: "border-box" as const, marginBottom: 4 };
  const textareaStyle: React.CSSProperties = { width: "100%", padding: 12, border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, fontFamily: "inherit", resize: "vertical" as const, boxSizing: "border-box" as const, lineHeight: 1.6 };

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: SETUP VIEW
  // ═══════════════════════════════════════════════════════════════════
  if (view === "setup") {
    return (
      <div style={{ minHeight: "100vh", background: "#fafafa", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 28 }}>
        <div style={{ width: "min(560px, 100%)" }}>
          <Link href="/" style={{ fontSize: 13, color: "#64748b", textDecoration: "none", marginBottom: 16, display: "inline-block" }}>
            &larr; Back to STORYLINE
          </Link>

          <div style={{ fontSize: 48, fontWeight: 900, letterSpacing: -2, color: "#0f172a", marginBottom: 4 }}>MEMOS</div>
          <div style={{ fontSize: 15, color: "#64748b", marginBottom: 32 }}>
            Create a project, add daily notes — text, voice, or images — and watch your story evolve.
          </div>

          {/* Existing projects */}
          {projectList.length > 0 && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Your Projects</div>
              <div style={{ display: "grid", gap: 8 }}>
                {projectList.map((m) => (
                  <button
                    key={m.memoId}
                    type="button"
                    onClick={() => openMemo(m.manifestUrl)}
                    disabled={!!busy}
                    style={{
                      textAlign: "left",
                      border: "1px solid #e2e8f0",
                      background: "#fff",
                      borderRadius: 10,
                      padding: "14px 16px",
                      cursor: "pointer",
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#0f172a")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{m.title}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>{m.workType}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteProject(m.memoId); }}
                          disabled={!!busy}
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            padding: "2px 4px",
                            fontSize: 13,
                            color: "#94a3b8",
                            borderRadius: 4,
                            transition: "color 0.15s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#dc2626")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
                          title="Delete project"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
                      {m.notesCount} note{m.notesCount !== 1 ? "s" : ""} &middot; {m.hasStory ? "Has story" : "No story yet"} &middot; {fmtDate(m.updatedAt)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {listBusy && <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>Loading projects...</div>}

          {/* Setup Wizard */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>New Project</div>

          {/* Step 1: Work Type */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>What are you writing?</div>
            <div style={{ display: "grid", gap: 6 }}>
              {WORK_TYPES.map((wt) => (
                <button
                  key={wt.value}
                  type="button"
                  onClick={() => { setWorkType(wt.value); if (setupStep < 2) setSetupStep(2); }}
                  style={{
                    textAlign: "left",
                    border: workType === wt.value ? "2px solid #0f172a" : "1px solid #e2e8f0",
                    background: workType === wt.value ? "#f8fafc" : "#fff",
                    borderRadius: 10,
                    padding: "12px 14px",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{wt.label}</div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{wt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: POV */}
          {setupStep >= 2 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>Point of view?</div>
              <div style={{ display: "flex", gap: 8 }}>
                {POV_OPTIONS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => { setPov(p.value); if (setupStep < 3) setSetupStep(3); }}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      border: pov === p.value ? "2px solid #0f172a" : "1px solid #e2e8f0",
                      background: pov === p.value ? "#f8fafc" : "#fff",
                      borderRadius: 10,
                      padding: "12px 14px",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{p.label}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Title & details */}
          {setupStep >= 3 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>Details</div>
              <input
                placeholder="Title (required)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, marginBottom: 8, boxSizing: "border-box" }}
              />
              <input
                placeholder="Author name (optional)"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14, marginBottom: 8, boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input
                  placeholder="Genre (optional)"
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  style={{ flex: 1, padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14 }}
                />
                <input
                  placeholder="Tone (optional)"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  style={{ flex: 1, padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 14 }}
                />
              </div>
              <button
                type="button"
                onClick={createMemo}
                disabled={!title.trim() || !!busy}
                style={{
                  width: "100%",
                  padding: "12px 0",
                  border: "none",
                  borderRadius: 10,
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: title.trim() && !busy ? "pointer" : "not-allowed",
                  background: title.trim() && !busy ? "#0f172a" : "#e2e8f0",
                  color: title.trim() && !busy ? "#fff" : "#94a3b8",
                  transition: "all 0.15s",
                }}
              >
                {busy || "Create Project"}
              </button>
            </div>
          )}

          {error && <div style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{error}</div>}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // RENDER: WORKSPACE VIEW
  // ═══════════════════════════════════════════════════════════════════
  const notes = manifest?.notes || [];
  const pendingCount = manifest?.pendingNoteIds?.length || 0;
  const grouped = groupByDate([...notes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  const sortedDates = [...grouped.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div style={{ minHeight: "100vh", background: "#fafafa", display: "flex", flexDirection: "column" }}>
      {/* ─── Header ─── */}
      <div style={{
        borderBottom: "1px solid #e2e8f0",
        background: "#fff",
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            type="button"
            onClick={() => { setView("setup"); setManifest(null); setManifestUrl(""); loadProjectList(); }}
            style={{ background: "none", border: "none", fontSize: 13, color: "#64748b", cursor: "pointer", padding: 0 }}
          >
            &larr; All Projects
          </button>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>{manifest?.settings.title}</div>
          <span style={{ fontSize: 12, color: "#94a3b8", background: "#f1f5f9", padding: "2px 8px", borderRadius: 6 }}>
            {manifest?.settings.workType} &middot; {manifest?.settings.pointOfView === "first" ? "1st person" : "3rd person"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {notes.length} note{notes.length !== 1 ? "s" : ""}
            {pendingCount > 0 && <span style={{ color: "#f59e0b", fontWeight: 700 }}> &middot; {pendingCount} pending</span>}
          </span>
          <button
            type="button"
            onClick={requestGenerate}
            disabled={generating || notes.length === 0}
            style={{
              padding: "8px 16px",
              border: "none",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: generating || notes.length === 0 ? "not-allowed" : "pointer",
              background: generating || notes.length === 0 ? "#e2e8f0" : "#0f172a",
              color: generating || notes.length === 0 ? "#94a3b8" : "#fff",
              transition: "all 0.15s",
            }}
          >
            {generating ? genStatus || "Generating..." : pendingCount > 0 ? `Generate (${pendingCount} new)` : "Regenerate"}
          </button>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 20px", display: "flex", gap: 0 }}>
        {(["notes", "story", "scribe", "settings"] as Tab[]).map((t) => {
          const label = t === "scribe" ? "Scribe" : t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: "10px 18px",
                border: "none",
                borderBottom: tab === t ? "2px solid #0f172a" : "2px solid transparent",
                background: "none",
                fontSize: 13,
                fontWeight: tab === t ? 700 : 500,
                color: tab === t ? "#0f172a" : "#64748b",
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* ─── Error Bar ─── */}
      {error && (
        <div style={{ background: "#fef2f2", borderBottom: "1px solid #fecaca", padding: "8px 20px", fontSize: 13, color: "#dc2626", display: "flex", justifyContent: "space-between" }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError("")} style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 13 }}>Dismiss</button>
        </div>
      )}

      {/* ─── Busy Bar ─── */}
      {busy && (
        <div style={{ background: "#fffbeb", borderBottom: "1px solid #fde68a", padding: "8px 20px", fontSize: 13, color: "#92400e" }}>
          {busy}
        </div>
      )}

      {/* ═══ TAB: NOTES ═══ */}
      {tab === "notes" && (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* ── LEFT: Full-height Editor ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRight: "1px solid #e2e8f0", minWidth: 0 }}>
            {/* Toolbar */}
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", background: "#fff", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="date"
                value={noteDate}
                onChange={(e) => setNoteDate(e.target.value)}
                style={{ padding: "6px 10px", border: "1px solid #e2e8f0", borderRadius: 6, fontSize: 13 }}
              />
              <span style={{ fontSize: 12, color: "#94a3b8" }}>
                {noteDate === today() ? "Today" : fmtDate(noteDate)}
              </span>

              <div style={{ flex: 1 }} />

              {/* Audio record */}
              {!audioRec.recording ? (
                <button
                  type="button"
                  onClick={audioRec.start}
                  disabled={!!busy}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: busy ? "not-allowed" : "pointer",
                    background: "#fff",
                    color: "#0f172a",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#dc2626" }} />
                  Record
                </button>
              ) : (
                <button
                  type="button"
                  onClick={finishAudioNote}
                  style={{
                    padding: "6px 12px",
                    border: "1px solid #dc2626",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    background: "#fef2f2",
                    color: "#dc2626",
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: "#dc2626", animation: "pulse 1s infinite" }} />
                  Stop ({audioRec.seconds}s)
                </button>
              )}

              {/* Image upload */}
              <label style={{
                padding: "6px 12px",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: busy ? "not-allowed" : "pointer",
                background: "#fff",
                color: "#0f172a",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}>
                + Image
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  disabled={!!busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) addImageNote(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>

            {/* Text Editor — full remaining height */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
              <textarea
                placeholder="Write your thoughts, ideas, events, scenes, dialogue...&#10;&#10;This is your creative workspace. Write as much or as little as you want — the AI will transform it into narrative."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                style={{
                  flex: 1,
                  width: "100%",
                  padding: "16px 20px",
                  border: "none",
                  fontSize: 15,
                  lineHeight: 1.7,
                  fontFamily: "inherit",
                  resize: "none",
                  boxSizing: "border-box",
                  outline: "none",
                  background: "#fafafa",
                  color: "#1e293b",
                }}
              />
              {/* Add Note button — fixed at bottom of editor */}
              <div style={{ padding: "10px 16px", borderTop: "1px solid #e2e8f0", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>
                  {noteText.trim() ? `${noteText.trim().split(/\s+/).length} words` : ""}
                </span>
                <button
                  type="button"
                  onClick={addTextNote}
                  disabled={!noteText.trim() || !!busy}
                  style={{
                    padding: "8px 20px",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: noteText.trim() && !busy ? "pointer" : "not-allowed",
                    background: noteText.trim() && !busy ? "#0f172a" : "#e2e8f0",
                    color: noteText.trim() && !busy ? "#fff" : "#94a3b8",
                    transition: "all 0.15s",
                  }}
                >
                  {busy || "Add Note"}
                </button>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Notes List ── */}
          <div style={{ width: 360, minWidth: 300, display: "flex", flexDirection: "column", background: "#fff", overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Notes
                <span style={{ fontWeight: 400, color: "#94a3b8", marginLeft: 6 }}>{notes.length}</span>
              </div>
              {pendingCount > 0 && (
                <span style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b", background: "#fffbeb", padding: "2px 8px", borderRadius: 4 }}>
                  {pendingCount} pending
                </span>
              )}
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "12px 12px 80px" }}>
              {notes.length === 0 ? (
                <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: 32 }}>
                  No notes yet. Write something in the editor!
                </div>
              ) : (
                sortedDates.map((date) => {
                  const dayNotes = grouped.get(date) || [];
                  const isPending = (manifest?.pendingNoteIds || []);
                  return (
                    <div key={date} style={{ marginBottom: 16 }}>
                      <div style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#94a3b8",
                        textTransform: "uppercase",
                        letterSpacing: 0.5,
                        marginBottom: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#cbd5e1" }} />
                        {fmtDate(date)}
                        {date === today() && <span style={{ fontSize: 10, color: "#cbd5e1" }}>(today)</span>}
                      </div>
                      {dayNotes.map((n) => (
                        <div
                          key={n.noteId}
                          style={{
                            background: isPending.includes(n.noteId) ? "#fffdf5" : "#f8fafc",
                            border: isPending.includes(n.noteId) ? "1px solid #fde68a" : "1px solid #e2e8f0",
                            borderRadius: 8,
                            padding: "8px 10px",
                            marginBottom: 6,
                            marginLeft: 10,
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{
                                fontSize: 10,
                                fontWeight: 700,
                                textTransform: "uppercase",
                                color: n.type === "audio" ? "#7c3aed" : n.type === "image" ? "#2563eb" : "#64748b",
                                background: n.type === "audio" ? "#f5f3ff" : n.type === "image" ? "#eff6ff" : "#fff",
                                padding: "1px 5px",
                                borderRadius: 3,
                              }}>
                                {n.type}
                              </span>
                              {isPending.includes(n.noteId) && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: "#f59e0b" }}>PENDING</span>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontSize: 10, color: "#94a3b8" }}>{fmtTime(n.createdAt)}</span>
                              <button
                                type="button"
                                onClick={() => deleteNote(n.noteId)}
                                disabled={!!busy}
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  padding: "0 2px",
                                  fontSize: 11,
                                  color: "#cbd5e1",
                                  borderRadius: 3,
                                  transition: "color 0.15s",
                                  lineHeight: 1,
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = "#dc2626")}
                                onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}
                                title="Delete note"
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          <div style={{ fontSize: 12, color: "#334155", lineHeight: 1.5, whiteSpace: "pre-wrap", maxHeight: 100, overflow: "hidden", WebkitMaskImage: "linear-gradient(180deg, #000 70%, transparent 100%)" }}>
                            {n.content}
                          </div>

                          {n.type === "image" && n.imageUrl && (
                            <div style={{ marginTop: 6 }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={n.imageUrl}
                                alt={n.imageCaption || "Uploaded image"}
                                style={{ maxWidth: "100%", maxHeight: 120, borderRadius: 4, border: "1px solid #e2e8f0" }}
                              />
                            </div>
                          )}

                          {n.type === "audio" && n.audioUrl && (
                            <div style={{ marginTop: 6 }}>
                              <audio controls src={n.audioUrl} style={{ width: "100%", height: 28 }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: STORY ═══ */}
      {tab === "story" && (
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* ── LEFT: Editable Story ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
            {/* Story Toolbar */}
            <div style={{ padding: "10px 16px", borderBottom: "1px solid #e2e8f0", background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {generating && genStatus && (
                  <span style={{ fontSize: 12, color: "#64748b", fontStyle: "italic" }}>{genStatus}</span>
                )}
                {!generating && storyText && (
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>
                    {storyText.trim().split(/\s+/).length} words
                    {storyDirty && <span style={{ color: "#f59e0b", fontWeight: 700, marginLeft: 6 }}>Edited</span>}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {storyDirty && (
                  <button
                    type="button"
                    onClick={saveStoryEdit}
                    disabled={!!busy}
                    style={{
                      padding: "6px 14px",
                      border: "1px solid #0f172a",
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: busy ? "not-allowed" : "pointer",
                      background: "#0f172a",
                      color: "#fff",
                      transition: "all 0.15s",
                    }}
                  >
                    Save Version
                  </button>
                )}
                <button
                  type="button"
                  onClick={requestGenerate}
                  disabled={generating || notes.length === 0}
                  style={{
                    padding: "6px 14px",
                    border: "1px solid #e2e8f0",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: generating || notes.length === 0 ? "not-allowed" : "pointer",
                    background: "#fff",
                    color: generating || notes.length === 0 ? "#94a3b8" : "#0f172a",
                  }}
                >
                  {generating ? "Generating..." : pendingCount > 0 ? `Regenerate (${pendingCount} new)` : "Regenerate"}
                </button>
              </div>
            </div>

            {/* Editable Story Area */}
            {!storyText && !generating ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 14, padding: 60 }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>&#x1F4D6;</div>
                  <div>No story generated yet.</div>
                  <div style={{ marginTop: 4 }}>Add some notes and click &quot;Generate&quot; to begin.</div>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
                <textarea
                  value={storyText}
                  onChange={(e) => { setStoryText(e.target.value); setStoryDirty(true); }}
                  readOnly={generating}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    padding: "28px 32px 60px",
                    border: "none",
                    outline: "none",
                    fontSize: 15,
                    lineHeight: 1.8,
                    color: "#1e293b",
                    fontFamily: "Georgia, 'Times New Roman', serif",
                    resize: "none",
                    boxSizing: "border-box",
                    background: generating ? "#fafafa" : "#fff",
                  }}
                />
                <div ref={storyBottomRef} />
              </div>
            )}
          </div>

          {/* ── RIGHT: Version History ── */}
          <div style={{ width: 300, minWidth: 240, display: "flex", flexDirection: "column", background: "#fff", borderLeft: "1px solid #e2e8f0", overflow: "hidden" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                Versions
                <span style={{ fontWeight: 400, color: "#94a3b8", marginLeft: 6 }}>{manifest?.storyVersions?.length || 0}</span>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "8px 10px" }}>
              {(!manifest?.storyVersions || manifest.storyVersions.length === 0) ? (
                <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 12, padding: 24 }}>
                  No versions yet. Generate or save to create one.
                </div>
              ) : (
                [...manifest.storyVersions].reverse().map((v, i) => {
                  const vNum = manifest.storyVersions.length - i;
                  const isCurrent = manifest.currentStoryUrl === v.storyUrl;
                  return (
                    <div
                      key={v.versionId}
                      style={{
                        background: isCurrent ? "#f0f9ff" : "#f8fafc",
                        border: isCurrent ? "1px solid #bae6fd" : "1px solid #e2e8f0",
                        borderRadius: 8,
                        padding: "8px 10px",
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>v{vNum}</span>
                          {isCurrent && (
                            <span style={{ fontSize: 9, fontWeight: 700, color: "#0284c7", background: "#e0f2fe", padding: "1px 5px", borderRadius: 3 }}>CURRENT</span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 4 }}>
                          {!isCurrent && (
                            <button
                              type="button"
                              onClick={() => loadVersion(v.versionId)}
                              disabled={!!busy}
                              style={{
                                background: "none",
                                border: "1px solid #e2e8f0",
                                borderRadius: 4,
                                padding: "2px 8px",
                                fontSize: 10,
                                fontWeight: 600,
                                color: "#0f172a",
                                cursor: busy ? "not-allowed" : "pointer",
                              }}
                            >
                              Load
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteVersion(v.versionId)}
                            disabled={!!busy}
                            style={{
                              background: "none",
                              border: "none",
                              padding: "2px 4px",
                              fontSize: 11,
                              color: "#cbd5e1",
                              cursor: busy ? "not-allowed" : "pointer",
                              borderRadius: 3,
                              transition: "color 0.15s",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.color = "#dc2626")}
                            onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}
                            title="Delete version"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.4 }}>
                        {v.wordCount} words
                        {v.notesIncorporated.length > 0 && ` · ${v.notesIncorporated.length} notes`}
                      </div>
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>
                        {v.changelog.length > 50 ? v.changelog.slice(0, 50) + "…" : v.changelog}
                      </div>
                      <div style={{ fontSize: 10, color: "#cbd5e1", marginTop: 2 }}>
                        {fmtDate(v.createdAt)} {fmtTime(v.createdAt)}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: SETTINGS ═══ */}
      {tab === "settings" && (
        <div style={{ flex: 1, maxWidth: 760, width: "100%", margin: "0 auto", padding: 20 }}>

          {/* ── Settings Sub-tabs ── */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0", marginBottom: 20, flexWrap: "wrap" }}>
            {([
              { key: "general" as SettingsTab, label: "General" },
              { key: "writer" as SettingsTab, label: "Writer Persona" },
              { key: "creative" as SettingsTab, label: "Creative Directives" },
              { key: "sources" as SettingsTab, label: "Source Interpretation" },
              { key: "style" as SettingsTab, label: "Narrative Style" },
              { key: "model" as SettingsTab, label: "Model & Stats" },
            ]).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setSettingsTab(t.key)}
                style={{
                  padding: "8px 14px",
                  border: "none",
                  borderBottom: settingsTab === t.key ? "2px solid #0f172a" : "2px solid transparent",
                  background: "none",
                  fontSize: 12,
                  fontWeight: settingsTab === t.key ? 700 : 500,
                  color: settingsTab === t.key ? "#0f172a" : "#94a3b8",
                  cursor: "pointer",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── GENERAL ── */}
          {settingsTab === "general" && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Project Settings</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>Basic project details — title, type, POV, genre, tone.</div>

              <label style={labelStyle}>Title</label>
              <input value={sTitle} onChange={(e) => setSTitle(e.target.value)} style={inputStyle} placeholder="Story title" />

              <label style={labelStyle}>Author Name</label>
              <input value={sAuthorName} onChange={(e) => setSAuthorName(e.target.value)} style={inputStyle} placeholder="Optional" />

              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Work Type</label>
                  <select value={sWorkType} onChange={(e) => setSWorkType(e.target.value as WorkType)} style={inputStyle}>
                    <option value="novel">Novel / Fiction</option>
                    <option value="diary">Diary / Journal</option>
                    <option value="nonfiction">Non-Fiction</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Point of View</label>
                  <select value={sPov} onChange={(e) => setSPov(e.target.value as PointOfView)} style={inputStyle}>
                    <option value="first">First Person</option>
                    <option value="third">Third Person</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Genre</label>
                  <input value={sGenre} onChange={(e) => setSGenre(e.target.value)} style={inputStyle} placeholder="e.g. sci-fi, romance, thriller" />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Tone</label>
                  <input value={sTone} onChange={(e) => setSTone(e.target.value)} style={inputStyle} placeholder="e.g. dark, whimsical, literary" />
                </div>
              </div>

              <label style={labelStyle}>Output Language</label>
              <select value={sLanguage} onChange={(e) => setSLanguage(e.target.value)} style={inputStyle}>
                <option value="">English (default)</option>
                <option value="English">English</option>
                <option value="French">French</option>
                <option value="Spanish">Spanish</option>
                <option value="German">German</option>
                <option value="Italian">Italian</option>
                <option value="Portuguese">Portuguese</option>
                <option value="Dutch">Dutch</option>
                <option value="Russian">Russian</option>
                <option value="Japanese">Japanese</option>
                <option value="Korean">Korean</option>
                <option value="Chinese">Chinese (Simplified)</option>
                <option value="Arabic">Arabic</option>
                <option value="Hindi">Hindi</option>
                <option value="Turkish">Turkish</option>
                <option value="Polish">Polish</option>
                <option value="Swedish">Swedish</option>
                <option value="Norwegian">Norwegian</option>
                <option value="Danish">Danish</option>
                <option value="Finnish">Finnish</option>
                <option value="Greek">Greek</option>
                <option value="Hebrew">Hebrew</option>
                <option value="Thai">Thai</option>
                <option value="Vietnamese">Vietnamese</option>
                <option value="Indonesian">Indonesian</option>
                <option value="Romanian">Romanian</option>
                <option value="Czech">Czech</option>
                <option value="Ukrainian">Ukrainian</option>
              </select>

              <label style={labelStyle}>Custom Instructions</label>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>Any additional direction for the AI (appended to every generation)</div>
              <textarea value={sCustomInstructions} onChange={(e) => setSCustomInstructions(e.target.value)} rows={4} style={textareaStyle} placeholder="e.g. Always end chapters with a cliffhanger. Keep dialogue minimal." />
            </div>
          )}

          {/* ── WRITER PERSONA ── */}
          {settingsTab === "writer" && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Writer Persona</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
                Defines who the AI &quot;is&quot; as a writer. This is the opening identity instruction sent to the model.
                Leave blank to use the default creative co-author persona.
              </div>
              <textarea
                value={sWriterPersona}
                onChange={(e) => setSWriterPersona(e.target.value)}
                rows={8}
                style={textareaStyle}
                placeholder={`You are an accomplished author and creative writing partner. You don't just transcribe or organize — you CREATE. You bring your own literary craft: vivid scenes, compelling dialogue, emotional depth, narrative tension, and artful pacing. You are a co-author who elevates raw material into polished storytelling.`}
              />
            </div>
          )}

          {/* ── CREATIVE DIRECTIVES ── */}
          {settingsTab === "creative" && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Creative Directives</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
                The core instructions telling the AI HOW to approach storytelling. Controls creativity level, what it should add on its own, how to handle sparse notes, etc.
                Leave blank for the default &quot;creative mandate&quot;.
              </div>
              <textarea
                value={sCreativeDirectives}
                onChange={(e) => setSCreativeDirectives(e.target.value)}
                rows={12}
                style={textareaStyle}
                placeholder={`CREATIVE MANDATE:\n- The user's notes are RAW MATERIAL and INSPIRATION — not a transcript to copy. Transform them into narrative.\n- ADD your own scenes, transitions, sensory details, inner monologue, and dialogue where they serve the story.\n- CREATE dramatic tension, foreshadowing, and payoffs.\n- DEVELOP characters beyond what the notes say — give them gestures, habits, contradictions, voices.\n- STRUCTURE scenes with proper pacing: beats, rising action, moments of stillness, climaxes.\n- If the notes are fragmentary or sparse, that's an invitation to fill the gaps with your craft.`}
              />
            </div>
          )}

          {/* ── SOURCE INTERPRETATION ── */}
          {settingsTab === "sources" && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Source Interpretation</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
                How the AI should interpret each type of source material (text notes, voice memos, images).
                Leave blank for the default behavior.
              </div>
              <textarea
                value={sSourceInterpretation}
                onChange={(e) => setSSourceInterpretation(e.target.value)}
                rows={10}
                style={textareaStyle}
                placeholder={`HOW TO INTERPRET DIFFERENT SOURCES:\n- TEXT NOTES: These are the creator's ideas, scenes, or direction. Use them as story beats but write them as proper narrative prose.\n- AUDIO TRANSCRIPTS: These capture the creator thinking out loud — often rambling, disjointed, stream-of-consciousness. Extract the INTENT and EMOTION, not the literal words.\n- IMAGE DESCRIPTIONS: These are mood boards and visual references. Let them inspire atmosphere, setting, color palette, and tone — don't just describe what's in the image.`}
              />
            </div>
          )}

          {/* ── NARRATIVE STYLE ── */}
          {settingsTab === "style" && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Narrative Style</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
                Prose style guidance — sentence structure, show vs. tell, voice, rhythm.
                Leave blank for the default style matched to your work type and POV.
              </div>
              <textarea
                value={sNarrativeStyle}
                onChange={(e) => setSNarrativeStyle(e.target.value)}
                rows={10}
                style={textareaStyle}
                placeholder={`PROSE STYLE:\n- Write in ${sPov === "first" ? "first" : "third"} person point of view, maintaining it consistently.\n- Use vivid, specific sensory details — not generic descriptions.\n- Vary sentence length and rhythm for natural prose flow.\n- Show, don't tell — render emotions through action, dialogue, and physical detail.\n- Let subtext do work — not everything needs to be stated explicitly.`}
              />
            </div>
          )}

          {/* ── MODEL & STATS ── */}
          {settingsTab === "model" && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Model</div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>Choose the AI model for story generation.</div>

              <label style={labelStyle}>Model</label>
              <select value={sModel} onChange={(e) => setSModel(e.target.value)} style={inputStyle}>
                <option value="">Claude Sonnet 4.6 (default)</option>
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                <option value="claude-opus-4">Claude Opus 4</option>
              </select>

              {/* Stats */}
              {manifest && (
                <div style={{ marginTop: 28, fontSize: 13, color: "#64748b" }}>
                  <div style={{ fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Stats</div>
                  <div>Notes: {manifest.notes.length}</div>
                  <div>Story versions: {manifest.storyVersions.length}</div>
                  <div>Memory entries: {manifest.memory.length}</div>
                  <div>Current word count: {manifest.currentStory?.split(/\s+/).length || 0}</div>
                  <div>Created: {fmtDate(manifest.createdAt)}</div>
                  <div>Last updated: {fmtDate(manifest.updatedAt)}</div>
                  {manifest.lastGeneratedAt && <div>Last generated: {fmtDate(manifest.lastGeneratedAt)} {fmtTime(manifest.lastGeneratedAt)}</div>}
                </div>
              )}
            </div>
          )}

          {/* ── Save Button (shown on all sub-tabs) ── */}
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #e2e8f0", display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={saveSettings}
              disabled={!!busy}
              style={{
                padding: "10px 24px",
                border: "none",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: busy ? "not-allowed" : "pointer",
                background: "#0f172a",
                color: "#fff",
                transition: "all 0.15s",
              }}
            >
              {busy || "Save Settings"}
            </button>
          </div>
        </div>
      )}

      {/* ─── SCRIBE TAB ─── */}
      {tab === "scribe" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Chat messages */}
          <div style={{ flex: 1, overflow: "auto", padding: "20px 20px 0" }}>
            {chatMessages.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#94a3b8" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✦</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#64748b", marginBottom: 8 }}>Scribe</div>
                <div style={{ fontSize: 14, maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
                  Your creative AI assistant. Ask about your world, characters, lore —
                  or get help with grammar, brainstorming, and storytelling craft.
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                  marginBottom: 12,
                }}
              >
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "10px 14px",
                    borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    background: msg.role === "user" ? "#0f172a" : "#f1f5f9",
                    color: msg.role === "user" ? "#fff" : "#0f172a",
                    fontSize: 14,
                    lineHeight: 1.6,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {msg.role === "assistant" && msg.content === "" && chatStreaming ? (
                    <span style={{ color: "#94a3b8", fontStyle: "italic" }}>Thinking…</span>
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Input bar */}
          <div style={{ padding: "12px 20px 16px", borderTop: "1px solid #e2e8f0", background: "#fff" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                ref={chatInputRef}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendScribeMessage();
                  }
                }}
                placeholder="Ask Scribe anything about your world…"
                rows={1}
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #e2e8f0",
                  fontSize: 14,
                  resize: "none",
                  outline: "none",
                  fontFamily: "inherit",
                  maxHeight: 120,
                  overflow: "auto",
                }}
              />
              <button
                onClick={sendScribeMessage}
                disabled={chatStreaming || !chatInput.trim()}
                style={{
                  padding: "10px 18px",
                  borderRadius: 12,
                  border: "none",
                  background: chatStreaming || !chatInput.trim() ? "#e2e8f0" : "#0f172a",
                  color: chatStreaming || !chatInput.trim() ? "#94a3b8" : "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: chatStreaming || !chatInput.trim() ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {chatStreaming ? "…" : "Send"}
              </button>
            </div>
            {chatMessages.length > 0 && (
              <button
                onClick={() => setChatMessages([])}
                style={{
                  marginTop: 8,
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: "1px solid #e2e8f0",
                  background: "none",
                  fontSize: 11,
                  color: "#94a3b8",
                  cursor: "pointer",
                }}
              >
                Clear chat
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Language Picker Modal ── */}
      {showLangPicker && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
          onClick={() => setShowLangPicker(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: "28px 32px",
              minWidth: 340,
              maxWidth: 420,
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>
              Choose Output Language
            </div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              Select the language for this generation
            </div>
            <select
              id="lang-picker-select"
              defaultValue={sLanguage || ""}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 14,
                marginBottom: 20,
                outline: "none",
              }}
            >
              <option value="">English (default)</option>
              <option value="English">English</option>
              <option value="French">French</option>
              <option value="Spanish">Spanish</option>
              <option value="German">German</option>
              <option value="Italian">Italian</option>
              <option value="Portuguese">Portuguese</option>
              <option value="Dutch">Dutch</option>
              <option value="Russian">Russian</option>
              <option value="Japanese">Japanese</option>
              <option value="Korean">Korean</option>
              <option value="Chinese">Chinese (Simplified)</option>
              <option value="Arabic">Arabic</option>
              <option value="Hindi">Hindi</option>
              <option value="Turkish">Turkish</option>
              <option value="Polish">Polish</option>
              <option value="Swedish">Swedish</option>
              <option value="Norwegian">Norwegian</option>
              <option value="Danish">Danish</option>
              <option value="Finnish">Finnish</option>
              <option value="Greek">Greek</option>
              <option value="Hebrew">Hebrew</option>
              <option value="Thai">Thai</option>
              <option value="Vietnamese">Vietnamese</option>
              <option value="Indonesian">Indonesian</option>
              <option value="Romanian">Romanian</option>
              <option value="Czech">Czech</option>
              <option value="Ukrainian">Ukrainian</option>
            </select>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowLangPicker(false)}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  background: "#fff",
                  color: "#64748b",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const sel = (document.getElementById("lang-picker-select") as HTMLSelectElement)?.value;
                  generateStory(sel || undefined);
                }}
                style={{
                  padding: "8px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: "#0f172a",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Generate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
