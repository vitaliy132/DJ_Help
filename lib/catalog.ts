import type { CatalogHit, TrackLink } from "./types";
import { httpsUrl } from "./http";
import { scoreMatch } from "./score";
import { getJson } from "./text";

type Candidate = {
  service: "deezer" | "itunes";
  artist: string;
  title: string;
  url: string;
  artwork?: string;
  durationSec?: number;
  label?: string;
  albumId?: number;
};

function best(artist: string, title: string, candidates: Candidate[]): (Candidate & { score: number }) | null {
  const ranked = candidates
    .map((candidate) => ({ ...candidate, score: scoreMatch(artist, title, candidate) }))
    .sort((left, right) => right.score - left.score);
  const winner = ranked[0];
  if (!winner || winner.score < 0.45) return null;
  return winner;
}

async function searchDeezer(artist: string, title: string): Promise<Candidate[]> {
  const payload = await getJson<{ data?: Array<Record<string, unknown>> }>(
    `https://api.deezer.com/search?q=${encodeURIComponent(`${artist} ${title}`)}&limit=6`,
  );
  return (payload.data ?? []).flatMap((hit) => {
    const hitArtist = hit.artist as { name?: string } | undefined;
    const album = hit.album as { id?: number; cover_medium?: string } | undefined;
    const url = httpsUrl(hit.link);
    if (!hitArtist?.name || typeof hit.title !== "string" || !url) return [];
    return [
      {
        service: "deezer" as const,
        artist: hitArtist.name,
        title: hit.title,
        url,
        artwork: httpsUrl(album?.cover_medium),
        durationSec: typeof hit.duration === "number" ? hit.duration : undefined,
        albumId: typeof album?.id === "number" ? album.id : undefined,
      },
    ];
  });
}

async function searchItunes(artist: string, title: string): Promise<Candidate[]> {
  const payload = await getJson<{ results?: Array<Record<string, unknown>> }>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(`${artist} ${title}`)}&entity=song&limit=6`,
  );
  return (payload.results ?? []).flatMap((hit) => {
    const url = httpsUrl(hit.trackViewUrl);
    if (typeof hit.artistName !== "string" || typeof hit.trackName !== "string" || !url) return [];
    const artwork =
      typeof hit.artworkUrl100 === "string" ? httpsUrl(hit.artworkUrl100.replace("100x100", "300x300")) : undefined;
    return [
      {
        service: "itunes" as const,
        artist: hit.artistName,
        title: hit.trackName,
        url,
        artwork,
        durationSec: typeof hit.trackTimeMillis === "number" ? hit.trackTimeMillis / 1000 : undefined,
      },
    ];
  });
}

async function withLabel(hit: CatalogHit & { albumId?: number }): Promise<CatalogHit> {
  if (hit.label || hit.service !== "deezer" || !hit.albumId) return hit;
  try {
    const album = await getJson<{ label?: string }>(`https://api.deezer.com/album/${hit.albumId}`);
    if (typeof album.label === "string" && album.label.trim()) return { ...hit, label: album.label.trim() };
  } catch {
    // The row still works without a label.
  }
  return hit;
}

export async function findCatalog(artist: string, title: string): Promise<CatalogHit | null> {
  try {
    const deezer = await searchDeezer(artist, title);
    const deezerBest = best(artist, title, deezer);
    if (deezerBest && deezerBest.score >= 0.62) return withLabel(deezerBest);
    const itunes = await searchItunes(artist, title);
    const winner = best(artist, title, [...deezer, ...itunes]);
    return winner ? withLabel(winner) : null;
  } catch {
    return null;
  }
}

export function storeLinks(artist: string, title: string, catalog: CatalogHit | null): TrackLink[] {
  const query = encodeURIComponent(`${artist} ${title}`);
  const links: TrackLink[] = [
    { label: "beatport", url: `https://www.beatport.com/search?q=${query}` },
    { label: "bandcamp", url: `https://bandcamp.com/search?q=${query}` },
    { label: "traxsource", url: `https://www.traxsource.com/search?term=${query}` },
  ];
  if (catalog?.service === "deezer") links.unshift({ label: "deezer", url: catalog.url });
  if (catalog?.service === "itunes") links.unshift({ label: "apple", url: catalog.url });
  return links;
}
