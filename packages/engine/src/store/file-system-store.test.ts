import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';
import { FileSystemStore } from './file-system-store.ts';
import type { RootData, NodeData } from '../types.ts';

describe('FileSystemStore Cache', () => {
  let store: FileSystemStore;
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temporary directory for each test
    tempDir = join(
      tmpdir(),
      `loom-test-${Date.now()}-${Math.random().toString(36).substring(2)}`
    );
    store = await FileSystemStore.create(tempDir);
  });

  afterEach(async () => {
    // Clean up temporary directory
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should cache and invalidate topology data correctly', async () => {
    // Create test root data
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test system prompt' }
    };

    // Save the root
    await store.saveRootInfo(rootData);

    // Create first node
    const nodeId1 = store.generateNodeId(rootId);
    const nodeData1: NodeData = {
      id: nodeId1,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: {
        role: 'user',
        content: 'First test message'
      } as any,
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: { type: 'user' }
      }
    };

    // Save the first node
    await store.saveNode(nodeData1);

    // Update root to include child
    rootData.child_ids = [nodeId1];
    await store.saveRootInfo(rootData);

    // First call to listAllNodeStructures - should populate cache
    const structures1 = await store.listAllNodeStructures();

    // Verify we have exactly 2 structures (root + 1 node)
    assert.equal(structures1.length, 2);

    // Find and verify root structure
    const rootStructure = structures1.find(s => s.id === rootId);
    assert(rootStructure, 'Root structure should exist');
    assert.equal(rootStructure.parent_id, null);
    assert.deepEqual(rootStructure.child_ids, [nodeId1]);
    assert.equal(rootStructure.role, 'system');

    // Find and verify node structure
    const nodeStructure1 = structures1.find(s => s.id === nodeId1);
    assert(nodeStructure1, 'Node structure should exist');
    assert.equal(nodeStructure1.parent_id, rootId);
    assert.deepEqual(nodeStructure1.child_ids, []);
    assert.equal(nodeStructure1.role, 'user');

    // Create second node
    const nodeId2 = store.generateNodeId(rootId);
    const nodeData2: NodeData = {
      id: nodeId2,
      root_id: rootId,
      parent_id: nodeId1,
      child_ids: [],
      message: {
        role: 'assistant',
        content: 'Second test message'
      } as any,
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: {
          type: 'model',
          provider: 'openai',
          model_name: 'gpt-4o',
          parameters: {
            max_tokens: 1000,
            temperature: 0.7
          }
        }
      }
    };

    // Update first node to have child
    nodeData1.child_ids = [nodeId2];
    await store.saveNode(nodeData1);

    // Save the second node - this should invalidate the cache
    await store.saveNode(nodeData2);

    // Second call to listAllNodeStructures - should rebuild cache
    const structures2 = await store.listAllNodeStructures();

    // Verify we now have exactly 3 structures (root + 2 nodes)
    assert.equal(structures2.length, 3);

    // Verify the cache was invalidated and rebuilt correctly by checking new node exists
    const nodeStructure2 = structures2.find(s => s.id === nodeId2);
    assert(nodeStructure2, 'Second node structure should exist');
    assert.equal(nodeStructure2.parent_id, nodeId1);
    assert.deepEqual(nodeStructure2.child_ids, []);
    assert.equal(nodeStructure2.role, 'assistant');

    // Verify first node was updated with child relationship
    const updatedNodeStructure1 = structures2.find(s => s.id === nodeId1);
    assert(updatedNodeStructure1, 'Updated first node structure should exist');
    assert.deepEqual(updatedNodeStructure1.child_ids, [nodeId2]);

    // Third call should return cached result (no file system operations)
    const structures3 = await store.listAllNodeStructures();
    assert.deepEqual(
      structures3,
      structures2,
      'Third call should return identical cached result'
    );
  });

  it('should invalidate cache on node deletion', async () => {
    // Create test data
    const rootId = store.generateRootId();
    const rootData: RootData = {
      id: rootId,
      child_ids: [],
      createdAt: new Date().toISOString(),
      config: { systemPrompt: 'Test system prompt' }
    };

    await store.saveRootInfo(rootData);

    const nodeId = store.generateNodeId(rootId);
    const nodeData: NodeData = {
      id: nodeId,
      root_id: rootId,
      parent_id: rootId,
      child_ids: [],
      message: { role: 'user', content: 'Test message' } as any,
      metadata: {
        timestamp: new Date().toISOString(),
        original_root_id: rootId,
        source_info: { type: 'user' }
      }
    };

    await store.saveNode(nodeData);

    // Populate cache
    const structures1 = await store.listAllNodeStructures();
    assert.equal(structures1.length, 2);

    // Delete node - should invalidate cache
    await store.deleteNode(nodeId);

    // Verify cache was invalidated
    const structures2 = await store.listAllNodeStructures();
    assert.equal(structures2.length, 1); // Only root should remain

    const remainingNode = structures2.find(s => s.id === nodeId);
    assert.equal(
      remainingNode,
      undefined,
      'Deleted node should not exist in structures'
    );
  });
});
