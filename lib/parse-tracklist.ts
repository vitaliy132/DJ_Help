import type { ParsedTrack } from "./types";
import { toPlainText } from "./text";

const SKIP =
  /^(follow|subscribe|download|https?:|www\.|instagram|soundcloud|mixcloud|youtube|tiktok|support|tracklist|track list|setlist|playlist|set by|recorded|enjoy|turn it up|find out|power up|tags?:|genre:|#)/i;

function parseStamp(stamp: string): number {
  const bits = stamp.split(":").map((part) => Number(part));
  if (bits.some((part) => !Number.isFinite(part))) return 0;
  if (bits.length === 3) return bits[0] * 3600 + bits[1] * 60 + bits[2];
  return bits[0] * 60 + bits[1];
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").replace(/^[-–—:|]+|[-–—:|]+$/g, "").trim();
}

export function parseTracklist(input: string): ParsedTrack[] {
  const tracks: ParsedTrack[] = [];
  const lines = toPlainText(input).split(/\r?\n/);

  for (const raw of lines) {
    let line = raw.replace(/\t+/g, " ").trim();
    if (line.length < 5 || SKIP.test(line)) continue;

    const hadIndex = /^\d{1,3}\s*[.)\]]/.test(line);
    line = line.replace(/^\d{1,3}\s*[.)\]]\s*/, "").trim();

    let startSeconds: number | null = null;
    let hadTime = false;
    const timed = line.match(/^\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*[-–—.]?\s*(.*)$/);
    if (timed?.[2]) {
      hadTime = true;
      startSeconds = parseStamp(timed[1]);
      line = timed[2].trim();
    }

    line = line.replace(/\s+\[?((?:\d{1,2}:)?\d{1,2}:\d{2})\]?\s*$/, "").trim();
    if (!line || SKIP.test(line)) continue;

    let parts = line.split(/\s+[-–—]\s+/);
    if (parts.length < 2 && (hadTime || hadIndex)) parts = line.split(/\s*:\s+/);
    if (parts.length < 2) continue;

    const artist = clean(parts[0]);
    const title = clean(parts.slice(1).join(" - "));
    if (!artist || !title || /^\d+$/.test(artist)) continue;
    if (artist.length > 140 || title.length > 180) continue;
    if (/^https?:\/\//i.test(artist) || /^https?:\/\//i.test(title)) continue;

    tracks.push({ artist, title, startSeconds });
    if (tracks.length >= 80) break;
  }

  return tracks;
}
