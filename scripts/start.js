const { spawn } = require('node:child_process');
const fs = require('node:fs');
const electron = require('electron');

if (!fs.existsSync(electron)) {
  throw new Error(`Electron executable was not found: ${electron}`);
}

const child = spawn(electron, ['.'], {
  detached: true,
  stdio: 'ignore',
  windowsHide: false,
});

child.once('error', (error) => {
  console.error('Не удалось запустить Radialy:', error);
  process.exitCode = 1;
});

child.unref();
console.log(`Radialy запущен отдельно от консоли (PID ${child.pid}).`);
