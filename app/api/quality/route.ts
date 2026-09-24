import { downloadError, HttpError } from "@/lib/http";
import { openOfficialDownload, soundcloudConfigured } from "@/lib/soundcloud";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    if (!soundcloudConfigured()) throw new HttpError(400, "Add SoundCloud API keys before checking a file.");
    const id = new URL(request.url).searchParams.get("id") || "";
    const opened = await openOfficialDownload(id);
    await opened.response.body?.cancel().catch(() => undefined);
    return Response.json({ quality: opened.quality });
  } catch (error) {
    return downloadError(error);
  }
}
