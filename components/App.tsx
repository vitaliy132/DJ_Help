"use client";

import { useEffect, useRef, useState } from "react";
import { Results } from "@/components/Results";
import { IconLink, IconList, IconPaste, IconRecord, IconWave } from "@/components/icons";
import { formatStamp } from "@/lib/text";
import type { LookupResponse } from "@/lib/types";

type View = "find" | "queue";
type Mode = "link" | "list" | "audio";

type HistoryItem = {
  id: string;
  at: number;
  query: string;
  mode: Mode;
  result: LookupResponse;
};

const HISTORY_KEY = "dj-help-history";
const SAMPLE_SET =
  "https://www.mixcloud.com/undergroundkollektiv/dadas-d-house-party-004-tracklist-in-description-udgk-03052024/";

async function readError(response: Response) {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error || `Request failed (${response.status}).`;
}

export function App() {
  const [view, setView] = useState<View>("find");
  const [mode, setMode] = useState<Mode>("link");
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<LookupResponse | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored) as HistoryItem[]);
    } catch {
      localStorage.removeItem(HISTORY_KEY);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 8)));
  }, [history, ready]);

  function remember(query: string, nextMode: Mode, next: LookupResponse) {
    setHistory((current) => [
      { id: crypto.randomUUID(), at: Date.now(), query, mode: nextMode, result: next },
      ...current.filter((item) => item.query !== query),
    ].slice(0, 8));
  }

  async function submit(nextInput = input, nextMode = mode, nextFile = file) {
    setError("");
    setCopied("");
    setLoading(true);
    try {
      let response: Response;
      if (nextMode === "audio") {
        if (!nextFile) throw new Error("Choose a recording first.");
        const body = new FormData();
        body.set("file", nextFile);
        response = await fetch("/api/identify", { method: "POST", body });
      } else {
        response = await fetch("/api/lookup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: nextInput, mode: nextMode }),
        });
      }
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as LookupResponse;
      setResult(data);
      setView("find");
      remember(nextMode === "audio" ? nextFile?.name || "Recording" : nextInput.trim(), nextMode, data);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Something went wrong.";
      setError(/audd|authorization|billed|token|api[_ ]?key|\.env/i.test(message) ? "That couldn't be read. Try again, or paste a tracklist." : message);
    } finally {
      setLoading(false);
    }
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      setInput(text);
      const nextMode = text.includes("\n") ? "list" : "link";
      setMode(nextMode);
      requestAnimationFrame(() => (nextMode === "list" ? listRef : inputRef).current?.focus());
    } catch {
      setError("Clipboard permission was blocked. Paste into the field instead.");
    }
  }

  async function copyResult(kind: "list" | "links") {
    if (!result) return;
    const text =
      kind === "list"
        ? result.tracks
            .map((track) => {
              const stamp = formatStamp(track.startSeconds);
              const line = `${track.artist} - ${track.title}`;
              return stamp ? `${stamp} ${line}` : line;
            })
            .join("\n")
        : result.tracks
            .map((track) => track.match?.url)
            .filter(Boolean)
            .join("\n");
    if (!text) {
      setCopied(kind === "links" ? "no links" : "nothing to copy");
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopied(kind === "links" ? "links copied" : "list copied");
  }

  const showFinder = view === "find";
  const hasResult = view === "find" && Boolean(result);

  return (
    <div className="app">
      <header className="top">
        <button
          className="brand"
          type="button"
          onClick={() => {
            setView("find");
            setResult(null);
            setError("");
            setCopied("");
          }}
          aria-label="DJ Help home"
        >
          <IconRecord />
        </button>
        <nav className="wordnav" aria-label="sections">
          <button type="button" aria-current={view === "queue" ? "page" : undefined} onClick={() => setView("queue")}>
            queue{history.length > 0 ? ` ${history.length}` : ""}
          </button>
        </nav>
      </header>

      <main className={hasResult ? "stage has-result" : "stage"}>

        {showFinder ? (
          <div
            className="composer-wrap"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const next = event.dataTransfer.files?.[0];
              if (!next) return;
              setFile(next);
              setMode("audio");
              setError("");
            }}
          >
            <form
              className="composer"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              {mode === "audio" ? (
                <button type="button" className={hasResult ? "drop compact" : "drop"} onClick={() => fileRef.current?.click()}>
                  <IconWave />
                  <span>{file ? file.name : "drop a recording, or choose a file"}</span>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="audio/*,video/*,.mp3,.wav,.flac,.aiff,.m4a,.mp4"
                    hidden
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                  />
                </button>
              ) : mode === "list" && !hasResult ? (
                <textarea
                  ref={listRef}
                  className="field tall"
                  value={input}
                  placeholder={"00:00 Artist - Title\n00:06 Artist - Title"}
                  aria-label="tracklist"
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                />
              ) : (
                <input
                  ref={inputRef}
                  className="field"
                  value={input}
                  placeholder={mode === "list" ? "Artist - Title" : "paste a set link"}
                  aria-label={mode === "list" ? "tracklist" : "set link"}
                  onChange={(event) => setInput(event.target.value)}
                />
              )}
              <div className="modes">
                <div className="modegroup" role="group" aria-label="input type">
                  <button type="button" className="mode link" aria-pressed={mode === "link"} onClick={() => setMode("link")}>
                    <IconLink /> link
                  </button>
                  <button type="button" className="mode list" aria-pressed={mode === "list"} onClick={() => setMode("list")}>
                    <IconList /> list
                  </button>
                  <button type="button" className="mode audio" aria-pressed={mode === "audio"} onClick={() => setMode("audio")}>
                    <IconWave /> file
                  </button>
                </div>
                <div className="modeactions">
                  {mode !== "audio" ? (
                    <button type="button" className="ghost" onClick={() => void paste()}>
                      <IconPaste /> paste
                    </button>
                  ) : null}
                  <button className="find" type="submit" disabled={loading || (mode === "audio" ? !file : !input.trim())}>
                    {loading ? "working" : "find"}
                  </button>
                </div>
              </div>
            </form>
            {error ? <p className="error">{error}</p> : null}
            {loading ? (
              <p className="statusline">
                {mode === "list" ? "Matching tracks." : "Listening to the set. A long one can take a few minutes."}
              </p>
            ) : null}
            {!hasResult && !loading && mode === "link" ? (
              <button
                type="button"
                className="sample"
                onClick={() => {
                  setInput(SAMPLE_SET);
                  void submit(SAMPLE_SET, "link", null);
                }}
              >
                try a house set
              </button>
            ) : null}
          </div>
        ) : null}

        {hasResult && result ? (
          <Results result={result} onCopy={(kind) => void copyResult(kind)} copied={copied} />
        ) : null}

        {view === "queue" ? (
          <section className="panel">
            <p className="kicker">queue</p>
            <h1>Recent sets.</h1>
            {history.length ? (
              <ul className="queue">
                {history.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setResult(item.result);
                        setMode(item.mode);
                        setInput(item.mode === "audio" ? "" : item.query);
                        setView("find");
                      }}
                    >
                      <strong>{item.result.set.title}</strong>
                      <span>
                        {item.result.tracks.length} tracks · {new Date(item.at).toLocaleString()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">Sets you look up will sit here, on this browser.</p>
            )}
            {history.length ? (
              <button
                type="button"
                className="textbtn"
                onClick={() => {
                  setHistory([]);
                  localStorage.removeItem(HISTORY_KEY);
                }}
              >
                clear
              </button>
            ) : null}
          </section>
        ) : null}

      </main>
    </div>
  );
}
