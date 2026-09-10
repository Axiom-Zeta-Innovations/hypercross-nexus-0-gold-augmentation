import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'path';
import isDev from 'electron-is-dev';

let mainWindow: BrowserWindow | null = null;
const rendererUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:3000';
const distPath = path.join(process.cwd(), 'dist');

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (isDev) {
    await mainWindow.loadURL(rendererUrl);
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(path.join(distPath, 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});

// IPC handlers for database access
ipcMain.handle('db-get-assets', async (event, orgId) => {
  return [];
});

ipcMain.handle('db-create-asset', async (event, data) => {
  return { id: `asset_${Date.now()}`, ...data };
});

// Create application menu
const template: any[] = [
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
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
