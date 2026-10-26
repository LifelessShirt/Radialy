// Эмуляция ввода и вспомогательные вызовы WinAPI через koffi (без компиляции нативных модулей).
import type { ClickButton } from '../shared/types';

const INPUT_SIZE = 40; // sizeof(INPUT) на x64
const EXTENDED = 0x1;
const KEYUP = 0x2;
const UNICODE = 0x4;

interface Native {
  sendInput(count: number, buf: Buffer): number;
  setCursorPos(x: number, y: number): void;
  mapVk(vk: number): number;
  foregroundExe(): string;
}
let native: Native | null = null;

export function initNative(): void {
  if (process.platform !== 'win32') throw new Error('Поддерживается только Windows');
  if (process.arch !== 'x64') throw new Error('Нужна 64-разрядная сборка (x64)');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');

  const SendInput = user32.func('uint32_t SendInput(uint32_t cInputs, void *pInputs, int cbSize)');
  const SetCursorPos = user32.func('bool SetCursorPos(int x, int y)');
  const MapVirtualKeyW = user32.func('uint32_t MapVirtualKeyW(uint32_t uCode, uint32_t uMapType)');
  const GetForegroundWindow = user32.func('void *GetForegroundWindow()');
  const GetWindowThreadProcessId = user32.func(
    'uint32_t GetWindowThreadProcessId(void *hWnd, _Out_ uint32_t *lpdwProcessId)',
  );
  const OpenProcess = kernel32.func('void *OpenProcess(uint32_t dwDesiredAccess, bool bInheritHandle, uint32_t dwProcessId)');
  const QueryFullProcessImageNameW = kernel32.func(
    'bool QueryFullProcessImageNameW(void *hProcess, uint32_t dwFlags, void *lpExeName, _Inout_ uint32_t *lpdwSize)',
  );
  const CloseHandle = kernel32.func('bool CloseHandle(void *hObject)');

  native = {
    sendInput: (count, buf) => SendInput(count, buf, INPUT_SIZE),
    setCursorPos: (x, y) => void SetCursorPos(x, y),
    mapVk: (vk) => MapVirtualKeyW(vk, 0),
    foregroundExe: () => {
      const hwnd = GetForegroundWindow();
      if (!hwnd) return '';
      const pid = [0];
      GetWindowThreadProcessId(hwnd, pid);
      const h = OpenProcess(0x1000, false, pid[0]); // PROCESS_QUERY_LIMITED_INFORMATION
      if (!h) return '';
      try {
        const buf = Buffer.alloc(1040);
        const size = [520];
        if (!QueryFullProcessImageNameW(h, 0, buf, size)) return '';
        const full = buf.toString('utf16le', 0, size[0] * 2);
        return full.slice(full.lastIndexOf('\\') + 1).toLowerCase();
      } finally {
        CloseHandle(h);
      }
    },
  };
}

export const nativeReady = (): boolean => native !== null;
const nat = (): Native => {
  if (!native) throw new Error('Системные функции недоступны (см. лог)');
  return native;
};
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function foregroundExe(): string {
  try {
    return native?.foregroundExe() ?? '';
  } catch {
    return '';
  }
}

export function setCursor(x: number, y: number): void {
  try {
    native?.setCursorPos(Math.round(x), Math.round(y));
  } catch {
    /* ignore */
  }
}

// ── Клавиши ──
const VK: Record<string, number> = {
  ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12, win: 0x5b, windows: 0x5b, meta: 0x5b, cmd: 0x5b,
  enter: 0x0d, return: 0x0d, esc: 0x1b, escape: 0x1b, tab: 0x09, space: 0x20, backspace: 0x08,
  delete: 0x2e, del: 0x2e, insert: 0x2d, home: 0x24, end: 0x23, pageup: 0x21, pagedown: 0x22,
  left: 0x25, up: 0x26, right: 0x27, down: 0x28,
  printscreen: 0x2c, pause: 0x13, capslock: 0x14, numlock: 0x90, scrolllock: 0x91,
  mute: 0xad, volumedown: 0xae, voldown: 0xae, volumeup: 0xaf, volup: 0xaf,
  nexttrack: 0xb0, next: 0xb0, prevtrack: 0xb1, prev: 0xb1, stop: 0xb2, playpause: 0xb3,
  ';': 0xba, '=': 0xbb, plus: 0xbb, ',': 0xbc, '-': 0xbd, '.': 0xbe, '/': 0xbf, '`': 0xc0,
  '[': 0xdb, '\\': 0xdc, ']': 0xdd, "'": 0xde,
};
const EXT_KEYS = new Set([0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2d, 0x2e, 0x5b, 0x90]);

function vkOf(token: string): number {
  const t = token.trim().toLowerCase();
  if (t in VK) return VK[t];
  if (/^f([1-9]|1\d|2[0-4])$/.test(t)) return 0x6f + Number(t.slice(1));
  if (/^[a-z]$/.test(t)) return t.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(t)) return t.charCodeAt(0);
  if (/^vk:/.test(t)) return parseInt(t.slice(3), 0);
  throw new Error(`Неизвестная клавиша: «${token}»`);
}

function kbInput(buf: Buffer, i: number, vk: number, flags: number, scan?: number): void {
  const o = i * INPUT_SIZE;
  buf.writeUInt32LE(1, o); // INPUT_KEYBOARD
  buf.writeUInt16LE(vk, o + 8);
  buf.writeUInt16LE(scan ?? (vk ? nat().mapVk(vk) : 0), o + 10);
  buf.writeUInt32LE(flags, o + 12);
}

function mouseInput(buf: Buffer, i: number, flags: number, data = 0): void {
  const o = i * INPUT_SIZE;
  buf.writeUInt32LE(0, o); // INPUT_MOUSE
  buf.writeInt32LE(data, o + 16);
  buf.writeUInt32LE(flags, o + 20);
}

export async function sendKeys(combo: string): Promise<void> {
  const vks = combo.split('+').filter((t) => t.trim()).map(vkOf);
  if (!vks.length) return;
  const flag = (vk: number) => (EXT_KEYS.has(vk) ? EXTENDED : 0);
  const down = Buffer.alloc(INPUT_SIZE * vks.length);
  vks.forEach((vk, i) => kbInput(down, i, vk, flag(vk)));
  const up = Buffer.alloc(INPUT_SIZE * vks.length);
  [...vks].reverse().forEach((vk, i) => kbInput(up, i, vk, flag(vk) | KEYUP));
  const nativeInput = nat();
  try {
    const sent = nativeInput.sendInput(vks.length, down);
    if (sent !== vks.length) throw new Error(`SendInput отправил ${sent} из ${vks.length} нажатий`);
    await sleep(15);
  } finally {
    const failures: string[] = [];
    for (let i = 0; i < vks.length; i++) {
      const keyUp = up.subarray(i * INPUT_SIZE, (i + 1) * INPUT_SIZE);
      try {
        if (nativeInput.sendInput(1, keyUp) !== 1) failures.push(String(vks[vks.length - 1 - i]));
      } catch (e) {
        failures.push(`${vks[vks.length - 1 - i]} (${e instanceof Error ? e.message : String(e)})`);
      }
    }
    if (failures.length) throw new Error(`Не удалось отпустить клавиши: ${failures.join(', ')}`);
  }
}

export async function typeText(text: string): Promise<void> {
  const ev: Array<[number, number | undefined, number]> = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 13) continue;
    if (c === 10 || c === 9) {
      const vk = c === 10 ? 0x0d : 0x09;
      ev.push([vk, undefined, 0], [vk, undefined, KEYUP]);
    } else {
      ev.push([0, c, UNICODE], [0, c, UNICODE | KEYUP]);
    }
  }
  for (let i = 0; i < ev.length; i += 80) {
    const part = ev.slice(i, i + 80);
    const buf = Buffer.alloc(INPUT_SIZE * part.length);
    part.forEach(([vk, scan, flags], k) => kbInput(buf, k, vk, flags, scan));
    nat().sendInput(part.length, buf);
    await sleep(5);
  }
}

// ── Мышь ──
const BUTTONS: Record<ClickButton, [number, number, number]> = {
  left: [0x2, 0x4, 0],
  right: [0x8, 0x10, 0],
  middle: [0x20, 0x40, 0],
  back: [0x80, 0x100, 1],
  forward: [0x80, 0x100, 2],
};

export async function click(button: ClickButton, count: number): Promise<void> {
  const [down, up, data] = BUTTONS[button] ?? BUTTONS.left;
  for (let i = 0; i < count; i++) {
    const buf = Buffer.alloc(INPUT_SIZE * 2);
    mouseInput(buf, 0, down, data);
    mouseInput(buf, 1, up, data);
    nat().sendInput(2, buf);
    await sleep(30);
  }
}

export function scroll(notches: number): void {
  const buf = Buffer.alloc(INPUT_SIZE);
  mouseInput(buf, 0, 0x800, Math.round(notches) * 120);
  nat().sendInput(1, buf);
}
