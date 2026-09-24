import { auddConfigured, probeAudd } from "./audd";
import { probeSoundCloud, soundcloudConfigured } from "./soundcloud";
import { probeYouTube } from "./sources";
import type { AppStatus, ServiceCheck } from "./types";
import { env } from "./env";

function missing(): ServiceCheck {
  return { configured: false, ok: false, detail: "" };
}

async function check(configured: boolean, probe: () => Promise<void>): Promise<ServiceCheck> {
  if (!configured) return missing();
  try {
    await probe();
    return { configured: true, ok: true, detail: "" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "The key was rejected.";
    return { configured: true, ok: false, detail: message.replace(/\s+/g, " ").slice(0, 220) };
  }
}

export async function serviceStatus(): Promise<AppStatus> {
  const [soundcloud, audd, youtube] = await Promise.all([
    check(soundcloudConfigured(), probeSoundCloud),
    check(auddConfigured(), probeAudd),
    check(Boolean(env("YOUTUBE_API_KEY")), probeYouTube),
  ]);
  return { soundcloud, audd, youtube };
}
