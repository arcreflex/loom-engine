import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Forest } from './forest.ts';
import { createMockStore, mockNodeId, mockRootId } from './test-helpers.ts';
import type { AssistantMessage, Message } from './types.ts';

describe('Forest V2-aware prefix matching', () => {
  it('reuses child when tool_call arguments differ only by key order', async () => {
    const { mockStore } = createMockStore();
    const forest = new Forest(mockStore);

    // Create root
    const rootId = mockRootId('root-1');
    await mockStore.saveRootInfo({
      id: rootId,
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'You are a system' },
      child_ids: []
    });

    // Create one assistant node under root with a tool call
    const assistantWithTool: AssistantMessage = {
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'sum', arguments: JSON.stringify({ a: 1, b: 2 }) }
        }
      ]
    };

    const nodeId = mockNodeId('node-1');
    await mockStore.saveNode({
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: assistantWithTool,
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4o-2024-08-06',
          parameters: { max_tokens: 100, temperature: 1 }
        }
      }
    });
    // Link root -> node
    const root = await mockStore.loadRootInfo(rootId);
    if (!root) throw new Error('root not found');
    root.child_ids.push(nodeId);
    await mockStore.saveRootInfo(root);

    // Now attempt to append an assistant message that is semantically same tool call
    // but with different key order in arguments JSON
    const incomingMessages: Message[] = [
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'sum', arguments: JSON.stringify({ b: 2, a: 1 }) }
          }
        ]
      }
    ];

    const final = await forest.append(rootId, incomingMessages, {
      source_info: {
        type: 'model',
        provider: 'openai',
        model_name: 'gpt-4o-2024-08-06',
        parameters: { max_tokens: 100, temperature: 1 }
      }
    });

    // Should have reused existing node instead of creating a new one
    assert.equal(final.id, nodeId);
  });

  it('retains assistant messages that are tool-use only', async () => {
    const { mockStore } = createMockStore();
    const forest = new Forest(mockStore);

    const rootId = mockRootId('root-4');
    await mockStore.saveRootInfo({
      id: rootId,
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Sys' },
      child_ids: []
    });

    const final = await forest.append(
      rootId,
      [
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call-xyz',
              type: 'function',
              function: { name: 'noop', arguments: '{}' }
            }
          ]
        }
      ],
      {
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4o-2024-08-06',
          parameters: { max_tokens: 10, temperature: 1 }
        }
      }
    );

    // Should have created a non-root node whose parent is the root
    if (!final.parent_id) throw new Error('expected non-root node');
    // parent should be the root id
    // Compare via string as these are branded string types
    if (
      (final.parent_id as unknown as string) !== (rootId as unknown as string)
    ) {
      throw new Error(
        `expected parent_id ${String(rootId)}, got ${String(final.parent_id)}`
      );
    }
  });

  it('skips empty-normalized messages and matches subsequent child', async () => {
    const { mockStore } = createMockStore();
    const forest = new Forest(mockStore);

    const rootId = mockRootId('root-2');
    await mockStore.saveRootInfo({
      id: rootId,
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Sys' },
      child_ids: []
    });

    const aId = mockNodeId('node-a');
    await mockStore.saveNode({
      id: aId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: { role: 'assistant', content: 'Hello' },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt',
          parameters: { max_tokens: 10, temperature: 1 }
        }
      }
    });
    const root2 = await mockStore.loadRootInfo(rootId);
    if (!root2) throw new Error('root not found');
    root2.child_ids.push(aId);
    await mockStore.saveRootInfo(root2);

    // Append with an empty-normalized assistant message first, then 'Hello'
    const final = await forest.append(
      rootId,
      [
        { role: 'assistant', content: '   ' },
        { role: 'assistant', content: 'Hello' }
      ],
      {
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt',
          parameters: { max_tokens: 10, temperature: 1 }
        }
      }
    );

    // Empty-normalized message should be skipped; should match existing 'Hello' node
    assert.equal(final.id, aId);
  });

  it('does not coalesce adjacent text messages at Forest layer', async () => {
    const { mockStore } = createMockStore();
    const forest = new Forest(mockStore);

    const rootId = mockRootId('root-3');
    await mockStore.saveRootInfo({
      id: rootId,
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Sys' },
      child_ids: []
    });

    // Create two assistant nodes: 'A' then 'B'
    const aId = mockNodeId('node-a');
    const bId = mockNodeId('node-b');
    await mockStore.saveNode({
      id: aId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [bId],
      message: { role: 'assistant', content: 'A' },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt',
          parameters: { max_tokens: 10, temperature: 1 }
        }
      }
    });
    await mockStore.saveNode({
      id: bId,
      root_id: rootId,
      parent_id: aId,
      child_ids: [],
      message: { role: 'assistant', content: 'B' },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt',
          parameters: { max_tokens: 10, temperature: 1 }
        }
      }
    });
    const root3 = await mockStore.loadRootInfo(rootId);
    if (!root3) throw new Error('root not found');
    root3.child_ids.push(aId);
    await mockStore.saveRootInfo(root3);

    // Now try to append a single assistant message 'A B' — should not match the existing two-node sequence
    const final = await forest.append(
      rootId,
      [{ role: 'assistant', content: 'A B' }],
      {
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt',
          parameters: { max_tokens: 10, temperature: 1 }
        }
      }
    );

    assert.notEqual(final.id, bId, 'did not match existing second node');
    assert.notEqual(final.id, aId, 'did not match first node');
  });
});
