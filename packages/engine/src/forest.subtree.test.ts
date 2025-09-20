import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import { Forest } from './forest.ts';
import { createMockStore } from './test-helpers.ts';
import type { NodeData } from './types.ts';

describe('Forest subtree helpers', () => {
  let storeWrapper: ReturnType<typeof createMockStore>;
  let forest: Forest;

  beforeEach(() => {
    storeWrapper = createMockStore();
    forest = new Forest(storeWrapper.mockStore);
  });

  afterEach(() => {
    mock.restoreAll();
  });

  function updateNode(node: NodeData) {
    storeWrapper.nodes.set(node.id, { ...node });
  }

  it('returns breadth-first nodes with optional depth cap', async () => {
    const root = storeWrapper.createTestRoot('root-subtree');
    const user = storeWrapper.createTestNode('node-user', root.id, null, {
      role: 'user',
      content: 'hello'
    });
    const assistant = storeWrapper.createTestNode(
      'node-assistant',
      root.id,
      user.id,
      { role: 'assistant', content: 'hi there' }
    );
    const tool = storeWrapper.createTestNode(
      'node-tool',
      root.id,
      assistant.id,
      {
        role: 'tool',
        content: JSON.stringify({ result: 'ok' }),
        tool_call_id: 'tool-1'
      }
    );
    const sibling = storeWrapper.createTestNode(
      'node-sibling',
      root.id,
      user.id,
      { role: 'assistant', content: 'alternate branch' }
    );

    root.child_ids.push(user.id);
    updateNode({ ...user, child_ids: [assistant.id, sibling.id] });
    updateNode({ ...assistant, child_ids: [tool.id] });
    updateNode({ ...tool, child_ids: [] });
    updateNode({ ...sibling, child_ids: [] });
    storeWrapper.roots.set(root.id, { ...root, child_ids: [user.id] });

    const full = await forest.getSubtree(user.id);
    assert.strictEqual(full.root.id, root.id);
    assert.deepStrictEqual(
      full.nodes.map(n => n.id),
      [user.id, assistant.id, sibling.id, tool.id]
    );

    const depthOne = await forest.getSubtree(user.id, { depth: 1 });
    assert.deepStrictEqual(
      depthOne.nodes.map(n => n.id),
      [user.id, assistant.id, sibling.id]
    );

    const fromRoot = await forest.getSubtree(root.id, { depth: 1 });
    assert.deepStrictEqual(
      fromRoot.nodes.map(n => n.id),
      [user.id]
    );
  });

  it('lists recent leaves ordered by timestamp', async () => {
    const root = storeWrapper.createTestRoot('root-leaves');
    const leafOld = storeWrapper.createTestNode('node-old', root.id, null, {
      role: 'user',
      content: 'first'
    });
    const leafNew = storeWrapper.createTestNode('node-new', root.id, null, {
      role: 'assistant',
      content: 'second'
    });
    const parent = storeWrapper.createTestNode('node-parent', root.id, null, {
      role: 'user',
      content: 'parent'
    });
    const child = storeWrapper.createTestNode(
      'node-child',
      root.id,
      parent.id,
      { role: 'assistant', content: 'child' }
    );

    leafOld.metadata.timestamp = '2024-01-01T00:00:00.000Z';
    leafNew.metadata.timestamp = '2024-01-03T00:00:00.000Z';
    parent.metadata.timestamp = '2024-01-02T00:00:00.000Z';
    child.metadata.timestamp = '2024-01-04T00:00:00.000Z';

    root.child_ids.push(leafOld.id, leafNew.id, parent.id);
    updateNode({ ...leafOld, child_ids: [] });
    updateNode({ ...leafNew, child_ids: [] });
    updateNode({ ...parent, child_ids: [child.id] });
    updateNode({ ...child, child_ids: [] });
    storeWrapper.roots.set(root.id, {
      ...root,
      child_ids: [leafOld.id, leafNew.id, parent.id]
    });

    const leaves = await forest.listRecentLeaves(2);
    assert.strictEqual(leaves.length, 2);
    assert.deepStrictEqual(
      leaves.map(n => n.id),
      [child.id, leafNew.id]
    );
  });
});
