import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import {
  LoomEngine,
  type NodeId,
  type NodeData,
  type Message
} from '@ankhdt/loom-engine';
import {
  handleCommand,
  isCommand,
  UNREAD_TAG,
  type Command
} from './commands.ts';
import { render } from 'ink';
import { formatError, formatMessage } from './util.ts';
import fs from 'fs/promises';
import path from 'path';

// --- Interfaces ---

interface LoomAppProps {
  engine: LoomEngine;
  initialNodeId: NodeId;
  options: {
    dataDir: string;
    n: number;
    temperature: number;
    maxTokens: number;
    debug: boolean;
  };
  onExit: () => void; // Function to call for graceful exit
}

interface DisplayMessage extends Message {
  nodeId: NodeId; // Keep track of the source node for potential future use
}

async function getFormattedHistory(
  engine: LoomEngine,
  currentNodeId: NodeId,
  _debug: boolean
): Promise<{ system?: string; messages: DisplayMessage[] }> {
  const { root, path } = await engine
    .getForest()
    .getPath({ from: undefined, to: currentNodeId });

  const displayMessages: DisplayMessage[] = path.map(node => ({
    ...node.message,
    nodeId: node.id
  }));

  return {
    system: root.config.systemPrompt,
    messages: displayMessages
  };
}

// --- Main Component ---

export async function start(props: LoomAppProps) {
  const instance = render(<LoomApp {...props} />);
  await instance.waitUntilExit();
}

export function LoomApp({
  engine,
  initialNodeId,
  options,
  onExit
}: LoomAppProps) {
  useApp();
  const [currentNodeId, setCurrentNodeId] = useState<NodeId>(initialNodeId);
  const [history, setHistory] = useState<DisplayMessage[]>([]);
  const [systemPrompt, setSystemPrompt] = useState<string | undefined>(
    undefined
  );
  const [children, setChildren] = useState<NodeData[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // State for focus management
  const [focusedElement, setFocusedElement] = useState<'input' | 'children'>(
    'input'
  );
  const [selectedChildIndex, setSelectedChildIndex] = useState<number>(0);

  // --- Data Fetching Effect ---
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Set current node ID
        await fs.writeFile(
          path.join(options.dataDir, 'current-node-id'),
          currentNodeId,
          'utf-8'
        );

        // Fetch history
        const { system, messages } = await getFormattedHistory(
          engine,
          currentNodeId,
          options.debug
        );
        setSystemPrompt(system);
        setHistory(messages);

        // Fetch children
        const fetchedChildren = await engine
          .getForest()
          .getChildren(currentNodeId);
        setChildren(fetchedChildren);

        // Clear the unread tag
        const node = await engine.getForest().getNode(currentNodeId);
        if (node?.parent_id) {
          await engine.getForest().updateNodeMetadata(node.id, {
            ...node.metadata,
            tags: node.metadata.tags?.filter(tag => tag !== UNREAD_TAG)
          });
        }

        setSelectedChildIndex(0); // Reset selection when node changes
      } catch (err) {
        setError(formatError(err, options.debug));
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [engine, currentNodeId, options.debug, options.dataDir]);

  // --- Input Handling ---
  const handleCommandAndUpdate = async (command: Command, args: string[]) => {
    setIsLoading(true);
    setError(null);
    let nextNodeId = currentNodeId;

    try {
      if (command === 'exit') {
        onExit(); // Call the passed exit handler
        return;
      } else {
        nextNodeId = await handleCommand(
          command,
          args,
          engine,
          currentNodeId,
          options
        );
      }

      setIsLoading(false);
      if (nextNodeId !== currentNodeId) {
        setCurrentNodeId(nextNodeId);
      }
    } catch (err) {
      setError(formatError(err, options.debug));
      setIsLoading(false);
    }
  };

  const handleInput = async (value: string) => {
    setInputValue('');
    const trimmedInput = value.trim();
    if (!trimmedInput) return; // Ignore empty submissions
    if (isLoading) return; // Ignore input while loading
    if (trimmedInput.startsWith('/')) {
      const [command, ...args] = trimmedInput.slice(1).trim().split(' ');
      if (isCommand(command)) {
        await handleCommandAndUpdate(command, args);
        return;
      }
    }
    await handleCommandAndUpdate('user', [value]);
  };

  // --- Keyboard Input Hook (Focus, Navigation) ---
  useInput(
    async (input, key) => {
      if (isLoading) return;
      // Handle Ctrl+C for exit (useApp's exit is preferred)
      if (key.ctrl && input === 'c') {
        onExit();
        return;
      }

      switch (focusedElement) {
        case 'input': {
          if (key.return) {
            handleInput(inputValue);
          } else if (key.upArrow && key.meta) {
            await handleCommandAndUpdate('up', []);
          } else if (key.leftArrow && key.meta) {
            await handleCommandAndUpdate('left', []);
          } else if (key.rightArrow && key.meta) {
            await handleCommandAndUpdate('right', []);
          } else if (key.downArrow && children.length > 0) {
            setFocusedElement('children');
            setSelectedChildIndex(0);
          }
          return;
        }
        case 'children': {
          if (children.length === 0) return;
          if (key.return) {
            // Navigate to selected child
            const selectedChild = children[selectedChildIndex];
            if (selectedChild) {
              setCurrentNodeId(selectedChild.id);
              setFocusedElement('input'); // Return focus to input after navigation
            }
          } else if (key.upArrow) {
            if (selectedChildIndex > 0) {
              setSelectedChildIndex(prev => prev - 1);
            } else {
              // Move focus back to input when pressing Up from the first child
              setFocusedElement('input');
            }
          } else if (
            key.downArrow &&
            selectedChildIndex < children.length - 1
          ) {
            setSelectedChildIndex(prev => prev + 1);
          }
        }
      }
    },
    { isActive: true } // Ensure the hook is always active
  );

  // --- Child Sorting and Rendering Logic ---
  const sortedChildren = useMemo(() => {
    const unread: NodeData[] = [];
    const read: NodeData[] = [];
    if (!children) return [];

    children.forEach(child => {
      if (child.metadata.tags?.includes(UNREAD_TAG)) {
        unread.push(child);
      } else {
        read.push(child);
      }
    });
    return [...unread, ...read];
  }, [children]);

  // --- Rendering Logic ---

  const maxChildren = 5;

  const inputHeight = 1;
  const statusHeight = 3;
  const childrenMargin = 1;
  const childrenHeight = children.length
    ? Math.min(children.length, maxChildren) + 3
    : 0;
  const fixedElementsHeight =
    inputHeight + statusHeight + childrenMargin + childrenHeight;
  const historyHeight = Math.max(1, process.stdout.rows - fixedElementsHeight); // Ensure at least 1 row

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* 1. History View */}
      <Box flexDirection="column" height={historyHeight} overflowY="hidden">
        {systemPrompt && <Text color="magenta">[System] {systemPrompt}</Text>}
        {history.slice(-historyHeight).map((msg, index) => (
          <Text key={`${msg.nodeId}-${index}`}>{formatMessage(msg)}</Text>
        ))}
        {history.length > historyHeight && (
          <Text dimColor>
            ... ({history.length - historyHeight} older messages hidden)
          </Text>
        )}
        {/* spacer if history is short to push input down */}
        {history.length <= historyHeight && <Box flexGrow={1} />}
      </Box>

      {/* Status Line */}
      <Box
        borderStyle="round"
        borderColor={isLoading ? 'yellow' : error ? 'red' : 'gray'}
        paddingX={1}
      >
        <Text color={isLoading ? 'yellow' : error ? 'red' : 'dim'}>
          {isLoading
            ? 'Generating...'
            : error
              ? `Error: ${error}`
              : `Current Node: ${currentNodeId}`}
        </Text>
      </Box>

      {/* 2. Input Field */}
      <Box>
        <Text color={focusedElement === 'input' ? 'blue' : 'grey'}>{'> '}</Text>
        <TextInput
          value={inputValue}
          onChange={setInputValue}
          onSubmit={handleInput}
          focus={focusedElement === 'input'}
        />
      </Box>

      {/* 3. Children */}
      {sortedChildren.length > 0 && (
        <Box
          borderStyle="round"
          borderColor={focusedElement === 'children' ? 'blue' : 'grey'}
          flexDirection="column"
          paddingX={1}
          marginTop={childrenMargin}
          height={childrenHeight}
          overflowY="hidden"
        >
          <Text dimColor>Children:</Text>
          {sortedChildren
            .slice(0, Math.min(sortedChildren.length, maxChildren))
            .map((child, index) => {
              const isSelected =
                focusedElement === 'children' && index === selectedChildIndex;
              const preview =
                child.message.content.substring(0, 80).replace(/\n/g, ' ') +
                (child.message.content.length > 80 ? '...' : '');
              const isUnread =
                child.parent_id && child.metadata.tags?.includes(UNREAD_TAG);
              return (
                <Text
                  key={child.id}
                  color={isSelected ? 'blue' : undefined}
                  bold={isUnread}
                  inverse={isSelected}
                >
                  {`${isUnread ? '* ' : ''}[${index + 1}] (${child.message.role}) ${preview}`}
                </Text>
              );
            })}
        </Box>
      )}
    </Box>
  );
}
