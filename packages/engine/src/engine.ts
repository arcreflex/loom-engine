import { coalesceMessages } from './coalesce-messages.ts';
import { OpenAIProvider } from './providers/openai.ts';
import { FileSystemStore } from './store/file-system-store.ts';
import type { ILoomStore } from './store/types.ts';
import { Forest } from './forest.ts';
import type {
  NodeId,
  ProviderType,
  RootConfig,
  Message,
  NodeData
} from './types.ts';
import { AnthropicProvider } from './providers/anthropic.ts';

export class LoomEngine {
  private forest: Forest;
  constructor(storeOrPath: ILoomStore | string) {
    let store;
    if (typeof storeOrPath === 'string') {
      store = new FileSystemStore();
      store.initialize(storeOrPath);
    } else {
      store = storeOrPath;
    }

    this.forest = new Forest(store);
  }

  getForest(): Forest {
    return this.forest;
  }

  async generate(
    config: RootConfig,
    contextMessages: Message[],
    options: {
      n: number;
      max_tokens: number;
      temperature: number;
    }
  ): Promise<NodeData[]> {
    const root = await this.forest.getOrCreateRoot(config);
    const provider = this.getProvider(root.config.providerType);

    const coalesced = coalesceMessages(contextMessages, '');

    const { max_tokens, temperature } = options;
    const parameters = {
      max_tokens,
      temperature
    };

    return Promise.all(
      Array.from({ length: options.n }).map(async () => {
        const response = await provider.generate({
          systemMessage: root.config.systemPrompt,
          messages: coalesced,
          model: root.config.model,
          parameters
        });
        const responseNode = await this.forest.append(
          root.id,
          [...contextMessages, response.message],
          {
            source_info: {
              type: 'model',
              parameters,
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
  }

  async getMessages(
    nodeId: NodeId
  ): Promise<{ root: RootConfig; messages: Message[] }> {
    const { root, messages } = await this.forest.getMessages(nodeId);
    return { root: root.config, messages };
  }

  private getProvider(provider: ProviderType) {
    switch (provider) {
      case 'openai':
        return new OpenAIProvider();
      case 'anthropic':
        return new AnthropicProvider();
      // case 'google':
      //   return new GoogleProvider();
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }
}
