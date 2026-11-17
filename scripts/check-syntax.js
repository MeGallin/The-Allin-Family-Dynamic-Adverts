import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

for (const directory of ['src', 'scripts', 'test']) {
  for (const file of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith('.js')) continue;
    const result = spawnSync(process.execPath, ['--check', `${file.parentPath}/${file.name}`], { stdio: 'inherit' });
    if (result.error || result.status !== 0) process.exit(1);
  }
}
console.log('JavaScript syntax validation passed; no compilation is required.');
