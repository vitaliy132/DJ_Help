export type SourceName = "mixcloud" | "youtube" | "soundcloud" | "paste" | "audio";

export type Confidence = "strong" | "likely" | "possible";

export type CatalogHit = {
  service: "deezer" | "itunes";
  artist: string;
  title: string;
  url: string;
  artwork?: string;
  durationSec?: number;
  label?: string;
  score: number;
};

export type SoundCloudMatch = {
  id: number;
  artist: string;
  title: string;
  url?: string;
  artwork?: string;
  username: string;
  durationMs: number;
  downloadable: boolean;
  score: number;
  confidence: Confidence;
  quality?: string;
};

export type TrackLink = {
  label: string;
  url: string;
};

export type TrackRow = {
  id: string;
  index: number;
  startSeconds: number | null;
  endSeconds: number | null;
  artist: string;
  title: string;
  label?: string;
  catalog: CatalogHit | null;
  match: SoundCloudMatch | null;
  alternates: SoundCloudMatch[];
  links: TrackLink[];
};

export type LookupSet = {
  title: string;
  author?: string;
  artwork?: string;
  url?: string;
  source: SourceName;
  durationSeconds?: number;
  styles?: string[];
  coverage?: number;
};

export type LookupResponse = {
  set: LookupSet;
  tracks: TrackRow[];
  warnings: string[];
  soundcloud: boolean;
};

export type ParsedTrack = {
  artist: string;
  title: string;
  startSeconds: number | null;
  endSeconds?: number | null;
  label?: string;
};

export type ServiceCheck = {
  configured: boolean;
  ok: boolean;
  detail: string;
};

export type AppStatus = {
  soundcloud: ServiceCheck;
  audd: ServiceCheck;
  youtube: ServiceCheck;
};
