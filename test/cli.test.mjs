import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const cli = fileURLToPath(new URL('../bin/api-drift-guard.mjs', import.meta.url));
const examples = fileURLToPath(new URL('../examples/', import.meta.url));
const exec = args => {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  return result;
};
const options = head => ['--base', join(examples, 'base.json'), '--head', join(examples, head)];
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'api-drift-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('additive demo passes, breaking demo blocks, and JSON is one document', () => {
  assert.equal(exec(options('additive.json')).status, 0);
  const result = exec([...options('breaking.json'), '--format', 'json']);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).summary.breaking, 2);
  assert.equal(result.stderr, '');
});

test('review changes block by default and can be explicitly allowed', t => {
  const dir = fixture(t);
  const base = { openapi: '3.1.0', info: { title: 'Demo', version: '1' }, paths: { '/demo': { get: { responses: { 200: { description: 'Demo' } } } } } };
  const head = structuredClone(base);
  head.paths['/demo'].get.operationId = 'changed';
  writeFileSync(join(dir, 'base file.json'), JSON.stringify(base));
  writeFileSync(join(dir, 'head file.json'), JSON.stringify(head));
  const args = ['--base', join(dir, 'base file.json'), '--head', join(dir, 'head file.json'), '--format', 'json'];
  assert.equal(exec(args).status, 1);
  const allowed = exec([...args, '--allow-review']);
  assert.equal(allowed.status, 0);
  assert.equal(JSON.parse(allowed.stdout).policy.allowReview, true);
});

test('markdown report uses only fixed vocabulary and numeric source locations', () => {
  const result = exec([...options('breaking.json'), '--format', 'markdown']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /\| Severity \|/);
  assert.equal(result.stdout.includes('/items'), false);
});

test('invalid args and missing paths never echo supplied values', () => {
  for (const args of [[], ['--bad-PRIVATE_SENTINEL'], ['--base'], [...options('base.json'), '--allow-review', '--allow-review'], ['--base', 'PRIVATE_SENTINEL', '--head', 'PRIVATE_SENTINEL']]) {
    const result = exec([...args, '--format', 'json']);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).ok, false);
    assert.equal((result.stdout + result.stderr).includes('PRIVATE_SENTINEL'), false);
  }
});

test('file errors and malformed JSON produce structured generic diagnostics', t => {
  const dir = fixture(t);
  const path = join(dir, 'input.json');
  for (const content of ['{"PRIVATE_SENTINEL": broken}', Buffer.from([0xc3, 0x28]), Buffer.alloc(4194305)]) {
    writeFileSync(path, content);
    const result = exec(['--base', path, '--head', path, '--format', 'json']);
    assert.equal(result.status, 2);
    assert.equal((result.stdout + result.stderr).includes('PRIVATE_SENTINEL'), false);
    assert.equal(JSON.parse(result.stdout).error.source, 'base');
  }
  assert.equal(exec(['--base', dir, '--head', path]).status, 2);
});

test('duplicate keys fail instead of silently masking an operation', t => {
  const dir = fixture(t);
  const path = join(dir, 'duplicate.json');
  writeFileSync(path, '{"openapi":"3.1.0","paths":{},"paths":{}}');
  const result = exec(['--base', path, '--head', path, '--format', 'json']);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).error.code, 'duplicate-key');
});

test('help and version need no files or credentials', () => {
  assert.match(exec(['--help']).stdout, /Usage:/);
  assert.equal(exec(['--version']).stdout.trim(), '0.1.0');
});
