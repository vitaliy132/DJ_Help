import { identifyAudio } from "@/lib/audd";
import { HttpError, jsonError } from "@/lib/http";
import { lookupParsed } from "@/lib/match";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const AUDIO = /\.(mp3|wav|flac|aiff|aif|m4a|aac|ogg|opus|mp4|mkv|webm|mov)$/i;

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose an audio file.");
    if (file.size <= 0) throw new HttpError(400, "That file is empty.");
    if (file.size > 80 * 1024 * 1024) throw new HttpError(413, "Files need to be under 80 MB.");
    if (file.type && !/^(audio|video)\//.test(file.type) && !AUDIO.test(file.name)) {
      throw new HttpError(400, "Use an audio or video recording of the set.");
    }

    const identified = await identifyAudio(file);
    const title = file.name.replace(/\.[^.]+$/, "") || "Recording";
    return Response.json(
      await lookupParsed(identified.tracks, {
        title,
        source: "audio",
        tracks: [],
        warnings: identified.note ? [identified.note] : [],
      }),
    );
  } catch (error) {
    return jsonError(error, "Something went wrong while identifying that recording.");
  }
}
