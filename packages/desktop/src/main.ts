import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { ServerManager, RunningServerInfo, resolveUserDataDir } from './server-manager.js';
import { logger } from '@nexus/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Request single-instance lock to prevent duplicate servers/windows
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  logger.warn('Desktop Main: Another instance is already running. Exiting.');
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let serverManager: ServerManager | null = null;
let runningServer: RunningServerInfo | null = null;

async function createMainWindow(serverUrl: string): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'NEXUS.AI — Autonomous AI Coding Assistant',
    backgroundColor: '#070a12',
    show: false,
    webPreferences: {
      preload: fs.existsSync(path.join(__dirname, 'preload.cjs'))
        ? path.join(__dirname, 'preload.cjs')
        : path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Open external links in user's default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Show window once DOM is ready to avoid white flash
  win.once('ready-to-show', () => {
    win.show();
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  // Load backend or dev server
  const targetUrl = process.env.VITE_DEV_SERVER_URL || serverUrl;
  logger.info(`Desktop Main: Loading UI from ${targetUrl}`);
  await win.loadURL(targetUrl);

  return win;
}

function registerIpcHandlers(): void {
  ipcMain.handle('nexus:get-system-info', () => {
    return {
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion(),
      serverPort: runningServer?.port ?? 3000,
      dataDir: runningServer?.dataDir ?? resolveUserDataDir(),
    };
  });

  ipcMain.handle('nexus:open-directory', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Project Directory',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('nexus:open-external', async (_event, url: string) => {
    if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
    }
  });

  ipcMain.handle('nexus:window-minimize', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('nexus:window-maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.handle('nexus:window-close', () => {
    mainWindow?.close();
  });
}

async function bootstrap(): Promise<void> {
  try {
    logger.info('Desktop Main: Bootstrapping NEXUS.AI desktop application...');

    // 1. Initialize and start embedded server
    serverManager = new ServerManager();
    const dataDir = resolveUserDataDir(process.env.NEXUS_DATA_DIR || app.getPath('userData'));
    runningServer = await serverManager.start({
      dataDir,
      preferredPort: process.env.PORT ? parseInt(process.env.PORT, 10) : 3000,
    });

    // 2. Setup IPC handlers
    registerIpcHandlers();

    // 3. Create Browser Window
    mainWindow = await createMainWindow(runningServer.url);

    // Focus existing window on second-instance attempt
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  } catch (err) {
    logger.error('Desktop Main: Fatal error during desktop bootstrap:', err);
    dialog.showErrorBox(
      'NEXUS.AI Startup Failure',
      `Failed to initialize the local NEXUS.AI runtime:\n\n${(err as Error)?.message || String(err)}`
    );
    app.quit();
  }
}

// App lifecycle
app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Clean shutdown sequence
let isShuttingDown = false;
async function cleanShutdown(): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info('Desktop Main: Initiating clean application shutdown...');

  try {
    if (runningServer) {
      await runningServer.stop();
      runningServer = null;
    }
  } catch (err) {
    logger.error('Desktop Main: Error stopping server during quit:', err);
  }
}

app.on('before-quit', (e) => {
  if (runningServer) {
    e.preventDefault();
    cleanShutdown().then(() => {
      app.quit();
    });
  }
});

process.on('SIGINT', async () => {
  await cleanShutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await cleanShutdown();
  process.exit(0);
});
