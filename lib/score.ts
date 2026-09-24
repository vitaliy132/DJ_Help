import type { Confidence } from "./types";

const VERSION_RE = /\b(remix|bootleg|edits?|flip|cover|rework|vip|dubs?|instrumental|acapella|extended)\b/g;

export function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(feat|ft|featuring)\b.*/g, " ")
    .replace(/\b(official|audio|video|lyrics|visualizer|topic|hd|hq)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 1);
}

function jaccard(left: string[], right: string[]): number {
  if (!left.length || !right.length) return 0;
  const rightSet = new Set(right);
  let shared = 0;
  for (const token of new Set(left)) {
    if (rightSet.has(token)) shared += 1;
  }
  return shared / new Set([...left, ...right]).size;
}

function hasPhrase(haystack: string, needle: string): boolean {
  const cleanNeedle = normalize(needle);
  if (cleanNeedle.length < 2) return false;
  return ` ${normalize(haystack)} `.includes(` ${cleanNeedle} `);
}

function versions(value: string): Set<string> {
  return new Set(normalize(value).match(new RegExp(VERSION_RE.source, "g")) ?? []);
}

export function scoreMatch(
  queryArtist: string,
  queryTitle: string,
  candidate: { artist: string; title: string; durationSec?: number },
  hint?: { durationSec?: number },
): number {
  let candidateArtist = candidate.artist;
  let candidateTitle = candidate.title;
  const split = candidate.title.split(/\s+[-–—]\s+/);
  if (split.length >= 2) {
    candidateArtist = `${candidate.artist} ${split[0]}`;
    candidateTitle = split.slice(1).join(" - ");
  }

  const titleScore = Math.max(
    jaccard(tokens(queryTitle), tokens(candidateTitle)),
    hasPhrase(candidateTitle, queryTitle) || hasPhrase(queryTitle, candidateTitle) ? 0.94 : 0,
  );
  const artistScore = Math.max(
    jaccard(tokens(queryArtist), tokens(candidateArtist)),
    hasPhrase(candidateArtist, queryArtist) || hasPhrase(queryArtist, candidateArtist) ? 0.92 : 0,
    hasPhrase(candidate.title, queryArtist) ? 0.78 : 0,
  );

  let score = titleScore * 0.64 + artistScore * 0.36;
  const queryVersions = versions(queryTitle);
  const candidateVersions = versions(`${candidateTitle} ${candidate.title}`);
  for (const version of candidateVersions) {
    if (!queryVersions.has(version)) score -= version === "bootleg" || version === "remix" ? 0.2 : 0.12;
  }
  for (const version of queryVersions) {
    if (!candidateVersions.has(version)) score -= 0.08;
  }

  if (hint?.durationSec && candidate.durationSec) {
    const diff = Math.abs(hint.durationSec - candidate.durationSec);
    if (diff <= 8) score += 0.06;
    else if (diff / Math.max(hint.durationSec, 1) > 0.28) score -= 0.14;
  }

  return Math.max(0, Math.min(1, score));
}

export function confidenceFor(score: number): Confidence | null {
  if (score >= 0.78) return "strong";
  if (score >= 0.55) return "likely";
  if (score >= 0.4) return "possible";
  return null;
}
