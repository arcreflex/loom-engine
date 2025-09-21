import { test } from 'node:test';
import assert from 'node:assert';
import { getCodebaseContext } from './introspect.ts';
import { readFile } from 'node:fs/promises';
import * as path from 'path';

const __dirname = new URL('.', import.meta.url).pathname;
const repoRoot = path.join(__dirname, '../../../../');

function assertExcludedFiles(result: string) {
  const tree = getFileTreeSection(result);

  // Make sure it includes something to validate the test
  assert.ok(
    tree.includes('introspect.test.ts'),
    'Does include introspect.test.ts'
  );

  // Check that node_modules is excluded
  assert.ok(!tree.includes('node_modules'), 'Does not include node_modules');
  assert.ok(tree.includes('.gitignore'), 'Includes .gitignore baseline');

  const containingDotGitDir = tree
    .split('\n')
    .map(line => line.trim())
    .filter(line => /(^|\/)\.git(\/.|$)/.test(line));
  assert.deepEqual(
    [...new Set(containingDotGitDir)],
    [],
    'Does not include .git dir contents'
  );
}

function getFileTreeSection(s: string) {
  const start = s.indexOf('<files>') + '<files>'.length;
  const end = s.indexOf('</files>');
  return s.slice(start, end).trim();
}

test('getCodebaseContext - overview level', async () => {
  const result = await getCodebaseContext('overview');

  assert.ok(result.includes('<loom-engine-overview>'));
  assert.ok(result.includes('<readme>'));
  assert.ok(result.includes('<files>'));
  assertExcludedFiles(result);
});

test('getCodebaseContext - all level', async () => {
  const result = await getCodebaseContext('all');

  assert.ok(result.includes('<loom-engine-codebase>'));
  assert.ok(result.includes('<files>'));
  assertExcludedFiles(result);
  const overview = await getCodebaseContext('overview');
  assert.equal(
    getFileTreeSection(result),
    getFileTreeSection(overview),
    'file tree is identical to overview file tree'
  );

  const fileContentEntries = [];
  // match every file path="..." tag and extract paths
  const regex = /<file path="([^"]+)">/g;
  let match;
  while ((match = regex.exec(result)) !== null) {
    fileContentEntries.push(match[1]);
  }

  assert.ok(
    fileContentEntries.includes('README.md'),
    'file content entry for README.md exists'
  );
  assert.ok(
    fileContentEntries.includes('packages/engine/src/engine.ts'),
    'file content entry for engine.ts exists'
  );
  const readme = await readFile(
    `${repoRoot}/packages/engine/src/engine.ts`,
    'utf-8'
  );
  assert.ok(
    result.includes(readme),
    'actual file content for engine.ts is included'
  );

  assert.ok(
    !fileContentEntries.includes('pnpm-lock.yaml'),
    'no file content entry for pnpm-lock.yaml'
  );
  const pnpmLock = await readFile(`${repoRoot}/pnpm-lock.yaml`, 'utf-8');
  assert.ok(pnpmLock.includes('lockfileVersion'), 'pnpm-lock looks reasonable');
  assert.ok(!result.includes(pnpmLock.trim()));
});

test('getCodebaseContext - invalid level throws error', async () => {
  await assert.rejects(
    async () => await getCodebaseContext('invalid' as any),
    /Invalid level: invalid/
  );
});
