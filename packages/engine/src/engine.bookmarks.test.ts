import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { LoomEngine } from './engine.ts';
import { createMockStore } from './test-helpers.ts';
import type { Config } from './config.ts';
import type { ConfigStore } from './config.ts';

function createStubConfigStore(initial?: Partial<Config>): ConfigStore {
  const config: Config = {
    defaults: {
      temperature: 0,
      maxTokens: 0,
      n: 1,
      systemPrompt: ''
    },
    bookmarks: [],
    ...initial
  } as Config;

  return {
    get: () => config,
    update: async (updates: Partial<Config>) => {
      if (updates.bookmarks !== undefined) {
        config.bookmarks = updates.bookmarks;
      }
      return true;
    },
    getDataDir: () => '/tmp',
    log: () => undefined
  } as unknown as ConfigStore;
}

describe('LoomEngine bookmarks helpers', () => {
  let engine: LoomEngine;
  let storeWrapper: ReturnType<typeof createMockStore>;

  beforeEach(async () => {
    storeWrapper = createMockStore();
  });

  it('returns an empty list when config store is absent', async () => {
    engine = await LoomEngine.create(storeWrapper.mockStore);
    assert.deepStrictEqual(engine.listBookmarks(), []);
    const root = storeWrapper.createTestRoot('root-no-config');
    const node = storeWrapper.createTestNode('node-no-config', root.id, null, {
      role: 'user',
      content: 'hello'
    });
    await assert.rejects(() => engine.addBookmark(node.id, 'Title'));
  });

  it('adds, lists, updates, and removes bookmarks', async () => {
    const configStore = createStubConfigStore();
    engine = await LoomEngine.create(storeWrapper.mockStore, configStore);

    const root = storeWrapper.createTestRoot('root-bookmarks');
    const node = storeWrapper.createTestNode('node-bookmark', root.id, null, {
      role: 'user',
      content: 'hello'
    });

    const bookmark = await engine.addBookmark(node.id, 'First');
    assert.strictEqual(bookmark.title, 'First');
    assert.strictEqual(bookmark.nodeId, node.id);
    assert.strictEqual(engine.listBookmarks().length, 1);

    // Ensure wall-clock time advances so updatedAt differs even on fast machines
    await new Promise(resolve => setTimeout(resolve, 5));

    const updated = await engine.addBookmark(node.id, 'Renamed');
    assert.strictEqual(updated.title, 'Renamed');
    assert.strictEqual(updated.createdAt, bookmark.createdAt);
    assert.notStrictEqual(updated.updatedAt, bookmark.updatedAt);

    await engine.removeBookmark(node.id);
    assert.deepStrictEqual(engine.listBookmarks(), []);
  });

  it('persists bookmarks through config updates', async () => {
    const configStore = createStubConfigStore();
    engine = await LoomEngine.create(storeWrapper.mockStore, configStore);

    const root = storeWrapper.createTestRoot('root-persist');
    const node = storeWrapper.createTestNode('node-persist', root.id, null, {
      role: 'user',
      content: 'remember me'
    });

    await engine.addBookmark(node.id, 'Persisted');
    const config = configStore.get();
    assert(config.bookmarks && config.bookmarks.length === 1);
    config.bookmarks![0]!.title = 'Mutated';

    // listBookmarks should return a copy, not the original reference
    const listed = engine.listBookmarks();
    listed[0]!.title = 'Changed externally';
    assert.notStrictEqual(
      listed[0]!.title,
      config.bookmarks![0]!.title,
      'listBookmarks returns clones'
    );
  });
});
