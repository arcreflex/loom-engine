import { test } from 'node:test';
import assert from 'node:assert';
import { getCodebaseContext } from './introspect.ts';

function assertGitAndNodeModulesExcluded(str: string) {
  // Use join for these paths so that the source code doesn't cause a false positive, heh.
  if (str.includes(['node_modules', 'typescript'].join('/'))) {
    console.log(str);
  }
  assert.ok(
    !str.includes(['node_modules', 'typescript'].join('/')),
    'Should not include node_modules'
  );
  assert.ok(
    !str.includes(['.git', 'HEAD'].join('/')),
    'Should not include .git dir'
  );
}

test('getCodebaseContext - overview level', async () => {
  const result = await getCodebaseContext('overview');

  assert.ok(result.includes('<loom-engine-overview>'));
  assert.ok(result.includes('<readme>'));
  assert.ok(result.includes('<files>'));
  assertGitAndNodeModulesExcluded(result);
});

test('getCodebaseContext - all level', async () => {
  const result = await getCodebaseContext('all');

  assert.ok(result.includes('<loom-engine-codebase>'));
  assert.ok(result.includes('<files>'));
  assert.ok(result.includes('<file path="packages/engine/src/engine.ts">'));
  assert.ok(result.includes('<file path="README.md">'));

  assertGitAndNodeModulesExcluded(result);
});

test('getCodebaseContext - invalid level throws error', async () => {
  await assert.rejects(
    async () => await getCodebaseContext('invalid' as any),
    /Invalid level: invalid/
  );
});
