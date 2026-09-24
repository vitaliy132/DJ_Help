import { downloadError, HttpError } from "@/lib/http";
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

export async function GET(request: Request) {
  try {
    if (!soundcloudConfigured()) throw new HttpError(400, "Add SoundCloud API keys before saving.");
    const url = new URL(request.url);
    const ids = [...new Set((url.searchParams.get("ids") || "").split(",").map((id) => id.trim()).filter((id) => /^\d+$/.test(id)))];
    if (!ids.length) throw new HttpError(400, "Choose tracks that can be saved.");
    if (ids.length > 60) throw new HttpError(400, "A set save is limited to 60 tracks.");

    const files: Array<{ name: string; data: Uint8Array }> = [];
    const used = new Set<string>();
    for (const id of ids) {
      try {
        const opened = await openOfficialDownload(id);
        const data = new Uint8Array(await opened.response.arrayBuffer());
        let name = opened.filename;
        if (used.has(name)) {
          const dot = name.lastIndexOf(".");
          const stem = dot > 0 ? name.slice(0, dot) : name;
          const ext = dot > 0 ? name.slice(dot) : "";
          let copy = 2;
          while (used.has(`${stem} (${copy})${ext}`)) copy += 1;
          name = `${stem} (${copy})${ext}`;
        }
        used.add(name);
        files.push({ name, data });
      } catch {
        // Artists who have not turned downloads on are left out of the zip.
      }
    }
    if (!files.length) throw new HttpError(404, "None of these tracks have downloads turned on.");

    const title = safeFilename(url.searchParams.get("name") || "set");
    const zip = storeZip(files);
    return new Response(Buffer.from(zip), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": attachment(`${title}.zip`),
        "content-length": String(zip.byteLength),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return downloadError(error);
  }
}
