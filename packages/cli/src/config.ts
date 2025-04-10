import fs from 'fs/promises';
import path from 'path';
import toml from 'toml';
import chalk from 'chalk';
import { formatError } from './util.ts';

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
}

type RecursivePartial<T> = {
  [K in keyof T]?: T[K] extends object ? RecursivePartial<T[K]> : T[K];
};

/**
 * Loads the config from the config.toml file in the data directory
 */
export async function loadConfig(dataDir: string): Promise<Config> {
  try {
    const configPath = path.join(dataDir, 'config.toml');

    try {
      // Check if config file exists
      await fs.access(configPath);
    } catch (error) {
      // Create a default config file if it doesn't exist
      const defaultConfig = `# Loom CLI Configuration

# Provider API keys
[providers]
# Anthropic provider settings
[providers.anthropic]
# apiKey = "YOUR_ANTHROPIC_API_KEY" # Set your Anthropic API key here or use ANTHROPIC_API_KEY env var

# OpenAI provider settings
[providers.openai]
# apiKey = "YOUR_OPENAI_API_KEY" # Set your OpenAI API key here or use OPENAI_API_KEY env var
# baseURL = "https://api.openai.com/v1" # Optional custom API URL

# Google provider settings
[providers.google]
# apiKey = "YOUR_GOOGLE_API_KEY" # Set your Google API key here
# projectId = "your-project-id" # Your Google Cloud project ID

# Default settings
[defaults]
# model = "anthropic/claude-3-haiku-20240307" # Default model in provider/model format
# temperature = 0.7 # Default temperature
# maxTokens = 1024 # Default maximum tokens
# n = 1 # Default number of completions
# systemPrompt = "You are a helpful assistant." # Default system prompt
`;

      await fs.writeFile(configPath, defaultConfig, 'utf-8');
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
 * Sets environment variables from the config
 */
export function setEnvFromConfig(config: Config): void {
  // Set Anthropic API key if present in config and not already set in env
  if (config.providers?.anthropic?.apiKey && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = config.providers.anthropic.apiKey;
  }

  // Set OpenAI API key if present in config and not already set in env
  if (config.providers?.openai?.apiKey && !process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = config.providers.openai.apiKey;
  }
}
