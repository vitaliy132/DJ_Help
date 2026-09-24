import { env } from "./env";
import { httpsUrl, warn } from "./http";
import { mapPool } from "./pool";
import { getJson, safeFilename } from "./text";

export type ScTrack = {
  id: number;
  title: string;
  url?: string;
  artwork?: string;
  artist: string;
  username: string;
  durationMs: number;
  downloadable: boolean;
  genre?: string;
  description?: string;
  kind?: string;
  tracks?: ScTrack[];
  trackCount?: number;
};

type TokenCache = {
  access: string;
  refresh?: string;
  expiresAt: number;
};

const ALLOWED_HOST = /(^|\.)soundcloud\.com$|(^|\.)sndcdn\.com$/i;
let cached: TokenCache | null = null;
let pending: Promise<string> | null = null;

export function soundcloudConfigured(): boolean {
  return Boolean(env("SOUNDCLOUD_CLIENT_ID") && env("SOUNDCLOUD_CLIENT_SECRET"));
}

function publicTrackUrl(record: Record<string, unknown>, user: Record<string, unknown>): string | undefined {
  const direct = httpsUrl(record.permalink_url);
  if (direct && !/api\.soundcloud\.com/i.test(direct)) return direct;
  const userSlug = typeof user.permalink === "string" ? user.permalink : "";
  const slug = typeof record.permalink === "string" ? record.permalink : "";
  if (userSlug && slug) return `https://soundcloud.com/${userSlug}/${slug}`;
  return undefined;
}

function artwork(value: unknown): string | undefined {
  const url = httpsUrl(value);
  return url?.replace("-large.", "-t500x500.");
}

export function embeddedTrackIds(raw: unknown): number[] {
  if (!raw || typeof raw !== "object") return [];
  const tracks = (raw as { tracks?: unknown }).tracks;
  if (!Array.isArray(tracks)) return [];
  const ids: number[] = [];
  for (const track of tracks) {
    if (!track || typeof track !== "object") continue;
    const id = Number((track as { id?: unknown }).id);
    if (Number.isFinite(id)) ids.push(id);
  }
  return ids;
}

function trackList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as { collection?: unknown; tracks?: unknown };
  if (Array.isArray(record.collection)) return record.collection;
  if (Array.isArray(record.tracks)) return record.tracks;
  return [];
}

export function mapSoundCloudTrack(raw: unknown): ScTrack | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const user = (record.user && typeof record.user === "object" ? record.user : {}) as Record<string, unknown>;
  const id = Number(record.id);
  const title = typeof record.title === "string" ? record.title : "";
  if (!Number.isFinite(id) || !title) return null;

  const nested = Array.isArray(record.tracks)
    ? record.tracks.map(mapSoundCloudTrack).filter((track): track is ScTrack => Boolean(track))
    : undefined;

  return {
    id,
    title,
    url: publicTrackUrl(record, user),
    artwork: artwork(record.artwork_url) || artwork(user.avatar_url),
    artist: String(user.full_name || user.username || "Unknown"),
    username: typeof user.username === "string" ? user.username : "",
    durationMs: Number(record.duration || 0),
    downloadable: Boolean(record.downloadable) || typeof record.download_url === "string",
    genre: typeof record.genre === "string" && record.genre.trim() ? record.genre.trim() : undefined,
    description: typeof record.description === "string" ? record.description : undefined,
    kind: typeof record.kind === "string" ? record.kind : undefined,
    tracks: nested,
    trackCount: typeof record.track_count === "number" ? record.track_count : undefined,
  };
}

async function requestToken(refresh?: string): Promise<TokenCache> {
  const clientId = env("SOUNDCLOUD_CLIENT_ID");
  const clientSecret = env("SOUNDCLOUD_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("SoundCloud keys are not set.");

  const body = new URLSearchParams(
    refresh
      ? { grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refresh }
      : { grant_type: "client_credentials" },
  );
  const headers: Record<string, string> = {
    accept: "application/json; charset=utf-8",
    "content-type": "application/x-www-form-urlencoded",
  };
  if (!refresh) {
    headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  const response = await fetch("https://secure.soundcloud.com/oauth/token", {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string; error_description?: string } | null;
    const detail = payload?.error_description || payload?.error || "";
    throw new Error(`SoundCloud auth failed (${response.status})${detail ? `: ${detail}` : ""}.`);
  }
  const json = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("SoundCloud auth returned no token.");
  return {
    access: json.access_token,
    refresh: json.refresh_token,
    expiresAt: Date.now() + Math.max((json.expires_in ?? 3600) - 60, 30) * 1000,
  };
}

export async function getSoundCloudToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.access;
  if (!pending) {
    const refresh = cached?.refresh;
    pending = (refresh ? requestToken(refresh).catch(() => requestToken()) : requestToken())
      .then((token) => {
        cached = token;
        return token.access;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

async function soundcloudGet(path: string, token: string): Promise<unknown> {
  return getJson(`https://api.soundcloud.com${path}`, 20000, {
    accept: "application/json; charset=utf-8",
    authorization: `OAuth ${token}`,
  });
}

async function queryTracks(token: string, q: string, playable: boolean, limit: string): Promise<unknown[]> {
  const params = new URLSearchParams({ q, limit, linked_partitioning: "true" });
  if (playable) params.set("access", "playable");
  return trackList(await soundcloudGet(`/tracks?${params.toString()}`, token));
}

export async function searchSoundCloud(artist: string, title: string, warnings: string[]): Promise<ScTrack[]> {
  try {
    const token = await getSoundCloudToken();
    const query = `${artist} ${title}`;
    let list: unknown[];
    try {
      list = await queryTracks(token, query, true, "8");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (!message.includes("(400)")) throw error;
      list = await queryTracks(token, query, false, "8");
    }
    return list.map(mapSoundCloudTrack).filter((track): track is ScTrack => Boolean(track?.title));
  } catch (error) {
    const message = error instanceof Error ? error.message : "SoundCloud search failed.";
    warn(
      warnings,
      /auth|401|403|invalid/i.test(message) ? message : "SoundCloud search didn't respond. Catalog links are still filled in.",
    );
    return [];
  }
}

export async function probeSoundCloud(): Promise<void> {
  const token = await getSoundCloudToken();
  const payload = await soundcloudGet("/tracks?q=house&limit=1&linked_partitioning=true", token);
  const record = payload && typeof payload === "object" ? payload : null;
  if (!Array.isArray(payload) && !(record && ("collection" in record || "tracks" in record))) {
    throw new Error("SoundCloud search returned an unexpected response.");
  }
}

export async function resolveSoundCloud(url: string): Promise<ScTrack> {
  const token = await getSoundCloudToken();
  const payload = await soundcloudGet(`/resolve?url=${encodeURIComponent(url)}`, token);
  const mapped = mapSoundCloudTrack(payload);
  if (!mapped) throw new Error("SoundCloud didn't recognize that link.");

  const ids = embeddedTrackIds(payload);
  if (ids.length) {
    const have = new Map((mapped.tracks ?? []).filter((track) => track.title).map((track) => [track.id, track]));
    const missing = ids.filter((id) => !have.get(id)?.title);
    if (missing.length) {
      const fetched = await mapPool(missing, 4, async (id) => {
        try {
          return mapSoundCloudTrack(await soundcloudGet(`/tracks/${id}`, token));
        } catch {
          return null;
        }
      });
      for (const track of fetched) {
        if (track?.title) have.set(track.id, track);
      }
    }
    mapped.tracks = ids.flatMap((id) => {
      const track = have.get(id);
      return track?.title ? [track] : [];
    });
    mapped.kind = mapped.kind || "playlist";
    mapped.trackCount = Math.max(mapped.trackCount ?? 0, ids.length);
  }

  return mapped;
}

function extensionFor(contentType: string): string {
  if (contentType.includes("flac")) return "flac";
  if (contentType.includes("wav") || contentType.includes("wave")) return "wav";
  if (contentType.includes("aiff") || contentType.includes("aif")) return "aiff";
  if (contentType.includes("mp4") || contentType.includes("aac")) return "m4a";
  if (contentType.includes("ogg")) return "ogg";
  return "mp3";
}

export function describeQuality(bytes: number | null, durationMs: number, contentType: string): string {
  if (/wav|flac|aiff|aif|wave/.test(contentType)) return "lossless";
  if (!bytes || durationMs < 1000) return "original";
  const kbps = (bytes * 8) / (durationMs / 1000) / 1000;
  if (kbps >= 900) return "lossless";
  if (kbps >= 300) return "320 kbps";
  if (kbps >= 240) return "256 kbps";
  if (kbps >= 180) return "192 kbps";
  if (kbps >= 120) return "128 kbps";
  return "original";
}

export async function openOfficialDownload(id: string): Promise<{
  response: Response;
  filename: string;
  quality: string;
}> {
  if (!/^\d+$/.test(id)) throw new Error("Bad track id.");
  const token = await getSoundCloudToken();
  const track = mapSoundCloudTrack(await soundcloudGet(`/tracks/${id}`, token));
  if (!track) throw new Error("SoundCloud couldn't find that track.");
  if (!track.downloadable) throw new Error("This artist hasn't turned on downloads.");

  let current = `https://api.soundcloud.com/tracks/${track.id}/download`;
  let response: Response | null = null;
  for (let hop = 0; hop < 5; hop += 1) {
    const host = new URL(current).hostname;
    if (!ALLOWED_HOST.test(host)) throw new Error("The download left SoundCloud, so it was stopped.");
    const headers: Record<string, string> = {};
    if (host.endsWith("soundcloud.com")) headers.authorization = `OAuth ${token}`;
    response = await fetch(current, { headers, redirect: "manual", signal: AbortSignal.timeout(30000) });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("SoundCloud returned an empty download redirect.");
      current = new URL(location, current).toString();
      continue;
    }
    break;
  }

  if (!response?.ok || !response.body) {
    throw new Error(`SoundCloud didn't hand over the file (${response?.status ?? 0}).`);
  }
  const type = response.headers.get("content-type") || "";
  if (type.includes("text/html") || type.includes("application/json")) {
    throw new Error("SoundCloud didn't return an audio file for this download.");
  }

  const bytes = Number(response.headers.get("content-length")) || null;
  const extension = extensionFor(type);
  return {
    response,
    filename: `${safeFilename(`${track.artist} - ${track.title}`)}.${extension}`,
    quality: describeQuality(bytes, track.durationMs, type),
  };
}
