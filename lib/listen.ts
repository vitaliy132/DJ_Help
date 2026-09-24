import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { AuddError, auddConfigured, identifyAudio } from "./audd";
import { HttpError } from "./http";
import type { PreparedTrack, SourceSet } from "./sources";
import { tracksFromYouTubeComments } from "./sources";
import type { ParsedTrack } from "./types";

const SLICE_SECONDS = 180;

function run(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new HttpError(504, `${command} took too long.`));
    }, timeoutMs);
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-400);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (error.code === "ENOENT") reject(new HttpError(400, `${command} is not installed.`));
      else reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new HttpError(502, stderr.trim().split("\n").pop() || `${command} failed.`));
    });
  });
}

function runCapture(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new HttpError(504, `${command} took too long.`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-400);
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (error.code === "ENOENT") reject(new HttpError(400, `${command} is not installed.`));
      else reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new HttpError(502, stderr.trim().split("\n").pop() || `${command} failed.`));
    });
  });
}

export function shiftTracks<T extends { startSeconds: number | null; endSeconds?: number | null }>(tracks: T[], offsetSeconds: number): T[] {
  if (!offsetSeconds) return tracks;
  return tracks.map((track) => ({
    ...track,
    startSeconds: track.startSeconds == null ? null : track.startSeconds + offsetSeconds,
    endSeconds: track.endSeconds == null ? null : track.endSeconds + offsetSeconds,
  }));
}

export function assembleHeard(slices: Array<{ tracks: ParsedTrack[]; quota?: boolean }>): { tracks: ParsedTrack[]; partial: boolean } {
  const tracks: ParsedTrack[] = [];
  for (const slice of slices) {
    if (slice.quota) return { tracks, partial: true };
    for (const track of slice.tracks) {
      const previous = tracks[tracks.length - 1];
      const same =
        previous &&
        previous.artist.toLowerCase() === track.artist.toLowerCase() &&
        previous.title.toLowerCase() === track.title.toLowerCase();
      const edge = previous?.endSeconds ?? previous?.startSeconds;
      if (same && previous && edge != null && track.startSeconds != null && track.startSeconds - edge <= 40) {
        if (track.endSeconds != null) previous.endSeconds = Math.max(previous.endSeconds ?? track.endSeconds, track.endSeconds);
        continue;
      }
      tracks.push({ ...track });
    }
  }
  return { tracks, partial: false };
}

async function identifySlices(path: string): Promise<{ tracks: ParsedTrack[]; partial: boolean; detail?: string }> {
  const probed = Number(await runCapture("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], 20000));
  const duration = Number.isFinite(probed) && probed > 0 ? probed : SLICE_SECONDS;
  const dir = dirname(path);
  const slices: Array<{ tracks: ParsedTrack[]; quota?: boolean }> = [];
  let detail: string | undefined;

  for (let start = 0, index = 0; start < duration; start += SLICE_SECONDS, index += 1) {
    const length = Math.min(SLICE_SECONDS, duration - start);
    const slicePath = join(dir, `slice-${index}.mp3`);
    await run(
      "ffmpeg",
      ["-y", "-ss", String(start), "-t", String(length), "-i", path, "-ac", "1", "-b:a", "64k", slicePath],
      120000,
    );
    const bytes = await readFile(slicePath);
    const file = new File([bytes], `slice-${index}.mp3`, { type: "audio/mpeg" });
    const limit = String(Math.max(1, Math.ceil(length / 12)));
    try {
      const identified = await identifyAudio(file, { every: "1", skip: "0", limit, dense: true, enterpriseOnly: true });
      slices.push({ tracks: shiftTracks(identified.tracks, start) });
    } catch (error) {
      if (error instanceof AuddError && error.quota) {
        slices.push({ tracks: [], quota: true });
        detail = error.message;
        break;
      }
      throw error;
    }
  }

  const heard = assembleHeard(slices);
  return { tracks: heard.tracks, partial: heard.partial, detail };
}

export async function captureSetAudio(url: string): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), "dj-help-"));
  const cleanup = () => rm(dir, { recursive: true, force: true });
  try {
    await run(
      "yt-dlp",
      [
        "-f",
        "bestaudio/best",
        "-x",
        "--audio-format",
        "mp3",
        "--postprocessor-args",
        "ffmpeg:-ac 1 -b:a 64k",
        "--no-playlist",
        "--no-warnings",
        "-o",
        join(dir, "set.%(ext)s"),
        url,
      ],
      300000,
    );
    const names = await readdir(dir);
    const audio = names.find((name) => name.endsWith(".mp3")) || names[0];
    if (!audio) throw new HttpError(502, "The set audio didn't download.");
    return { path: join(dir, audio), cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

function heardCovers(item: PreparedTrack, at: number): boolean {
  if (item.startSeconds == null) return false;
  const end = item.endSeconds ?? item.startSeconds + 12;
  return at >= item.startSeconds - 1 && at <= end + 1;
}

export function mergeHeardWithWritten(heard: PreparedTrack[], written: PreparedTrack[]): PreparedTrack[] {
  if (!heard.length) return written;
  const fillers = written.filter((track) => track.startSeconds != null && !heard.some((item) => heardCovers(item, track.startSeconds as number)));
  return [...heard, ...fillers].sort((left, right) => (left.startSeconds ?? 0) - (right.startSeconds ?? 0));
}

export function coverageOf(
  tracks: Array<{ startSeconds: number | null; endSeconds?: number | null }>,
  durationSeconds?: number,
): number | undefined {
  if (!durationSeconds || durationSeconds <= 0) return undefined;
  const timed = tracks
    .filter((track) => track.startSeconds != null)
    .slice()
    .sort((left, right) => (left.startSeconds ?? 0) - (right.startSeconds ?? 0));
  let covered = 0;
  let cursor = 0;
  for (let index = 0; index < timed.length; index += 1) {
    const start = timed[index].startSeconds ?? 0;
    const next = timed[index + 1]?.startSeconds;
    const end = Math.min(durationSeconds, timed[index].endSeconds ?? next ?? Math.min(start + 12, durationSeconds));
    const from = Math.max(start, cursor);
    if (end > from) covered += end - from;
    cursor = Math.max(cursor, end);
  }
  if (covered <= 0) return undefined;
  return Math.min(1, covered / durationSeconds);
}

export async function listenToSource(source: SourceSet, url: string): Promise<SourceSet> {
  if (source.tracks.some((track) => track.preset)) return source;
  if (!auddConfigured()) {
    return {
      ...source,
      warnings: [...source.warnings, "AudD is not configured, so this used the written tracklist."],
    };
  }

  let cleanup: (() => Promise<void>) | undefined;
  try {
    const captured = await captureSetAudio(url);
    cleanup = captured.cleanup;
    const identified = await identifySlices(captured.path);
    if (!identified.tracks.length && identified.detail) {
      const recovered = await recoverFromComments(source, url, identified.detail);
      if (recovered) return recovered;
    }
    const heard: PreparedTrack[] = identified.tracks;
    const tracks = mergeHeardWithWritten(heard, source.tracks);
    const warnings = source.warnings.filter((warning) => !/no tracklist|no tagged/i.test(warning));
    warnings.push("AudD listened through this set in 12-second chunks. Each recognized chunk is billed.");
    if (identified.partial && identified.detail) {
      warnings.push(`${identified.detail} Tracks already heard are kept. The rest of the set was not billed.`);
    }
    if (!heard.length) warnings.push("AudD didn't recognize tracks in this set. Showing the written tracklist.");
    return { ...source, tracks: tracks.length ? tracks : source.tracks, warnings };
  } catch (error) {
    const message = error instanceof Error ? error.message : "the audio couldn't be read";
    if (error instanceof AuddError && error.quota) {
      const recovered = await recoverFromComments(source, url, message);
      if (recovered) return recovered;
    }
    return {
      ...source,
      warnings: [...source.warnings, `Couldn't listen to this set (${message}). Showing the written tracklist.`],
    };
  } finally {
    await cleanup?.();
  }
}

async function recoverFromComments(source: SourceSet, url: string, detail: string): Promise<SourceSet | null> {
  if (source.source !== "youtube") return null;
  const comments = await tracksFromYouTubeComments(url);
  if (comments.length < 2) return null;
  const warnings = source.warnings.filter((warning) => !/no tracklist|no tagged/i.test(warning));
  warnings.push(`${detail} Using a tracklist from the video comments.`);
  return { ...source, tracks: comments, warnings };
}
