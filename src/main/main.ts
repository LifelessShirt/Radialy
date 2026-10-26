import { BrowserWindow, Menu, Tray, app, dialog, ipcMain, nativeTheme, shell, systemPreferences } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { normSteps, loadSettings, normalize, saveSettings } from './config';
import { runSteps } from './actions';
import { KeyHook } from './hook';
import { foregroundExe, initNative, nativeReady, setCursor } from './input';
import { log } from './log';
import { Overlay } from './overlay';
import type { AppStatus, MenuItem, Settings } from '../shared/types';
import { translate, translateActionLabel } from '../shared/i18n';

app.setName('Radialy');
const appDataPath = app.getPath('appData');
const userDataPath = path.join(appDataPath, 'Radialy');
const previousUserDataPath = path.join(appDataPath, 'Radial Menu');
app.setPath('userData', userDataPath);

try {
  fs.mkdirSync(userDataPath, { recursive: true });
  for (const file of ['settings.json', 'radial-menu.log']) {
    const source = path.join(previousUserDataPath, file);
    const destination = path.join(userDataPath, file);
    if (fs.existsSync(source) && !fs.existsSync(destination)) fs.copyFileSync(source, destination);
  }
} catch (e) {
  console.error(`Не удалось перенести данные из ${previousUserDataPath} в ${userDataPath}:`, e);
}

const ICON = path.join(app.getAppPath(), 'assets', 'icon.ico');
const OWN_EXE = path.basename(process.execPath).toLowerCase();

let settings: Settings;
let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let overlay: Overlay;
let hook: KeyHook;
let quitting = false;
let hookOk = false;
let startError: string | null = null;
let openItems: MenuItem[] = [];
let captureDone: ((name: string | null) => void) | null = null;
interface LoopState {
  timer: NodeJS.Timeout | null;
  intervalMs: number;
  item: MenuItem;
}
const loops = new Map<string, LoopState>();

function stopLoop(id: string): void {
  const state = loops.get(id);
  if (!state) return;
  if (state.timer) clearTimeout(state.timer);
  loops.delete(id);
}

function stopAllLoops(): void {
  for (const id of loops.keys()) stopLoop(id);
}

async function runLoop(state: LoopState): Promise<void> {
  const item = state.item;
  if (loops.get(item.id) !== state) return;
  try {
    await runSteps(item.steps);
  } catch (e) {
    log('loop', item.label, e);
    stopLoop(item.id);
    return;
  }
  if (loops.get(item.id) === state) {
    state.timer = setTimeout(() => void runLoop(state), state.intervalMs);
  }
}

function toggleLoop(item: MenuItem): void {
  if (loops.has(item.id)) {
    stopLoop(item.id);
    return;
  }
  const state: LoopState = { timer: null, intervalMs: item.loop?.intervalMs ?? 1000, item };
  loops.set(item.id, state);
  void runLoop(state);
}

// ── вспомогательное ──
function systemAccent(): string {
  try {
    return '#' + systemPreferences.getAccentColor().slice(0, 6);
  } catch {
    return '#0067c0';
  }
}
const accent = () => (settings.appearance.accent === 'system' ? systemAccent() : settings.appearance.accent);

function status(): AppStatus {
  return {
    nativeOk: nativeReady(),
    hookOk,
    error: startError,
    version: app.getVersion(),
    accent: systemAccent(),
    dataDir: app.getPath('userData'),
    packaged: app.isPackaged,
  };
}

function overlayColors() {
  const dark = nativeTheme.shouldUseDarkColors;
  return {
    color: dark ? '#202020' : '#f3f3f3',
    symbolColor: dark ? '#ffffff' : '#000000',
    height: 36,
  };
}

// ── окно настроек ──
function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    width: 1000,
    height: 680,
    minWidth: 860,
    minHeight: 560,
    show: false,
    title: 'Radialy',
    icon: ICON,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#202020' : '#f3f3f3',
    titleBarStyle: 'hidden',
    titleBarOverlay: overlayColors(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  void w.loadFile(path.join(__dirname, '../renderer/settings/settings.html'));
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.on('will-navigate', (e) => e.preventDefault());
  w.once('ready-to-show', () => {
    const autostart = process.argv.includes('--autostart');
    if (!(autostart && settings.startup.startHidden) && !startHidden) w.show();
    startHidden = false;
  });
  // Закрытие окна сворачивает программу в трей
  w.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      w.hide();
    }
  });
  w.on('closed', () => (win = null));
  return w;
}
let startHidden = false;

function showSettings(): void {
  if (!win || win.isDestroyed()) win = createWindow();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// ── трей ──
function updateTray(): void {
  const t = (text: string) => translate(text, settings.language);
  tray?.setContextMenu(
    Menu.buildFromTemplate([
      { label: t('Открыть настройки'), click: showSettings },
      {
        label: t('Меню включено'),
        type: 'checkbox',
        checked: settings.enabled,
        click: (item) => {
          settings.enabled = item.checked;
          saveSettings(settings);
          applySettings();
          win?.webContents.send('settings:external', settings);
        },
      },
      { type: 'separator' },
      {
        label: t('Выход'),
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function createTray(): void {
  tray = new Tray(ICON);
  tray.setToolTip('Radialy');
  tray.on('click', showSettings);
  updateTray();
}

// ── применение настроек ──
function applySettings(): void {
  nativeTheme.themeSource = settings.appearance.theme;
  hook.configure(settings.trigger, settings.enabled, settings.suppressTrigger);
  if (!settings.enabled) stopAllLoops();
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: settings.startup.launchAtLogin, args: ['--autostart'] });
  updateTray();
}

// ── меню: нажатие / отпускание триггера ──
function onPress(): void {
  try {
    const exe = foregroundExe();
    const profile = settings.profiles.find((p) => p.exe && p.exe === exe) ?? settings.profiles[0];
    const items = profile.items.slice(0, 16);
    if (items.length < 2) return;
    openItems = items;
    overlay.open(
      items.map((item) => ({ ...item, label: translateActionLabel(item.label, settings.language) })),
      new Set(loops.keys()),
      settings.appearance,
      nativeTheme.shouldUseDarkColors,
      accent(),
      settings.language,
    );
  } catch (e) {
    log('press', e);
  }
}

function onRelease(): void {
  try {
    if (!overlay.isOpen) return;
    const { index, center } = overlay.close();
    if (index === null) return;
    const item = openItems[index];
    if (settings.appearance.returnCursor) setCursor(center.x, center.y);
    if (item.loop) toggleLoop(item);
    else setTimeout(() => runSteps(item.steps).catch((e) => log('action', item.label, e)), 40);
  } catch (e) {
    log('release', e);
  }
}

// ── IPC ──
function registerIpc(): void {
  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:save', (_e, raw) => {
    settings = normalize(raw);
    const configuredItems = new Map(
      settings.profiles.flatMap((p) => p.items.filter((item) => item.loop).map((item) => [item.id, item] as const)),
    );
    for (const [id, state] of loops) {
      const updated = configuredItems.get(id);
      if (!updated) stopLoop(id);
      else {
        const intervalChanged = state.intervalMs !== updated.loop?.intervalMs;
        state.item = updated;
        state.intervalMs = updated.loop?.intervalMs ?? state.intervalMs;
        if (intervalChanged && state.timer) {
          clearTimeout(state.timer);
          state.timer = setTimeout(() => void runLoop(state), state.intervalMs);
        }
      }
    }
    saveSettings(settings);
    applySettings();
  });
  ipcMain.handle('app:status', () => status());
  ipcMain.handle(
    'trigger:capture',
    () =>
      new Promise<string | null>((resolve) => {
        if (!hookOk) return resolve(null);
        captureDone?.(null);
        captureDone = resolve;
        hook.beginCapture((name) => {
          captureDone = null;
          resolve(name === 'Escape' ? null : name);
        });
      }),
  );
  ipcMain.on('trigger:cancel', () => {
    hook.cancelCapture();
    captureDone?.(null);
    captureDone = null;
  });
  ipcMain.handle('app:detect', async () => {
    await new Promise((r) => setTimeout(r, 3000));
    const exe = foregroundExe();
    return exe && exe !== OWN_EXE ? exe : null;
  });
  ipcMain.on('action:test', (_e, steps) => {
    setTimeout(() => runSteps(normSteps(steps)).catch((e) => log('test', e)), 3000);
  });
  ipcMain.handle('dialog:file', async () => {
    const r = await dialog.showOpenDialog(win ?? BrowserWindow.getFocusedWindow()!, { properties: ['openFile'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.on('app:open-data', () => void shell.openPath(app.getPath('userData')));
  ipcMain.handle('app:open-github', () => shell.openExternal('https://github.com/LifelessShirt/Radialy'));
}

// ── запуск ──
async function start(): Promise<void> {
  Menu.setApplicationMenu(null);
  settings = loadSettings();
  startHidden = process.argv.includes('--autostart') && settings.startup.startHidden;
  try {
    initNative();
  } catch (e) {
    startError = (e as Error).message;
    log('initNative', e);
  }
  overlay = new Overlay();
  hook = new KeyHook(onPress, onRelease);
  try {
    hook.start();
    hookOk = true;
  } catch (e) {
    startError ??= `Не удалось запустить перехват клавиш: ${(e as Error).message}`;
    log('hook', e);
  }
  registerIpc();
  applySettings();
  createTray();
  win = createWindow();
  nativeTheme.on('updated', () => {
    win?.setTitleBarOverlay(overlayColors());
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showSettings);
  app.on('window-all-closed', () => {
    /* живём в трее */
  });
  app.on('before-quit', () => {
    quitting = true;
    stopAllLoops();
  });
  app.on('will-quit', () => hook?.stop());
  app.whenReady().then(start).catch((e) => log('start', e));
}
