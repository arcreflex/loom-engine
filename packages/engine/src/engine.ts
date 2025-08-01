import { coalesceMessages } from './coalesce-messages.ts';
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
import { AnthropicProvider } from './providers/anthropic.ts';
import { GoogleProvider } from './providers/google.ts';
import { ToolRegistry } from './tools/registry.ts';
import type { ConfigStore, Bookmark } from './config.ts';
import { discoverMcpTools } from './mcp/client.ts';
import { KNOWN_MODELS } from './browser.ts';
import type { ProviderRequest } from './providers/types.ts';
import { getCodebaseContext } from './tools/introspect.ts';

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
    contextMessages: Message[],
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

    const estimatedInputTokens = contextMessages
      .map(msg => {
        const str = JSON.stringify(msg);
        const len = str.length;
        // 1 token ~= 4 chars, but want to overestimate a bit
        return len * 0.3;
      })
      .reduce((sum, tok) => sum + tok, 0);

    const modelSpec = KNOWN_MODELS[`${providerName}/${modelName}`];
    if (modelSpec) {
      parameters.max_tokens = Math.min(
        options.max_tokens,
        modelSpec.capabilities.max_output_tokens,
        modelSpec.capabilities.max_input_tokens
          ? modelSpec.capabilities.max_input_tokens - estimatedInputTokens
          : Infinity
      );
    }

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

    const coalesced = coalesceMessages(contextMessages, '');

    const childNodes = await Promise.all(
      Array.from({ length: options.n }).map(async () => {
        const response = await provider.generate({
          systemMessage: root.config.systemPrompt,
          messages: coalesced,
          model: modelName,
          parameters,
          tools: undefined
        });
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

        return responseNode;
      })
    );

    return { childNodes };
  }

  private async toolCall(
    root: RootData,
    providerName: ProviderName,
    modelName: string,
    contextMessages: Message[],
    parameters: ProviderRequest['parameters'],
    activeTools: string[]
  ): Promise<GenerateResult> {
    // The conversation history for this turn
    const messages = [...contextMessages];

    const provider = this.getProvider(providerName);

    // Limit to 5 iterations to prevent infinite loops
    const coalesced = coalesceMessages(messages, '');

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

    const toolsToUse =
      toolsForProvider.length > 0 ? toolsForProvider : undefined;
    const toolChoiceToUse = toolsForProvider.length > 0 ? 'auto' : undefined;

    const response = await provider.generate({
      systemMessage: root.config.systemPrompt,
      messages: coalesced,
      model: modelName,
      parameters,
      tools: toolsToUse,
      tool_choice: toolChoiceToUse
    });

    const assistantMessage = response.message;

    // Append the assistant's response (which may or may not have tool calls)
    const assistantNode = await this.forest.append(
      root.id,
      [...messages, assistantMessage],
      {
        source_info: {
          type: 'model',
          provider: providerName,
          model_name: modelName,
          parameters,
          tools: toolsToUse,
          tool_choice: toolChoiceToUse,
          finish_reason: response.finish_reason,
          usage: response.usage
        }
      }
    );

    // Update the message history with the assistant's turn
    messages.push(assistantMessage);

    const toolCalls = getToolCalls(assistantMessage) ?? [];
    if (toolCalls.length === 0) {
      // If no tool calls, this is the final response.
      return { childNodes: [assistantNode as NodeData] };
    }

    // --- If there are tool calls, execute them ---
    const toolResults = await Promise.all(
      toolCalls.map(async toolCall => {
        try {
          const result = await this.toolRegistry.execute(
            toolCall.function.name,
            JSON.parse(toolCall.function.arguments)
          );
          return {
            tool_call_id: toolCall.id,
            role: 'tool' as const,
            content: result
          };
        } catch (error) {
          return {
            tool_call_id: toolCall.id,
            role: 'tool' as const,
            content: JSON.stringify({ error: String(error) })
          };
        }
      })
    );

    // Append each tool result as a new node and update message history

    let lastToolNode: NodeData | undefined;
    for (const toolResultMessage of toolResults) {
      const toolCall = toolCalls.find(
        tc => tc.id === toolResultMessage.tool_call_id
      )!;
      const toolNode = await this.forest.append(
        root.id,
        [...messages, toolResultMessage],
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

      messages.push(toolResultMessage);
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
