import { coalesceMessages, LoomEngine } from '@ankhdt/loom-engine';
import type { ProviderName } from '@ankhdt/loom-engine';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { ConfigStore } from './config.ts';
import { start } from './App.tsx';
import chalk from 'chalk';
import { formatError, formatMessage } from './util.ts';

/**
 * Resolves a directory path, expanding ~ to the user's home directory
 */
function resolveDataDir(dataDir: string): string {
  if (dataDir.startsWith('~')) {
    return path.join(os.homedir(), dataDir.slice(1));
  }
  return dataDir;
}

/**
 * Parses a model string in the format "provider/model"
 */
function parseModelString(modelString: string): {
  provider: ProviderName;
  model: string;
} {
  const parts = modelString.split('/');
  if (parts.length !== 2) {
    throw new Error(
      'Invalid model format. Expected "provider/model" (e.g., "anthropic/claude-3-opus-20240229").'
    );
  }

  switch (parts[0]) {
    case 'openai':
    case 'anthropic':
      // case 'google':
      return {
        provider: parts[0],
        model: parts[1]
      };
    default:
      throw new Error(
        `Unsupported provider "${parts[0]}". Supported providers: openai, anthropic, google.`
      );
  }
}

async function main() {
  // Parse command line arguments
  const argv = await yargs(hideBin(process.argv))
    .option('data-dir', {
      type: 'string',
      description: 'Directory to store conversation data',
      default: '~/.loom'
    })
    .option('model', {
      type: 'string',
      description: 'Model ID (e.g., anthropic/claude-3-opus-20240229)'
    })
    .option('system', {
      type: 'string',
      description: 'System prompt for new conversations'
    })
    .option('n', {
      type: 'number',
      description: 'Default number of completions',
      default: 5
    })
    .option('temperature', {
      type: 'number',
      description: 'Default temperature',
      default: 1
    })
    .option('max-tokens', {
      type: 'number',
      description: 'Default max tokens',
      default: 1024
    })
    .option('print', {
      type: 'boolean',
      description: 'Print the content of the current node to stdout and exit'
    })
    .options('debug', { type: 'boolean', default: false })
    .help()
    .alias('h', 'help')
    .parseAsync();

  try {
    // Ensure data directory exists
    const dataDir = resolveDataDir(argv['data-dir']);
    await fs.mkdir(dataDir, { recursive: true });

    // Load config from config.toml
    const configStore = await ConfigStore.create(dataDir);

    // Create engine instance
    const engine = await LoomEngine.create(dataDir);

    // Load the last node ID if one exists
    const config = configStore.get();

    let initialNode = config.currentNodeId
      ? await engine.getForest().getNode(config.currentNodeId)
      : null;
    let initialRoot =
      initialNode?.parent_id !== undefined
        ? await engine.getForest().getRoot(initialNode.root_id)
        : initialNode;

    if (!initialNode || argv.model || argv.system) {
      try {
        let provider = initialRoot?.config.provider;
        let model = initialRoot?.config.model;

        if (argv.model) {
          // Parse the model string
          const parsedModel = parseModelString(argv.model);
          provider = parsedModel.provider;
          model = parsedModel.model;
        }

        if (!model && config.defaults.model) {
          const parsedModel = parseModelString(config.defaults.model);
          provider = parsedModel.provider;
          model = parsedModel.model;
        }

        if (!provider) {
          throw new Error('Provider type is required.');
        }
        if (!model) {
          throw new Error('Model is required.');
        }

        const targetRootConfig = {
          provider,
          model,
          systemPrompt: argv.system || config.defaults.systemPrompt
        };

        console.log(targetRootConfig);

        const targetRoot = await engine
          .getForest()
          .getOrCreateRoot(targetRootConfig);

        if (initialRoot?.id !== targetRoot.id) {
          initialNode = targetRoot;
          initialRoot = targetRoot;
        }
      } catch (error) {
        console.log(chalk.red(formatError(error, argv.debug)));
        process.exit(1);
      }
    }

    if (!initialNode || !initialRoot) {
      // No model/system specified and no persisted node
      console.log(chalk.red('Error: No existing conversation found.'));
      process.exit(1);
    }

    if (argv.print) {
      const { root, messages } = await engine.getMessages(initialNode.id);
      const content = coalesceMessages(messages)
        .map(message => formatMessage(message))
        .join('\n');
      console.log(chalk.magenta(`[System] ${root.systemPrompt}`));
      console.log(content);
      process.exit(0);
    }

    await configStore.update({
      currentNodeId: initialNode.id
    });

    await start({
      engine,
      configStore,
      initialNode,
      initialRoot,
      options: {
        n: argv.n ?? config.defaults.n,
        max_tokens: argv['max-tokens'] ?? config.defaults.maxTokens,
        temperature: argv['temperature'] ?? config.defaults.temperature
      },
      debug: argv.debug
    });
  } catch (error) {
    console.log(chalk.red(formatError(error, argv.debug)));
    process.exit(1);
  }
}

// Run the main function
main();
