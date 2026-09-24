export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function jsonError(error: unknown, fallback = "Something went wrong while matching.") {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof Error ? error.message : fallback;
  if (status === 500) console.error(error);
  return Response.json({ error: status === 500 ? fallback : message }, { status });
}

export function downloadError(error: unknown) {
  const message = error instanceof Error ? error.message : "Download failed.";
  if (/secret|client_id|access_token/i.test(message)) {
    return Response.json({ error: "SoundCloud auth failed. Check the API keys." }, { status: 401 });
  }
  let status = 502;
  if (error instanceof HttpError) status = error.status;
  else if (message.includes("hasn't turned on")) status = 403;
  else if (message.includes("Bad track") || message.includes("not set")) status = 400;
  else if (message.includes("auth")) status = 401;
  return Response.json({ error: message }, { status });
}

export function warn(warnings: string[], message: string) {
  if (!warnings.includes(message)) warnings.push(message);
}

export function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
