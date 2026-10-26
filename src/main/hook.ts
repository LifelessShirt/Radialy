// Глобальный перехват клавиши или кнопки мыши-триггера через uiohook-napi.
type UiohookModule = typeof import('uiohook-napi');

const MOUSE_BUTTONS: Record<number, string> = {
  1: 'MouseLeft',
  2: 'MouseRight',
  3: 'MouseMiddle',
  4: 'MouseBack',
  5: 'MouseForward',
};

export class KeyHook {
  enabled = true;
  private mod: UiohookModule | null = null;
  private names = new Map<number, string>();
  private triggerName: string | undefined;
  private held = false;
  private capture: ((name: string) => void) | null = null;

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
    mod.uIOhook.start();
    this.mod = mod;
  }

  stop(): void {
    try {
      this.mod?.uIOhook.stop();
    } catch {
      /* ignore */
    }
  }

  setTrigger(name: string): void {
    if (name !== this.triggerName) this.held = false;
    this.triggerName = name;
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
      this.onPress();
    }
  }

  private release(name: string | undefined): void {
    if (name === this.triggerName && this.held) {
      this.held = false;
      this.onRelease();
    }
  }
}
