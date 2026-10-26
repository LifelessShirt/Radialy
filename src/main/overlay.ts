// Прозрачное окно с радиальным меню: не забирает фокус, пропускает клики сквозь себя.
import { BrowserWindow, screen } from 'electron';
import * as path from 'node:path';
import { setCursor } from './input';
import type { Appearance, MenuItem, OverlayPayload } from '../shared/types';
import type { Language } from '../shared/i18n';

const PAD = 24; // должен совпадать с RING_PAD в renderer/ring.ts
const BACKDROP_PAD = 112;

export class Overlay {
  isOpen = false;
  private win: BrowserWindow;
  private timer: NodeJS.Timeout | null = null;
  private center = { x: 0, y: 0 }; // DIP
  private hover: number | null = null;
  private count = 0;
  private inner = 48;

  constructor() {
    this.win = new BrowserWindow({
      width: 400,
      height: 400,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      fullscreenable: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload/overlay-preload.js'),
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setIgnoreMouseEvents(true);
    void this.win.loadFile(path.join(__dirname, '../renderer/overlay/overlay.html'));
  }

  open(items: MenuItem[], loopingItems: Set<string>, ap: Appearance, dark: boolean, accent: string, language: Language): void {
    if (this.isOpen) return;
    const extent = ap.radius + PAD + BACKDROP_PAD;
    const pt = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(pt);
    const b = display.bounds;

    // Меню целиком помещается на экран: при необходимости сдвигаем курсор к центру меню
    const cx = Math.min(Math.max(pt.x, b.x + extent), b.x + b.width - extent);
    const cy = Math.min(Math.max(pt.y, b.y + extent), b.y + b.height - extent);
    if (cx !== pt.x || cy !== pt.y) {
      const p = screen.dipToScreenPoint({ x: cx, y: cy });
      setCursor(p.x, p.y);
    }
    this.center = { x: cx, y: cy };
    this.count = items.length;
    this.inner = ap.innerRadius;
    this.hover = null;

    const bounds = { x: cx - extent, y: cy - extent, width: extent * 2, height: extent * 2 };
    this.win.setBounds(bounds);
    this.win.setBounds(bounds); // второй вызов — обход бага с разным DPI мониторов
    const payload: OverlayPayload = {
      language,
      items: items.map((i) => ({ label: i.label, icon: i.icon, looping: loopingItems.has(i.id) })),
      radius: ap.radius,
      innerRadius: ap.innerRadius,
      opacity: ap.opacity,
      dark,
      accent,
      center: { x: extent, y: extent },
    };
    this.win.webContents.send('overlay:open', payload);
    this.win.showInactive();
    this.isOpen = true;
    this.timer = setInterval(() => this.tick(), 16);
  }

  close(): { index: number | null; center: { x: number; y: number } } {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const index = this.indexAt();
    this.isOpen = false;
    this.win.hide();
    this.win.webContents.send('overlay:close');
    return { index, center: screen.dipToScreenPoint(this.center) };
  }

  private tick(): void {
    const i = this.indexAt();
    if (i !== this.hover) {
      this.hover = i;
      this.win.webContents.send('overlay:hover', i);
    }
  }

  private indexAt(): number | null {
    const p = screen.getCursorScreenPoint();
    const dx = p.x - this.center.x;
    const dy = p.y - this.center.y;
    if (Math.hypot(dx, dy) < this.inner) return null;
    const step = 360 / this.count;
    const ang = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360; // по часовой от «12 часов»
    return Math.floor((ang + step / 2) / step) % this.count;
  }
}
