/**
 * Hypercross API client — a thin, typed fetch wrapper shared conceptually
 * across web and desktop. Base URL is configurable and never hard-coded:
 *  - Browser (Vite):  VITE_HYPERCROSS_API_URL
 *  - Desktop (Electron): HYPERCROSS_API_URL (or window.electron.getApiBaseUrl())
 *  - Falls back to http://localhost:10000 for local development only.
 *
 * NOTE: like packages/shared, this is currently a plain module (not yet an
 * installable workspace package) — see docs/DEPLOYMENT.md.
 */

import type { ApiError, BlockchainStatus, Portfolio, Subscription, TradeRequest, TradeResult, User } from "../shared/types";
import { readApiError } from "../../src/lib/readApiError";

export interface ApiClientOptions {
  baseUrl?: string;
  getAccessToken?: () => string | null | Promise<string | null>;
  onUnauthorized?: () => void;
}

export class ApiError2 extends Error {
  code: string;
  requestId?: string;
  constructor(payload: ApiError) {
    super(payload.message);
    this.code = payload.code;
    this.requestId = payload.requestId;
  }
}

function resolveDefaultBaseUrl(): string {
  // Browser (Vite) build-time env var — never a private credential.
  const viteUrl = (import.meta as any)?.env?.VITE_HYPERCROSS_API_URL;
  if (viteUrl) return viteUrl;
  // Desktop/node runtime env var.
  if (typeof process !== "undefined" && process.env?.HYPERCROSS_API_URL) {
    return process.env.HYPERCROSS_API_URL;
  }
  return "http://localhost:10000";
}

export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl || resolveDefaultBaseUrl()).replace(/\/$/, "");

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = options.getAccessToken ? await options.getAccessToken() : null;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });

    if (response.status === 401 && options.onUnauthorized) {
      options.onUnauthorized();
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = payload?.error;
      throw new ApiError2({
        code: err && typeof err === "object" && typeof err.code === "string" ? err.code : "INTERNAL_ERROR",
        message: readApiError(payload, "Request failed."),
        requestId: err && typeof err === "object" && typeof err.requestId === "string" ? err.requestId : undefined,
      });
    }
    return payload as T;
  }

  return {
    auth: {
      register: (email: string, password: string, displayName?: string) =>
        request<{ user: User; accessToken: string; refreshToken: string }>("/api/auth/v2/register", {
          method: "POST",
          body: JSON.stringify({ email, password, displayName }),
        }),
      login: (email: string, password: string) =>
        request<{ user: User; accessToken: string; refreshToken: string }>("/api/auth/v2/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }),
      logout: (refreshToken: string) =>
        request<{ ok: boolean }>("/api/auth/v2/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }),
      refresh: (refreshToken: string) =>
        request<{ user: User; accessToken: string; refreshToken: string }>("/api/auth/v2/refresh", {
          method: "POST",
          body: JSON.stringify({ refreshToken }),
        }),
      me: () => request<{ user: User }>("/api/auth/v2/me"),
    },
    subscription: {
      status: () => request<{ subscription: Subscription | null }>("/api/billing/subscription"),
      checkout: (plan: "research" | "trader" | "pro") =>
        request<{ url: string }>("/api/billing/create-checkout-session", { method: "POST", body: JSON.stringify({ plan }) }),
      portal: () => request<{ url: string }>("/api/billing/create-portal-session", { method: "POST" }),
      cancel: () => request<{ ok: boolean }>("/api/billing/subscription/cancel", { method: "POST" }),
    },
    blockchain: {
      status: () => request<BlockchainStatus>("/api/blockchain/status"),
    },
    portfolio: {
      get: (address: string) => request<{ portfolio: Portfolio }>(`/api/portfolio/${address}`),
    },
    trading: {
      execute: (tradeRequest: TradeRequest) =>
        request<TradeResult>("/api/trading/quote", { method: "POST", body: JSON.stringify(tradeRequest) }),
      history: () => request<{ transactions: unknown[] }>("/api/transactions"),
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
