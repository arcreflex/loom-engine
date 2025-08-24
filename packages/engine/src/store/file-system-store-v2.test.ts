import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm, writeFile, mkdir } from 'node:fs/promises';
import { FileSystemStore } from './file-system-store.ts';
import type { RootData, NodeData, NodeId } from '../types.ts';

describe('FileSystemStore V2 Message Format', () => {
  let store: FileSystemStore;
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    tempDir = join(
      tmpdir(),
      `loom-test-v2-${Date.now()}-${Math.random().toString(36).substring(2)}`
    );
    store = await FileSystemStore.create(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should convert legacy user message format on read', async () => {
    // Create test root
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    // Create a legacy format node file directly on disk
    const nodeId = store.generateNodeId(rootId);
    const legacyNode = {
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'user',
        content: 'Hello world' // Legacy string format
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: { type: 'user' }
      }
    };

    // Write directly to disk in legacy format
    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });
    const [, file] = nodeId.split('/');
    await writeFile(
      join(nodesDir, `${file}.json`),
      JSON.stringify(legacyNode, null, 2)
    );

    // Load through FileSystemStore's normalized method
    const loaded = await store.loadNodeNormalized(nodeId);
    assert(loaded, 'Node should be loaded');
    assert('message' in loaded, 'Should be a NodeDataV2');

    // Check that message has been normalized to V2 format
    assert.equal(loaded.message.role, 'user');
    assert(Array.isArray(loaded.message.content), 'Content should be an array');
    assert.equal(loaded.message.content.length, 1);
    assert.equal(loaded.message.content[0].type, 'text');
    assert.equal(loaded.message.content[0].text, 'Hello world');
  });

  it('should convert legacy assistant message with tool calls on read', async () => {
    // Create test root
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    // Create a legacy format node with tool calls - untyped literal
    const nodeId = store.generateNodeId(rootId);
    const legacyNode = {
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'assistant',
        content: 'Let me help you with that.',
        tool_calls: [
          {
            id: 'call_123',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: '{"location": "Paris"}'
            }
          }
        ]
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4',
          parameters: { temperature: 1, max_tokens: 100 }
        }
      }
    };

    // Write directly to disk in legacy format
    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });
    const [, file] = nodeId.split('/');
    await writeFile(
      join(nodesDir, `${file}.json`),
      JSON.stringify(legacyNode, null, 2)
    );

    // Load through FileSystemStore's normalized method
    const loaded = await store.loadNodeNormalized(nodeId);
    assert(loaded, 'Node should be loaded');
    assert('message' in loaded, 'Should be a NodeDataV2');

    // Check that message has been normalized to V2 format
    assert.equal(loaded.message.role, 'assistant');
    assert(Array.isArray(loaded.message.content), 'Content should be an array');
    assert.equal(
      loaded.message.content.length,
      2,
      'Should have text and tool-use blocks'
    );

    // Check text block
    assert.equal(loaded.message.content[0].type, 'text');
    assert.equal(
      (loaded.message.content[0] as any).text,
      'Let me help you with that.'
    );

    // Check tool-use block
    assert.equal(loaded.message.content[1].type, 'tool-use');
    assert.equal((loaded.message.content[1] as any).id, 'call_123');
    assert.equal((loaded.message.content[1] as any).name, 'get_weather');
    assert.deepEqual((loaded.message.content[1] as any).parameters, {
      location: 'Paris'
    });
  });

  it('should convert legacy tool message format on read', async () => {
    // Create test root
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    // Create a legacy format tool message - untyped literal
    const nodeId = store.generateNodeId(rootId);
    const legacyNode = {
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'tool',
        content: 'The weather in Paris is sunny.',
        tool_call_id: 'call_123'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'tool_result',
          tool_name: 'get_weather'
        }
      }
    };

    // Write directly to disk in legacy format
    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });
    const [, file] = nodeId.split('/');
    await writeFile(
      join(nodesDir, `${file}.json`),
      JSON.stringify(legacyNode, null, 2)
    );

    // Load through FileSystemStore's normalized method
    const loaded = await store.loadNodeNormalized(nodeId);
    assert(loaded, 'Node should be loaded');
    assert('message' in loaded, 'Should be a NodeDataV2');

    // Check that message has been normalized to V2 format
    assert.equal(loaded.message.role, 'tool');
    assert.equal((loaded.message as any).tool_call_id, 'call_123');
    assert(Array.isArray(loaded.message.content), 'Content should be an array');
    assert.equal(loaded.message.content.length, 1);
    assert.equal(loaded.message.content[0].type, 'text');
    assert.equal(
      loaded.message.content[0].text,
      'The weather in Paris is sunny.'
    );
  });

  it('should handle V2 format messages without conversion', async () => {
    // Create test root
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    // Create a V2 format node file directly on disk
    const nodeId = store.generateNodeId(rootId);
    const v2Node = {
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Here is the weather:' },
          {
            type: 'tool-use',
            id: 'call_456',
            name: 'check_weather',
            parameters: { city: 'London' }
          }
        ]
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'model',
          provider: 'anthropic',
          model_name: 'claude-3',
          parameters: { temperature: 0.7, max_tokens: 200 }
        }
      }
    };

    // Write directly to disk in V2 format
    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });
    const [, file] = nodeId.split('/');
    await writeFile(
      join(nodesDir, `${file}.json`),
      JSON.stringify(v2Node, null, 2)
    );

    // Load through FileSystemStore's normalized method
    const loaded = await store.loadNodeNormalized(nodeId);
    assert(loaded, 'Node should be loaded');
    assert('message' in loaded, 'Should be a NodeDataV2');

    // Check that V2 format is preserved
    assert.equal(loaded.message.role, 'assistant');
    assert(Array.isArray(loaded.message.content), 'Content should be an array');
    assert.equal(loaded.message.content.length, 2);

    // Check text block
    assert.equal(loaded.message.content[0].type, 'text');
    assert.equal(
      (loaded.message.content[0] as any).text,
      'Here is the weather:'
    );

    // Check tool-use block
    assert.equal(loaded.message.content[1].type, 'tool-use');
    assert.equal((loaded.message.content[1] as any).id, 'call_456');
    assert.equal((loaded.message.content[1] as any).name, 'check_weather');
    assert.deepEqual((loaded.message.content[1] as any).parameters, {
      city: 'London'
    });
  });

  it('should normalize messages in findNodesNormalized', async () => {
    // Create test root
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    // Create multiple legacy format nodes
    const nodeId1 = store.generateNodeId(rootId);
    const nodeId2 = store.generateNodeId(rootId);

    const legacyNode1 = {
      id: nodeId1,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [nodeId2],
      message: {
        role: 'user',
        content: 'First message'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: { type: 'user' }
      }
    };

    const legacyNode2 = {
      id: nodeId2,
      root_id: rootId,
      parent_id: nodeId1,
      child_ids: [],
      message: {
        role: 'assistant',
        content: 'Response',
        tool_calls: []
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4',
          parameters: { temperature: 1, max_tokens: 100 }
        }
      }
    };

    // Write nodes directly to disk
    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });

    const [, file1] = nodeId1.split('/');
    const [, file2] = nodeId2.split('/');

    await writeFile(
      join(nodesDir, `${file1}.json`),
      JSON.stringify(legacyNode1, null, 2)
    );
    await writeFile(
      join(nodesDir, `${file2}.json`),
      JSON.stringify(legacyNode2, null, 2)
    );

    // Find nodes through FileSystemStore's normalized method
    const nodes = await store.findNodesNormalized({ rootId });
    assert.equal(nodes.length, 2);

    // Check that both messages have been normalized
    for (const node of nodes) {
      assert(
        Array.isArray(node.message.content),
        `Content should be array for ${node.id}`
      );
      assert(
        node.message.content.length > 0,
        `Content should not be empty for ${node.id}`
      );
      assert.equal(node.message.content[0].type, 'text');
    }
  });

  it('should handle assistant with null content and tool_calls only', async () => {
    // Create test root
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    // Create legacy assistant message with null content but tool_calls
    const nodeId = store.generateNodeId(rootId);
    const legacyNode = {
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'assistant',
        content: null, // null content
        tool_calls: [
          {
            id: 'call_789',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query": "test"}'
            }
          }
        ]
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4',
          parameters: { temperature: 1, max_tokens: 100 }
        }
      }
    };

    // Write directly to disk
    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });
    const [, file] = nodeId.split('/');
    await writeFile(
      join(nodesDir, `${file}.json`),
      JSON.stringify(legacyNode, null, 2)
    );

    // Load and verify normalization
    const loaded = await store.loadNodeNormalized(nodeId);
    assert(loaded, 'Node should be loaded');
    assert('message' in loaded, 'Should be a NodeDataV2');

    assert.equal(loaded.message.role, 'assistant');
    assert(Array.isArray(loaded.message.content), 'Content should be an array');
    assert.equal(
      loaded.message.content.length,
      1,
      'Should have only tool-use block'
    );
    assert.equal(loaded.message.content[0].type, 'tool-use');
    assert.equal((loaded.message.content[0] as any).id, 'call_789');
    assert.equal((loaded.message.content[0] as any).name, 'search');
    assert.deepEqual((loaded.message.content[0] as any).parameters, {
      query: 'test'
    });
  });

  it('should preserve ordering of multiple tool_calls', async () => {
    // Create test root
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    // Create assistant message with multiple tool calls
    const nodeId = store.generateNodeId(rootId);
    const legacyNode = {
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'assistant',
        content: 'Let me check multiple things.',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query": "first"}'
            }
          },
          {
            id: 'call_2',
            type: 'function',
            function: {
              name: 'calculate',
              arguments: '{"expr": "1+1"}'
            }
          },
          {
            id: 'call_3',
            type: 'function',
            function: {
              name: 'fetch',
              arguments: '{"url": "http://example.com"}'
            }
          }
        ]
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4',
          parameters: { temperature: 1, max_tokens: 100 }
        }
      }
    };

    // Write directly to disk
    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });
    const [, file] = nodeId.split('/');
    await writeFile(
      join(nodesDir, `${file}.json`),
      JSON.stringify(legacyNode, null, 2)
    );

    // Load and verify ordering
    const loaded = await store.loadNodeNormalized(nodeId);
    assert(loaded, 'Node should be loaded');
    assert('message' in loaded, 'Should be a NodeDataV2');

    assert.equal(loaded.message.role, 'assistant');
    assert(Array.isArray(loaded.message.content), 'Content should be an array');
    assert.equal(
      loaded.message.content.length,
      4,
      'Should have text + 3 tool-use blocks'
    );

    // Check text block first
    assert.equal(loaded.message.content[0].type, 'text');
    assert.equal(
      (loaded.message.content[0] as any).text,
      'Let me check multiple things.'
    );

    // Check tool calls in order
    assert.equal(loaded.message.content[1].type, 'tool-use');
    assert.equal((loaded.message.content[1] as any).id, 'call_1');
    assert.equal((loaded.message.content[1] as any).name, 'search');

    assert.equal(loaded.message.content[2].type, 'tool-use');
    assert.equal((loaded.message.content[2] as any).id, 'call_2');
    assert.equal((loaded.message.content[2] as any).name, 'calculate');

    assert.equal(loaded.message.content[3].type, 'tool-use');
    assert.equal((loaded.message.content[3] as any).id, 'call_3');
    assert.equal((loaded.message.content[3] as any).name, 'fetch');
  });

  it('should fail loudly on invalid tool_calls JSON arguments', async () => {
    // Create test root
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    // Create assistant message with invalid JSON in tool arguments
    const nodeId = store.generateNodeId(rootId);
    const legacyNode = {
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'assistant',
        content: 'Let me check.',
        tool_calls: [
          {
            id: 'call_bad',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{invalid json}' // Invalid JSON
            }
          }
        ]
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4',
          parameters: { temperature: 1, max_tokens: 100 }
        }
      }
    };

    // Write directly to disk
    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });
    const [, file] = nodeId.split('/');
    await writeFile(
      join(nodesDir, `${file}.json`),
      JSON.stringify(legacyNode, null, 2)
    );

    // Should throw ToolArgumentParseError
    await assert.rejects(
      async () => await store.loadNodeNormalized(nodeId),
      (error: any) => {
        assert(error.message.includes('Failed to normalize message'));
        // Check that error has cause
        assert(error.cause, 'Error should have a cause property');
        // Check for the actual error message format from ToolArgumentParseError
        const cause = error.cause as Error;
        assert(
          cause.message?.includes('Failed to parse tool arguments') ||
            cause.name === 'ToolArgumentParseError',
          'Cause should be ToolArgumentParseError'
        );
        return true;
      }
    );
  });

  it('should fail on assistant with null content and empty tool_calls', async () => {
    // Create test root
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    // Create legacy assistant message with null content and empty tool_calls
    const nodeId = store.generateNodeId(rootId);
    const legacyNode = {
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [] // Empty array - invalid
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4',
          parameters: { temperature: 1, max_tokens: 100 }
        }
      }
    };

    // Write directly to disk
    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });
    const [, file] = nodeId.split('/');
    await writeFile(
      join(nodesDir, `${file}.json`),
      JSON.stringify(legacyNode, null, 2)
    );

    // Should fail when normalizing empty message
    await assert.rejects(
      async () => await store.loadNodeNormalized(nodeId),
      (error: Error) => {
        assert(error.message.includes('Failed to normalize message'));
        assert(error.cause, 'Should have error cause');
        return true;
      }
    );
  });

  it('should handle assistant with empty text and tool_calls only', async () => {
    // Create test root
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    // Create assistant message with empty string content
    const nodeId = store.generateNodeId(rootId);
    const legacyNode = {
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'assistant',
        content: '', // Empty string content
        tool_calls: [
          {
            id: 'call_empty',
            type: 'function',
            function: {
              name: 'action',
              arguments: '{}'
            }
          }
        ]
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4',
          parameters: { temperature: 1, max_tokens: 100 }
        }
      }
    };

    // Write directly to disk
    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });
    const [, file] = nodeId.split('/');
    await writeFile(
      join(nodesDir, `${file}.json`),
      JSON.stringify(legacyNode, null, 2)
    );

    // Load and verify only tool-use block exists
    const loaded = await store.loadNodeNormalized(nodeId);
    assert(loaded, 'Node should be loaded');
    assert('message' in loaded, 'Should be a NodeDataV2');

    assert.equal(loaded.message.role, 'assistant');
    assert(Array.isArray(loaded.message.content), 'Content should be an array');
    assert.equal(
      loaded.message.content.length,
      1,
      'Should have only tool-use block'
    );
    assert.equal(loaded.message.content[0].type, 'tool-use');
    assert.equal((loaded.message.content[0] as any).id, 'call_empty');
    assert.equal((loaded.message.content[0] as any).name, 'action');
    assert.deepEqual((loaded.message.content[0] as any).parameters, {});
  });

  it('should return null for non-existent node', async () => {
    // Create test root
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    // Try to load a non-existent node
    const missingNodeId = `${rootId}/node-999` as NodeId;
    const result = await store.loadNodeNormalized(missingNodeId);

    assert.equal(result, null, 'Should return null for non-existent node');
  });

  it('should throw when loadNodeNormalized is called with a root ID', async () => {
    // Create test root
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    // Should throw when trying to normalize a root
    await assert.rejects(
      async () => await store.loadNodeNormalized(rootId),
      (error: Error) => {
        assert(
          error.message.includes('loadNodeNormalized called with root ID')
        );
        assert(error.message.includes('Use loadNode for roots'));
        return true;
      }
    );
  });

  it('should fail loudly on JSON parse errors', async () => {
    // Create test root
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    // Create a malformed JSON file directly on disk
    const nodeId = store.generateNodeId(rootId);
    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });
    const [, file] = nodeId.split('/');

    // Write malformed JSON
    await writeFile(
      join(nodesDir, `${file}.json`),
      '{ invalid json content' // Malformed JSON
    );

    // loadNode should throw for malformed JSON (fail loudly per spec)
    await assert.rejects(
      async () => await store.loadNode(nodeId),
      (error: Error) => {
        assert(error.message.includes('Failed to load node'));
        assert(error.message.includes(nodeId));
        // Should have the JSON parse error as cause
        assert(error.cause, 'Should have a cause');
        return true;
      }
    );

    // loadNodeNormalized should also throw since loadNode throws
    await assert.rejects(
      async () => await store.loadNodeNormalized(nodeId),
      (error: Error) => {
        assert(error.message.includes('Failed to load node'));
        return true;
      }
    );
  });

  it('should fail loudly when findNodesNormalized encounters invalid tool arguments', async () => {
    // Create test root
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    // Create nodes - one valid, one with invalid tool arguments
    const nodeId1 = store.generateNodeId(rootId);
    const nodeId2 = store.generateNodeId(rootId);

    const validNode = {
      id: nodeId1,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'user',
        content: 'Valid message'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: { type: 'user' }
      }
    };

    const invalidNode = {
      id: nodeId2,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'assistant',
        content: 'Test',
        tool_calls: [
          {
            id: 'call_bad',
            type: 'function',
            function: {
              name: 'test_tool',
              arguments: 'not valid json' // Invalid JSON
            }
          }
        ]
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4',
          parameters: { temperature: 1, max_tokens: 100 }
        }
      }
    };

    // Write nodes directly to disk
    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });

    const [, file1] = nodeId1.split('/');
    const [, file2] = nodeId2.split('/');

    await writeFile(
      join(nodesDir, `${file1}.json`),
      JSON.stringify(validNode, null, 2)
    );
    await writeFile(
      join(nodesDir, `${file2}.json`),
      JSON.stringify(invalidNode, null, 2)
    );

    // findNodesNormalized should fail loudly when encountering invalid tool arguments
    await assert.rejects(
      async () => await store.findNodesNormalized({ rootId }),
      (error: any) => {
        assert(error.message.includes('Failed to normalize message'));
        assert(error.message.includes(nodeId2));
        // Check that error has cause
        assert(error.cause, 'Error should have a cause property');
        const cause = error.cause as Error;
        assert(
          cause.message?.includes('Failed to parse tool arguments') ||
            cause.name === 'ToolArgumentParseError',
          'Cause should be ToolArgumentParseError'
        );
        return true;
      }
    );
  });

  it('should fail on V2 messages with empty content arrays', async () => {
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    const nodeId = store.generateNodeId(rootId);
    // Create V2 message with empty content array - invalid
    const invalidV2Node = {
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'assistant',
        content: [] // Empty array - invalid for V2
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4',
          parameters: { temperature: 1, max_tokens: 100 }
        }
      }
    };

    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });
    const [, file] = nodeId.split('/');
    await writeFile(
      join(nodesDir, `${file}.json`),
      JSON.stringify(invalidV2Node, null, 2)
    );

    // Should fail validation when trying to normalize
    await assert.rejects(
      async () => await store.loadNodeNormalized(nodeId),
      (error: Error) => {
        assert(error.message.includes('Failed to normalize message'));
        return true;
      }
    );
  });

  it('should fail on user messages with tool-use blocks', async () => {
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    const nodeId = store.generateNodeId(rootId);
    // User message with tool-use block - invalid
    const invalidNode = {
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'tool-use', id: 'test', name: 'invalid', parameters: {} } // Invalid for user
        ]
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: { type: 'user' }
      }
    };

    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });
    const [, file] = nodeId.split('/');
    await writeFile(
      join(nodesDir, `${file}.json`),
      JSON.stringify(invalidNode, null, 2)
    );

    // Should fail validation
    await assert.rejects(
      async () => await store.loadNodeNormalized(nodeId),
      (error: Error) => {
        assert(error.message.includes('Failed to normalize message'));
        return true;
      }
    );
  });

  it('should fail on tool messages with tool-use blocks', async () => {
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    const nodeId = store.generateNodeId(rootId);
    // Tool message with tool-use block - invalid
    const invalidNode = {
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'tool',
        tool_call_id: 'call_123',
        content: [
          { type: 'text', text: 'Result' },
          { type: 'tool-use', id: 'test', name: 'invalid', parameters: {} } // Invalid for tool
        ]
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: { type: 'tool_result', tool_name: 'test' }
      }
    };

    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });
    const [, file] = nodeId.split('/');
    await writeFile(
      join(nodesDir, `${file}.json`),
      JSON.stringify(invalidNode, null, 2)
    );

    // Should fail validation
    await assert.rejects(
      async () => await store.loadNodeNormalized(nodeId),
      (error: Error) => {
        assert(error.message.includes('Failed to normalize message'));
        return true;
      }
    );
  });

  it('should fail on tool messages missing tool_call_id', async () => {
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    const nodeId = store.generateNodeId(rootId);
    // Tool message without tool_call_id - invalid
    const invalidNode = {
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'tool',
        // Missing tool_call_id
        content: [{ type: 'text', text: 'Result' }]
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: { type: 'tool_result', tool_name: 'test' }
      }
    };

    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });
    const [, file] = nodeId.split('/');
    await writeFile(
      join(nodesDir, `${file}.json`),
      JSON.stringify(invalidNode, null, 2)
    );

    // Should fail validation
    await assert.rejects(
      async () => await store.loadNodeNormalized(nodeId),
      (error: Error) => {
        assert(error.message.includes('Failed to normalize message'));
        return true;
      }
    );
  });

  it('should fail on messages with unknown block types', async () => {
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    const nodeId = store.generateNodeId(rootId);
    // Message with unknown block type
    const invalidNode = {
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'unknown-type', data: 'something' } // Unknown type
        ]
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4',
          parameters: { temperature: 1, max_tokens: 100 }
        }
      }
    };

    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });
    const [, file] = nodeId.split('/');
    await writeFile(
      join(nodesDir, `${file}.json`),
      JSON.stringify(invalidNode, null, 2)
    );

    // Should fail validation
    await assert.rejects(
      async () => await store.loadNodeNormalized(nodeId),
      (error: Error) => {
        assert(error.message.includes('Failed to normalize message'));
        return true;
      }
    );
  });

  it('should fail loudly when findNodesNormalized encounters node with invalid V2 structure', async () => {
    // Create test root
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    // Create a valid node first
    const nodeId1 = store.generateNodeId(rootId);
    const validNode = {
      id: nodeId1,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'user',
        content: 'Valid message'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: { type: 'user' }
      }
    };

    // Create a node with invalid V2 structure (tool message without tool_call_id)
    const nodeId2 = store.generateNodeId(rootId);
    const invalidNode = {
      id: nodeId2,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'tool',
        content: 'Result' // Missing tool_call_id
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: { type: 'tool_result', tool_name: 'test' }
      }
    };

    // Write nodes
    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });

    const [, file1] = nodeId1.split('/');
    await writeFile(
      join(nodesDir, `${file1}.json`),
      JSON.stringify(validNode, null, 2)
    );

    const [, file2] = nodeId2.split('/');
    await writeFile(
      join(nodesDir, `${file2}.json`),
      JSON.stringify(invalidNode, null, 2)
    );

    // findNodesNormalized should fail loudly when encountering invalid structure
    await assert.rejects(
      async () => await store.findNodesNormalized({ rootId }),
      (error: Error) => {
        assert(error.message.includes('Failed to normalize message'));
        assert(error.message.includes(nodeId2));
        // Should have cause
        assert(error.cause, 'Should have a cause');
        return true;
      }
    );
  });

  it('should maintain legacy methods unchanged', async () => {
    // Create test root and node
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test' }
    };
    await store.saveRootInfo(rootData);

    const nodeId = store.generateNodeId(rootId);
    const legacyNode = {
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'user',
        content: 'Test message'
      },
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: { type: 'user' }
      }
    };

    // Write directly to disk
    const nodesDir = join(tempDir, rootId, 'nodes');
    await mkdir(nodesDir, { recursive: true });
    const [, file] = nodeId.split('/');
    await writeFile(
      join(nodesDir, `${file}.json`),
      JSON.stringify(legacyNode, null, 2)
    );

    // Load through legacy method - should still return legacy format
    const loaded = (await store.loadNode(nodeId)) as NodeData;
    assert(loaded, 'Node should be loaded');
    assert.equal(loaded.message.role, 'user');
    assert.equal(loaded.message.content, 'Test message'); // Still legacy format

    // findNodes should also return legacy format
    const nodes = await store.findNodes({ rootId });
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].message.role, 'user');
    assert.equal(nodes[0].message.content, 'Test message'); // Still legacy format
  });
});
