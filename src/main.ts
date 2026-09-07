import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  shell,
  session,
  nativeImage,
  dialog,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

type Provider = 'proton' | 'google';

interface Account {
  id: string;
  provider: Provider;
  label: string;
  isDefault: boolean;
}

const PROVIDER_URLS: Record<Provider, string> = {
  proton: 'https://mail.proton.me',
  google: 'https://mail.google.com',
};

const PROVIDER_LABELS: Record<Provider, string> = {
  proton: 'Proton Mail',
  google: 'Gmail',
};

// Host allow-lists per provider. Anything outside these is handed to the
// system browser instead of navigated to in-app (covers OAuth hops, help
// links, etc.). Google's own login flow bounces across a few subdomains,
// so it gets a slightly wider net than Proton does.
const PROVIDER_HOSTS: Record<Provider, (hostname: string) => boolean> = {
  proton: (h) => h.endsWith('proton.me') || h.endsWith('protonmail.com'),
  google: (h) =>
    h.endsWith('google.com') ||
    h.endsWith('googleusercontent.com') ||
    h.endsWith('gstatic.com'),
};

function partitionFor(account: Account): string {
  return `persist:${account.provider}-${account.id}`;
}

const ACCOUNTS_FILE = path.join(app.getPath('userData'), 'accounts.json');

function loadAccounts(): Account[] {
  try {
    return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveAccounts(accounts: Account[]): void {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
  } catch (err) {
    console.error('[accounts] failed to save', err);
  }
}

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
}

function stateFileFor(accountId: string): string {
  return path.join(app.getPath('userData'), `window-state-${accountId}.json`);
}

function loadWindowState(accountId: string): WindowState {
  try {
    return JSON.parse(fs.readFileSync(stateFileFor(accountId), 'utf-8'));
  } catch {
    return { width: 1200, height: 800 };
  }
}

function saveWindowState(accountId: string, win: BrowserWindow) {
  if (win.isDestroyed()) return;
  try {
    fs.writeFileSync(stateFileFor(accountId), JSON.stringify(win.getBounds()));
  } catch {
    /* non-fatal */
  }
}

// Safety-net only — NOT the primary sync mechanism. Each provider's own web
// client should already keep itself in sync via its own live-update
// connection while backgrounded (backgroundThrottling is left on for these
// windows at default, so this stays a coarse, infrequent fallback rather
// than a substitute for that connection).
const SYNC_SAFETY_RELOAD_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// A minimal solid-purple 16x16 PNG, used only when no real tray-icon.png is
// present, so the tray icon is never literally invisible.
const PLACEHOLDER_TRAY_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4nGPI9fr/nxLMMGrAqAGjBgwXAwDI8rUfLuPiVgAAAABJRU5ErkJggg==';

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/126.0.0.0 Safari/537.36';

const windows = new Map<string, BrowserWindow>(); // accountId -> window
let tray: Tray | null = null;
let isQuitting = false;
let syncReloadTimer: NodeJS.Timeout | null = null;

function createWindow(account: Account): BrowserWindow {
  const state = loadWindowState(account.id);

  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    icon: (() => {
      const p = path.join(app.getAppPath(), 'assets', 'icon.png');
      return fs.existsSync(p) ? p : undefined;
    })(),
    webPreferences: {
      partition: partitionFor(account),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setTitle(`Protonium — ${account.label}`);
  win.webContents.setUserAgent(USER_AGENT);
  win.loadURL(PROVIDER_URLS[account.provider]);

  const isAllowedHost = (url: string): boolean => {
    try {
      return PROVIDER_HOSTS[account.provider](new URL(url).hostname);
    } catch {
      return false;
    }
  };

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedHost(url)) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedHost(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  let saveTimer: NodeJS.Timeout | null = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveWindowState(account.id, win), 500);
  };
  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    windows.delete(account.id);
  });

  session
    .fromPartition(partitionFor(account))
    .setPermissionRequestHandler((_wc, permission, callback) => {
      callback(permission === 'notifications');
    });

  return win;
}

function showOrCreateWindow(account: Account): BrowserWindow {
  const existing = windows.get(account.id);
  if (existing && !existing.isDestroyed()) {
    existing.isVisible() ? existing.focus() : existing.show();
    return existing;
  }
  const win = createWindow(account);
  windows.set(account.id, win);
  return win;
}

function focusMostRecentWindow() {
  const any = [...windows.values()][0];
  if (!any) return;
  if (any.isMinimized()) any.restore();
  if (!any.isVisible()) any.show();
  any.focus();
}

function addAccount(provider: Provider, makeDefault = false): Account {
  const accounts = loadAccounts();

  const account: Account = {
    id: randomUUID(),
    provider,
    label: PROVIDER_LABELS[provider],
    isDefault: makeDefault || accounts.length === 0,
  };

  if (account.isDefault) {
    accounts.forEach((a) => (a.isDefault = false));
  }

  accounts.push(account);
  saveAccounts(accounts);
  refreshTrayMenu();
  return account;
}

function setDefaultAccount(accountId: string) {
  const accounts = loadAccounts();
  accounts.forEach((a) => (a.isDefault = a.id === accountId));
  saveAccounts(accounts);
  refreshTrayMenu();
}

function removeAccount(accountId: string) {
  const win = windows.get(accountId);
  if (win && !win.isDestroyed()) {
    isQuittingWindow(win); // see note below
    win.destroy();
  }
  windows.delete(accountId);

  const accounts = loadAccounts().filter((a) => a.id !== accountId);
  if (accounts.length > 0 && !accounts.some((a) => a.isDefault)) {
    accounts[0].isDefault = true;
  }
  saveAccounts(accounts);
  refreshTrayMenu();
}

// close-hides windows by default; this lets removeAccount force a real close
function isQuittingWindow(_win: BrowserWindow) {
  // no-op hook kept explicit so the intent at the removeAccount call site
  // is obvious — the win.destroy() call right after bypasses the
  // close -> hide interception entirely.
}

// First run: no accounts saved yet. Ask which provider to start with via a
// native dialog (swap this for a real HTML picker window later if you want
// a nicer first-run UI — the account-creation logic itself doesn't change).
async function runFirstRunSetup() {
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Add your first account',
    message: 'Which mail provider would you like to set up first?',
    buttons: [PROVIDER_LABELS.proton, PROVIDER_LABELS.google, 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  });

  if (response === 2) {
    app.quit();
    return;
  }

  const provider: Provider = response === 0 ? 'proton' : 'google';
  const account = addAccount(provider, true);
  showOrCreateWindow(account);
  createTray();
  startSyncReloadLoop();
}

async function promptAddAccount() {
  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'Add account',
    message: 'Which mail provider?',
    buttons: [PROVIDER_LABELS.proton, PROVIDER_LABELS.google, 'Cancel'],
    defaultId: 0,
    cancelId: 2,
  });
  if (response === 2) return;

  const provider: Provider = response === 0 ? 'proton' : 'google';
  const account = addAccount(provider, false);
  showOrCreateWindow(account);
}

function loadTrayIcon(): Electron.NativeImage {
  const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
  let image = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : null;

  if (!image || image.isEmpty()) {
    if (fs.existsSync(iconPath)) {
      console.warn(`[tray] ${iconPath} exists but failed to load as an image.`);
    } else {
      console.warn(`[tray] No icon found at ${iconPath} — using a generated placeholder.`);
    }
    image = nativeImage.createFromDataURL(PLACEHOLDER_TRAY_ICON_DATA_URL);
  }
  return image;
}

function buildTrayMenu(): Menu {
  const accounts = loadAccounts();

  const accountItems = accounts.map((a) => ({
    label: a.isDefault ? `${a.label} (default)` : a.label,
    click: () => showOrCreateWindow(a),
  }));

  return Menu.buildFromTemplate([
    ...accountItems,
    { type: 'separator' as const },
    { label: 'Add account…', click: () => void promptAddAccount() },
    { type: 'separator' as const },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
}

function refreshTrayMenu() {
  tray?.setContextMenu(buildTrayMenu());
}

function createTray() {
  tray = new Tray(loadTrayIcon());
  tray.setToolTip('Protonium');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', focusMostRecentWindow);
}

function startSyncReloadLoop() {
  if (syncReloadTimer) return;
  syncReloadTimer = setInterval(() => {
    for (const win of windows.values()) {
      if (!win.isDestroyed() && !win.isVisible()) {
        win.webContents.reload();
      }
    }
  }, SYNC_SAFETY_RELOAD_INTERVAL_MS);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    focusMostRecentWindow();
  });

  app.whenReady().then(async () => {
    if (process.platform === 'linux') {
      app.setAppUserModelId('com.omrxm18.protonium');
    }

    const accounts = loadAccounts();

    if (accounts.length === 0) {
      await runFirstRunSetup();
      return;
    }

    const toOpen = accounts.filter((a) => a.isDefault);
    (toOpen.length > 0 ? toOpen : accounts.slice(0, 1)).forEach(showOrCreateWindow);

    createTray();
    startSyncReloadLoop();

    app.on('activate', () => {
      if (windows.size === 0) {
        const def = loadAccounts().find((a) => a.isDefault);
        if (def) showOrCreateWindow(def);
      } else {
        focusMostRecentWindow();
      }
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
    // Tray-resident app: stay alive on all platforms except macOS's usual
    // dock-icon convention, same as the original single-account version.
    if (process.platform !== 'darwin') {
      // intentionally not quitting — windows are hidden, not closed, via
      // the close handler above; this only fires if every window was
      // force-destroyed (e.g. removeAccount).
    }
  });
}

export { addAccount, setDefaultAccount, removeAccount };