"use client";

import { formatStamp } from "@/lib/text";
import type { LookupResponse, SoundCloudMatch, TrackRow } from "@/lib/types";

function visibleWarning(message: string) {
  if (/couldn.?t listen/i.test(message)) return "The audio couldn't be read. Showing the written tracklist.";
  if (/audd|billed|authorization|api[_ ]?key|\.env|token|configured|comment|12-second|chunk|client id|client secret|invalid_client|keys are not/i.test(message)) {
    return "";
  }
  return message;
}

function initials(artist: string) {
  const letters = artist
    .split(/\s+/)
    .map((part) => part.replace(/[^a-z]/gi, "")[0] || "")
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return letters || "•";
}

function MatchActions({ item }: { item: SoundCloudMatch }) {
  return (
    <div className="side">
      {item.downloadable ? (
        <span className="chip good">{item.quality || "original"}</span>
      ) : (
        <span className="chip" title="The artist hasn't turned on downloads.">
          no download
        </span>
      )}
      <span className={`chip ${item.confidence}`}>{Math.round(item.score * 100)}%</span>
      {item.url ? (
        <a className="textbtn" href={item.url} target="_blank" rel="noreferrer">
          open
        </a>
      ) : null}
      {item.downloadable ? (
        <a className="textbtn" href={`/api/download?id=${item.id}`}>
          save
        </a>
      ) : null}
    </div>
  );
}

function Row({
  track,
  withHours,
}: {
  track: TrackRow;
  withHours: boolean;
}) {
  const artwork = track.match?.artwork || track.catalog?.artwork;
  const start = formatStamp(track.startSeconds, withHours);
  const end = formatStamp(track.endSeconds, withHours);
  const span = start && end ? `${start} – ${end}` : start;

  return (
    <li className="row">
      <div className="when">
        {start ? <span>{start}</span> : <span>{String(track.index + 1).padStart(2, "0")}</span>}
        {end ? <span>{end}</span> : null}
      </div>
      <div className="art">{artwork ? <img src={artwork} alt="" /> : <span>{initials(track.artist)}</span>}</div>
      <div className="meta">
        {span ? <div className="span">{span}</div> : null}
        <div className="who">{track.artist}</div>
        <div className="name">{track.title}</div>
        {track.label ? <div className="label">{track.label}</div> : null}
        <div className={track.match ? "matchline" : "matchline dim"}>
          {track.match
            ? `SoundCloud · ${track.match.username || track.match.artist}`
            : "No close SoundCloud upload"}
        </div>
        {track.links.length > 0 ? (
          <div className="buylinks">
            {track.links.map((link) => (
              <a key={link.label} href={link.url} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            ))}
          </div>
        ) : null}
        {track.alternates.length > 0 ? (
          <details className="alts">
            <summary>other uploads</summary>
            <ul>
              {track.alternates.map((alternate) => (
                <li key={alternate.id}>
                  <span>
                    {alternate.artist} — {alternate.title}
                  </span>
                  <em>{Math.round(alternate.score * 100)}%</em>
                  {alternate.url ? (
                    <a href={alternate.url} target="_blank" rel="noreferrer">
                      open
                    </a>
                  ) : null}
                  {alternate.downloadable ? <a href={`/api/download?id=${alternate.id}`}>save</a> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
      {track.match ? (
        <MatchActions item={track.match} />
      ) : (
        <div className="side" />
      )}
    </li>
  );
}

export function Results({
  result,
  onCopy,
  copied,
}: {
  result: LookupResponse;
  onCopy: (kind: "list" | "links") => void;
  copied: string;
}) {
  const sourceLabel = {
    mixcloud: "Mixcloud",
    youtube: "YouTube",
    soundcloud: "SoundCloud",
    paste: "Pasted list",
    audio: "Recording",
  }[result.set.source];
  const withHours = (result.set.durationSeconds ?? 0) >= 3600 || result.tracks.some((track) => track.endSeconds != null);
  const duration = formatStamp(result.set.durationSeconds ?? null, withHours);
  const downloadable = result.tracks.filter((track) => track.match?.downloadable);
  const coverage = result.set.coverage != null ? `${Math.round(result.set.coverage * 100)}% covered` : "";
  const byline = [
    result.set.author,
    duration,
    result.set.styles?.join(", "),
    `${result.tracks.length} track${result.tracks.length === 1 ? "" : "s"}`,
    coverage,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="results">
      <header className="sethead">
        <div className="setcopy">
          <p className="kicker">{sourceLabel}</p>
          <h1>{result.set.title}</h1>
          <p className="byline">{byline}</p>
        </div>
        <div className="setactions">
          {downloadable.length ? (
            <a
              className="save-set"
              href={`/api/download-set?ids=${downloadable.map((track) => track.match?.id).join(",")}&name=${encodeURIComponent(result.set.title)}`}
            >
              save set ({downloadable.length})
            </a>
          ) : null}
          <button type="button" className="textbtn" onClick={() => onCopy("list")} disabled={!result.tracks.length}>
            copy list
          </button>
          <button type="button" className="textbtn" onClick={() => onCopy("links")} disabled={!result.tracks.length}>
            copy links
          </button>
          {copied ? <span className="copied">{copied}</span> : null}
        </div>
      </header>
      {result.warnings.map(visibleWarning).filter(Boolean).map((warning) => (
        <p className="warning" key={warning}>
          {warning}
        </p>
      ))}
      {result.tracks.length ? (
        <ol className="rows">
          {result.tracks.map((track) => (
            <Row key={track.id} track={track} withHours={withHours} />
          ))}
        </ol>
      ) : (
        <p className="empty">Nothing to match yet.</p>
      )}
    </section>
  );
}
