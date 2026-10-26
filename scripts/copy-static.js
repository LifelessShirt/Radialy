// Копирует html/css из src/renderer в dist/renderer
const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

for (const f of walk('src/renderer')) {
  if (!/\.(html|css)$/.test(f)) continue;
  const dest = path.join('dist', path.relative('src', f));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(f, dest);
}
console.log('Статические файлы скопированы');
