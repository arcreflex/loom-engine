import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import toml from '@iarna/toml';
import type { NodeId } from '@ankhdt/loom-engine';
import { formatError } from './util.ts';

export type Bookmark = {
  title: string;
  nodeId: NodeId;
  createdAt: string;
  updatedAt: string;
};

export interface Config {
  providers?: {
    anthropic?: {
      apiKey?: string;
    };
    openai?: {
      apiKey?: string;
      baseURL?: string;
    };
    google?: {
      apiKey?: string;
      projectId?: string;
    };
  };
  defaults: {
    model?: string;
    temperature: number;
    maxTokens: number;
    n: number;
    systemPrompt: string;
  };
  currentNodeId?: NodeId;
  bookmarks?: Bookmark[];
}

type RecursivePartial<T> = {
  [K in keyof T]?: T[K] extends object ? RecursivePartial<T[K]> : T[K];
};

// strip brands off of nominally typed strings
type ToPlainJson<T> = {
  [K in keyof T]: T[K] extends object
    ? ToPlainJson<T[K]>
    : T[K] extends string | Date
      ? string
      : T[K];
};

function getConfigPath(dataDir: string): string {
  return path.join(dataDir, 'config.toml');
}

const defaultConfig: Config = {
  providers: {
    anthropic: {
      apiKey: 'your API key'
    },
    openai: {
      apiKey: 'your API key'
    },
    google: {
      apiKey: 'your API key',
      projectId: 'your project id'
    }
  },
  defaults: {
    model: 'anthropic/claude-3-haiku-20240307',
    temperature: 1,
    maxTokens: 1024,
    n: 5,
    systemPrompt:
      'The assistant is in CLI simulation mode and responds only with the output of the command.'
  }
};

export class ConfigStore {
  private data: Config;
  private dataDir: string;

  private constructor(dataDir: string, initial: Config) {
    this.dataDir = dataDir;
    this.data = initial;
  }

  static async create(dataDir: string): Promise<ConfigStore> {
    const config = await loadConfig(dataDir);
    setEnvFromConfig(config);
    return new ConfigStore(dataDir, config);
  }

  get(): Config {
    return this.data;
  }

  async update(updates: Partial<Config>): Promise<Config> {
    const next = {
      ...this.data,
      ...updates
    };
    if (JSON.stringify(next) === JSON.stringify(this.data)) {
      return this.data;
    }
    this.data = next;
    await saveConfig(this.dataDir, this.data);
    setEnvFromConfig(this.data);
    return this.data;
  }
}

/**
 * Loads the config from the config.toml file in the data directory
 */
async function loadConfig(dataDir: string): Promise<Config> {
  try {
    const configPath = getConfigPath(dataDir);

    try {
      // Check if config file exists
      await fs.access(configPath);
    } catch (_error) {
      await saveConfig(dataDir, defaultConfig);
      console.log(chalk.green(`Created default config file at ${configPath}`));
    }

    // Read and parse the config file
    const content = await fs.readFile(configPath, 'utf-8');
    const config = toml.parse(content) as RecursivePartial<Config>;

    return {
      ...config,
      defaults: {
        n: 5,
        maxTokens: 1024,
        systemPrompt:
          'The assistant is in CLI simulation mode and responds only with the output of the command.',
        temperature: 1,
        ...config.defaults
      }
    };
  } catch (error) {
    console.log(chalk.red(formatError(error, true)));
    process.exit(1);
  }
}

/**
 * Saves the config object back to the config.toml file.
 */
async function saveConfig(dataDir: string, config: Config): Promise<void> {
  const configPath = getConfigPath(dataDir);
  const tomlString = toml.stringify(config as ToPlainJson<Config>);
  await fs.writeFile(configPath, tomlString, 'utf-8');
}

/**
 * Sets environment variables from the config
 */
function setEnvFromConfig(config: Config): void {
  // Set Anthropic API key if present in config and not already set in env
  if (config.providers?.anthropic?.apiKey && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = config.providers.anthropic.apiKey;
  }

  // Set OpenAI API key if present in config and not already set in env
  if (config.providers?.openai?.apiKey && !process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = config.providers.openai.apiKey;
  }
}
