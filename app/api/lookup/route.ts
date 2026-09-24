import { jsonError } from "@/lib/http";
import { lookupInput } from "@/lib/match";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { input?: unknown; mode?: unknown };
    const input = typeof body.input === "string" ? body.input : "";
    const mode = body.mode === "list" ? "list" : "link";
    if (input.length > 50_000) return Response.json({ error: "That paste is too long." }, { status: 413 });
    return Response.json(await lookupInput(input, mode));
  } catch (error) {
    return jsonError(error);
  }
}
