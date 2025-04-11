import chalk from 'chalk';
import path from 'path';
import fs from 'fs/promises';
import { LoomEngine } from '@ankhdt/loom-engine';
import type { NodeId } from '@ankhdt/loom-engine';
import assert from 'assert';

export type Command =
  | 'user'
  | 'generate'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'up'
  | 'left'
  | 'right'
  | 'save'
  | 'exit';

export const UNREAD_TAG = 'cli/unread';

interface CommandOptions {
  dataDir: string;
  n: number;
  temperature: number;
  maxTokens: number;
  debug: boolean;
}

export function isCommand(input: string): input is Command {
  switch (input) {
    case 'user':
    case 'generate':
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
    case 'up':
    case 'left':
    case 'right':
    case 'save':
    case 'exit':
      input satisfies Command;
      return true;
    default:
      return false;
  }
}

// Bookmark management functions
async function loadBookmarks(dataDir: string): Promise<Record<string, string>> {
  try {
    const filePath = path.join(dataDir, 'bookmarks.json');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (_error) {
    // File doesn't exist or other error
    return {};
  }
}

async function saveBookmarks(
  dataDir: string,
  bookmarks: Record<string, string>
): Promise<void> {
  const filePath = path.join(dataDir, 'bookmarks.json');
  await fs.writeFile(filePath, JSON.stringify(bookmarks, null, 2), 'utf-8');
}

/**
 * Handles commands entered in the REPL
 * Returns the new current node ID
 */
export async function handleCommand(
  command: Command,
  args: string[],
  engine: LoomEngine,
  currentNodeId: NodeId,
  options: CommandOptions
): Promise<NodeId> {
  // Handle commands
  switch (command) {
    case 'user': {
      assert(args.length === 1, '/user requires a single argument');
      const userNode = await engine
        .getForest()
        .append(currentNodeId, [{ role: 'user', content: args[0] }], {
          source_info: { type: 'user' }
        });
      return handleCommand('generate', [], engine, userNode.id, options);
    }
    // Generate response(s)
    case 'generate':
    case '1':
    case '2':
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9': {
      // Parse N (number of completions to generate)
      const n = command === 'generate' ? options.n : parseInt(command, 10);

      // Get current context
      const { root, messages } = await engine.getMessages(currentNodeId);

      // Generate responses
      const assistantNodes = await engine.generate(root, messages, {
        n,
        temperature: options.temperature,
        max_tokens: options.maxTokens
      });

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
      const title = args.join(' ').trim();
      if (!title) {
        return currentNodeId;
      }

      // Load bookmarks, add the new one, and save
      const bookmarks = await loadBookmarks(options.dataDir);
      bookmarks[title] = currentNodeId as string;
      await saveBookmarks(options.dataDir, bookmarks);
      return currentNodeId;
    }

    // Exit the CLI
    case 'exit': {
      console.log(chalk.green('Goodbye!'));
      process.exit(0);
      throw new Error('Process exited');
    }

    // Unknown command
    default: {
      command satisfies never;
      console.log(chalk.yellow(`Unknown command: ${command}`));
      return currentNodeId;
    }
  }
}
