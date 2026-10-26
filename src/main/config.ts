import { app } from 'electron';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MediaAction, MenuItem, Profile, Settings, Step } from '../shared/types';
import { normalizeMenuIcon, type MenuIcon } from '../shared/icons';
import { detectLanguage, type Language } from '../shared/i18n';
import { log } from './log';

const file = () => path.join(app.getPath('userData'), 'settings.json');
const uid = () => randomUUID();
const clamp = (v: unknown, lo: number, hi: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;

const keys = (label: string, icon: MenuIcon, value: string): MenuItem => ({
  id: uid(),
  label,
  icon,
  steps: [{ type: 'keys', value }],
});

export function defaultItems(): MenuItem[] {
  return [
    keys('Копировать', 'copy', 'ctrl+c'),
    keys('Вставить', 'paste', 'ctrl+v'),
    keys('Отменить', 'undo', 'ctrl+z'),
    keys('Скриншот', 'camera', 'win+shift+s'),
    keys('Диспетчер задач', 'chart', 'ctrl+shift+esc'),
    { id: uid(), label: 'Без звука', icon: 'volume-off', steps: [{ type: 'media', action: 'mute' }] },
    { id: uid(), label: 'Блокнот', icon: 'file', steps: [{ type: 'run', value: 'notepad.exe' }] },
    {
      id: uid(),
      label: 'Выделить и копировать',
      icon: 'scissors',
      steps: [
        { type: 'keys', value: 'ctrl+a' },
        { type: 'delay', ms: 80 },
        { type: 'keys', value: 'ctrl+c' },
      ],
    },
  ];
}

export function defaultSettings(): Settings {
  return {
    version: 1,
    language: detectLanguage(app.getLocale()),
    enabled: true,
    trigger: 'F23',
    profiles: [{ id: uid(), exe: null, items: defaultItems() }],
    appearance: { theme: 'system', accent: 'system', radius: 170, innerRadius: 48, opacity: 0.92, returnCursor: false },
    startup: { launchAtLogin: false, startHidden: true },
  };
}

const BUTTONS = ['left', 'right', 'middle', 'back', 'forward'];
const MEDIA_ACTIONS: MediaAction[] = ['previous', 'playPause', 'next', 'volumeDown', 'volumeUp', 'mute'];

function normStep(s: any): Step | null {
  switch (s?.type) {
    case 'keys':
    case 'text':
    case 'run':
      return { type: s.type, value: String(s.value ?? '') };
    case 'delay':
      return { type: 'delay', ms: Math.round(clamp(s.ms, 0, 60000, 100)) };
    case 'click':
      return {
        type: 'click',
        button: BUTTONS.includes(s.button) ? s.button : 'left',
        count: Math.round(clamp(s.count, 1, 10, 1)),
      };
    case 'scroll':
      return { type: 'scroll', notches: Math.round(clamp(s.notches, -50, 50, -3)) };
    case 'media':
      return { type: 'media', action: MEDIA_ACTIONS.includes(s.action) ? s.action : 'mute' };
    default:
      return null;
  }
}

export function normSteps(raw: unknown): Step[] {
  return Array.isArray(raw) ? raw.map(normStep).filter((s): s is Step => s !== null) : [];
}

function normItem(i: any): MenuItem {
  const label = String(i?.label ?? '');
  const steps = normSteps(i?.steps);
  if (label === 'Без звука' && steps.length === 1 && steps[0].type === 'keys' && steps[0].value.trim().toLowerCase() === 'mute') {
    steps[0] = { type: 'media', action: 'mute' };
  }
  const loopInterval = Number(i?.loop?.intervalMs);
  return {
    id: String(i?.id ?? uid()),
    label,
    icon: normalizeMenuIcon(i?.icon),
    steps,
    ...(Number.isFinite(loopInterval) && loopInterval > 0
      ? { loop: { intervalMs: Math.round(clamp(loopInterval, 10, 60000, 1000)) } }
      : {}),
  };
}

export function normalize(raw: any): Settings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const a = raw.appearance ?? {};
  const profiles: Profile[] = Array.isArray(raw.profiles)
    ? raw.profiles
        .filter((p: any) => p && Array.isArray(p.items))
        .map((p: any): Profile => ({
          id: String(p.id ?? uid()),
          exe: p.exe ? String(p.exe).toLowerCase() : null,
          items: p.items.slice(0, 16).map(normItem),
        }))
    : [];
  if (!profiles.some((p) => p.exe === null)) profiles.unshift(d.profiles[0]);
  profiles.sort((x, y) => Number(y.exe === null) - Number(x.exe === null));
  return {
    version: 1,
    language: (['ru', 'en', 'uk'] as Language[]).includes(raw.language) ? raw.language : detectLanguage(app.getLocale()),
    enabled: raw.enabled !== false,
    trigger: typeof raw.trigger === 'string' && raw.trigger ? raw.trigger : d.trigger,
    profiles,
    appearance: {
      theme: ['system', 'light', 'dark'].includes(a.theme) ? a.theme : 'system',
      accent: /^#[0-9a-f]{6}$/i.test(a.accent) ? a.accent : 'system',
      radius: Math.round(clamp(a.radius, 120, 260, d.appearance.radius)),
      innerRadius: Math.round(clamp(a.innerRadius, 30, 80, d.appearance.innerRadius)),
      opacity: clamp(a.opacity, 0.5, 1, d.appearance.opacity),
      returnCursor: a.returnCursor === true,
    },
    startup: {
      launchAtLogin: raw.startup?.launchAtLogin === true,
      startHidden: raw.startup?.startHidden !== false,
    },
  };
}

export function saveSettings(s: Settings): void {
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file(), JSON.stringify(s, null, 2), 'utf8');
  } catch (e) {
    log('saveSettings', e);
  }
}

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    const settings = normalize(raw);
    if (!(['ru', 'en', 'uk'] as Language[]).includes(raw?.language)) saveSettings(settings);
    return settings;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') log('loadSettings', e);
    const s = defaultSettings();
    saveSettings(s);
    return s;
  }
}
