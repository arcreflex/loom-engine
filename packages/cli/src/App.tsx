import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import TextInput from 'ink-text-input';
import {
  LoomEngine,
  type NodeId,
  type NodeData,
  type Message,
  type RootData,
  type Node,
  type GenerateOptions
} from '@ankhdt/loom-engine';
import {
  handleCommand,
  parseCommand,
  UNREAD_TAG,
  type CommandWithArgs
} from './commands.ts';
import { render } from 'ink';
import { formatError } from './util.ts';
import type { ConfigStore } from './config.ts';

// --- Interfaces ---

interface LoomAppProps {
  engine: LoomEngine;
  configStore: ConfigStore;
  options: GenerateOptions;
  initialNode: Node;
  initialRoot: RootData;
  debug: boolean;
  onExit: () => void; // Function to call for graceful exit
}

interface DisplayMessage extends Message {
  nodeId: NodeId; // Keep track of the source node for potential future use
  isChildPreview?: boolean;
}

// --- Main Component ---

export async function start(props: LoomAppProps) {
  const instance = render(<LoomApp {...props} />);
  await instance.waitUntilExit();
}

export function LoomApp({
  engine,
  configStore,
  options,
  initialNode,
  initialRoot,
  debug,
  onExit
}: LoomAppProps) {
  useApp();
  const [currentNodeId, setCurrentNodeId] = useState<NodeId>(initialNode.id);
  const [root, setRoot] = useState<RootData>(initialRoot);
  const [history, setHistory] = useState<DisplayMessage[]>([]);
  const [children, setChildren] = useState<NodeData[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [siblings, setSiblings] = useState<NodeId[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [focusedElement, setFocusedElement] = useState<'input' | 'children'>(
    'input'
  );
  const [selectedChildIndex, setSelectedChildIndex] = useState<number>(0);
  const [status, setStatus] = useState<
    | { status: 'loading' }
    | { status: 'idle' }
    | { status: 'error'; error: string }
  >({ status: 'idle' });
  const stopLoading = () => {
    setStatus(status =>
      status.status === 'loading' ? { status: 'idle' } : status
    );
  };

  // --- Data Fetching Effect ---
  useEffect(() => {
    const fetchData = async () => {
      engine.log(`Current node: ${currentNodeId}`);
      setStatus({ status: 'loading' });
      try {
        // Set current node ID
        await configStore.update({
          currentNodeId
        });

        // Fetch history
        const nodeHistory = await engine
          .getForest()
          .getPath({ from: undefined, to: currentNodeId });

        const displayMessages: DisplayMessage[] = nodeHistory.path.map(
          node => ({
            ...node.message,
            nodeId: node.id
          })
        );

        setRoot(nodeHistory.root);
        setHistory(displayMessages);

        // Fetch children
        const fetchedChildren = await engine
          .getForest()
          .getChildren(currentNodeId);
        setChildren(fetchedChildren);

        const node = await engine.getForest().getNode(currentNodeId);
        const parentNode = node?.parent_id
          ? await engine.getForest().getNode(node.parent_id)
          : null;
        setSiblings(parentNode?.child_ids || [currentNodeId]);

        // Clear the unread tag
        if (node?.parent_id) {
          await engine.getForest().updateNodeMetadata(node.id, {
            ...node.metadata,
            tags: node.metadata.tags?.filter(tag => tag !== UNREAD_TAG)
          });
        }

        setSelectedChildIndex(0); // Reset selection when node changes
      } catch (err) {
        engine.log(err);
        setStatus({
          status: 'error',
          error: formatError(err, debug)
        });
      } finally {
        stopLoading();
      }
    };
    fetchData();
  }, [engine, currentNodeId, debug, configStore, refresh]);

  // --- Input Handling ---
  const handleCommandAndUpdate = async (commandWithArgs: CommandWithArgs) => {
    setStatus({ status: 'loading' });
    let nextNodeId = currentNodeId;

    try {
      if (commandWithArgs[0] === 'exit') {
        onExit(); // Call the passed exit handler
        return;
      } else {
        nextNodeId = await handleCommand(
          commandWithArgs,
          engine,
          currentNodeId
        );
      }

      if (nextNodeId !== currentNodeId) {
        setCurrentNodeId(nextNodeId);
      }

      if (commandWithArgs[0] === 'generate') {
        setRefresh(prev => prev + 1);
      }
    } catch (err) {
      engine.log(err);
      setStatus({
        status: 'error',
        error: formatError(err, debug)
      });
    } finally {
      stopLoading();
    }
  };

  const handleInput = async (value: string) => {
    if (status.status === 'loading') return;
    if (!value.trim()) return;
    setInputValue('');
    setStatus({ status: 'loading' });
    try {
      const parsedCommand = parseCommand(value, options);
      if (parsedCommand) {
        await handleCommandAndUpdate(parsedCommand);
      } else {
        await handleCommandAndUpdate([
          'user',
          {
            content: value,
            generateOptions: options
          }
        ]);
      }
    } catch (e) {
      engine.log(e);
      setStatus({ status: 'error', error: formatError(e, debug) });
    } finally {
      stopLoading();
    }
  };

  // --- Keyboard Input Hook (Focus, Navigation) ---

  // Global keys
  useInput(async (input, key) => {
    if (key.ctrl && input === 'c') {
      onExit();
      return;
    }
  });

  // Input field
  useInput(
    async (input, key) => {
      if (status.status === 'loading') return;
      if (key.return) {
        await handleInput(inputValue);
      } else if (key.upArrow && key.meta) {
        await handleCommandAndUpdate(['up', undefined]);
      } else if (key.leftArrow && key.meta) {
        await handleCommandAndUpdate(['left', undefined]);
      } else if (key.rightArrow && key.meta) {
        await handleCommandAndUpdate(['right', undefined]);
      } else if (key.downArrow && children.length > 0) {
        setFocusedElement('children');
        setSelectedChildIndex(0);
      }
    },
    {
      isActive: focusedElement === 'input'
    }
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

  const context = [...history];
  if (focusedElement === 'children' && sortedChildren[selectedChildIndex]) {
    const previewMessage = sortedChildren[selectedChildIndex].message;
    context.push({
      ...previewMessage,
      nodeId: sortedChildren[selectedChildIndex].id,
      isChildPreview: true
    });
  }

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* 1. History View */}
      <Box flexDirection="column" height={historyHeight} overflowY="hidden">
        {root?.config.systemPrompt && (
          <Text color="magenta">[System] {root?.config.systemPrompt}</Text>
        )}
        {context.slice(-historyHeight).map((msg, index) => {
          const key = `${msg.nodeId}-${index}`;
          const color = msg.isChildPreview
            ? 'gray'
            : msg.role === 'user'
              ? 'green'
              : 'cyan';
          const text =
            msg.role == 'user' ? `[USER] ${msg.content}` : `${msg.content}`;
          return (
            <Text key={key} color={color}>
              {text}
            </Text>
          );
        })}
        {context.length > historyHeight && (
          <Text dimColor>
            ... ({context.length - historyHeight} older messages hidden)
          </Text>
        )}
        {/* spacer if history is short to push input down */}
        {context.length <= historyHeight && <Box flexGrow={1} />}
      </Box>

      {/* Status Line */}
      <Box
        borderStyle="round"
        borderColor={
          status.status === 'loading'
            ? 'yellow'
            : status.status === 'error'
              ? 'red'
              : 'gray'
        }
        paddingX={1}
      >
        {status.status === 'loading' ? (
          <Text color={'yellow'}>...</Text>
        ) : status.status === 'error' ? (
          <Text color="red">{status.error}</Text>
        ) : (
          <>
            <Text color="gray">
              [{root?.id}:{root?.config.model}] node {currentNodeId}
              {siblings.length > 1 &&
                `(${siblings.indexOf(currentNodeId) + 1}/${siblings.length})`}
            </Text>
          </>
        )}
      </Box>

      {/* 2. Input Field */}
      <Box>
        <Text color={focusedElement === 'input' ? 'blue' : 'grey'}>{'> '}</Text>
        <TextInput
          value={inputValue}
          onChange={setInputValue}
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
          <Text dimColor>{sortedChildren.length} children:</Text>
          <ScrollableSelectList
            items={sortedChildren}
            maxVisibleItems={maxChildren}
            focusedIndex={
              focusedElement === 'children' ? selectedChildIndex : undefined
            }
            onFocusedIndexChange={(index: number | undefined) => {
              if (index === undefined) {
                setFocusedElement('input');
              } else {
                setSelectedChildIndex(index);
              }
            }}
            onSelectItem={item => {
              setCurrentNodeId(item.id);
              setFocusedElement('input');
            }}
            renderItem={(child, isFocused) => {
              const isUnread =
                child.parent_id && child.metadata.tags?.includes(UNREAD_TAG);
              const rawPreview = `${isUnread ? '* ' : ''}[${child.id}] (${child.message.role}) ${child.message.content.replace(/\n/g, ' ')}`;
              const preview =
                rawPreview.substring(0, 80) +
                (rawPreview.length > 80 ? '...' : '');
              return (
                <Text
                  key={child.id}
                  color={isFocused ? 'blue' : undefined}
                  bold={isUnread}
                  inverse={isFocused}
                >
                  {preview}
                </Text>
              );
            }}
          />
        </Box>
      )}
    </Box>
  );
}

interface ScrollableSelectListProps<T> {
  items: T[];
  maxVisibleItems: number;
  focusedIndex: number | undefined;
  onFocusedIndexChange: (newIndex: number | undefined) => void;
  onSelectItem: (item: T, index: number) => void;
  renderItem: (item: T, isFocused: boolean) => React.ReactNode;
}

export function ScrollableSelectList<Item>({
  items,
  maxVisibleItems,
  focusedIndex,
  renderItem,
  onFocusedIndexChange,
  onSelectItem
}: ScrollableSelectListProps<Item>) {
  const isActive = focusedIndex !== undefined;

  const [firstVisibleIndex, setFirstVisibleIndex] = useState(0);
  useEffect(() => {
    const currentLastVisibleIndex = firstVisibleIndex + maxVisibleItems - 1;
    let nextFirstVisibleIndex = firstVisibleIndex;

    if (focusedIndex === undefined) {
      nextFirstVisibleIndex = 0;
    } else if (focusedIndex < firstVisibleIndex) {
      nextFirstVisibleIndex = focusedIndex;
    } else if (focusedIndex > currentLastVisibleIndex) {
      nextFirstVisibleIndex = focusedIndex - maxVisibleItems + 1;
    }

    const maxPossibleFirstIndex = Math.max(0, items.length - maxVisibleItems);
    nextFirstVisibleIndex = Math.max(
      0,
      Math.min(nextFirstVisibleIndex, maxPossibleFirstIndex)
    );

    if (nextFirstVisibleIndex !== firstVisibleIndex) {
      setFirstVisibleIndex(nextFirstVisibleIndex);
    }
  }, [focusedIndex, maxVisibleItems, items.length, firstVisibleIndex]);

  const visibleItems = items.slice(
    firstVisibleIndex,
    firstVisibleIndex + maxVisibleItems
  );

  useInput(
    async (_input, key) => {
      if (items.length === 0) return;
      if (focusedIndex === undefined) return;
      if (key.return) {
        // Navigate to selected child
        const selectedItem = items[focusedIndex];
        if (selectedItem) {
          onSelectItem(selectedItem, focusedIndex);
        }
        return;
      }

      let newFocusedIndex = focusedIndex;
      if (key.upArrow) {
        newFocusedIndex = focusedIndex - 1;
      } else if (key.downArrow) {
        newFocusedIndex = focusedIndex + 1;
      }

      if (newFocusedIndex < 0) {
        onFocusedIndexChange(undefined);
      }

      if (newFocusedIndex < items.length && newFocusedIndex !== focusedIndex) {
        onFocusedIndexChange(newFocusedIndex);
      }
    },
    { isActive }
  );

  return (
    <>
      {visibleItems.map((item, i) => {
        const index = firstVisibleIndex + i;
        const isFocused = isActive && index === focusedIndex;
        return renderItem(item, isFocused);
      })}
    </>
  );
}
