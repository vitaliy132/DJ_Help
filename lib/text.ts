export function toPlainText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

export function formatStamp(seconds: number | null, withHours = false): string {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const paddedSecs = String(secs).padStart(2, "0");
  if (hours || withHours) return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSecs}`;
  return `${minutes}:${paddedSecs}`;
}

export function safeFilename(value: string): string {
  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
  return cleaned || "track";
}

const FETCH_HEADERS = {
  accept: "application/json",
  "user-agent": "DJHelp/0.1",
};

export async function getJson<T>(url: string, timeoutMs = 20000, headers?: HeadersInit): Promise<T> {
  const response = await fetch(url, {
    headers: { ...FETCH_HEADERS, ...headers },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: { message?: string } | string;
      error_description?: string;
    } | null;
    let detail = "";
    if (payload && typeof payload === "object") {
      if (typeof payload.error === "string") detail = payload.error;
      else if (typeof payload.error?.message === "string") detail = payload.error.message;
      else if (typeof payload.error_description === "string") detail = payload.error_description;
    }
    const extra = detail ? `: ${detail.replace(/\s+/g, " ").slice(0, 180)}` : "";
    throw new Error(`Request failed (${response.status})${extra}`);
  }
  return (await response.json()) as T;
}
