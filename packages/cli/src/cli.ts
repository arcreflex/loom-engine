import { LoomEngine } from '@ankhdt/loom-engine';
import type { NodeId, ProviderType } from '@ankhdt/loom-engine';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { hideBin } from 'yargs/helpers';
import yargs from 'yargs/yargs';
import { loadConfig, setEnvFromConfig } from './config.ts';
import { start } from './App.tsx';
import chalk from 'chalk';
import { formatError } from './util.ts';

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
  providerType: ProviderType;
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
        providerType: parts[0],
        model: parts[1]
      };
    default:
      throw new Error(
        `Unsupported provider "${parts[0]}". Supported providers: openai, anthropic, google.`
      );
  }
}

/**
 * Loads the current node ID from the data directory
 */
async function loadCurrentNode(engine: LoomEngine, dataDir: string) {
  try {
    const filePath = path.join(dataDir, 'current-node-id');
    const content = await fs.readFile(filePath, 'utf-8');
    const id = content.trim();
    const node = await engine.getForest().getNode(id as NodeId);
    return node;
  } catch (_error) {
    // File doesn't exist or other error
    return null;
  }
}

/**
 * Saves the current node ID to the data directory
 */
async function saveCurrentNodeId(
  dataDir: string,
  nodeId: string
): Promise<void> {
  const filePath = path.join(dataDir, 'current-node-id');
  await fs.writeFile(filePath, nodeId, 'utf-8');
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
    .option('temp', {
      type: 'number',
      description: 'Default temperature',
      default: 1
    })
    .option('max-tokens', {
      type: 'number',
      description: 'Default max tokens',
      default: 1024
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
    const config = await loadConfig(dataDir);

    // Set environment variables from config
    setEnvFromConfig(config);

    // Create engine instance
    const engine = new LoomEngine(dataDir);

    // Load the last node ID if one exists
    const persistedNode = await loadCurrentNode(engine, dataDir);
    let startingNodeId = persistedNode?.id;

    const defaultRoot =
      persistedNode?.parent_id !== undefined
        ? await engine.getForest().getRoot(persistedNode.root_id)
        : persistedNode;

    if (!startingNodeId || argv.model || argv.system) {
      try {
        let providerType = defaultRoot?.config.providerType;
        let model = defaultRoot?.config.model;

        if (argv.model) {
          // Parse the model string
          const parsedModel = parseModelString(argv.model);
          providerType = parsedModel.providerType;
          model = parsedModel.model;
        }

        if (!model && config.defaults.model) {
          const parsedModel = parseModelString(config.defaults.model);
          providerType = parsedModel.providerType;
          model = parsedModel.model;
        }

        if (!providerType) {
          throw new Error('Provider type is required.');
        }
        if (!model) {
          throw new Error('Model is required.');
        }

        const targetRootConfig = {
          providerType,
          model,
          systemPrompt: argv.system || config.defaults.systemPrompt
        };

        const targetRoot = await engine
          .getForest()
          .getOrCreateRoot(targetRootConfig);

        if (defaultRoot?.id !== targetRoot.id) {
          // Different root, create a new conversation
          startingNodeId = targetRoot.id;
        }
      } catch (error) {
        console.log(chalk.red(formatError(error, argv.debug)));
        process.exit(1);
      }
    }

    if (!startingNodeId) {
      // No model/system specified and no persisted node
      console.log(chalk.red('Error: No existing conversation found.'));
      process.exit(1);
    }

    // Save the determined starting node ID
    await saveCurrentNodeId(dataDir, startingNodeId);

    // Ensure the determined starting node ID exists before rendering
    try {
      await engine.getForest().getNode(startingNodeId);
    } catch (nodeError) {
      console.log(chalk.red(formatError(nodeError, argv.debug)));
      // Attempt to reset to the root if possible? Or just exit.
      // Maybe try deleting the current-node-id file?
      process.exit(1);
    }

    await start({
      engine,
      initialNodeId: startingNodeId,
      options: {
        dataDir,
        n: argv.n ?? config.defaults.n,
        temperature: argv.temp ?? config.defaults.temperature,
        maxTokens: argv['max-tokens'] ?? config.defaults.maxTokens,
        debug: argv.debug
      },
      onExit: async () => {
        // Save final node ID before exiting
        // Note: We might want to save more frequently within the app
        // await saveCurrentNodeId(dataDir, ???); // Need access to the *current* node ID from the app state here. This is tricky.
        console.log(chalk.green('\nGoodbye!'));
        // appInstance.unmount(); // Let Ink handle unmount on exit
        // process.exit(0); // Let the app handle the actual exit via useApp().exit() or similar
      }
    });
  } catch (error) {
    console.log(chalk.red(formatError(error, argv.debug)));
    process.exit(1);
  }
}

// Run the main function
main();
