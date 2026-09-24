import { serviceStatus } from "@/lib/check";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return Response.json(await serviceStatus());
}
