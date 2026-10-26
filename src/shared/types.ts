import type { MenuIcon } from './icons';
import type { Language } from './i18n';

export type ClickButton = 'left' | 'right' | 'middle' | 'back' | 'forward';
export type MediaAction = 'previous' | 'playPause' | 'next' | 'volumeDown' | 'volumeUp' | 'mute';

export type Step =
  | { type: 'keys'; value: string }
  | { type: 'text'; value: string }
  | { type: 'run'; value: string }
  | { type: 'delay'; ms: number }
  | { type: 'click'; button: ClickButton; count: number }
  | { type: 'scroll'; notches: number }
  | { type: 'media'; action: MediaAction };

export interface MenuItem {
  id: string;
  label: string;
  icon: MenuIcon;
  steps: Step[];
  loop?: { intervalMs: number };
}

/** exe === null — меню по умолчанию (для всех приложений) */
export interface Profile {
  id: string;
  exe: string | null;
  items: MenuItem[];
}

export interface Appearance {
  theme: 'system' | 'light' | 'dark';
  /** 'system' или '#rrggbb' */
  accent: string;
  radius: number;
  innerRadius: number;
  opacity: number;
  returnCursor: boolean;
}

export interface Settings {
  version: 1;
  language: Language;
  enabled: boolean;
  /** Имя клавиши в терминах uiohook-napi, например 'F23' */
  trigger: string;
  profiles: Profile[];
  appearance: Appearance;
  startup: { launchAtLogin: boolean; startHidden: boolean };
}

export interface AppStatus {
  nativeOk: boolean;
  hookOk: boolean;
  error: string | null;
  version: string;
  accent: string;
  dataDir: string;
  packaged: boolean;
}

export interface OverlayPayload {
  language: Language;
  items: { label: string; icon: MenuIcon; looping?: boolean }[];
  radius: number;
  innerRadius: number;
  opacity: number;
  dark: boolean;
  accent: string;
  center: { x: number; y: number };
}

export interface Api {
  getSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  getStatus(): Promise<AppStatus>;
  captureTrigger(): Promise<string | null>;
  cancelCapture(): void;
  detectApp(): Promise<string | null>;
  testSteps(steps: Step[]): void;
  pickFile(): Promise<string | null>;
  openDataDir(): void;
  openGitHub(): Promise<void>;
  onExternalChange(cb: (s: Settings) => void): void;
}

export interface OverlayApi {
  onOpen(cb: (p: OverlayPayload) => void): void;
  onHover(cb: (i: number | null) => void): void;
  onClose(cb: () => void): void;
}
