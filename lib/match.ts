import { findCatalog, storeLinks } from "./catalog";
import { HttpError, warn } from "./http";
import { coverageOf, listenToSource } from "./listen";
import { parseTracklist } from "./parse-tracklist";
import { mapPool } from "./pool";
import { confidenceFor, scoreMatch } from "./score";
import { openOfficialDownload, searchSoundCloud, soundcloudConfigured, type ScTrack } from "./soundcloud";
import { detectLink, readSource, type PreparedTrack, type SourceSet } from "./sources";
import type { LookupResponse, SoundCloudMatch, TrackRow } from "./types";

const PLACEHOLDER = /^(id|tba|tbd|unknown|untitled|n\/?a|\?)$/i;

export function knownTracks(tracks: PreparedTrack[]): PreparedTrack[] {
  return tracks.filter((track) => !PLACEHOLDER.test(track.artist.trim()) && !PLACEHOLDER.test(track.title.trim()));
}

function toMatch(track: ScTrack, score: number): SoundCloudMatch | null {
  const confidence = confidenceFor(score);
  if (!confidence) return null;
  return {
    id: track.id,
    artist: track.artist,
    title: track.title,
    url: track.url,
    artwork: track.artwork,
    username: track.username,
    durationMs: track.durationMs,
    downloadable: track.downloadable,
    score,
    confidence,
  };
}

async function matchTracks(tracks: PreparedTrack[], warnings: string[]): Promise<TrackRow[]> {
  const enabled = soundcloudConfigured();
  if (!enabled) {
    warn(warnings, "SoundCloud keys are not set, so uploads are not searched yet. Store links still work.");
  }

  const slice = tracks.slice(0, 60);
  if (tracks.length > 60) warn(warnings, "Only the first 60 tracks were matched.");

  return mapPool(slice, 4, async (track, index) => {
    const catalog = await findCatalog(track.artist, track.title);
    const hint = catalog?.durationSec ? { durationSec: catalog.durationSec } : undefined;
    let ranked: SoundCloudMatch[] = [];

    if (track.preset) {
      const preset = toMatch(track.preset, 1);
      if (preset) ranked = [preset];
    } else if (enabled) {
      const uploads = await searchSoundCloud(track.artist, track.title, warnings);
      ranked = uploads
        .map((upload) =>
          toMatch(
            upload,
            scoreMatch(
              track.artist,
              track.title,
              {
                artist: upload.artist,
                title: upload.title,
                durationSec: upload.durationMs ? upload.durationMs / 1000 : undefined,
              },
              hint,
            ),
          ),
        )
        .filter((upload): upload is SoundCloudMatch => Boolean(upload))
        .sort((left, right) => {
          if (Math.abs(left.score - right.score) <= 0.05 && left.downloadable !== right.downloadable) {
            return left.downloadable ? -1 : 1;
          }
          return right.score - left.score;
        });
    }

    const primaryIndex = ranked.findIndex((item) => item.confidence !== "possible");
    const match = primaryIndex >= 0 ? ranked[primaryIndex] : null;
    const alternates = ranked.filter((_, itemIndex) => itemIndex !== primaryIndex).slice(0, 3);
    if (match?.downloadable) {
      try {
        const opened = await openOfficialDownload(String(match.id));
        await opened.response.body?.cancel().catch(() => undefined);
        match.quality = opened.quality;
      } catch {
        // The chip stays "original" when the file size can't be read.
      }
    }

    const row: TrackRow = {
      id: `${index}-${track.artist}-${track.title}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80),
      index,
      startSeconds: track.startSeconds,
      endSeconds: track.endSeconds ?? null,
      artist: track.artist,
      title: track.title,
      label: track.label || catalog?.label,
      catalog,
      match,
      alternates,
      links: storeLinks(track.artist, track.title, catalog),
    };
    return row;
  });
}

async function fromSource(source: SourceSet): Promise<LookupResponse> {
  const warnings = [...source.warnings];
  const listed = knownTracks(source.tracks);
  if (listed.length < source.tracks.length) warn(warnings, "Unidentified tracks were left out.");
  const tracks = listed.length ? await matchTracks(listed, warnings) : [];
  if (!tracks.length && !warnings.length) {
    warn(warnings, "No tracklist was found. Paste one, or upload the recording if AudD is configured.");
  }
  return {
    set: {
      title: source.title,
      author: source.author,
      artwork: source.artwork,
      url: source.url,
      source: source.source,
      durationSeconds: source.durationSeconds,
      styles: source.styles,
      coverage: coverageOf(listed, source.durationSeconds),
    },
    tracks,
    warnings,
    soundcloud: soundcloudConfigured(),
  };
}

export async function lookupInput(input: string, mode: "link" | "list"): Promise<LookupResponse> {
  const trimmed = input.trim();
  if (!trimmed) throw new HttpError(400, "Paste a set link or a tracklist.");
  const firstLine = trimmed.split(/\r?\n/)[0];
  const kind = detectLink(firstLine);

  if (mode === "link" && kind) return fromSource(await listenToSource(await readSource(kind, firstLine), firstLine));
  if (kind && mode === "list" && trimmed.split(/\r?\n/).length === 1) {
    return fromSource(await listenToSource(await readSource(kind, firstLine), firstLine));
  }

  const tracks = parseTracklist(trimmed);
  if (!tracks.length) {
    throw new HttpError(
      kind ? 422 : 400,
      kind
        ? "No written tracklist was found, and this mode expected Artist - Title lines."
        : "Use a Mixcloud, YouTube, or SoundCloud link, or lines like Artist - Title.",
    );
  }

  return fromSource({
    title: "Pasted tracklist",
    source: "paste",
    tracks,
    warnings: [],
  });
}

export async function lookupParsed(
  tracks: PreparedTrack[],
  set: SourceSet,
): Promise<LookupResponse> {
  if (!tracks.length) throw new HttpError(422, "No tracks were recognized in that recording.");
  return fromSource({ ...set, tracks });
}
