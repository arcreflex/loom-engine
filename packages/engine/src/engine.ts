import { OpenAIProvider } from './providers/openai.ts';
import { FileSystemStore } from './store/file-system-store.ts';
import type { ILoomStore } from './store/types.ts';
import { Forest } from './forest.ts';
import {
  type NodeId,
  type RootId,
  type ProviderName,
  type RootConfig,
  type NodeData,
  type RootData
} from './types.ts';
import type {
  NonEmptyArray,
  TextBlock,
  Message,
  ToolUseBlock
} from './types.ts';
import { AnthropicProvider } from './providers/anthropic.ts';
import { GoogleProvider } from './providers/google.ts';
import { ToolRegistry } from './tools/registry.ts';
import type { ConfigStore, Bookmark } from './config.ts';
import { discoverMcpTools } from './mcp/client.ts';
import { KNOWN_MODELS } from './browser.ts';
import type { IProvider, ProviderRequest } from './providers/types.ts';
import { normalizeMessage } from './content-blocks.ts';
import { getCodebaseContext } from './tools/introspect.ts';
import { extractToolUseBlocks } from './providers/provider-utils.ts';
import {
  MaxToolIterationsExceededError,
  ToolsOnlySupportNSingletonError,
  throwIfAborted,
  toError
} from './errors.ts';
// error classes no longer used directly here
import {
  clampMaxTokens,
  coalesceTextOnlyAdjacent,
  estimateInputTokens
} from './engine-utils.ts';

const DEFAULT_MAX_TOOL_ITERATIONS = 8;

type GenerateStreamEvent =
  | { type: 'assistant_node'; nodes: NodeData[]; hasMore: boolean }
  | { type: 'tool_result_node'; nodes: NodeData[]; hasMore: boolean };

export interface GenerateOptions {
  n: number;
  max_tokens: number;
  temperature: number;
  maxToolIterations?: number;
}

export interface GenerateResult {
  childNodes: NodeData[];
  next?: Promise<GenerateResult>;
}

export class LoomEngine {
  private forest: Forest;
  private store: ILoomStore;
  private configStore?: ConfigStore;
  public readonly toolRegistry: ToolRegistry;

  private constructor(store: ILoomStore, configStore?: ConfigStore) {
    this.store = store;
    this.forest = new Forest(this.store, configStore);
    this.toolRegistry = new ToolRegistry();
    this.configStore = configStore;
  }

  static async create(
    storeOrPath: ILoomStore | string,
    configStore?: ConfigStore
  ) {
    let store;
    if (typeof storeOrPath === 'string') {
      store = await FileSystemStore.create(storeOrPath);
    } else {
      store = storeOrPath;
    }
    const engine = new LoomEngine(store, configStore);
    await engine.initializeTools();
    return engine;
  }

  getConfigStore() {
    return this.configStore;
  }

  getForest(): Forest {
    return this.forest;
  }

  async generate(
    rootId: RootId,
    providerName: ProviderName,
    modelName: string,
    contextMessages: Message[],
    options: GenerateOptions,
    activeTools?: string[],
    signal?: AbortSignal
  ): Promise<GenerateResult> {
    const root = await this.forest.getRoot(rootId);
    if (!root) {
      throw new Error(`Root with ID ${rootId} not found`);
    }

    const provider = this.getProvider(providerName);
    const parameters = {
      max_tokens: options.max_tokens,
      temperature: options.temperature,
      model: modelName
    };

    // Build V2 context and coalesce per spec
    const normalizedContext = contextMessages.map(message =>
      normalizeMessage(message)
    );
    const v2Coalesced = coalesceTextOnlyAdjacent(normalizedContext, '');
    const estimatedInputTokens = estimateInputTokens(
      v2Coalesced,
      root.config.systemPrompt
    );
    const modelSpec = KNOWN_MODELS[`${providerName}/${modelName}`];
    parameters.max_tokens = clampMaxTokens(
      options.max_tokens,
      modelSpec?.capabilities,
      estimatedInputTokens
    );

    if (activeTools && activeTools.length > 0) {
      if (options.n > 1) {
        throw new ToolsOnlySupportNSingletonError(options.n);
      }

      const toolParameters = this.getToolParameters(activeTools);
      const maxToolIterations =
        options.maxToolIterations ?? DEFAULT_MAX_TOOL_ITERATIONS;

      const stream = this.toolGenerateStream({
        root,
        provider,
        providerName,
        modelName,
        messages: [...normalizedContext],
        parameters,
        toolParameters,
        maxToolIterations,
        signal
      });

      return this.consumeGenerateStream(stream);
    }

    throwIfAborted(signal);

    const childNodes = await Promise.all(
      Array.from({ length: options.n }).map(async () => {
        throwIfAborted(signal);
        const response = await provider.generate(
          {
            systemMessage: root.config.systemPrompt,
            messages: v2Coalesced,
            model: modelName,
            parameters,
            tools: undefined,
            tool_choice: undefined
          },
          signal
        );
        throwIfAborted(signal);
        const responseNode = await this.forest.append(
          root.id,
          [...normalizedContext, response.message],
          {
            source_info: {
              type: 'model',
              provider: providerName,
              model_name: modelName,
              parameters,
              tools: undefined,
              tool_choice: undefined,
              finish_reason: response.finish_reason,
              usage: response.usage
            }
          }
        );
        if (!responseNode.parent_id) {
          throw new Error(
            'Expected result of appending >0 nodes to be a non-root node.'
          );
        }

        return responseNode;
      })
    );

    return { childNodes };
  }

  getToolParameters(
    activeTools: string[]
  ): Pick<ProviderRequest, 'tools' | 'tool_choice'> {
    const toolsForProvider = this.toolRegistry
      .list()
      .filter(t => activeTools.includes(t.name))
      .map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }
      }));

    if (toolsForProvider.length > 0) {
      return {
        tools: toolsForProvider,
        tool_choice: 'auto'
      };
    }

    return {};
  }

  private async consumeGenerateStream(
    iterator: AsyncGenerator<GenerateStreamEvent>
  ): Promise<GenerateResult> {
    const { value, done } = await iterator.next();
    if (done || !value) {
      return { childNodes: [] };
    }

    const result: GenerateResult = {
      childNodes: value.nodes
    };

    if (value.hasMore) {
      result.next = this.consumeGenerateStream(iterator);
    }

    return result;
  }

  private async *toolGenerateStream({
    root,
    provider,
    providerName,
    modelName,
    messages,
    parameters,
    toolParameters,
    maxToolIterations,
    signal
  }: {
    root: RootData;
    provider: IProvider;
    providerName: ProviderName;
    modelName: string;
    messages: Message[];
    parameters: ProviderRequest['parameters'];
    toolParameters: Pick<ProviderRequest, 'tools' | 'tool_choice'>;
    maxToolIterations: number;
    signal?: AbortSignal;
  }): AsyncGenerator<GenerateStreamEvent> {
    let iterations = 0;

    while (true) {
      throwIfAborted(signal);
      const v2Context = coalesceTextOnlyAdjacent(
        messages.map(message => normalizeMessage(message)),
        ''
      );

      const response = await provider.generate(
        {
          systemMessage: root.config.systemPrompt,
          messages: v2Context,
          model: modelName,
          parameters,
          ...toolParameters
        },
        signal
      );
      throwIfAborted(signal);

      const assistantNode = await this.forest.append(
        root.id,
        [...messages, response.message],
        {
          source_info: {
            type: 'model',
            provider: providerName,
            model_name: modelName,
            parameters,
            finish_reason: response.finish_reason,
            usage: response.usage,
            ...toolParameters
          }
        }
      );
      if (!assistantNode.parent_id) {
        throw new Error(
          'Expected result of appending >0 nodes to be a non-root node.'
        );
      }

      messages.push(response.message);

      const toolUse = extractToolUseBlocks(response.message.content) ?? [];
      const hasToolUse = toolUse.length > 0;

      yield {
        type: 'assistant_node',
        nodes: [assistantNode as NodeData],
        hasMore: hasToolUse
      };

      if (!hasToolUse) {
        return;
      }

      iterations += 1;
      if (iterations > maxToolIterations) {
        throw new MaxToolIterationsExceededError(maxToolIterations);
      }

      for (const toolBlock of toolUse) {
        const toolResultMessage = await this.executeToolBlock(
          toolBlock,
          signal
        );

        const toolNode = await this.forest.append(
          root.id,
          [...messages, toolResultMessage],
          {
            source_info: {
              type: 'tool_result',
              tool_name: toolBlock.name ?? 'unknown'
            }
          }
        );
        if (!toolNode.parent_id) {
          throw new Error(
            'Expected result of appending >0 nodes to be a non-root node.'
          );
        }

        messages.push(toolResultMessage);

        yield {
          type: 'tool_result_node',
          nodes: [toolNode as NodeData],
          hasMore: true
        };
      }
    }
  }

  private async executeToolBlock(
    toolBlock: ToolUseBlock,
    signal?: AbortSignal
  ): Promise<Message> {
    throwIfAborted(signal);
    try {
      const result = await this.toolRegistry.execute(
        toolBlock.name,
        toolBlock.parameters
      );
      throwIfAborted(signal);
      const text = typeof result === 'string' ? result : String(result);
      return {
        role: 'tool',
        content: [{ type: 'text', text }] as NonEmptyArray<TextBlock>,
        tool_call_id: toolBlock.id
      } as Message;
    } catch (error) {
      throwIfAborted(signal);
      const err = toError(error);
      return {
        role: 'tool',
        content: [
          {
            type: 'text',
            text: JSON.stringify({ error: err.message })
          }
        ] as NonEmptyArray<TextBlock>,
        tool_call_id: toolBlock.id
      } as Message;
    }
  }

  async getMessages(
    nodeId: NodeId
  ): Promise<{ root: RootConfig; messages: Message[] }> {
    const { root, messages } = await this.forest.getMessages(nodeId);
    return { root: root.config, messages };
  }

  async editNode(nodeId: NodeId, newContent: string): Promise<NodeData> {
    const newNode = await this.forest.editNodeContent(nodeId, newContent);

    // If the edit resulted in a new node, move any existing bookmark.
    if (newNode.id !== nodeId && this.configStore) {
      const config = this.configStore.get();
      const bookmarks = config.bookmarks || [];
      const bookmarkIndex = bookmarks.findIndex(b => b.nodeId === nodeId);

      if (bookmarkIndex > -1) {
        const oldBookmark = bookmarks[bookmarkIndex];
        const newBookmark: Bookmark = {
          ...oldBookmark,
          nodeId: newNode.id,
          updatedAt: new Date().toISOString()
        };
        bookmarks[bookmarkIndex] = newBookmark;
        await this.configStore.update({ bookmarks });
      }
    }

    return newNode;
  }

  private getProvider(provider: ProviderName) {
    switch (provider) {
      case 'openai':
        return new OpenAIProvider(this);
      case 'anthropic':
        return new AnthropicProvider(this);
      case 'google':
        return new GoogleProvider(this);
      case 'openrouter':
        if (!process.env.OPENROUTER_API_KEY) {
          throw new Error('OpenRouter API key is required.');
        }
        return new OpenAIProvider(
          this,
          process.env.OPENROUTER_API_KEY,
          `https://openrouter.ai/api/v1`
        );
      default:
        provider satisfies never;
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  log(x: unknown) {
    this.store.log(x);
  }

  private async initializeTools(): Promise<void> {
    this.toolRegistry.register(
      'current_date',
      'Returns the current date and time.',
      { type: 'object', properties: {} },
      async () => JSON.stringify({ date: new Date().toISOString() }),
      'Built-in' // Group built-in tools together
    );

    this.toolRegistry.register(
      'introspect',
      `Introspects the loom-engine codebase that's powering this interaction.`,
      {
        type: 'object',
        properties: {
          level: {
            type: 'string',
            enum: ['overview', 'all'],
            description:
              'Level of detail: "overview" (README.md + file tree) or "all" (file tree + all file contents)'
          }
        },
        required: ['level']
      },
      async (args: { level?: string }) => {
        return await getCodebaseContext(
          (args.level as 'overview' | 'all') || 'overview'
        );
      },
      'Built-in'
    );

    // Discover and register tools from configured MCP servers
    if (this.configStore) {
      await discoverMcpTools(this.toolRegistry, this.configStore);
    }
  }
}

// legacy: helper no longer needed here (kept for clarity during migration)
