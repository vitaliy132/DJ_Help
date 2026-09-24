import type { ParsedTrack } from "./types";
import { env } from "./env";
import { HttpError } from "./http";

type RawSong = {
  artist?: string;
  title?: string;
  label?: string;
  start_seconds?: number;
  end_seconds?: number;
  start_offset?: number;
  end_offset?: number;
  songs?: RawSong[];
  offset?: string | number;
  deezer?: { album?: { label?: string } };
};

function stampSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.includes(":")) return null;
  const bits = value.split(":").map((part) => Number(part));
  if (!bits.length || bits.some((part) => !Number.isFinite(part))) return null;
  if (bits.length === 3) return bits[0] * 3600 + bits[1] * 60 + bits[2];
  if (bits.length === 2) return bits[0] * 60 + bits[1];
  return null;
}

function songLabel(song: RawSong): string | undefined {
  if (typeof song.label === "string" && song.label.trim()) return song.label.trim();
  const fromAlbum = song.deezer?.album?.label;
  if (typeof fromAlbum === "string" && fromAlbum.trim()) return fromAlbum.trim();
  return undefined;
}

function placed(song: RawSong, base: number | null): { startSeconds: number | null; endSeconds: number | null } {
  if (typeof song.start_seconds === "number") {
    return {
      startSeconds: song.start_seconds,
      endSeconds: typeof song.end_seconds === "number" ? song.end_seconds : null,
    };
  }
  if (base == null) return { startSeconds: null, endSeconds: null };
  const startSeconds = base + (typeof song.start_offset === "number" ? song.start_offset / 1000 : 0);
  const endSeconds = typeof song.end_offset === "number" ? base + song.end_offset / 1000 : null;
  return { startSeconds, endSeconds };
}

export function tracksFromAudd(payload: unknown): ParsedTrack[] {
  if (!payload || typeof payload !== "object") return [];
  const result = (payload as { result?: RawSong | RawSong[] | null }).result;
  if (!result) return [];
  const chunks = Array.isArray(result) ? result : [result];
  const tracks: ParsedTrack[] = [];

  for (const chunk of chunks) {
    const base = stampSeconds(chunk.offset);
    const songs = Array.isArray(chunk.songs) && chunk.songs.length ? chunk.songs : chunk.artist && chunk.title ? [chunk] : [];
    for (const song of songs) {
      if (!song.artist || !song.title) continue;
      const { startSeconds, endSeconds } = placed(song, base);
      const label = songLabel(song);
      const previous = tracks[tracks.length - 1];
      const same =
        previous &&
        previous.artist.toLowerCase() === song.artist.toLowerCase() &&
        previous.title.toLowerCase() === song.title.toLowerCase();
      const sameWindow =
        previous?.startSeconds != null &&
        startSeconds != null &&
        Math.abs(startSeconds - previous.startSeconds) < 1;
      if (previous && sameWindow && !same) continue;
      const previousEdge = previous?.endSeconds ?? previous?.startSeconds;
      const adjacent = previousEdge == null || startSeconds == null || startSeconds - previousEdge <= 40;
      if (same && adjacent && previous) {
        if (endSeconds != null) previous.endSeconds = previous.endSeconds == null ? endSeconds : Math.max(previous.endSeconds, endSeconds);
        else if (startSeconds != null) previous.endSeconds = previous.endSeconds == null ? startSeconds : Math.max(previous.endSeconds, startSeconds);
        if (!previous.label && label) previous.label = label;
        continue;
      }
      tracks.push({ artist: song.artist, title: song.title, startSeconds, endSeconds, label });
    }
  }

  return tracks;
}

export class AuddError extends HttpError {
  code?: number;
  quota: boolean;

  constructor(message: string, code?: number) {
    super(502, code != null ? `AudD ${code}: ${message}` : message);
    this.code = code;
    this.quota = code === 901 || code === 902 || code === 610 || code === 611 || /limit was reached/i.test(message);
  }
}

function auddFailure(payload: unknown): { message: string; code?: number } | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as { status?: string; error?: { error_code?: number; error_message?: string } | string };
  if (record.status !== "error") return null;
  if (typeof record.error === "string") return { message: record.error };
  const code = typeof record.error?.error_code === "number" ? record.error.error_code : undefined;
  return { message: record.error?.error_message || "AudD couldn't identify that file.", code };
}

function auddError(payload: unknown): string | null {
  const failure = auddFailure(payload);
  if (!failure) return null;
  return failure.code != null ? `AudD ${failure.code}: ${failure.message}` : failure.message;
}

export function auddConfigured(): boolean {
  return Boolean(env("AUDD_API_TOKEN"));
}

export async function probeAudd(): Promise<void> {
  const token = env("AUDD_API_TOKEN");
  if (!token) throw new Error("AudD token is not set.");
  const body = new FormData();
  body.set("api_token", token);
  const response = await fetch("https://api.audd.io/", {
    method: "POST",
    body,
    signal: AbortSignal.timeout(20000),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  const message = auddError(payload) || "";
  if (/token/i.test(message)) throw new Error(message);
  if (message && /file|url|audio/i.test(message)) return;
  if (!response.ok) throw new Error(message || `AudD returned ${response.status}.`);
}

export async function identifyAudio(
  file: File,
  options?: { every?: string; skip?: string; limit?: string; dense?: boolean; enterpriseOnly?: boolean },
): Promise<{ tracks: ParsedTrack[]; note?: string }> {
  const token = env("AUDD_API_TOKEN");
  if (!token) {
    throw new HttpError(400, "Audio identification needs an AUDD_API_TOKEN from dashboard.audd.io.");
  }

  const every = options?.every || env("AUDD_EVERY") || "1";
  const skip = options?.skip || env("AUDD_SKIP") || "2";
  const limit = options?.limit || env("AUDD_LIMIT") || "200";
  const body = new FormData();
  body.set("api_token", token);
  body.set("return", "apple_music,spotify,deezer");
  body.set("accurate_offsets", "true");
  body.set("limit", limit);
  body.set("every", every);
  body.set("skip", skip);
  body.set("file", file, file.name);

  let response: Response;
  try {
    response = await fetch("https://enterprise.audd.io/", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(300000),
    });
  } catch {
    throw new HttpError(502, "AudD didn't respond. A long set can take a few minutes, then try again.");
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  const failure = auddFailure(payload);
  if (!response.ok || failure) {
    if (failure && (options?.enterpriseOnly || new AuddError(failure.message, failure.code).quota)) {
      throw new AuddError(failure.message, failure.code);
    }
    if (!options?.enterpriseOnly && file.size <= 10 * 1024 * 1024) return identifyClip(file, token);
    throw new HttpError(502, failure ? auddError(payload) || failure.message : "AudD couldn't read that recording. Full sets need an AudD plan with the enterprise endpoint.");
  }

  const tracks = tracksFromAudd(payload);
  if (!tracks.length && !options?.enterpriseOnly && file.size <= 10 * 1024 * 1024) return identifyClip(file, token);
  const note = options?.dense
    ? "AudD listened through this set in 12-second chunks. Each recognized chunk is billed."
    : skip === "0"
      ? undefined
      : `AudD sampled this recording: ${every} chunk recognized, then ${skip} skipped. Each chunk is 12 seconds and is billed. Set AUDD_SKIP=0 for every chunk.`;
  return { tracks, note };
}

async function identifyClip(file: File, token: string): Promise<{ tracks: ParsedTrack[]; note?: string }> {
  const body = new FormData();
  body.set("api_token", token);
  body.set("return", "apple_music,spotify,deezer");
  body.set("file", file, file.name);
  const response = await fetch("https://api.audd.io/", {
    method: "POST",
    body,
    signal: AbortSignal.timeout(30000),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  const message = auddError(payload);
  if (!response.ok || message) throw new HttpError(502, message || "AudD couldn't identify that clip.");
  return {
    tracks: tracksFromAudd(payload),
    note: "This file was identified as one clip. Full sets use the AudD enterprise endpoint.",
  };
}
