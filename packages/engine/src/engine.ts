import { coalesceMessages } from './coalesce-messages.ts';
import { OpenAIProvider } from './providers/openai.ts';
import { FileSystemStore } from './store/file-system-store.ts';
import type { ILoomStore } from './store/types.ts';
import { Forest } from './forest.ts';
import type {
  NodeId,
  RootId,
  ProviderName,
  RootConfig,
  Message,
  NodeData
} from './types.ts';
import { AnthropicProvider } from './providers/anthropic.ts';
import { GoogleProvider } from './providers/google.ts';
import { ToolRegistry } from './tools/registry.ts';
import type { ConfigStore, Bookmark } from './config.ts';
import { discoverMcpTools } from './mcp/client.ts';
import { KNOWN_MODELS } from './browser.ts';

export interface GenerateOptions {
  n: number;
  max_tokens: number;
  temperature: number;
}

export type ProgressCallback = (node: NodeData) => void;

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
    onProgress?: ProgressCallback
  ): Promise<NodeData[]> {
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

    // If no tools are active, use the original n > 1 logic
    if (!activeTools || activeTools.length === 0) {
      const coalesced = coalesceMessages(contextMessages, '');

      return Promise.all(
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

          // Call progress callback for the newly created node
          if (onProgress) {
            onProgress(responseNode);
          }

          return responseNode;
        })
      );
    }

    // Tool-calling logic (only supports n=1)
    if (options.n > 1) {
      throw new Error('Tool calling currently only supports n=1');
    }

    // The conversation history for this turn
    const currentMessages = [...contextMessages];
    const finalAssistantNodes: NodeData[] = [];

    // Start the tool-calling loop
    for (let i = 0; i < 5; i++) {
      // Limit to 5 iterations to prevent infinite loops
      const coalesced = coalesceMessages(currentMessages, '');

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
        [...currentMessages, assistantMessage],
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

      // Call progress callback for the newly created assistant node
      if (onProgress) {
        onProgress(assistantNode as NodeData);
      }

      // Update the message history with the assistant's turn
      currentMessages.push(assistantMessage);

      if (
        !assistantMessage.tool_calls ||
        assistantMessage.tool_calls.length === 0
      ) {
        // If no tool calls, this is the final response.
        finalAssistantNodes.push(assistantNode as NodeData);
        break; // Exit the loop
      }

      // --- If there are tool calls, execute them ---
      const toolResults = await Promise.all(
        assistantMessage.tool_calls.map(async toolCall => {
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
      for (const toolResultMessage of toolResults) {
        const toolCall = assistantMessage.tool_calls!.find(
          tc => tc.id === toolResultMessage.tool_call_id
        )!;
        const toolNode = await this.forest.append(
          root.id,
          [...currentMessages, toolResultMessage],
          {
            source_info: {
              type: 'tool_result',
              tool_name: toolCall.function.name
            }
          }
        );

        // Call progress callback for the newly created tool result node
        if (onProgress) {
          onProgress(toolNode as NodeData);
        }

        currentMessages.push(toolResultMessage);
      }

      // Continue the loop to send the tool results back to the model
    }

    if (finalAssistantNodes.length === 0) {
      throw new Error(
        'Model did not produce a final response after tool calls.'
      );
    }

    return finalAssistantNodes;
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
    // Register built-in tools first as fallback
    this.toolRegistry.register(
      'echo',
      'Echoes the input back to the user.',
      {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The message to echo.' }
        },
        required: ['message']
      },
      async (args: { message?: string }) =>
        JSON.stringify({ echo: args.message ?? 'No message provided' }),
      'Built-in' // Group built-in tools together
    );

    this.toolRegistry.register(
      'current_date',
      'Returns the current date and time.',
      { type: 'object', properties: {} },
      async () => JSON.stringify({ date: new Date().toISOString() }),
      'Built-in' // Group built-in tools together
    );

    // Discover and register tools from configured MCP servers
    if (this.configStore) {
      await discoverMcpTools(this.toolRegistry, this.configStore);
    }
  }
}
