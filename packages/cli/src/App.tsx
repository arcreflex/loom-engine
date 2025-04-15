import React, {
  useState,
  useEffect,
  useMemo,
  useReducer,
  type Dispatch
} from 'react';
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
  handleAsyncAction,
  navigateToParent,
  navigateToSibling,
  UNREAD_TAG,
  userMessage
} from './async-actions.ts';
import { render } from 'ink';
import { formatError } from './util.ts';
import type { Config, ConfigStore } from './config.ts';
import {
  CommandPalette,
  reducePaletteState,
  type PaletteAction,
  type PaletteState
} from './CommandPalette.tsx';

// --- Interfaces ---

interface LoomAppProps {
  engine: LoomEngine;
  configStore: ConfigStore;
  options: GenerateOptions;
  initialNode: Node;
  initialRoot: RootData;
  debug: boolean;
}

type DisplayMessage =
  | (Message & {
      nodeId: NodeId;
      isChildPreview?: boolean;
    })
  | {
      role: 'system';
      content: string;
      isChildPreview?: never;
    };

export type AppContext = {
  exit: () => void;
  engine: LoomEngine;
  configStore: ConfigStore;
  dispatch: Dispatch<Action>;
  state: State;
  debug: boolean;
};

type Status =
  | { status: 'loading' }
  | { status: 'idle' }
  | { status: 'error'; error: string };

export interface State {
  currentNodeId: NodeId;
  root: RootData;
  history: DisplayMessage[];
  children: NodeData[];
  inputValue: string;
  siblings: NodeId[];
  focusedElement: 'input' | 'children' | 'palette';
  selectedChildIndex: number;
  status: Status;
  refreshToken: number;
  paletteState: PaletteState;
}

export type Action =
  | { type: 'SET_STATUS_LOADING' }
  | { type: 'SET_STATUS_IDLE' }
  | { type: 'SET_STATUS_ERROR'; payload: { error: string } }
  | {
      type: 'SET_FETCHED_DATA';
      payload: {
        history: DisplayMessage[];
        children: NodeData[];
        siblings: NodeId[];
        root: RootData;
      };
    }
  | { type: 'SET_CURRENT_NODE_ID'; payload: { nodeId: NodeId } }
  | { type: 'UPDATE_INPUT_VALUE'; payload: { value: string } }
  | { type: 'CLEAR_INPUT_VALUE' }
  | { type: 'FOCUS_INPUT' }
  | { type: 'FOCUS_CHILDREN'; payload: { index: number } } // Combines focus and selection
  | { type: 'UPDATE_SELECTED_CHILD_INDEX'; payload: { index: number } }
  | { type: 'FORCE_FETCH' }
  | {
      type: 'PALETTE';
      payload: PaletteAction;
    };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_STATUS_LOADING':
      return { ...state, status: { status: 'loading' } };
    case 'SET_STATUS_IDLE':
      // Only change if currently loading or error
      if (state.status.status !== 'idle') {
        return { ...state, status: { status: 'idle' } };
      }
      return state; // No change if already idle
    case 'SET_STATUS_ERROR':
      return {
        ...state,
        status: { status: 'error', error: action.payload.error }
      };
    case 'SET_FETCHED_DATA':
      return {
        ...state,
        history: action.payload.history,
        children: action.payload.children,
        siblings: action.payload.siblings,
        root: action.payload.root,
        status: { status: 'idle' }, // Fetch success implies idle
        selectedChildIndex: 0 // Reset selection on new data
      };
    case 'SET_CURRENT_NODE_ID':
      // Only update if the ID actually changed
      if (state.currentNodeId !== action.payload.nodeId) {
        return {
          ...state,
          currentNodeId: action.payload.nodeId,
          // Resetting children/history/siblings here is redundant,
          // as the fetch effect will handle it.
          // Status will be set to loading by the fetch effect.
          selectedChildIndex: 0 // Reset selection when node changes
        };
      }
      return state;
    case 'UPDATE_INPUT_VALUE':
      return { ...state, inputValue: action.payload.value };
    case 'CLEAR_INPUT_VALUE':
      return { ...state, inputValue: '' };
    case 'FOCUS_INPUT':
      return { ...state, focusedElement: 'input' };
    case 'FOCUS_CHILDREN':
      return {
        ...state,
        focusedElement: 'children',
        selectedChildIndex: action.payload.index
      };
    case 'UPDATE_SELECTED_CHILD_INDEX':
      if (state.focusedElement === 'children') {
        return { ...state, selectedChildIndex: action.payload.index };
      }
      return state; // Cannot select child if input is focused
    case 'FORCE_FETCH':
      return { ...state, refreshToken: state.refreshToken + 1 };
    case 'PALETTE': {
      let focusedElement = state.focusedElement;
      if (action.payload.type === 'CLOSE') {
        focusedElement = 'input';
      }
      if (action.payload.type === 'OPEN') {
        focusedElement = 'palette';
      }
      return {
        ...state,
        focusedElement,
        paletteState: reducePaletteState(state.paletteState, action.payload)
      };
    }
    default:
      // Ensure all action types are handled (useful for type checking)
      action satisfies never;
      return state;
  }
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
  debug
}: LoomAppProps) {
  const app = useApp();

  // --- Initial State ---
  const initialState: State = {
    currentNodeId: initialNode.id,
    root: initialRoot,
    history: [],
    children: [],
    inputValue: '',
    siblings: [],
    focusedElement: 'input',
    selectedChildIndex: 0,
    status: { status: 'idle' },
    paletteState: { status: 'closed' },
    refreshToken: 0
  };

  const [state, dispatch] = useReducer(reducer, initialState);

  const {
    currentNodeId,
    root,
    history,
    children,
    inputValue,
    siblings,
    focusedElement,
    selectedChildIndex,
    status
  } = state;

  // --- Data Fetching Effect ---
  useEffect(() => {
    const fetchData = async () => {
      engine.log(`Fetching data for node: ${currentNodeId}`);
      dispatch({ type: 'SET_STATUS_LOADING' });
      try {
        // Set current node ID in config store (Side effect is okay here)
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

        // Fetch children
        const fetchedChildren = await engine
          .getForest()
          .getChildren(currentNodeId);

        const node = await engine.getForest().getNode(currentNodeId);
        const parentNode = node?.parent_id
          ? await engine.getForest().getNode(node.parent_id)
          : null;
        const fetchedSiblings = parentNode?.child_ids || [currentNodeId];

        // Clear the unread tag (Side effect is okay here)
        if (node?.parent_id && node.metadata.tags?.includes(UNREAD_TAG)) {
          await engine.getForest().updateNodeMetadata(node.id, {
            ...node.metadata,
            tags: node.metadata.tags?.filter(tag => tag !== UNREAD_TAG)
          });
        }

        // Dispatch success action with all fetched data
        dispatch({
          type: 'SET_FETCHED_DATA',
          payload: {
            history: displayMessages,
            children: fetchedChildren,
            siblings: fetchedSiblings,
            root: nodeHistory.root
          }
        });
        // No need to set idle status or selected index here, reducer handles it
      } catch (err) {
        engine.log(err);
        // Dispatch error action
        dispatch({
          type: 'SET_STATUS_ERROR',
          payload: { error: formatError(err, debug) }
        });
      }
      // No finally block needed to set status idle
    };
    fetchData();
    // Depend only on currentNodeId and potentially engine/configStore/debug if they could change
  }, [engine, currentNodeId, debug, configStore]);

  const appContext: AppContext = {
    exit: () => app.exit(),
    engine,
    configStore,
    dispatch,
    state,
    debug
  };

  const handleSubmit = async (value: string) => {
    if (status.status === 'loading') return;
    if (!value.trim()) return;
    dispatch({ type: 'CLEAR_INPUT_VALUE' });
    try {
      await handleAsyncAction(appContext, ctx =>
        userMessage(ctx, { content: value, generateOptions: options })
      );
    } catch (e) {
      engine.log(e);
      dispatch({
        type: 'SET_STATUS_ERROR',
        payload: { error: formatError(e, debug) }
      });
    }
  };

  // --- Keyboard Input Hook (Focus, Navigation) ---

  // Global keys
  useInput(async (input, key) => {
    if (key.ctrl && input === 'c') {
      app.exit();
      return;
    }

    if (input === 'p' && (key.meta || key.ctrl)) {
      // Strip off "p" from the input hacky but whatever
      dispatch({
        type: 'UPDATE_INPUT_VALUE',
        payload: { value: state.inputValue.replace(/p$/i, '') }
      });

      dispatch({ type: 'PALETTE', payload: { type: 'OPEN' } });
    }
  });

  // Input field
  useInput(
    async (input, key) => {
      if (status.status === 'loading') return;
      if (key.return) {
        await handleSubmit(inputValue);
      } else if (key.upArrow && key.meta) {
        await handleAsyncAction(appContext, navigateToParent);
      } else if (key.leftArrow && key.meta) {
        await handleAsyncAction(appContext, ctx =>
          navigateToSibling(ctx, { direction: 'left' })
        );
      } else if (key.rightArrow && key.meta) {
        await handleAsyncAction(appContext, ctx =>
          navigateToSibling(ctx, { direction: 'right' })
        );
      } else if (key.downArrow && children.length > 0) {
        dispatch({ type: 'FOCUS_CHILDREN', payload: { index: 0 } });
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
  const childrenHeight = sortedChildren.length
    ? Math.min(sortedChildren.length, maxChildren) + 3
    : 0;
  const commandPaletteHeight = state.paletteState.status === 'open' ? 15 : 0;
  const fixedElementsHeight =
    inputHeight +
    statusHeight +
    childrenMargin +
    childrenHeight +
    commandPaletteHeight;

  const historyHeight = Math.max(1, process.stdout.rows - fixedElementsHeight); // Ensure at least 1 row

  const context: DisplayMessage[] = [
    {
      role: 'system',
      content: `[System] ${root?.config.systemPrompt || '(empty)'} \n`
    },
    ...history
  ];
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
      <CommandPalette appContext={appContext} height={commandPaletteHeight} />

      <ContextView context={context} height={historyHeight} />

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
        <StatusLine
          status={status}
          config={configStore.get()}
          root={root}
          currentNodeId={currentNodeId}
          siblings={siblings}
        />
      </Box>

      {/* 2. Input Field */}
      <Box>
        <Text color={focusedElement === 'input' ? 'blue' : 'grey'}>{'> '}</Text>
        <TextInput
          value={inputValue}
          onChange={value => {
            dispatch({ type: 'UPDATE_INPUT_VALUE', payload: { value } });
          }}
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
                dispatch({ type: 'FOCUS_INPUT' });
              } else {
                dispatch({
                  type: 'UPDATE_SELECTED_CHILD_INDEX',
                  payload: { index }
                });
              }
            }}
            onSelectItem={item => {
              dispatch({
                type: 'SET_CURRENT_NODE_ID',
                payload: { nodeId: item.id }
              });
              dispatch({ type: 'FOCUS_INPUT' });
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

export function ContextView({
  context,
  height
}: {
  context: DisplayMessage[];
  height: number;
}) {
  const lineCounts = context.map(msg => msg.content.split('\n').length);
  let totalLineCount = 0;
  const cumulativeLineCounts: number[] = [];
  for (const count of lineCounts) {
    totalLineCount += count;
    cumulativeLineCounts.push(totalLineCount);
  }

  let startLine = totalLineCount - height;
  if (startLine < 0) {
    startLine = 0;
  }
  // If we're omitting lines, add 1 to startLine to account for the ellipsis
  if (startLine > 0) {
    startLine += 1;
  }

  return (
    <Box flexDirection="column" height={height} overflowY="hidden">
      {startLine > 0 && (
        <Text color="gray">{`(... ${totalLineCount - height} more lines ...)\n`}</Text>
      )}
      {context.map((msg, index) => {
        const msgStartLine = cumulativeLineCounts[index] - lineCounts[0];
        const msgEndLine = cumulativeLineCounts[index];
        if (msgEndLine < startLine) {
          return null; // Skip this message
        }
        let text =
          msg.role == 'user' ? `[USER] ${msg.content}` : `${msg.content}`;
        if (msgStartLine < startLine) {
          // Remove the top (startLine - msgStartLine) lines
          const lines = msg.content.split('\n');
          const linesToRemove = startLine - msgStartLine;
          lines.splice(0, linesToRemove);
          text = lines.join('\n');
        }
        const key = msg.role === 'system' ? 'system' : msg.nodeId;

        const color = msg.isChildPreview
          ? 'gray'
          : msg.role === 'user'
            ? 'green'
            : msg.role === 'system'
              ? 'magenta'
              : 'cyan';

        return (
          <Text key={key} color={color}>
            {text}
          </Text>
        );
      })}
      {totalLineCount <= height && <Box flexGrow={1} />}
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

function StatusLine({
  status,
  config,
  root,
  currentNodeId,
  siblings
}: {
  status: Status;
  config: Config;
  root?: RootData;
  currentNodeId: NodeId;
  siblings: NodeId[];
}) {
  if (status.status === 'loading') {
    return <Text color={'yellow'}>Loading...</Text>;
  }

  if (status.status === 'error') {
    return <Text color="red">{status.error}</Text>;
  }

  const bookmarkTitle = config.bookmarks?.find(
    b => b.nodeId === currentNodeId
  )?.title;

  return (
    <>
      <Text color="gray">
        [{root?.config.model}] {currentNodeId}
      </Text>
      {siblings.length > 1 && (
        <Text color="white">
          {' '}
          ({siblings.indexOf(currentNodeId) + 1}/{siblings.length})
        </Text>
      )}
      {bookmarkTitle && (
        <Text color="cyan">
          {' ⊛ '}
          {bookmarkTitle}
        </Text>
      )}
    </>
  );
}
