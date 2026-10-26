import { shell } from 'electron';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import { click, scroll, sendKeys, typeText } from './input';
import type { MediaAction, Step } from '../shared/types';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function launch(cmd: string): void {
  const c = cmd.trim();
  if (!c) return;
  if (/^https?:\/\//i.test(c)) void shell.openExternal(c);
  else if (fs.existsSync(c)) void shell.openPath(c);
  else spawn(c, { shell: true, detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

const MEDIA_KEYS: Record<MediaAction, string> = {
  previous: 'prevtrack',
  playPause: 'playpause',
  next: 'nexttrack',
  volumeDown: 'volumedown',
  volumeUp: 'volumeup',
  mute: 'mute',
};

async function runStep(s: Step): Promise<void> {
  switch (s.type) {
    case 'keys': return sendKeys(s.value);
    case 'text': return typeText(s.value);
    case 'run': return launch(s.value);
    case 'delay': return sleep(s.ms);
    case 'click': return click(s.button, s.count);
    case 'scroll': return scroll(s.notches);
    case 'media': return sendKeys(MEDIA_KEYS[s.action]);
  }
}

export async function runSteps(steps: Step[]): Promise<void> {
  for (const s of steps) await runStep(s);
}
