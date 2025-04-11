import chalk from 'chalk';
import { LoomEngine } from '@ankhdt/loom-engine';
import type { GenerateOptions, NodeId } from '@ankhdt/loom-engine';

type CommandMap = {
  user: { content: string; generateOptions: GenerateOptions };
  generate: GenerateOptions;
  up: undefined;
  left: undefined;
  right: undefined;
  save: string;
  exit: undefined;
};

export type Command = keyof CommandMap;
export type CommandWithArgs = {
  [K in Command]: [K, CommandMap[K]];
}[Command];

export const UNREAD_TAG = 'cli/unread';

export function parseCommand(
  input: string,
  baseGenerateOptions: GenerateOptions
): CommandWithArgs | undefined {
  input = input.trim();
  if (!input.startsWith('/')) {
    return undefined;
  }

  const [command, ...rest] = input.slice(1).trim().split(' ');
  switch (command) {
    case 'save': {
      return ['save', rest.join(' ')];
    }
    case '': {
      return ['generate', baseGenerateOptions];
    }
    case 'up':
    case 'left':
    case 'right':
    case 'exit': {
      return [command, undefined];
    }
    default: {
      const n = parseInt(command, 10);
      if (!isNaN(n)) {
        return ['generate', { ...baseGenerateOptions, n }];
      }
      throw new Error(`Unknown command: ${command}`);
    }
  }

  return undefined;
}

/**
 * Handles commands entered in the REPL
 * Returns the new current node ID
 */
export async function handleCommand(
  [command, args]: CommandWithArgs,
  engine: LoomEngine,
  currentNodeId: NodeId
): Promise<NodeId> {
  // Handle commands
  switch (command) {
    case 'user': {
      const { content, generateOptions } = args;
      const userNode = await engine
        .getForest()
        .append(currentNodeId, [{ role: 'user', content }], {
          source_info: { type: 'user' }
        });
      return handleCommand(['generate', generateOptions], engine, userNode.id);
    }
    case 'generate': {
      return generate(engine, currentNodeId, args);
    }

    case 'left':
    case 'right': {
      // Get current node
      const node = await engine.getForest().getNode(currentNodeId);
      if (!node || !node.parent_id) {
        return currentNodeId;
      }

      // Get parent node
      const parent = await engine.getForest().getNode(node.parent_id);
      if (!parent) {
        return currentNodeId;
      }

      // Get all siblings (children of the parent)
      const siblings = await engine.getForest().getChildren(parent.id);

      const currentIndex = siblings.findIndex(s => s.id === currentNodeId);
      const desiredIndex =
        command === 'left' ? currentIndex - 1 : currentIndex + 1;
      if (desiredIndex < 0 || desiredIndex >= siblings.length) {
        return currentNodeId;
      }
      const newNode = siblings[desiredIndex];
      if (!newNode) {
        return currentNodeId;
      }
      return newNode.id;
    }

    // Move to parent node
    case 'up': {
      const node = await engine.getForest().getNode(currentNodeId);
      if (node && node.parent_id) {
        return node.parent_id;
      } else {
        return currentNodeId;
      }
    }

    // Save current node as a bookmark
    case 'save': {
      const title = args;
      if (!title) {
        throw new Error(`Please provide a title for the bookmark.`);
      }

      throw new Error(`TODO: save bookmarks in config.toml`);
    }

    // Exit the CLI
    case 'exit': {
      console.log(chalk.green('Goodbye!'));
      process.exit(0);
      throw new Error('Process exited');
    }

    default: {
      command satisfies never;
      console.log(chalk.yellow(`Unknown command: ${command}`));
      return currentNodeId;
    }
  }
}

async function generate(
  engine: LoomEngine,
  currentNodeId: NodeId,
  options: {
    n: number;
    max_tokens: number;
    temperature: number;
  }
) {
  // Get current context
  const { root, messages } = await engine.getMessages(currentNodeId);

  // Generate responses
  const assistantNodes = await engine.generate(root, messages, options);

  if (assistantNodes.length === 1) {
    const chosenNode = assistantNodes[0];
    return chosenNode.id;
  } else {
    for (const node of assistantNodes) {
      await engine.getForest().updateNodeMetadata(node.id, {
        ...node.metadata,
        tags: [...new Set([...(node.metadata.tags || []), UNREAD_TAG])]
      });
    }
    return currentNodeId;
  }
}
