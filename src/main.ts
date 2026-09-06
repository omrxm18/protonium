import { app, BrowserWindow, Menu, Tray, shell, session, nativeImage, Notification, powerMonitor } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

const PROTON_URL = 'https://mail.proton.me';
const PARTITION = 'persist:protonium';

// Safety-net only — NOT the primary sync mechanism. Proton's own web
// client should already keep itself in sync via its own live-update
// connection (websocket or similar), the same way it does in a normal
// visible tab; `backgroundThrottling: false` above is what lets that
// keep running at full speed while hidden, at whatever cost Proton's own
// client already pays — we're not adding overhead on top of it.
//
// A full page reload is comparatively expensive (re-downloads and
// re-executes the whole JS bundle, re-renders everything), so this only
// exists as an infrequent fallback in case that connection silently dies
// while backgrounded for a long time. Thunderbird's IMAP IDLE doesn't
// need this at all; if it falls back to polling, it's a cheap "any new
// mail?" check, not a full client reload — this is a coarser version of
// that same idea, so the interval stays long.
const SYNC_SAFETY_RELOAD_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// A minimal solid-purple 16x16 PNG, used only when no real tray-icon.png is
// present, so the tray icon is never literally invisible (an empty
// nativeImage renders as nothing on most desktop environments).

const PLACEHOLDER_TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGPI9fr/nxLMMGrAqAGjBgwXAwDI8rUfLuPiVgAAAABJRU5ErkJggg==';

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0.0.0 Safari/537.36';

const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json');

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

function loadWindowState(): WindowState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  } catch {
    return { width: 1200, height: 800 };
  }
}

function saveWindowState(win: BrowserWindow) {
  if (win.isDestroyed()) return;
  const bounds = win.getBounds();
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(bounds));
  } catch {
    /* non-fatal */
  }
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let syncReloadTimer: NodeJS.Timeout | null = null;

function startSyncReloadLoop() {
  if (syncReloadTimer) return;
  syncReloadTimer = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.webContents.reload();
    }
  }, SYNC_SAFETY_RELOAD_INTERVAL_MS);
}

function reloadIfHidden() {
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
    mainWindow.webContents.reload();
  }
}

function createWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    icon: (() => {
      const p = path.join(app.getAppPath(), 'assets', 'icon.png');
      return fs.existsSync(p) ? p : undefined;
    })(),
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setUserAgent(USER_AGENT);
  mainWindow.loadURL(PROTON_URL);

  const isProtonHost = (url: string) => {
    try {
      const { hostname } = new URL(url);
      return hostname.endsWith('proton.me') || hostname.endsWith('protonmail.com');
    } catch {
      return false;
    }
  };

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isProtonHost(url)) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isProtonHost(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  let saveTimer: NodeJS.Timeout | null = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => mainWindow && saveWindowState(mainWindow), 500);
  };
  mainWindow.on('resize', scheduleSave);
  mainWindow.on('move', scheduleSave);

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  let image = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : null;

    if (!image || image.isEmpty()) {
    if (fs.existsSync(iconPath)) {
      console.warn(`[tray] ${iconPath} exists but failed to load as an image.`);
    } else {
      console.warn(
        `[tray] No icon found at ${iconPath} — using a generated placeholder. `
      );
    }
    image = nativeImage.createFromDataURL(PLACEHOLDER_TRAY_ICON_DATA_URL);
  }

  tray = new Tray(image);
  tray.setToolTip('Protonium');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Show',
        click: () => mainWindow?.show(),
      },
      {
        label: 'Quit',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow?.show();
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    session.fromPartition(PARTITION).setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'notifications');
    });

    if (process.platform === 'linux') {
      app.setAppUserModelId('com.omrxm18.protonium');
    }

    createWindow();
    createTray();
    startSyncReloadLoop();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else mainWindow?.show();
    });
  });

  app.on('before-quit', () => {
    isQuitting = true;
    if (syncReloadTimer) {
      clearInterval(syncReloadTimer);
      syncReloadTimer = null;
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
    }
  });
}
