const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  authSignup: (payload) => ipcRenderer.invoke('auth-signup', payload),
  authSignin: (payload) => ipcRenderer.invoke('auth-signin', payload),
  dbGetAssets: (orgId) => ipcRenderer.invoke('db-get-assets', orgId),
  dbCreateAsset: (data) => ipcRenderer.invoke('db-create-asset', data),
  dbGetInfo: () => ipcRenderer.invoke('db-get-info'),
  getAppInfo: () => ({
    platform: process.platform,
    version: process.env.APP_VERSION || '1.0.0',
  }),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (config) => ipcRenderer.invoke('update-config', config),
  log: (message, data) => ipcRenderer.invoke('log', message, data),
  // Secure, OS-backed token storage (Windows DPAPI / macOS Keychain / libsecret).
  // Never store access/refresh tokens in localStorage or plaintext JSON.
  secureStoreSet: (key, value) => ipcRenderer.invoke('secure-store-set', key, value),
  secureStoreGet: (key) => ipcRenderer.invoke('secure-store-get', key),
  secureStoreDelete: (key) => ipcRenderer.invoke('secure-store-delete', key),
  getApiBaseUrl: () => ipcRenderer.invoke('get-api-base-url'),
});