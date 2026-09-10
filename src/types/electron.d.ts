export {};

declare global {
  interface Window {
    electron?: {
      authSignup: (payload: {
        method: 'email' | 'phone';
        emailOrSubAccount?: string;
        phoneNumber?: string;
        password: string;
      }) => Promise<{ ok: boolean; status: number; error?: string; message?: string; user?: Record<string, unknown> }>;
      authSignin: (payload: {
        method: 'email' | 'phone';
        emailOrSubAccount?: string;
        phoneNumber?: string;
        password: string;
      }) => Promise<{ ok: boolean; status: number; error?: string; message?: string; user?: Record<string, unknown> }>;
      dbGetAssets: (orgId: string) => Promise<Array<Record<string, unknown>>>;
      dbCreateAsset: (data: Record<string, unknown>) => Promise<Record<string, unknown>>;
      dbGetInfo: () => Promise<{ path: string }>;
      getAppInfo: () => unknown;
      selectDirectory: () => Promise<string | null>;
      getConfig: () => Promise<unknown>;
      updateConfig: (config: unknown) => Promise<void>;
      log: (message: string, data?: unknown) => Promise<void>;
      secureStoreSet: (key: string, value: string) => Promise<{ ok: boolean; error?: string }>;
      secureStoreGet: (key: string) => Promise<{ ok: boolean; value: string | null; error?: string }>;
      secureStoreDelete: (key: string) => Promise<{ ok: boolean }>;
      getApiBaseUrl: () => Promise<string>;
    };
  }
}
