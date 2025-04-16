import React, { useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import type { Action, AppContext } from './App.tsx';
import {
  deleteNodes,
  handleAsyncAction,
  navigateToParent,
  navigateToSibling,
  save,
  type AsyncAction
} from './async-actions.ts';
import fuzzysort from 'fuzzysort';

export type PaletteState =
  | {
      status: 'closed';
    }
  | {
      status: 'command';
      query: string;
      items: PaletteCommandItem[];
      selectedIndex: number;
    }
  | {
      status: 'save';
      title: string;
    };

export interface PaletteCommandItem {
  id: string;
  label: string;
  action: AsyncAction | Action;
}

export type PaletteAction =
  | {
      type: 'OPEN';
    }
  | { type: 'CLOSE' }
  | { type: 'START_SAVE' }
  | { type: 'SET_SAVE_TITLE'; payload: { title: string } }
  | { type: 'UPDATE_QUERY'; payload: { query: string } } // Just update query
  | { type: 'SET_ITEMS'; payload: { items: PaletteCommandItem[] } } // Set filtered items
  | { type: 'NAVIGATE'; payload: { direction: 'up' | 'down' } };

export function reducePaletteState(
  state: PaletteState,
  action: PaletteAction
): PaletteState {
  switch (action.type) {
    case 'OPEN':
      return {
        status: 'command',
        query: '',
        items: APP_COMMANDS,
        selectedIndex: 0
      };
    case 'CLOSE':
      return { status: 'closed' };
    case 'UPDATE_QUERY':
      if (state.status !== 'command') return state;
      return { ...state, query: action.payload.query };
    case 'SET_ITEMS':
      if (state.status !== 'command') return state;
      return {
        ...state,
        items: action.payload.items,
        selectedIndex: 0
      };
    case 'NAVIGATE': {
      if (state.status !== 'command' || state.items.length === 0) {
        return state;
      }
      const current = state.selectedIndex;
      const maxIndex = state.items.length - 1;
      let next = current;
      if (action.payload.direction === 'up') {
        next = current <= 0 ? maxIndex : current - 1;
      } else {
        next = current >= maxIndex ? 0 : current + 1;
      }
      return { ...state, selectedIndex: next };
    }
    case 'START_SAVE': {
      return { status: 'save', title: '' };
    }
    case 'SET_SAVE_TITLE': {
      if (state.status !== 'save') return state;
      return { ...state, title: action.payload.title };
    }
  }
}

const APP_COMMANDS: PaletteCommandItem[] = [
  {
    id: 'up',
    label: 'Navigate to parent',
    action: navigateToParent
  },
  {
    id: 'left',
    label: 'Previous sibling',
    action: ctx => navigateToSibling(ctx, { direction: 'left' })
  },
  {
    id: 'right',
    label: 'Next sibling',
    action: ctx => navigateToSibling(ctx, { direction: 'right' })
  },
  {
    id: 'save',
    label: 'Save bookmark',
    action: {
      type: 'PALETTE',
      payload: { type: 'START_SAVE' }
    }
  },
  {
    id: 'delete',
    label: 'Delete current node',
    action: ctx => deleteNodes(ctx, [ctx.state.currentNodeId])
  },
  {
    id: 'delete-siblings',
    label: 'Delete all siblings',
    action: async ctx => {
      const node = await ctx.engine
        .getForest()
        .getNode(ctx.state.currentNodeId);
      if (!node?.parent_id) {
        return;
      }
      const parent = await ctx.engine.getForest().getNode(node.parent_id);
      return deleteNodes(
        ctx,
        parent?.child_ids.filter(id => id !== ctx.state.currentNodeId) || []
      );
    }
  },
  {
    id: 'delete-children',
    label: 'Delete children',
    action: async ctx => {
      const node = await ctx.engine
        .getForest()
        .getNode(ctx.state.currentNodeId);
      return deleteNodes(ctx, node?.child_ids || []);
    }
  }
];

function generateAllCommands(ctx: AppContext): PaletteCommandItem[] {
  const commands = [...APP_COMMANDS];
  const bookmarks = ctx.configStore.get().bookmarks || [];
  for (const bookmark of bookmarks) {
    commands.push({
      id: 'bookmark-' + bookmark.title,
      label: `Load bookmark: ${bookmark.title}`,
      action: {
        type: 'SET_CURRENT_NODE_ID',
        payload: { nodeId: bookmark.nodeId }
      }
    });
  }
  return commands;
}

function filterCommands(query: string, commands: PaletteCommandItem[]) {
  const match = fuzzysort.go(query, commands, {
    key: item => item.label,
    all: true
  });
  return match;
}

interface PaletteProps {
  appContext: AppContext;
  height: number;
}

export function CommandPalette({ appContext, height }: PaletteProps) {
  const { state: appState, dispatch } = appContext;
  const dispatchPaletteAction = (paletteAction: PaletteAction) =>
    dispatch({ type: 'PALETTE', payload: paletteAction });
  const state = appState.paletteState;

  const status = state.status;

  // Filter logic is now triggered by query changes
  useEffect(() => {
    if (status !== 'command') return;
    // Regenerate and filter whenever the query changes
    const allCommands = generateAllCommands(appContext);
    const filteredItems = filterCommands(state.query, allCommands);
    dispatchPaletteAction({
      type: 'SET_ITEMS',
      payload: { items: filteredItems.map(x => x.obj) }
    });
  }, [state.status === 'command' && state.query, state.status]); // TODO: re-run filter if bookmarks change

  // Input handling
  useInput(
    (input, key) => {
      if (key.escape) {
        dispatchPaletteAction({ type: 'CLOSE' });
      } else if (key.upArrow) {
        dispatchPaletteAction({
          type: 'NAVIGATE',
          payload: { direction: 'up' }
        });
      } else if (key.downArrow) {
        dispatchPaletteAction({
          type: 'NAVIGATE',
          payload: { direction: 'down' }
        });
      } else if (key.return) {
        if (state.status === 'closed') return;
        if (state.status === 'save') {
          const title = state.title.trim();
          if (!title) {
            dispatch({
              type: 'SET_STATUS_ERROR',
              payload: { error: 'Bookmark title cannot be empty' }
            });
          } else {
            dispatchPaletteAction({ type: 'CLOSE' });
            handleAsyncAction(appContext, ctx => save(ctx, { title }));
          }
        } else if (
          state.items &&
          state.items.length > 0 &&
          state.selectedIndex >= 0
        ) {
          const selectedCommand = state.items[state.selectedIndex];
          dispatchPaletteAction({ type: 'CLOSE' });
          if (typeof selectedCommand.action === 'function') {
            handleAsyncAction(appContext, selectedCommand.action);
          } else {
            dispatch(selectedCommand.action);
          }
        }
      }
    },
    { isActive: state.status !== 'closed' }
  );

  if (state.status === 'closed') {
    return null;
  }

  if (state.status === 'save') {
    return (
      <Box
        margin={1}
        height={height - 2}
        borderStyle="round"
        borderColor="blue"
        padding={1}
        flexDirection="column"
      >
        <TextInput
          value={state.title}
          onChange={value =>
            dispatchPaletteAction({
              type: 'SET_SAVE_TITLE',
              payload: { title: value }
            })
          }
          placeholder="Bookmark title..."
          focus={true}
        />
      </Box>
    );
  }

  const maxVisibleItems = height - 2 - 2 - 2 - 1; // 2 each for border, padding, margin, and 1 for input
  const visibleItems = state.items.slice(0, maxVisibleItems);

  return (
    <Box
      margin={1}
      height={height - 2}
      borderStyle="round"
      borderColor="blue"
      padding={1}
      flexDirection="column"
    >
      <Box>
        <TextInput
          value={state.query}
          onChange={value =>
            // Just dispatch query update, useEffect handles filtering
            dispatchPaletteAction({
              type: 'UPDATE_QUERY',
              payload: { query: value }
            })
          }
          placeholder="Run command..."
          focus={state.status === 'command'} // Auto-focus
        />
      </Box>
      <Box flexDirection="column" marginTop={1}>
        {/* Render items */}
        {visibleItems.length === 0 && <Text>No matching commands.</Text>}
        {visibleItems.map((item, index) => (
          <Text
            key={item.id} // Use the unique command ID
            inverse={index === state.selectedIndex}
            color={index === state.selectedIndex ? 'blue' : undefined}
          >
            {item.label}
          </Text>
        ))}
        {state.items.length > maxVisibleItems && (
          <Text dimColor>
            ... {state.items.length - maxVisibleItems} more ...
          </Text>
        )}
      </Box>
    </Box>
  );
}
