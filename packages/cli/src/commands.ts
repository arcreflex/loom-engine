import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import fs from 'fs/promises';
import { LoomEngine } from '@ankhdt/loom-engine';
import type { NodeId } from '@ankhdt/loom-engine';

export const UNREAD_TAG = 'cli/unread';

interface CommandOptions {
  dataDir: string;
  n: number;
  temperature: number;
  maxTokens: number;
  debug: boolean;
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
  input: string,
  engine: LoomEngine,
  currentNodeId: NodeId,
  options: CommandOptions
): Promise<NodeId> {
  // Parse the command (removing the leading slash)
  const [command, ...args] = input.slice(1).trim().split(' ');

  // Handle commands
  switch (command) {
    // Generate response(s)
    case '':
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
      const n = command === '' ? options.n : parseInt(command, 10);

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

    // List and select sibling nodes
    case 'siblings': {
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

      // Filter out the current node
      const otherSiblings = siblings.filter(
        sibling => sibling.id !== currentNodeId
      );

      if (otherSiblings.length === 0) {
        return currentNodeId;
      }

      // Format choices for inquirer
      const choices = otherSiblings.map((sibling, index) => {
        const previewContent =
          sibling.message.content.substring(0, 50) +
          (sibling.message.content.length > 50 ? '...' : '');
        return {
          name: `[${index + 1}] ${previewContent}`,
          value: sibling.id
        };
      });

      // Prompt user to select a sibling
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedId',
          message: 'Choose sibling:',
          choices
        }
      ]);

      if (answers.selectedId) {
        return answers.selectedId as NodeId;
      } else {
        return currentNodeId;
      }
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
      console.log(chalk.yellow(`Unknown command: ${command}`));
      return currentNodeId;
    }
  }
}
