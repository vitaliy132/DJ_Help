import { downloadError, HttpError } from "@/lib/http";
import { mapPool } from "@/lib/pool";
import { openOfficialDownload, soundcloudConfigured } from "@/lib/soundcloud";
import { safeFilename } from "@/lib/text";
import { storeZip } from "@/lib/zip";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function attachment(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "").replace(/"/g, "") || "set";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

type SaveTrack = { id: number; index: number };

function readTracks(body: unknown): SaveTrack[] {
  if (!body || typeof body !== "object") return [];
  const tracks = (body as { tracks?: unknown }).tracks;
  if (!Array.isArray(tracks)) return [];
  const seen = new Set<number>();
  const parsed: SaveTrack[] = [];
  for (const item of tracks) {
    if (!item || typeof item !== "object") continue;
    const record = item as { id?: unknown; index?: unknown };
    const id = Number(record.id);
    const index = Number(record.index);
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    parsed.push({ id, index: Number.isInteger(index) && index >= 0 ? index : parsed.length });
  }
  return parsed;
}

export async function POST(request: Request) {
  try {
    if (!soundcloudConfigured()) throw new HttpError(400, "Add SoundCloud API keys before saving.");
    const body = (await request.json().catch(() => null)) as { name?: unknown; tracks?: unknown } | null;
    const tracks = readTracks(body);
    if (!tracks.length) throw new HttpError(400, "Choose tracks that can be saved.");
    if (tracks.length > 60) throw new HttpError(400, "A set save is limited to 60 tracks.");

    const downloaded = await mapPool(tracks, 3, async (track) => {
      try {
        const opened = await openOfficialDownload(String(track.id));
        const data = new Uint8Array(await opened.response.arrayBuffer());
        const order = String(track.index + 1).padStart(2, "0");
        return { name: `${order} ${opened.filename}`, data };
      } catch {
        return null;
      }
    });

    const files: Array<{ name: string; data: Uint8Array }> = [];
    const used = new Set<string>();
    for (const file of downloaded) {
      if (!file) continue;
      let name = file.name;
      if (used.has(name)) {
        const dot = name.lastIndexOf(".");
        const stem = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : "";
        let copy = 2;
        while (used.has(`${stem} (${copy})${ext}`)) copy += 1;
        name = `${stem} (${copy})${ext}`;
      }
      used.add(name);
      files.push({ name, data: file.data });
    }
    if (!files.length) throw new HttpError(404, "None of these tracks have downloads turned on.");

    const title = safeFilename(typeof body?.name === "string" ? body.name : "set");
    const zip = storeZip(files);
    return new Response(Buffer.from(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": attachment(`${title}.zip`),
        "content-length": String(zip.byteLength),
        "cache-control": "no-store",
        "x-saved": String(files.length),
        "x-skipped": String(tracks.length - files.length),
      },
    });
  } catch (error) {
    return downloadError(error);
  }
}
