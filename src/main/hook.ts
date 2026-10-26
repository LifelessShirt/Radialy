// Глобальный перехват клавиши или кнопки мыши-триггера через uiohook-napi.
import type { IKoffiRegisteredCallback } from 'koffi';
import { log } from './log';

type UiohookModule = typeof import('uiohook-napi');
type KoffiModule = typeof import('koffi');
type KoffiStruct = ReturnType<KoffiModule['struct']>;
type NativeCallNextHook = (handle: unknown, code: number, message: number, data: unknown) => number;

const MOUSE_BUTTONS: Record<number, string> = {
  1: 'MouseLeft',
  2: 'MouseRight',
  3: 'MouseMiddle',
  4: 'MouseBack',
  5: 'MouseForward',
};

const VK_CODES: Record<string, number> = {
  backspace: 0x08, tab: 0x09, enter: 0x0d, capslock: 0x14, escape: 0x1b, space: 0x20,
  pageup: 0x21, pagedown: 0x22, end: 0x23, home: 0x24, arrowleft: 0x25, arrowup: 0x26,
  arrowright: 0x27, arrowdown: 0x28, printscreen: 0x2c, insert: 0x2d, delete: 0x2e,
  ctrl: 0xa2, ctrlright: 0xa3, alt: 0xa4, altright: 0xa5, shift: 0xa0, shiftright: 0xa1,
  meta: 0x5b, metaright: 0x5c, numlock: 0x90, scrolllock: 0x91,
  numpadenter: 0x0d,
  numpadmultiply: 0x6a, numpadadd: 0x6b, numpadsubtract: 0x6d, numpaddecimal: 0x6e, numpaddivide: 0x6f,
  numpadend: 0x23, numpadarrowdown: 0x28, numpadpagedown: 0x22, numpadarrowleft: 0x25,
  numpadarrowright: 0x27, numpadhome: 0x24, numpadarrowup: 0x26, numpadpageup: 0x21,
  numpadinsert: 0x2d, numpaddelete: 0x2e,
  semicolon: 0xba, equal: 0xbb, comma: 0xbc, minus: 0xbd, period: 0xbe, slash: 0xbf,
  backquote: 0xc0, bracketleft: 0xdb, backslash: 0xdc, bracketright: 0xdd, quote: 0xde,
};

function virtualKey(name: string): number | null {
  const key = name.toLowerCase();
  if (/^f([1-9]|1\d|2[0-4])$/.test(key)) return 0x70 + Number(key.slice(1)) - 1;
  if (/^[a-z]$/.test(key)) return key.toUpperCase().charCodeAt(0);
  if (/^[0-9]$/.test(key)) return key.charCodeAt(0);
  if (/^numpad[0-9]$/.test(key)) return 0x60 + Number(key.slice(-1));
  return VK_CODES[key] ?? null;
}

class TriggerBlocker {
  private koffi: KoffiModule | null = null;
  private nextHook: NativeCallNextHook | null = null;
  private unhook: ((handle: unknown) => boolean) | null = null;
  private keyboardHook: unknown = null;
  private mouseHook: unknown = null;
  private keyboardCallback: IKoffiRegisteredCallback | null = null;
  private mouseCallback: IKoffiRegisteredCallback | null = null;
  private trigger = '';
  private enabled = false;
  private triggerVk: number | null = null;

  constructor(private onDown: (name: string) => void, private onUp: (name: string) => void) {}

  start(): void {
    if (process.platform !== 'win32') throw new Error('Поддерживается только Windows');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const koffi: KoffiModule = require('koffi');
    const user32 = koffi.load('user32.dll');
    const KeyboardData = koffi.struct('KBDLLHOOKSTRUCT', {
      vkCode: 'uint32_t',
      scanCode: 'uint32_t',
      flags: 'uint32_t',
      time: 'uint32_t',
      dwExtraInfo: 'uintptr_t',
    });
    const Point = koffi.struct('POINT', { x: 'int32_t', y: 'int32_t' });
    const MouseData = koffi.struct('MSLLHOOKSTRUCT', {
      pt: Point,
      mouseData: 'uint32_t',
      flags: 'uint32_t',
      time: 'uint32_t',
      dwExtraInfo: 'uintptr_t',
    });
    const HookProc = koffi.proto('__stdcall', 'HookProc', 'intptr_t', ['int32_t', 'uintptr_t', 'void *']);
    const setWindowsHook = user32.func('SetWindowsHookExW', 'void *', ['int32_t', koffi.pointer(HookProc), 'void *', 'uint32_t']);
    this.nextHook = user32.func('CallNextHookEx', 'intptr_t', ['void *', 'int32_t', 'uintptr_t', 'void *']);
    this.unhook = user32.func('UnhookWindowsHookEx', 'bool', ['void *']);
    this.koffi = koffi;
    this.keyboardCallback = koffi.register(
      (code: number, message: number, data: unknown) => this.keyboardEvent(code, message, data, KeyboardData),
      koffi.pointer(HookProc),
    );
    this.mouseCallback = koffi.register(
      (code: number, message: number, data: unknown) => this.mouseEvent(code, message, data, MouseData),
      koffi.pointer(HookProc),
    );

    try {
      this.keyboardHook = setWindowsHook(13, this.keyboardCallback, null, 0);
      if (!this.keyboardHook) throw new Error('Не удалось установить перехват клавиатуры Windows');
      this.mouseHook = setWindowsHook(14, this.mouseCallback, null, 0);
      if (!this.mouseHook) throw new Error('Не удалось установить перехват мыши Windows');
    } catch (e) {
      this.stop();
      throw e;
    }
  }

  stop(): void {
    let failedToUnhook = false;
    for (const [hook, kind] of [[this.keyboardHook, 'keyboard'], [this.mouseHook, 'mouse']] as const) {
      if (hook === null || !this.unhook) continue;
      try {
        if (!this.unhook(hook)) {
          failedToUnhook = true;
          log('unhook', `Не удалось снять системный перехват ${kind}`);
        } else if (kind === 'keyboard') this.keyboardHook = null;
        else this.mouseHook = null;
      } catch (e) {
        failedToUnhook = true;
        log('unhook', e);
      }
    }
    if (failedToUnhook) return;
    if (this.koffi) {
      for (const callback of [this.keyboardCallback, this.mouseCallback]) {
        if (!callback) continue;
        try {
          this.koffi.unregister(callback);
        } catch (e) {
          log('unregister hook callback', e);
        }
      }
    }
    this.keyboardCallback = null;
    this.mouseCallback = null;
  }

  configure(trigger: string, enabled: boolean): void {
    this.trigger = trigger;
    this.triggerVk = virtualKey(trigger);
    this.enabled = enabled;
  }

  private callNext(code: number, message: number, data: unknown): number {
    return this.nextHook?.(null, code, message, data) ?? 0;
  }

  private keyboardEvent(code: number, message: number, data: unknown, dataType: KoffiStruct): number {
    if (code < 0) return this.callNext(code, message, data);
    const keyDown = message === 0x0100 || message === 0x0104;
    const keyUp = message === 0x0101 || message === 0x0105;
    if (this.enabled && this.triggerVk !== null && (keyDown || keyUp)) {
      try {
        const event = this.koffi?.decode(data, dataType) as { vkCode: number };
        if (event.vkCode === this.triggerVk) {
          if (keyDown) this.onDown(this.trigger);
          else this.onUp(this.trigger);
          return 1;
        }
      } catch (e) {
        log('keyboard blocker', e);
      }
    }
    return this.callNext(code, message, data);
  }

  private mouseEvent(code: number, message: number, data: unknown, dataType: KoffiStruct): number {
    if (code < 0) return this.callNext(code, message, data);
    let name: string | undefined;
    let buttonDown = false;
    if (message === 0x0201 || message === 0x0202) {
      name = 'MouseLeft';
      buttonDown = message === 0x0201;
    } else if (message === 0x0204 || message === 0x0205) {
      name = 'MouseRight';
      buttonDown = message === 0x0204;
    } else if (message === 0x0207 || message === 0x0208) {
      name = 'MouseMiddle';
      buttonDown = message === 0x0207;
    }
    else if (message === 0x020b || message === 0x020c) {
      buttonDown = message === 0x020b;
      try {
        const event = this.koffi?.decode(data, dataType) as { mouseData: number };
        const button = event.mouseData >>> 16;
        name = button === 1 ? 'MouseBack' : button === 2 ? 'MouseForward' : undefined;
      } catch (e) {
        log('mouse blocker', e);
      }
    }
    if (this.enabled && name === this.trigger) {
      if (buttonDown) this.onDown(name);
      else this.onUp(name);
      return 1;
    }
    return this.callNext(code, message, data);
  }
}

export class KeyHook {
  private enabled = true;
  private mod: UiohookModule | null = null;
  private names = new Map<number, string>();
  private triggerName: string | undefined;
  private held = false;
  private capture: ((name: string) => void) | null = null;
  private blocker = new TriggerBlocker((name) => this.press(name), (name) => this.release(name));

  constructor(private onPress: () => void, private onRelease: () => void) {}

  start(): void {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('uiohook-napi') as UiohookModule;
    for (const [name, code] of Object.entries(mod.UiohookKey)) {
      if (typeof code === 'number' && !this.names.has(code)) this.names.set(code, name);
    }
    mod.uIOhook.on('keydown', (e) => this.down(e.keycode));
    mod.uIOhook.on('keyup', (e) => this.up(e.keycode));
    mod.uIOhook.on('mousedown', (e) => this.mouseDown(e.button));
    mod.uIOhook.on('mouseup', (e) => this.mouseUp(e.button));
    this.mod = mod;
    try {
      mod.uIOhook.start();
      this.blocker.start();
    } catch (e) {
      try {
        mod.uIOhook.stop();
      } catch (stopError) {
        log('stop keyboard hook after startup failure', stopError);
      }
      this.blocker.stop();
      throw e;
    }
  }

  stop(): void {
    try {
      this.mod?.uIOhook.stop();
    } catch (e) {
      log('stop keyboard hook', e);
    } finally {
      this.blocker.stop();
    }
  }

  configure(name: string, enabled: boolean, suppressTrigger: boolean): void {
    if (name !== this.triggerName) this.held = false;
    this.triggerName = name;
    this.enabled = enabled;
    this.blocker.configure(name, enabled && suppressTrigger);
  }

  beginCapture(cb: (name: string) => void): void {
    this.capture = cb;
  }

  cancelCapture(): void {
    this.capture = null;
  }

  private down(code: number): void {
    this.press(this.names.get(code));
  }

  private up(code: number): void {
    this.release(this.names.get(code));
  }

  private mouseDown(button: unknown): void {
    this.press(typeof button === 'number' ? MOUSE_BUTTONS[button] : undefined);
  }

  private mouseUp(button: unknown): void {
    this.release(typeof button === 'number' ? MOUSE_BUTTONS[button] : undefined);
  }

  private press(name: string | undefined): void {
    if (this.capture) {
      if (name) {
        const cb = this.capture;
        this.capture = null;
        cb(name);
      }
      return;
    }
    if (this.enabled && name === this.triggerName && !this.held) {
      this.held = true;
      setImmediate(this.onPress);
    }
  }

  private release(name: string | undefined): void {
    if (name === this.triggerName && this.held) {
      this.held = false;
      setImmediate(this.onRelease);
    }
  }
}
