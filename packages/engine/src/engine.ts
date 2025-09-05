import { OpenAIProvider } from './providers/openai.ts';
import { FileSystemStore } from './store/file-system-store.ts';
import type { ILoomStore } from './store/types.ts';
import { Forest } from './forest.ts';
import {
  type NodeId,
  type RootId,
  type ProviderName,
  type RootConfig,
  type Message,
  type NodeData,
  getToolCalls,
  type RootData
} from './types.ts';
import type { NonEmptyArray, TextBlock, MessageV2 } from './types.ts';
import { AnthropicProvider } from './providers/anthropic.ts';
import { GoogleProvider } from './providers/google.ts';
import { ToolRegistry } from './tools/registry.ts';
import type { ConfigStore, Bookmark } from './config.ts';
import { discoverMcpTools } from './mcp/client.ts';
import { KNOWN_MODELS } from './browser.ts';
import type { ProviderRequest } from './providers/types.ts';
import { isMessageV2, normalizeMessage } from './content-blocks.ts';
import { getCodebaseContext } from './tools/introspect.ts';
import { v2ToLegacyMessage } from './content-blocks-convert.ts';
import {
  normalizeMessagesToV2,
  extractToolUseBlocks
} from './providers/provider-utils.ts';
import {
  clampMaxTokens,
  coalesceTextOnlyAdjacent,
  estimateInputTokens
} from './engine-utils.ts';

export interface GenerateOptions {
  n: number;
  max_tokens: number;
  temperature: number;
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
    contextMessages: MessageV2[],
    options: GenerateOptions,
    activeTools?: string[]
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

    // Build V2 context and coalesce per spec, then convert back to legacy for provider
    const v2Context = normalizeMessagesToV2(contextMessages);
    const v2Coalesced = coalesceTextOnlyAdjacent(v2Context, '');
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
      // Tool-calling logic (only supports n=1)
      if (options.n > 1) {
        throw new Error('Tool calling currently only supports n=1');
      }

      return this.toolCall(
        root,
        providerName,
        modelName,
        contextMessages,
        parameters,
        activeTools
      );
    }

    const childNodes = await Promise.all(
      Array.from({ length: options.n }).map(async () => {
        const response = await provider.generate({
          systemMessage: root.config.systemPrompt,
          messages: v2Coalesced,
          model: modelName,
          parameters,
          tools: undefined
        });
        // Convert V2 message back to legacy format for forest
        const legacyResponseMessage = v2ToLegacyMessage(response.message);
        const legacyHistory = contextMessages.map(v2ToLegacyMessage);
        const responseNode = await this.forest.append(
          root.id,
          [...legacyHistory, legacyResponseMessage],
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

  private async toolCall(
    root: RootData,
    providerName: ProviderName,
    modelName: string,
    contextMessages: Array<Message | MessageV2>,
    parameters: ProviderRequest['parameters'],
    activeTools: string[]
  ): Promise<GenerateResult> {
    // The conversation history for this turn
    const messages = [...contextMessages];

    const provider = this.getProvider(providerName);

    // Limit to 5 iterations to prevent infinite loops
    const v2Context = normalizeMessagesToV2(messages);
    const v2Coalesced = coalesceTextOnlyAdjacent(v2Context, '');
    const toolParameters = this.getToolParameters(activeTools);

    const response = await provider.generate({
      systemMessage: root.config.systemPrompt,
      messages: v2Coalesced,
      model: modelName,
      parameters,
      ...toolParameters
    });

    // Convert V2 message back to legacy format for forest
    const assistantMessage = v2ToLegacyMessage(response.message);

    // Append the assistant's response (which may or may not have tool calls)
    const assistantNode = await this.forest.append(
      root.id,
      [
        ...messages.map(m =>
          isMessageV2(m as unknown)
            ? v2ToLegacyMessage(m as MessageV2)
            : (m as Message)
        ),
        assistantMessage
      ],
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

    // Update the message history with the assistant's turn
    messages.push(assistantMessage);

    // Extract tool-use blocks from V2 response for robust correlation handling
    const toolUse = extractToolUseBlocks(response.message.content) ?? [];
    const toolCalls = getToolCalls(assistantMessage) ?? [];
    if (toolCalls.length === 0) {
      // If no tool calls, this is the final response.
      return { childNodes: [assistantNode as NodeData] };
    }

    // --- If there are tool calls, execute them ---
    const toolResults = await Promise.all(
      toolCalls.map(async toolCall => {
        // Validate correlation with V2 blocks when available
        const matchingV2 = toolUse.find(tb => tb.id === toolCall.id);
        if (!matchingV2) {
          this.log({
            level: 'warn',
            event: 'tool_correlation_mismatch',
            root_id: root.id,
            tool_call_id: toolCall.id,
            available_v2_ids: toolUse.map(t => t.id)
          });
        }
        try {
          const result = await this.toolRegistry.execute(
            toolCall.function.name,
            JSON.parse(toolCall.function.arguments)
          );
          const v2 = {
            role: 'tool' as const,
            content: [
              { type: 'text' as const, text: result }
            ] as NonEmptyArray<TextBlock>,
            tool_call_id: toolCall.id
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
            tool_call_id: toolCall.id
          };
          return v2;
        }
      })
    );

    // Append each tool result as a new node and update message history

    let lastToolNode: NodeData | undefined;
    for (const toolResultMessage of toolResults) {
      const toolCall = toolCalls.find(
        tc => tc.id === toolResultMessage.tool_call_id
      )!;
      const legacyToolResult = v2ToLegacyMessage(toolResultMessage);
      const toolNode = await this.forest.append(
        root.id,
        [
          ...messages.map(m =>
            isMessageV2(m as unknown)
              ? v2ToLegacyMessage(m as MessageV2)
              : (m as Message)
          ),
          legacyToolResult
        ],
        {
          source_info: {
            type: 'tool_result',
            tool_name: toolCall.function.name
          }
        }
      );
      if (!toolNode.parent_id) {
        throw new Error(
          'Expected result of appending >0 nodes to be a non-root node.'
        );
      }
      lastToolNode = toolNode;

      messages.push(legacyToolResult);
    }
    if (!lastToolNode) {
      return { childNodes: [assistantNode as NodeData] };
    }

    // Continue the loop to send the tool results back to the model
    const next = this.toolCall(
      root,
      providerName,
      modelName,
      messages,
      parameters,
      activeTools
    );
    return {
      childNodes: [lastToolNode],
      next
    };
  }

  async getMessages(
    nodeId: NodeId
  ): Promise<{ root: RootConfig; messages: MessageV2[] }> {
    const { root, messages } = await this.forest.getMessages(nodeId);
    const v2 = messages.map(m => normalizeMessage(m));
    return { root: root.config, messages: v2 };
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
