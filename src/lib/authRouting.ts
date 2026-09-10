import { readApiError } from "./readApiError";

export function shouldRetryLegacyAuth(status?: number): boolean {
  if (typeof status !== "number") return false;
  return status === 404 || status === 410 || status === 503;
}

export function readAuthError(payload: unknown): string | undefined {
  const message = readApiError(payload, "");
  return message || undefined;
}

export function getAuthRoutes(mode: "signin" | "signup" | "forgot") {
  if (mode === "signup") {
    return {
      primary: "/api/auth/v2/register",
      fallback: "/api/auth/signup",
    };
  }

  if (mode === "forgot") {
    return {
      primary: "/api/auth/v2/reset-password/request",
      fallback: "/api/auth/reset-password/request",
    };
  }

  return {
    primary: "/api/auth/v2/login",
    fallback: "/api/auth/signin",
  };
}
