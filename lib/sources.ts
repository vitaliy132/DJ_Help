import type { ParsedTrack, SourceName } from "./types";
import { env } from "./env";
import { HttpError, httpsUrl } from "./http";
import { parseTracklist } from "./parse-tracklist";
import type { ScTrack } from "./soundcloud";
import { resolveSoundCloud, soundcloudConfigured } from "./soundcloud";
import { getJson } from "./text";

export type PreparedTrack = ParsedTrack & { preset?: ScTrack };

export type SourceSet = {
  title: string;
  author?: string;
  artwork?: string;
  url?: string;
  source: SourceName;
  tracks: PreparedTrack[];
  warnings: string[];
  durationSeconds?: number;
  styles?: string[];
};

export function detectLink(input: string): "mixcloud" | "youtube" | "soundcloud" | null {
  try {
    const url = new URL(input.trim());
    const host = url.hostname.replace(/^www\./, "");
    if (host === "mixcloud.com" || host.endsWith(".mixcloud.com")) return "mixcloud";
    if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) return "youtube";
    if (host === "soundcloud.com" || host.endsWith(".soundcloud.com")) return "soundcloud";
    return null;
  } catch {
    return null;
  }
}

function youtubeId(input: string): string | null {
  const url = new URL(input);
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || null;
  if (url.pathname === "/watch") return url.searchParams.get("v");
  const nested = url.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/);
  return nested?.[1] ?? null;
}

export function bestCommentTracklist(texts: string[]): ParsedTrack[] {
  let best: ParsedTrack[] = [];
  for (const text of texts) {
    const parsed = parseTracklist(text);
    if (parsed.length > best.length) best = parsed;
  }
  return best.length >= 2 ? best : [];
}

export async function tracksFromYouTubeComments(input: string): Promise<ParsedTrack[]> {
  let id: string | null = null;
  try {
    id = youtubeId(input);
  } catch {
    return [];
  }
  const key = env("YOUTUBE_API_KEY");
  if (!id || !key) return [];
  try {
    const payload = await getJson<{
      items?: Array<{ snippet?: { topLevelComment?: { snippet?: { textDisplay?: string } } } }>;
    }>(
      `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${encodeURIComponent(id)}&order=relevance&maxResults=20&textFormat=plainText&key=${encodeURIComponent(key)}`,
    );
    const texts = (payload.items ?? []).flatMap((item) => {
      const text = item.snippet?.topLevelComment?.snippet?.textDisplay;
      return typeof text === "string" ? [text] : [];
    });
    return bestCommentTracklist(texts);
  } catch {
    return [];
  }
}

function mixcloudPath(input: string): string | null {
  const url = new URL(input);
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return `${parts[0]}/${parts[1]}`;
}

function styleNames(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const name = (item as { name?: unknown }).name;
    return typeof name === "string" && name.trim() ? [name.trim()] : [];
  });
  return names.length ? names : undefined;
}

function isoDuration(value: string): number | undefined {
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return undefined;
  const seconds = Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
  return seconds > 0 ? seconds : undefined;
}

function sectionTracks(sections: unknown): PreparedTrack[] {
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((section) => {
    if (!section || typeof section !== "object") return [];
    const record = section as Record<string, unknown>;
    const track = (record.track && typeof record.track === "object" ? record.track : record) as Record<string, unknown>;
    const artistRecord = track.artist && typeof track.artist === "object" ? (track.artist as { name?: string }) : undefined;
    const artist = artistRecord?.name || (typeof record.artist_name === "string" ? record.artist_name : "");
    const title = typeof track.name === "string" ? track.name : typeof track.title === "string" ? track.title : "";
    if (!artist || !title) return [];
    const start = typeof record.start_time === "number" ? record.start_time : null;
    return [{ artist, title, startSeconds: start }];
  });
}

async function readMixcloud(input: string): Promise<SourceSet> {
  const path = mixcloudPath(input);
  if (!path) throw new HttpError(400, "That Mixcloud link needs a show, not just a profile.");
  let data: Record<string, unknown>;
  try {
    data = await getJson<Record<string, unknown>>(`https://api.mixcloud.com/${path}/`);
  } catch {
    throw new HttpError(502, "Mixcloud didn't respond for that show.");
  }

  const tagged = sectionTracks(data.sections);
  const description = typeof data.description === "string" ? data.description : "";
  const tracks = tagged.length ? tagged : parseTracklist(description);
  const user = data.user && typeof data.user === "object" ? (data.user as { name?: string }) : undefined;
  const pictures = data.pictures && typeof data.pictures === "object" ? (data.pictures as { extra_large?: string }) : undefined;

  return {
    title: typeof data.name === "string" ? data.name : "Mixcloud set",
    author: user?.name,
    artwork: httpsUrl(pictures?.extra_large),
    url: httpsUrl(data.url) || input,
    source: "mixcloud",
    tracks,
    durationSeconds: typeof data.audio_length === "number" ? data.audio_length : undefined,
    styles: styleNames(data.tags),
    warnings: tracks.length
      ? []
      : ["This Mixcloud show has no tagged tracks and no tracklist in the description."],
  };
}

async function readYouTube(input: string): Promise<SourceSet> {
  const id = youtubeId(input);
  if (!id || !/^[\w-]{6,}$/.test(id)) throw new HttpError(400, "That YouTube link doesn't look like a video.");

  const key = env("YOUTUBE_API_KEY");
  if (!key) {
    let title = "YouTube set";
    let author: string | undefined;
    let artwork: string | undefined;
    try {
      const oembed = await getJson<{ title?: string; author_name?: string; thumbnail_url?: string }>(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`,
      );
      title = oembed.title || title;
      author = oembed.author_name;
      artwork = httpsUrl(oembed.thumbnail_url);
    } catch {
      // The title is optional. The description still needs an API key.
    }
    return {
      title,
      author,
      artwork,
      url: `https://www.youtube.com/watch?v=${id}`,
      source: "youtube",
      tracks: [],
      warnings: ["YouTube descriptions need a YOUTUBE_API_KEY. Paste the tracklist, or add the key."],
    };
  }

  let payload: {
    items?: Array<{
      snippet?: { title?: string; description?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> };
      contentDetails?: { duration?: string };
    }>;
  };
  try {
    payload = await getJson(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    throw new HttpError(502, message ? `YouTube: ${message}` : "YouTube didn't return that video. Check the API key.");
  }
  const snippet = payload.items?.[0]?.snippet;
  if (!snippet) throw new HttpError(404, "YouTube couldn't find that video.");
  const tracks = parseTracklist(snippet.description || "");
  const thumbs = snippet.thumbnails || {};
  return {
    title: snippet.title || "YouTube set",
    author: snippet.channelTitle,
    artwork: httpsUrl(thumbs.maxres?.url || thumbs.high?.url || thumbs.medium?.url),
    url: `https://www.youtube.com/watch?v=${id}`,
    source: "youtube",
    tracks,
    durationSeconds: isoDuration(payload.items?.[0]?.contentDetails?.duration || ""),
    warnings: tracks.length ? [] : ["No tracklist was written in this video description."],
  };
}

async function readSoundCloudUrl(input: string): Promise<SourceSet> {
  if (!soundcloudConfigured()) {
    throw new HttpError(
      400,
      "SoundCloud links need Artist Pro API keys. Paste the tracklist, or add SOUNDCLOUD_CLIENT_ID and SOUNDCLOUD_CLIENT_SECRET.",
    );
  }
  let resolved: ScTrack;
  try {
    resolved = await resolveSoundCloud(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "SoundCloud didn't resolve that link.";
    throw new HttpError(502, message);
  }

  const warnings: string[] = [];
  let tracks: PreparedTrack[] = [];
  if (resolved.tracks?.length || resolved.kind === "playlist") {
    tracks = (resolved.tracks ?? []).map((track) => ({
      artist: track.artist,
      title: track.title,
      startSeconds: null,
      preset: track,
    }));
    if (resolved.trackCount && resolved.trackCount > tracks.length) {
      warnings.push(`SoundCloud returned ${tracks.length} of ${resolved.trackCount} playlist tracks.`);
    }
  } else {
    tracks = parseTracklist(resolved.description || "");
    if (!tracks.length) warnings.push("No tracklist was written on this SoundCloud upload.");
  }

  return {
    title: resolved.title,
    author: resolved.username || resolved.artist,
    artwork: resolved.artwork,
    url: resolved.url || input,
    source: "soundcloud",
    tracks,
    durationSeconds: resolved.durationMs > 0 ? resolved.durationMs / 1000 : undefined,
    styles: resolved.genre?.split(",").map((style) => style.trim()).filter(Boolean),
    warnings,
  };
}

export async function readSource(kind: "mixcloud" | "youtube" | "soundcloud", input: string): Promise<SourceSet> {
  if (kind === "mixcloud") return readMixcloud(input);
  if (kind === "youtube") return readYouTube(input);
  return readSoundCloudUrl(input);
}

export async function probeYouTube(): Promise<void> {
  const key = env("YOUTUBE_API_KEY");
  if (!key) throw new Error("YouTube API key is not set.");
  await getJson(
    `https://www.googleapis.com/youtube/v3/videos?part=id&id=jNQXAC9IVRw&key=${encodeURIComponent(key)}`,
  );
}
