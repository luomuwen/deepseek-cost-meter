import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const manifest = JSON.parse(read('package.json'));

test('public package and Cordis bundle refer to the same installable package', () => {
  assert.equal(manifest.name, 'deepseek-cost-meter');
  assert.notEqual(manifest.private, true);
  assert.equal(manifest.publishConfig.registry, 'https://registry.npmjs.org/');
  assert.match(read('cordis.patch.yml'), /name: ['"]?deepseek-cost-meter['"]?\s/);
  assert.ok(manifest.repository.url.includes('luomuwen/deepseek-cost-meter'));
});

test('generated browser module registers under the published package name', () => {
  const registrations = [];
  runInNewContext(read('client.js'), { window: { __ModuleLoader__: { load: value => registrations.push(value) } } });
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].id, manifest.name);
  assert.equal(typeof registrations[0].factory, 'function');
});
