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

export interface GenerateOptions {
  n: number;
  max_tokens: number;
  temperature: number;
}

export class LoomEngine {
  private forest: Forest;
  private store: ILoomStore;

  private constructor(store: ILoomStore) {
    this.store = store;
    this.forest = new Forest(this.store);
  }

  static async create(storeOrPath: ILoomStore | string) {
    let store;
    if (typeof storeOrPath === 'string') {
      store = await FileSystemStore.create(storeOrPath);
    } else {
      store = storeOrPath;
    }
    const engine = new LoomEngine(store);
    return engine;
  }

  getForest(): Forest {
    return this.forest;
  }

  async generate(
    rootId: RootId,
    providerName: ProviderName,
    modelName: string,
    contextMessages: Message[],
    options: GenerateOptions
  ): Promise<NodeData[]> {
    const root = await this.forest.getRoot(rootId);
    if (!root) {
      throw new Error(`Root with ID ${rootId} not found`);
    }

    const provider = this.getProvider(providerName);

    const coalesced = coalesceMessages(contextMessages, '');

    const { max_tokens, temperature } = options;
    const parameters = {
      max_tokens,
      temperature,
      model: modelName
    };

    return Promise.all(
      Array.from({ length: options.n }).map(async () => {
        const response = await provider.generate({
          systemMessage: root.config.systemPrompt,
          messages: coalesced,
          model: modelName,
          parameters
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

  private getProvider(provider: ProviderName) {
    switch (provider) {
      case 'openai':
        return new OpenAIProvider(this);
      case 'anthropic':
        return new AnthropicProvider(this);
      case 'google':
        return new GoogleProvider(this);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  log(x: unknown) {
    this.store.log(x);
  }
}
