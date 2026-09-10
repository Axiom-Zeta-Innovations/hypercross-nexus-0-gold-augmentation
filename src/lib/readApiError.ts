/**
 * Normalize API error payloads into a renderable string.
 * Backend errors are shaped `{ error: { code, message } }`; legacy paths may
 * send `{ error: string }` or `{ message: string }`. Never return a non-string —
 * React will crash with minified error #31 if an object is used as a child.
 */
export function readApiError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const rec = payload as { error?: unknown; message?: unknown };
    const error = rec.error;
    if (typeof error === "string" && error.trim()) return error;
    if (error && typeof error === "object") {
      const nested = (error as { message?: unknown }).message;
      if (typeof nested === "string" && nested.trim()) return nested;
    }
    if (typeof rec.message === "string" && rec.message.trim()) return rec.message;
  }
  return fallback;
}
