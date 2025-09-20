import { randomUUID } from 'node:crypto';
import { OpenAIProvider } from './providers/openai.ts';
import { FileSystemStore } from './store/file-system-store.ts';
import type { ILoomStore } from './store/types.ts';
import { Forest } from './forest.ts';
import {
  type NodeId,
  type RootId,
  type ProviderName,
  type RootConfig,
  type NodeData
} from './types.ts';
import type { NonEmptyArray, TextBlock, Message } from './types.ts';
import { AnthropicProvider } from './providers/anthropic.ts';
import { GoogleProvider } from './providers/google.ts';
import { ToolRegistry } from './tools/registry.ts';
import type { ConfigStore, Bookmark } from './config.ts';
import { discoverMcpTools } from './mcp/client.ts';
import { KNOWN_MODELS } from './browser.ts';
import type { ProviderRequest } from './providers/types.ts';
import { normalizeMessage } from './content-blocks.ts';
import { getCodebaseContext } from './tools/introspect.ts';
import { extractToolUseBlocks } from './content-blocks.ts';
import {
  GenerationAbortedError,
  ToolIterationLimitExceededError,
  ToolsOnlySupportNSingletonError
} from './errors.ts';
// error classes no longer used directly here
import {
  clampMaxTokens,
  coalesceTextOnlyAdjacent,
  estimateInputTokens
} from './engine-utils.ts';

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

export type GenerateEvent =
  | { type: 'provider_request'; request: ProviderRequest }
  | {
      type: 'provider_response';
      message: Message;
      usage?: unknown;
      finish_reason?: string | null;
    }
  | { type: 'assistant_node'; node: NodeData }
  | { type: 'tool_result_node'; node: NodeData }
  | { type: 'done'; final: NodeData[] }
  | { type: 'error'; error: Error };

export interface GenerateSession {
  id: string;
  [Symbol.asyncIterator](): AsyncIterator<GenerateEvent>;
  abort(reason?: string): void;
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
    activeTools?: string[]
  ): Promise<GenerateResult> {
    const session = this.generateStream(
      rootId,
      providerName,
      modelName,
      contextMessages,
      options,
      activeTools
    );
    const assistantNodes: NodeData[] = [];
    let lastToolNode: NodeData | undefined;
    let finalNodes: NodeData[] | undefined;

    for await (const event of session) {
      if (event.type === 'assistant_node') {
        assistantNodes.push(event.node);
      } else if (event.type === 'tool_result_node') {
        lastToolNode = event.node;
      } else if (event.type === 'done') {
        finalNodes = event.final;
      } else if (event.type === 'error') {
        throw event.error;
      }
    }

    if (lastToolNode) {
      const resolvedFinal = finalNodes ?? assistantNodes;
      return {
        childNodes: [lastToolNode],
        next: Promise.resolve({ childNodes: resolvedFinal })
      };
    }

    const resolvedFinal = finalNodes ?? assistantNodes;
    return { childNodes: resolvedFinal };
  }

  generateStream(
    rootId: RootId,
    providerName: ProviderName,
    modelName: string,
    contextMessages: Message[],
    options: GenerateOptions,
    activeTools?: string[],
    signal?: AbortSignal
  ): GenerateSession {
    const process = this.createGenerateProcess({
      rootId,
      providerName,
      modelName,
      contextMessages,
      options,
      activeTools,
      externalSignal: signal
    });

    let consumed = false;
    return {
      id: process.id,
      abort: process.abort,
      [Symbol.asyncIterator]: () => {
        if (consumed) {
          throw new Error('GenerateSession can only be iterated once.');
        }
        consumed = true;
        return process.iterator();
      }
    };
  }

  private createGenerateProcess(args: {
    rootId: RootId;
    providerName: ProviderName;
    modelName: string;
    contextMessages: Message[];
    options: GenerateOptions;
    activeTools?: string[];
    externalSignal?: AbortSignal;
  }): {
    id: string;
    abort: (reason?: string) => void;
    iterator: () => AsyncGenerator<GenerateEvent>;
  } {
    const controller = new AbortController();
    const sessionId = randomUUID();
    let abortError: Error | undefined;

    const normalizeAbortError = (reason?: unknown) => {
      if (reason instanceof Error) {
        return reason;
      }
      if (typeof reason === 'string') {
        return new GenerationAbortedError(reason);
      }
      if (reason !== undefined) {
        return new GenerationAbortedError(String(reason));
      }
      return new GenerationAbortedError();
    };

    const assignAbortError = (reason?: unknown) => {
      abortError = normalizeAbortError(reason);
      return abortError;
    };

    if (args.externalSignal) {
      const external = args.externalSignal;
      if (external.aborted) {
        controller.abort(assignAbortError(external.reason));
      } else {
        external.addEventListener(
          'abort',
          () => {
            controller.abort(assignAbortError(external.reason));
          },
          { once: true }
        );
      }
    }

    const abort = (reason?: string) => {
      if (!controller.signal.aborted) {
        controller.abort(assignAbortError(reason));
      }
    };

    return {
      id: sessionId,
      abort,
      iterator: () =>
        this.runGenerateStream({
          ...args,
          signal: controller.signal,
          getAbortError: () => abortError
        })
    };
  }

  private async *runGenerateStream(args: {
    rootId: RootId;
    providerName: ProviderName;
    modelName: string;
    contextMessages: Message[];
    options: GenerateOptions;
    activeTools?: string[];
    signal: AbortSignal;
    getAbortError: () => Error | undefined;
  }): AsyncGenerator<GenerateEvent> {
    const {
      rootId,
      providerName,
      modelName,
      contextMessages,
      options,
      activeTools,
      signal,
      getAbortError
    } = args;

    const throwIfAborted = () => {
      if (signal.aborted) {
        throw getAbortError() ?? new GenerationAbortedError();
      }
    };

    try {
      throwIfAborted();
      const root = await this.forest.getRoot(rootId);
      if (!root) {
        throw new Error(`Root with ID ${rootId} not found`);
      }

      const provider = this.getProvider(providerName);
      const parameters = {
        max_tokens: options.max_tokens,
        temperature: options.temperature,
        model: modelName
      } satisfies ProviderRequest['parameters'];

      const initialCoalesced = coalesceTextOnlyAdjacent(
        contextMessages.map(m => normalizeMessage(m)),
        ''
      );
      const estimatedInputTokens = estimateInputTokens(
        initialCoalesced,
        root.config.systemPrompt
      );
      const modelSpec = KNOWN_MODELS[`${providerName}/${modelName}`];
      parameters.max_tokens = clampMaxTokens(
        options.max_tokens,
        modelSpec?.capabilities,
        estimatedInputTokens
      );

      if (!activeTools || activeTools.length === 0) {
        const finalNodes: NodeData[] = [];
        for (let i = 0; i < options.n; i++) {
          throwIfAborted();
          const request: ProviderRequest = {
            systemMessage: root.config.systemPrompt,
            messages: initialCoalesced,
            model: modelName,
            parameters,
            tools: undefined,
            tool_choice: undefined
          };
          yield { type: 'provider_request', request };
          const response = await provider.generate(request, signal);
          yield {
            type: 'provider_response',
            message: response.message,
            usage: response.usage,
            finish_reason: response.finish_reason ?? null
          };
          throwIfAborted();
          const responseNode = await this.forest.append(
            root.id,
            [...contextMessages, response.message],
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
          const nodeData = responseNode as NodeData;
          yield { type: 'assistant_node', node: nodeData };
          finalNodes.push(nodeData);
        }
        yield { type: 'done', final: finalNodes };
        return;
      }

      if (options.n > 1) {
        throw new ToolsOnlySupportNSingletonError();
      }

      const toolParameters = this.getToolParameters(activeTools);
      const maxToolIterations = options.maxToolIterations ?? 5;
      const messages: Message[] = [...contextMessages];
      let iterations = 0;

      while (true) {
        throwIfAborted();
        iterations += 1;
        const v2Context = coalesceTextOnlyAdjacent(
          messages.map(m => normalizeMessage(m)),
          ''
        );
        const request: ProviderRequest = {
          systemMessage: root.config.systemPrompt,
          messages: v2Context,
          model: modelName,
          parameters,
          ...toolParameters
        };
        yield { type: 'provider_request', request };
        const response = await provider.generate(request, signal);
        yield {
          type: 'provider_response',
          message: response.message,
          usage: response.usage,
          finish_reason: response.finish_reason ?? null
        };
        throwIfAborted();
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
        const assistantNodeData = assistantNode as NodeData;
        yield { type: 'assistant_node', node: assistantNodeData };
        messages.push(response.message);

        const toolUse = extractToolUseBlocks(response.message.content) ?? [];
        if (toolUse.length === 0) {
          yield { type: 'done', final: [assistantNodeData] };
          return;
        }

        const toolResults = await Promise.all(
          toolUse.map(async toolBlock => {
            try {
              const result = await this.toolRegistry.execute(
                toolBlock.name,
                toolBlock.parameters
              );
              const v2 = {
                role: 'tool' as const,
                content: [
                  { type: 'text' as const, text: result }
                ] as NonEmptyArray<TextBlock>,
                tool_call_id: toolBlock.id
              };
              return v2;
            } catch (error) {
              const v2 = {
                role: 'tool' as const,
                content: [
                  {
                    type: 'text' as const,
                    text: JSON.stringify({ error: String(error) })
                  }
                ] as NonEmptyArray<TextBlock>,
                tool_call_id: toolBlock.id
              };
              return v2;
            }
          })
        );

        for (const toolResultMessage of toolResults) {
          throwIfAborted();
          const toolNode = await this.forest.append(
            root.id,
            [...messages, toolResultMessage],
            {
              source_info: {
                type: 'tool_result',
                tool_name:
                  toolUse.find(tb => tb.id === toolResultMessage.tool_call_id)
                    ?.name ?? 'unknown'
              }
            }
          );
          if (!toolNode.parent_id) {
            throw new Error(
              'Expected result of appending >0 nodes to be a non-root node.'
            );
          }
          const toolNodeData = toolNode as NodeData;
          yield { type: 'tool_result_node', node: toolNodeData };
          messages.push(toolResultMessage);
        }

        if (iterations >= maxToolIterations) {
          throw new ToolIterationLimitExceededError(maxToolIterations);
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      yield { type: 'error', error: err };
    }
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

  listBookmarks(): Bookmark[] {
    if (!this.configStore) {
      return [];
    }
    const config = this.configStore.get();
    const bookmarks = config.bookmarks ?? [];
    return bookmarks.map(bookmark => ({ ...bookmark }));
  }

  async addBookmark(nodeId: NodeId, title: string): Promise<Bookmark> {
    if (!this.configStore) {
      throw new Error('Config store is required to manage bookmarks.');
    }
    const node = await this.forest.getNode(nodeId);
    if (!node || 'config' in node) {
      throw new Error(`Cannot bookmark missing or root node: ${nodeId}`);
    }

    const now = new Date().toISOString();
    const config = this.configStore.get();
    const bookmarks = config.bookmarks ? [...config.bookmarks] : [];
    const existingIndex = bookmarks.findIndex(b => b.nodeId === nodeId);

    if (existingIndex >= 0) {
      const existing = bookmarks[existingIndex];
      const updated: Bookmark = {
        ...existing,
        title,
        updatedAt: now
      };
      bookmarks[existingIndex] = updated;
      await this.configStore.update({ bookmarks });
      return updated;
    }

    const bookmark: Bookmark = {
      title,
      nodeId,
      rootId: node.root_id,
      createdAt: now,
      updatedAt: now
    };
    bookmarks.push(bookmark);
    await this.configStore.update({ bookmarks });
    return bookmark;
  }

  async removeBookmark(nodeId: NodeId): Promise<void> {
    if (!this.configStore) {
      throw new Error('Config store is required to manage bookmarks.');
    }
    const config = this.configStore.get();
    const bookmarks = config.bookmarks ?? [];
    const next = bookmarks.filter(b => b.nodeId !== nodeId);
    if (next.length === bookmarks.length) {
      return;
    }
    await this.configStore.update({ bookmarks: next });
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
