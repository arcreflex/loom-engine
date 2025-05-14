import fs from 'fs/promises';
import path from 'path';
import type { NodeId, RootId } from './types.ts';
import os from 'os';

import * as toml from '@iarna/toml';
import { log } from './log.ts';

export type Bookmark = {
  title: string;
  rootId: RootId;
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
  presets?: {
    [name: string]: Partial<
      Pick<Config['defaults'], 'n' | 'temperature' | 'maxTokens'>
    >;
  };
  activePresetName?: string; // Remove null, handle in application logic
  currentNodeId?: NodeId;
  bookmarks?: Bookmark[];
}

type RecursivePartial<T> = {
  [K in keyof T]?: T[K] extends object ? RecursivePartial<T[K]> : T[K];
};

// strip brands off of nominally typed strings and handle nulls
type ToPlainJson<T> = {
  [K in keyof T]: T[K] extends object
    ? T[K] extends null
      ? null
      : ToPlainJson<T[K]>
    : T[K] extends string | Date
      ? string
      : T[K];
};

/**
 * Resolves a directory path, expanding ~ to the user's home directory
 */
export function resolveDataDir(dataDir: string): string {
  if (dataDir.startsWith('~')) {
    return path.join(os.homedir(), dataDir.slice(1));
  }
  return dataDir;
}

function getMainConfigPath(dataDir: string): string {
  return path.join(dataDir, 'config.toml');
}

async function getAllConfigPaths(dataDir: string): Promise<string[]> {
  const files = await fs.readdir(dataDir);
  const configFiles = files.filter(
    file => file.startsWith('config.') && file.endsWith('.toml')
  );
  return configFiles
    .sort((a, b) =>
      a.replace('.toml', '').localeCompare(b.replace('.toml', ''))
    )
    .map(file => path.join(dataDir, file));
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
    temperature: 1,
    maxTokens: 1024,
    n: 5,
    systemPrompt: 'You are a helpful assistant.'
  }
};

export class ConfigStore {
  private base: Config;
  private main: RecursivePartial<Config>;
  private dataDir: string;

  private constructor(
    dataDir: string,
    { base, main }: { base: Config; main: RecursivePartial<Config> }
  ) {
    this.dataDir = dataDir;
    this.base = base;
    this.main = main;
    setEnvFromConfig(this.get());
  }

  static async create(dataDir: string): Promise<ConfigStore> {
    const { base, main } = await loadConfig(dataDir);
    return new ConfigStore(dataDir, { base, main });
  }

  get(): Config {
    return merge(this.base, this.main);
  }

  async update(updates: Partial<Config>): Promise<boolean> {
    const next = merge(this.main, updates);
    if (JSON.stringify(next) === JSON.stringify(this.main)) {
      return false;
    }
    this.main = next;
    await saveConfig(this.dataDir, this.main);
    setEnvFromConfig(this.get());
    return true;
  }
}

/**
 * Loads the config from the config.toml file in the data directory
 */
async function loadConfig(
  dataDir: string
): Promise<{ base: Config; main: RecursivePartial<Config> }> {
  const mainConfigPath = getMainConfigPath(dataDir);
  // Ensure main config file exists
  try {
    await fs.access(mainConfigPath);
  } catch (_error) {
    await saveConfig(dataDir, defaultConfig);
    log(
      dataDir,
      `[ConfigStore] Created default config file at ${getMainConfigPath(dataDir)}`
    );
  }

  try {
    // Read main config
    const main = toml.parse(
      await fs.readFile(mainConfigPath, 'utf-8')
    ) as RecursivePartial<Config>;

    // Read additional configs
    const configPaths = (await getAllConfigPaths(dataDir)).filter(
      p => path.resolve(p) !== path.resolve(mainConfigPath)
    );
    let base: Config = defaultConfig;
    for (const configPath of configPaths) {
      log(dataDir, `[ConfigStore] Reading config from ${configPath}`);
      const content = await fs.readFile(configPath, 'utf-8');
      const config = toml.parse(content) as RecursivePartial<Config>;
      // Merge the loaded config with the combined config
      base = merge(base, config);
    }
    return { base, main };
  } catch (error) {
    console.error('Failed to load config:', error);
    throw error;
  }
}

function merge<T extends RecursivePartial<Config>>(
  base: T,
  updates: RecursivePartial<Config>
): T {
  return {
    ...base,
    ...updates,
    providers: {
      ...base.providers,
      ...updates.providers
    },
    defaults: {
      ...base.defaults,
      ...updates.defaults
    },
    presets: {
      ...base.presets,
      ...updates.presets
    }
  };
}

/**
 * Saves the config object back to the config.toml file.
 */
async function saveConfig(
  dataDir: string,
  config: RecursivePartial<Config>
): Promise<void> {
  const configPath = getMainConfigPath(dataDir);
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

  // Set Google API key if present in config and not already set in env
  if (config.providers?.google?.apiKey && !process.env.GOOGLE_API_KEY) {
    process.env.GOOGLE_API_KEY = config.providers.google.apiKey;
  }
}
