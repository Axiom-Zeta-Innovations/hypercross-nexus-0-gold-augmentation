import { app, BrowserWindow, Menu, dialog, ipcMain, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { authSignin, authSignup, createAsset, getAssets, getDatabasePath } from './database.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rendererUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:3000';
const isDev = !app.isPackaged;

let mainWindow = null;

// Secure token storage: auth tokens are encrypted at rest via the OS credential
// store (Windows DPAPI / macOS Keychain / libsecret) through Electron's
// safeStorage API. Never stored in localStorage or plaintext JSON.
function getSecureStorePath() {
  return path.join(app.getPath('userData'), 'secure-store.json');
}

function readSecureStoreRaw() {
  try {
    const raw = fs.readFileSync(getSecureStorePath(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeSecureStoreRaw(data) {
  fs.mkdirSync(path.dirname(getSecureStorePath()), { recursive: true });
  fs.writeFileSync(getSecureStorePath(), JSON.stringify(data), { mode: 0o600 });
}


function getConfigSourcePath() {
  const userConfigPath = path.join(app.getPath('userData'), 'whiteLabelConfig.json');
  const bundledConfigPath = path.join(process.cwd(), 'config', 'whiteLabelConfig.json');
  return fs.existsSync(userConfigPath) ? userConfigPath : bundledConfigPath;
}

function readConfig() {
  const configPath = getConfigSourcePath();
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function writeConfig(config) {
  const userConfigPath = path.join(app.getPath('userData'), 'whiteLabelConfig.json');
  fs.mkdirSync(path.dirname(userConfigPath), { recursive: true });
  fs.writeFileSync(userConfigPath, JSON.stringify(config, null, 2));
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (isDev) {
    await mainWindow.loadURL(rendererUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(process.cwd(), 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('db-get-assets', async (_event, orgId) => {
  return getAssets(orgId);
});

ipcMain.handle('auth-signup', async (_event, payload) => {
  return authSignup(payload || {});
});

ipcMain.handle('auth-signin', async (_event, payload) => {
  return authSignin(payload || {});
});

ipcMain.handle('db-create-asset', async (_event, data) => {
  return createAsset(data);
});

ipcMain.handle('db-get-info', async () => ({
  path: getDatabasePath(),
}));

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });

  return result.canceled ? null : result.filePaths[0] ?? null;
});

ipcMain.handle('get-config', async () => readConfig());

ipcMain.handle('update-config', async (_event, config) => {
  writeConfig(config);
});

ipcMain.handle('log', async (_event, message, data) => {
  console.log('[renderer]', message, data ?? '');
});

ipcMain.handle('secure-store-set', async (_event, key, value) => {
  const store = readSecureStoreRaw();
  if (safeStorage.isEncryptionAvailable()) {
    store[key] = safeStorage.encryptString(String(value)).toString('base64');
  } else {
    // No OS credential store available (rare/headless environment) — refuse rather than write plaintext.
    console.warn('safeStorage encryption unavailable; refusing to persist token in plaintext.');
    return { ok: false, error: 'Secure storage unavailable on this system.' };
  }
  writeSecureStoreRaw(store);
  return { ok: true };
});

ipcMain.handle('secure-store-get', async (_event, key) => {
  const store = readSecureStoreRaw();
  const encoded = store[key];
  if (!encoded) return { ok: true, value: null };
  try {
    const value = safeStorage.decryptString(Buffer.from(encoded, 'base64'));
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: 'Unable to decrypt stored value.' };
  }
});

ipcMain.handle('secure-store-delete', async (_event, key) => {
  const store = readSecureStoreRaw();
  delete store[key];
  writeSecureStoreRaw(store);
  return { ok: true };
});

ipcMain.handle('get-api-base-url', async () => {
  return process.env.HYPERCROSS_API_URL || 'http://localhost:10000';
});

app.whenReady().then(() => {
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});