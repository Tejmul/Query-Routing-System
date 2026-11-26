// Calls to the FastAPI backend. Requests go to /api/... on this app and next.config.ts proxies them.

export const KEY_STORE = "routing-desk-api-key";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function apiKey(): string {
  try {
    return localStorage.getItem(KEY_STORE) ?? "";
  } catch {
    return "";
  }
}

function headers(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  const key = apiKey();
  if (key) h.set("X-API-Key", key);
  return h;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { ...init, headers: headers(init.headers) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(body.detail) ? body.detail[0]?.msg : body.detail;
    if (res.status === 401) window.dispatchEvent(new Event("bankq:needs-key"));
    throw new ApiError((typeof detail === "string" && detail) || `The server returned ${res.status}.`, res.status);
  }
  return body as T;
}

export const send = <T>(path: string, method: string, data: unknown, signal?: AbortSignal) =>
  api<T>(path, { method, signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });

/**
 * URL on the FastAPI backend itself, bypassing the Next.js proxy. Used for big uploads and downloads
 * (the dev proxy can't carry a 68 MB body). The backend allows this app's origin via CORS.
 */
export function directUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_BANKQ_DIRECT_API_URL ?? `${window.location.protocol}//${window.location.hostname}:8077`;
  return `${base}${path}`;
}

/** Upload with progress events (fetch can't report upload progress), straight to the backend. */
export function upload<T>(path: string, file: File, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", directUrl(path));
    const key = apiKey();
    if (key) xhr.setRequestHeader("X-API-Key", key);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { detail?: unknown } = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError((typeof body.detail === "string" && body.detail) || `Upload failed (${xhr.status}).`, xhr.status));
    };
    xhr.onerror = () => reject(new ApiError("Upload failed: the server could not be reached.", 0));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}
