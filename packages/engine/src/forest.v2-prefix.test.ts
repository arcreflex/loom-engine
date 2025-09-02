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
});
