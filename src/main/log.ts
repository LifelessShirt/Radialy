import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

export function log(...args: unknown[]): void {
  const text = args
    .map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'radial-menu.log'), `${new Date().toISOString()} ${text}\n`);
  } catch {
    /* ignore */
  }
}
