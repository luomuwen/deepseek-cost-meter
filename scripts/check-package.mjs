import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const destination = mkdtempSync(join(tmpdir(), 'cost-package-'));
try {
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', destination], { encoding: 'utf8' }));
  const files = new Set(pack.files.map(file => file.path));
  for (const file of ['index.js', 'client.js', 'src/pricing.js', 'src/projection.js', 'src/client-factory.js',
    'rates.json', 'cordis.patch.yml', 'icon.svg', 'locale/en.json', 'locale/zh.json', 'LICENSE', 'README.md', 'node_modules/zod/package.json']) {
    assert.ok(files.has(file), `Package missing ${file}`);
  }
  assert.ok(![...files].some(file => file.startsWith('node_modules/react/')), 'Harness supplies React');
  assert.ok(![...files].some(file => /(^|\/)(\.env|\.git)(\/|$)/.test(file)), 'No private files in package');
  console.log('PASS: distributable includes runtime files and bundled Zod, without a second React.');
} finally {
  rmSync(destination, { recursive: true, force: true });
}
