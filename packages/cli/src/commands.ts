import { LoomEngine } from '@ankhdt/loom-engine';
import type { GenerateOptions, NodeId } from '@ankhdt/loom-engine';
import type { ConfigStore } from './config.ts';
import type { Dispatch } from 'react';
import type { Action } from './App.tsx';

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
  app: {
    exit: (error?: Error) => void;
  },
  engine: LoomEngine,
  configStore: ConfigStore,
  dispatch: Dispatch<Action>,
  currentNodeId: NodeId,
  [command, args]: CommandWithArgs
): Promise<void> {
  // Handle commands
  switch (command) {
    case 'user': {
      const { content, generateOptions } = args;
      const userNode = await engine
        .getForest()
        .append(currentNodeId, [{ role: 'user', content }], {
          source_info: { type: 'user' }
        });
      await handleCommand(app, engine, configStore, dispatch, userNode.id, [
        'generate',
        generateOptions
      ]);
      break;
    }
    case 'generate': {
      const nodeId = await generate(engine, currentNodeId, args);
      if (nodeId === currentNodeId) {
        // Since generate leaves us on the same node but adds children, force a fetch
        dispatch({ type: 'FORCE_FETCH' });
      } else {
        dispatch({ type: 'SET_CURRENT_NODE_ID', payload: { nodeId } });
      }
      break;
    }

    case 'left':
    case 'right': {
      // Get current node
      const node = await engine.getForest().getNode(currentNodeId);
      if (!node || !node.parent_id) {
        break;
      }

      // Get parent node
      const parent = await engine.getForest().getNode(node.parent_id);
      if (!parent) {
        break;
      }

      // Get all siblings (children of the parent)
      const siblings = await engine.getForest().getChildren(parent.id);

      const currentIndex = siblings.findIndex(s => s.id === currentNodeId);
      const desiredIndex =
        command === 'left' ? currentIndex - 1 : currentIndex + 1;
      if (desiredIndex < 0 || desiredIndex >= siblings.length) {
        break;
      }
      const newNode = siblings[desiredIndex];
      if (!newNode) {
        break;
      }
      dispatch({
        type: 'SET_CURRENT_NODE_ID',
        payload: { nodeId: newNode.id }
      });
      break;
    }

    // Move to parent node
    case 'up': {
      const node = await engine.getForest().getNode(currentNodeId);
      if (node && node.parent_id) {
        dispatch({
          type: 'SET_CURRENT_NODE_ID',
          payload: { nodeId: node.parent_id }
        });
      }
      break;
    }

    // Save current node as a bookmark
    case 'save': {
      const title = args;
      if (!title) {
        throw new Error(`Please provide a title for the bookmark.`);
      }

      if (configStore.get().bookmarks?.some(b => b.title === title)) {
        throw new Error(`Bookmark with title "${title}" already exists.`);
      }

      const now = new Date().toISOString();
      await configStore.update({
        bookmarks: [
          ...(configStore.get().bookmarks || []),
          {
            title,
            nodeId: currentNodeId,
            createdAt: now,
            updatedAt: now
          }
        ]
      });

      break;
    }

    // Exit the CLI
    case 'exit': {
      app.exit();
      break;
    }

    default: {
      command satisfies never;
      throw new Error(`Unknown command: ${command}`);
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
