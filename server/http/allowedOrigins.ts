/**
 * Browser Origin allowlist for CORS.
 * Missing Origin (same-origin, Electron, curl) is allowed.
 * Hypercross Vercel hosts for this project are allowed even when
 * ALLOWED_ORIGINS was configured before the Vercel frontend existed.
 */

const DEFAULT_ORIGINS =
  "http://localhost:10000,http://localhost:3000,http://localhost:5173,https://www.hypercrossfinancial.online,https://hypercrossfinancial.online,https://www.hypercrossfinancial.com,https://hypercrossfinancial.com";

export function normalizeOrigin(value: string): string {
  return value.trim().replace(/^["']+|["']+$/g, "").replace(/\/+$/, "").toLowerCase();
}

export function parseOriginList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map(normalizeOrigin).filter(Boolean);
}

export function buildAllowedOrigins(input: {
  allowedOriginsEnv?: string;
  renderExternalUrl?: string;
  hypercrossPublicUrl?: string;
}): string[] {
  const origins = parseOriginList(input.allowedOriginsEnv || DEFAULT_ORIGINS);
  if (input.renderExternalUrl) origins.push(normalizeOrigin(input.renderExternalUrl));
  if (input.hypercrossPublicUrl) origins.push(normalizeOrigin(input.hypercrossPublicUrl));
  origins.push(
    "https://hypercross-nexus-gold.vercel.app",
    "https://hypercross-nexus-gold-az-apex.vercel.app",
    "https://hypercross-nexus-gold-git-main-az-apex.vercel.app",
  );
  return [...new Set(origins)];
}

export function isHypercrossVercelOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "hypercross-nexus-gold.vercel.app") return true;
    return host.startsWith("hypercross-nexus-gold-") && host.endsWith("-az-apex.vercel.app");
  } catch {
    return false;
  }
}

export function isAllowedBrowserOrigin(origin: string | undefined, allowlist: string[]): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (allowlist.includes(normalized)) return true;
  return isHypercrossVercelOrigin(normalized);
}
