import type { Env } from "./env";

export function parseRange(rangeHeader: string | null, size: number): { offset: number; length: number } | null {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) return null;
  const [, startStr, endStr] = match;
  if (startStr === "" && endStr === "") return null;

  let start: number;
  let end: number;
  if (startStr === "") {
    const suffixLength = parseInt(endStr, 10);
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = parseInt(startStr, 10);
    end = endStr === "" ? size - 1 : Math.min(parseInt(endStr, 10), size - 1);
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) return null;
  return { offset: start, length: end - start + 1 };
}

// Shared by the authenticated stream route and the public invite-token-scoped
// one — Range-request serving is identical either way, only the access
// check differs.
export async function serveMediaObject(
  env: Env,
  key: string,
  rangeHeader: string | null,
  contentTypeFallback = "audio/wav",
): Promise<Response> {
  const head = await env.MEDIA.head(key);
  if (!head) return new Response(JSON.stringify({ error: "file not found" }), { status: 404 });
  const size = head.size;

  const range = parseRange(rangeHeader, size);
  const obj = range ? await env.MEDIA.get(key, { range }) : await env.MEDIA.get(key);
  if (!obj || !obj.body) return new Response(JSON.stringify({ error: "file not found" }), { status: 404 });

  const headers = new Headers();
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Type", obj.httpMetadata?.contentType ?? contentTypeFallback);
  headers.set("Cache-Control", "private, max-age=3600");

  if (range) {
    headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`);
    headers.set("Content-Length", String(range.length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(size));
  return new Response(obj.body, { status: 200, headers });
}
