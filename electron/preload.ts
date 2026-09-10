import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  authSignup: (payload: any) => ipcRenderer.invoke('auth-signup', payload),
  authSignin: (payload: any) => ipcRenderer.invoke('auth-signin', payload),
  // Database access
  dbGetAssets: (orgId: string) => ipcRenderer.invoke('db-get-assets', orgId),
  dbCreateAsset: (data: any) => ipcRenderer.invoke('db-create-asset', data),
  dbGetInfo: () => ipcRenderer.invoke('db-get-info'),

  // App info
  getAppInfo: () => ({
    platform: process.platform,
    version: process.env.APP_VERSION || '1.0.0',
  }),

  // File system
  selectDirectory: () => ipcRenderer.invoke('select-directory'),

  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (config: any) => ipcRenderer.invoke('update-config', config),

  // Logging
  log: (message: string, data?: any) => ipcRenderer.invoke('log', message, data),
});

