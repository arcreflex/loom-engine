import express from 'express';
import fs from 'fs/promises';
import {
  LoomEngine,
  type NodeId,
  type GenerateOptions,
  ConfigStore,
  resolveDataDir,
  NodeData,
  KNOWN_MODELS,
  RootId,
  type ProviderName,
  GenerateResult
} from '@ankhdt/loom-engine';
import { DisplayMessage, GenerationRequestUpdate } from './types';

class GenerationRequest {
  private manager: GenerationRequestManager;
  private requests: Set<{
    id: string;
    options: Partial<GenerateOptions>;
    promise: Promise<GenerateResult>;
    startedAt: Date;
  }> = new Set();

  readonly parentNodeId: NodeId;
  callbacks: Set<(state: GenerationRequestUpdate) => void> = new Set();

  constructor(manager: GenerationRequestManager, parentNodeId: NodeId) {
    this.manager = manager;
    this.parentNodeId = parentNodeId;
  }

  getStatus() {
    return this.requests.size > 0 ? 'pending' : 'idle';
  }

  addRequest(
    options: Partial<GenerateOptions>,
    promise: Promise<GenerateResult>
  ): string {
    const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    const request = {
      id: requestId,
      options,
      promise,
      startedAt: new Date()
    };

    this.requests.add(request);

    // Handle promise resolution
    promise
      .then(({ childNodes, next }) => {
        this.requests.delete(request);
        if (next) {
          for (const child of childNodes) {
            this.manager.getOrCreate(child.id).addRequest(options, next);
          }
        }
        this.update({
          status: this.getStatus(),
          added: childNodes
        });
      })
      .catch(error => {
        this.requests.delete(request);
        this.update({
          status: this.getStatus(),
          error: error instanceof Error ? error.message : String(error)
        });
      });

    return requestId;
  }

  update(state: GenerationRequestUpdate) {
    this.callbacks.forEach(callback => callback(state));
  }
}

class GenerationRequestManager {
  private requests: Map<NodeId, GenerationRequest> = new Map();

  get(nodeId: NodeId): GenerationRequest | undefined {
    return this.requests.get(nodeId);
  }

  getOrCreate(nodeId: NodeId): GenerationRequest {
    let request = this.requests.get(nodeId);
    if (!request) {
      request = new GenerationRequest(this, nodeId);
      this.requests.set(nodeId, request);
    }
    return request;
  }

  remove(nodeId: NodeId): void {
    this.requests.delete(nodeId);
  }
}

async function main() {
  const app = express();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  const dataDir = resolveDataDir(process.env.DATA_DIR || '~/.loom');

  app.use(express.json({ limit: '4mb' }));

  // Ensure data directory exists
  await fs.mkdir(dataDir, { recursive: true });

  // Create engine and config store
  const configStore = await ConfigStore.create(dataDir);
  const engine = await LoomEngine.create(dataDir, configStore);

  const generationRequests = new GenerationRequestManager();

  const log = (message: string) => {
    engine.log(`[server] ${message}`);
  };

  log(`Initialized LoomEngine with data directory: ${dataDir}`);
  app.use((req, _res, next) => {
    log(`${req.method} ${req.url}`);
    next();
  });

  // API routes

  // State
  app.get('/api/state', (_req, res) => {
    const config = configStore.get();
    res.json({ currentNodeId: config.currentNodeId || null });
  });

  app.put('/api/state', async (req, res) => {
    try {
      const { currentNodeId } = req.body;

      if (!currentNodeId) {
        return res.status(400).json({ error: 'currentNodeId is required' });
      }

      await configStore.update({ currentNodeId });
      res.json({ currentNodeId });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // SSE endpoint for updates on a pending generation for a specific node
  app.get('/api/nodes/:nodeId/generation', (req, res) => {
    const { nodeId } = req.params;
    const generationReq = generationRequests.get(nodeId as NodeId);
    if (!generationReq) {
      return res
        .status(404)
        .json({ error: 'No pending generation for this node' });
    }
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    const sendUpdate = (state: GenerationRequestUpdate) => {
      res.write(`data: ${JSON.stringify(state)}\n\n`);
    };
    // Send initial state
    sendUpdate({ status: generationReq.getStatus() });
    // Subscribe to updates
    generationReq.callbacks.add(sendUpdate);
    req.on('close', () => {
      generationReq.callbacks.delete(sendUpdate);
      res.end();
    });
  });

  // Nodes
  app.get('/api/nodes/:nodeId', async (req, res) => {
    try {
      const { nodeId } = req.params;
      const node = await engine.getForest().getNode(nodeId as NodeId);

      if (!node) {
        return res.status(404).json({ error: 'Node not found' });
      }

      // Check if there's a pending generation for this node
      const generationReq = generationRequests.get(nodeId as NodeId);
      const pendingGeneration = generationReq
        ? {
            status: generationReq.getStatus()
          }
        : undefined;

      res.json({
        ...node,
        pendingGeneration
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/nodes/:nodeId/path', async (req, res) => {
    try {
      const { nodeId } = req.params;
      // Get the full path with node data
      const { root, path } = await engine.getForest().getPath({
        from: undefined,
        to: nodeId as NodeId
      });

      // Create DisplayMessages that include nodeIds, timestamps, and source info
      const messagesWithIds = path.map(node => {
        let sourceProvider: ProviderName | undefined;
        let sourceModelName: string | undefined;
        if (
          node.message.role === 'assistant' &&
          node.metadata.source_info.type === 'model'
        ) {
          sourceProvider = node.metadata.source_info.provider;
          sourceModelName = node.metadata.source_info.model_name;
        }
        return {
          ...node.message,
          nodeId: node.id,
          timestamp: node.metadata.timestamp,
          sourceProvider,
          sourceModelName
        } satisfies DisplayMessage;
      });

      res.json({
        root: root.config,
        messages: messagesWithIds
      });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/nodes/:nodeId/children', async (req, res) => {
    try {
      const { nodeId } = req.params;
      const children = await engine.getForest().getChildren(nodeId as NodeId);
      res.json(children);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.get('/api/nodes/:nodeId/siblings', async (req, res) => {
    try {
      const { nodeId } = req.params;
      const node = await engine.getForest().getNode(nodeId as NodeId);

      if (!node || !node.parent_id) {
        return res.status(404).json({ error: 'Node or parent not found' });
      }

      const siblings = await engine.getForest().getChildren(node.parent_id);
      res.json(siblings);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/nodes/:parentId/append', async (req, res) => {
    try {
      const { parentId } = req.params;
      const { role, content } = req.body;

      if (!role || !content) {
        return res.status(400).json({ error: 'Role and content are required' });
      }

      const newNode = await engine
        .getForest()
        .append(parentId as NodeId, [{ role, content }], {
          source_info: { type: 'user' }
        });

      // Update current node ID in config
      await configStore.update({ currentNodeId: newNode.id });

      res.json(newNode);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/nodes/:nodeId/generate', async (req, res) => {
    try {
      const { nodeId } = req.params;
      const { providerName, modelName, activeTools, ...options } = req.body as {
        providerName: ProviderName;
        modelName: string;
        activeTools?: string[];
      } & Partial<GenerateOptions>;
      const defaults = configStore.get().defaults;

      if (!providerName || !modelName) {
        return res
          .status(400)
          .json({ error: 'providerName and modelName are required' });
      }

      // Get the root_id for the current node to fetch its systemPrompt
      const node = await engine.getForest().getNode(nodeId as NodeId);
      if (!node) return res.status(404).json({ error: 'Node not found' });
      const rootId = node.parent_id === undefined ? node.id : node.root_id;

      // Get message history up to this node
      const { messages } = await engine.getMessages(nodeId as NodeId);

      // Create or get existing generation request for this node
      const generationReq = generationRequests.getOrCreate(nodeId as NodeId);

      // Start generation and add it to the request
      const generationPromise = engine.generate(
        rootId,
        providerName,
        modelName,
        messages,
        {
          max_tokens: defaults.maxTokens,
          temperature: defaults.temperature,
          n: defaults.n,
          ...options
        },
        activeTools
      );

      generationReq.addRequest(options, generationPromise);

      // Return success immediately - client will subscribe to SSE for updates
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.put('/api/nodes/:nodeId/content', async (req, res) => {
    try {
      const { nodeId } = req.params;
      const { content } = req.body;

      if (typeof content !== 'string') {
        return res.status(400).json({ error: 'Content must be a string' });
      }

      const newNode = await engine.editNode(nodeId as NodeId, content);
      res.json(newNode);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.delete('/api/nodes/:nodeId', async (req, res) => {
    try {
      const { nodeId } = req.params;
      const children = await engine.getForest().getChildren(nodeId as NodeId);
      const deletableChildren = await filterOutBookmarkedDescendants(
        engine,
        configStore,
        children
      );
      if (deletableChildren.length < children.length) {
        return res.status(400).json({
          error: 'Cannot delete node with bookmarked children'
        });
      }
      await engine.getForest().deleteNode(nodeId as NodeId, false);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.delete('/api/nodes/:nodeId/siblings', async (req, res) => {
    try {
      const { nodeId } = req.params;
      const siblings = await engine.getForest().getSiblings(nodeId as NodeId);
      const toDelete = await filterOutBookmarkedDescendants(
        engine,
        configStore,
        siblings
      );
      await engine.getForest().deleteNodes(toDelete.map(node => node.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.delete('/api/nodes/:nodeId/children', async (req, res) => {
    try {
      const { nodeId } = req.params;
      const children = await engine.getForest().getChildren(nodeId as NodeId);
      const toDelete = await filterOutBookmarkedDescendants(
        engine,
        configStore,
        children
      );
      log(
        'Deleting children: ' + JSON.stringify(toDelete.map(node => node.id))
      );
      await engine.getForest().deleteNodes(toDelete.map(node => node.id));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Roots
  app.get('/api/roots', async (_req, res) => {
    try {
      const roots = await engine.getForest().listRoots();
      res.json(roots);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.post('/api/roots', async (req, res) => {
    try {
      const { systemPrompt } = req.body;

      const root = await engine.getForest().getOrCreateRoot(systemPrompt);
      await configStore.update({ currentNodeId: root.id });
      res.json(root);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Bookmarks
  app.get('/api/bookmarks', (_req, res) => {
    const config = configStore.get();
    res.json(config.bookmarks || []);
  });

  app.post('/api/bookmarks', async (req, res) => {
    try {
      const { title, nodeId, rootId } = req.body;

      if (!title || !nodeId || !rootId) {
        return res
          .status(400)
          .json({ error: 'Title, nodeId and rootId are required' });
      }

      const config = configStore.get();
      const now = new Date().toISOString();
      const bookmarks = config.bookmarks || [];

      // Check if bookmark with this title already exists
      const existingIndex = bookmarks.findIndex(b => b.title === title);

      const bookmark = {
        title,
        nodeId: nodeId as NodeId,
        rootId: rootId as RootId,
        createdAt: now,
        updatedAt: now
      };

      if (existingIndex >= 0) {
        // Update existing bookmark
        bookmarks[existingIndex] = {
          ...bookmark,
          createdAt: bookmarks[existingIndex].createdAt
        };
      } else {
        // Add new bookmark
        bookmarks.push(bookmark);
      }

      await configStore.update({ bookmarks });
      res.json(bookmark);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  app.delete('/api/bookmarks/:title', async (req, res) => {
    try {
      const { title } = req.params;
      const config = configStore.get();

      if (!config.bookmarks) {
        return res.json({ success: true });
      }

      const bookmarks = config.bookmarks.filter(b => b.title !== title);

      await configStore.update({ bookmarks });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Config defaults
  app.get('/api/config/defaults', (_req, res) => {
    const config = configStore.get();
    res.json(config.defaults);
  });

  // Models endpoint
  app.get('/api/models', (_req, res) => {
    try {
      // Return only the keys (model strings)
      const modelStrings = Object.keys(KNOWN_MODELS);
      res.json(modelStrings);
    } catch (_error) {
      res.status(500).json({ error: 'Failed to retrieve known models' });
    }
  });

  // Tools endpoint
  app.get('/api/tools', (_req, res) => {
    try {
      const tools = engine.toolRegistry.list(); // Returns definitions without handlers
      res.json(tools);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Graph topology endpoint
  app.get('/api/graph/topology', async (_req, res) => {
    try {
      const topology = await engine.getForest().getAllNodeStructures();
      res.json(topology);
    } catch (error) {
      res.status(500).json({ error: String(error) });
    }
  });

  // Presets endpoint
  app.get('/api/config/presets', (_req, res) => {
    try {
      const config = configStore.get();
      res.json({
        presets: config.presets || {}, // Return empty object if undefined
        activePresetName: config.activePresetName || null // Return null if undefined
      });
    } catch (_err) {
      res
        .status(500)
        .json({ error: 'Failed to retrieve preset configuration' });
    }
  });

  // Active preset update endpoint
  app.put('/api/config/active-preset', async (req, res) => {
    try {
      const { presetName } = req.body; // presetName can be string or null

      if (presetName !== null && typeof presetName !== 'string') {
        return res
          .status(400)
          .json({ error: 'presetName must be a string or null' });
      }

      // Ensure the preset exists if setting it (unless setting to null)
      const config = configStore.get();
      if (presetName !== null && !(presetName in (config.presets || {}))) {
        return res
          .status(400)
          .json({ error: `Preset named "${presetName}" not found in config.` });
      }

      await configStore.update({ activePresetName: presetName || undefined }); // Store undefined if null
      res.json({ activePresetName: presetName || null });
    } catch (_err) {
      res.status(500).json({ error: 'Failed to update active preset' });
    }
  });

  // Start server
  app.listen(port, () => {
    log(`Server running at http://localhost:${port}`);
  });
}

main().catch(err => {
  console.error('Server initialization failed:', err);
  process.exit(1);
});

async function filterOutBookmarkedDescendants(
  engine: LoomEngine,
  config: ConfigStore,
  input: NodeData[]
) {
  const out = [];
  for (const node of input) {
    const bookmarkedNodes = new Set(config.get().bookmarks?.map(b => b.nodeId));
    if (bookmarkedNodes.has(node.id)) {
      continue;
    }

    const bookmarkedDescendants = await engine
      .getForest()
      .findAllDescendants(node);
    let hasBookmark = false;
    for (const descendant of bookmarkedDescendants) {
      if (bookmarkedNodes.has(descendant)) {
        hasBookmark = true;
        break;
      }
    }
    if (hasBookmark) {
      continue;
    }

    out.push(node);
  }

  return out;
}
