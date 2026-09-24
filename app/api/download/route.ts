import { downloadError, HttpError } from "@/lib/http";
import { openOfficialDownload, soundcloudConfigured } from "@/lib/soundcloud";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function attachment(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "").replace(/"/g, "") || "track";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(request: Request) {
  try {
    if (!soundcloudConfigured()) throw new HttpError(400, "Add SoundCloud API keys before saving.");
    const id = new URL(request.url).searchParams.get("id") || "";
    const opened = await openOfficialDownload(id);
    const length = opened.response.headers.get("content-length");
    const headers = new Headers({
      "content-type": opened.response.headers.get("content-type") || "application/octet-stream",
      "content-disposition": attachment(opened.filename),
      "cache-control": "no-store",
      "x-audio-quality": opened.quality,
    });
    if (length) headers.set("content-length", length);
    return new Response(opened.response.body, { headers });
  } catch (error) {
    return downloadError(error);
  }
}
