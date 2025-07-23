import { useEffect, useCallback, useMemo } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { StatusBar } from './components/StatusBar';
import { CommandPalette } from './components/CommandPalette';
import { ModelSwitcherModal } from './components/ModelSwitcherModal.tsx';
import { NavigationManager } from './components/NavigationManager';
import HomeView from './components/HomeView';
import { NodeView } from './views/NodeView';
import type { Command } from './types';
import { parseModelString, KNOWN_MODELS } from '@ankhdt/loom-engine/browser';
import { useAppStore } from './state';

// Main App Component - Unified Shell
function App() {
  // Use granular selectors to prevent re-renders on palette state changes
  const status = useAppStore(state => state.status);
  const isModelSwitcherOpen = useAppStore(state => state.isModelSwitcherOpen);
  const currentNode = useAppStore(state => state.currentNode);
  const siblings = useAppStore(state => state.siblings);
  const bookmarks = useAppStore(state => state.bookmarks);
  const currentProviderName = useAppStore(state => state.currentProviderName);
  const currentModelName = useAppStore(state => state.currentModelName);
  const roots = useAppStore(state => state.roots);
  const children = useAppStore(state => state.children);
  const messages = useAppStore(state => state.messages);
  const root = useAppStore(state => state.root);
  const presets = useAppStore(state => state.presets);
  const activePresetName = useAppStore(state => state.activePresetName);
  const renderingMode = useAppStore(state => state.renderingMode);
  const actions = useAppStore(state => state.actions);

  // Only get paletteState for keyboard shortcuts (not for rendering)
  const paletteStatus = useAppStore(state => state.paletteState.status);

  // Find the current bookmark for this node
  const currentBookmark = currentNode?.id
    ? bookmarks.find(b => b.nodeId === currentNode?.id) || null
    : null;

  const currentRootId =
    currentNode?.parent_id === undefined
      ? currentNode?.id
      : currentNode?.root_id;

  // Initialize app data on mount
  useEffect(() => {
    actions.fetchInitialData();
  }, [actions]);

  // Copy to clipboard helper
  const copyToClipboard = useCallback(
    async (text: string, successMessage: string) => {
      try {
        await navigator.clipboard.writeText(text);
        console.log(successMessage);
      } catch (err) {
        console.error('Failed to copy text: ', err);
        actions.setStatusError('Failed to copy to clipboard');
      }
    },
    [actions]
  );

  // Build list of available commands
  const commands = useMemo((): Command[] => {
    const cmds: Command[] = [
      {
        id: 'set-role-user',
        title: 'Set Input Role: User',
        execute: async () => actions.setInputRole('user')
      },
      {
        id: 'set-role-assistant',
        title: 'Set Input Role: Assistant',
        execute: async () => actions.setInputRole('assistant')
      },
      {
        id: 'toggle-generate-submit',
        title: `Toggle Generate on Submit (${useAppStore.getState().requestOnSubmit ? 'ON' : 'OFF'})`,
        execute: async () => actions.toggleRequestOnSubmit()
      },
      {
        id: 'navigate-parent',
        title: 'Navigate to Parent',
        disabled: !currentNode?.parent_id || !root || !messages.length,
        execute: actions.navigateToParent
      },
      {
        id: 'generate',
        title: 'Generate Completion',
        disabled: !currentNode || status.type === 'loading',
        execute: async () => {
          if (!currentNode) return;
          await actions.handleGenerate();
        }
      }
    ];

    // Add bookmark commands
    if (currentNode) {
      if (currentBookmark) {
        cmds.push({
          id: `delete-bookmark-${currentBookmark.title}`,
          title: `Remove Bookmark: ${currentBookmark.title}`,
          disabled: status.type === 'loading',
          execute: async () => {
            await actions.deleteBookmark(currentBookmark.title);
          }
        });
      } else {
        cmds.push({
          id: 'create-bookmark',
          title: 'Save Bookmark',
          disabled: status.type === 'loading',
          execute: async () => {
            const title = prompt('Enter bookmark title:');
            if (title) {
              await actions.saveBookmark(title);
            }
          }
        });
      }
    }

    // Add bookmark navigation commands
    bookmarks.forEach(bookmark => {
      const rootId = bookmark.rootId;
      const root = roots.find(r => r.id === rootId);
      if (!root) return;
      cmds.push({
        id: `navigate-bookmark-${bookmark.title}`,
        title: `Go to: ${bookmark.title}`,
        description: `System Prompt: ${root.config.systemPrompt ?? '(empty system prompt)'}`,
        disabled:
          status.type === 'loading' || bookmark.nodeId === currentNode?.id,
        execute: async () => {
          actions.setPendingNavigation(bookmark.nodeId);
        }
      });
    });

    // Add root navigation commands
    roots.forEach(root => {
      const systemPrompt =
        root.config.systemPrompt?.replace(/[\n\r]+/g, ' ') ?? '(empty)';
      cmds.push({
        id: `navigate-root-${root.id}`,
        title: `Go to conversation`,
        description: `System Prompt: ${systemPrompt}`,
        disabled: status.type === 'loading' || root.id === currentRootId,
        execute: async () => {
          actions.setPendingNavigation(root.id);
        }
      });
    });

    // Add node management commands
    if (currentNode?.id) {
      const nodeId = currentNode.id;
      cmds.push({
        id: 'delete-children',
        title: 'Delete All Children',
        description: `Delete ${children.length} children`,
        disabled: !children.length || status.type === 'loading',
        execute: async () => {
          if (window.confirm('Delete all children of this node?')) {
            await actions.deleteChildren(nodeId);
          }
        }
      });

      const hasSiblings = siblings.length > 1;
      cmds.push({
        id: 'delete-siblings',
        title: 'Delete All Siblings (Except This)',
        description: `Delete ${siblings.length} siblings`,
        disabled: !hasSiblings || status.type === 'loading',
        execute: async () => {
          if (
            window.confirm(
              'Delete all siblings of this node (excluding this one)?'
            )
          ) {
            await actions.deleteSiblings(nodeId);
          }
        }
      });

      const nodeIsRoot = messages.length === 0;
      cmds.push({
        id: 'delete-node',
        title: 'Delete This Node',
        disabled: nodeIsRoot || status.type === 'loading',
        execute: async () => {
          if (window.confirm('Delete this node and all its descendants?')) {
            await actions.deleteNode(nodeId);
          }
        }
      });
    }

    // Add Copy commands
    if (messages.length > 0) {
      cmds.push({
        id: 'copy-context-markdown',
        title: 'Copy Current Context (Markdown)',
        disabled: !currentNode || messages.length === 0,
        execute: async () => {
          let markdownText = '';
          if (root?.systemPrompt) {
            markdownText += `**System Prompt:**\n\n${root.systemPrompt}\n\n`;
          }
          messages.forEach(message => {
            const rolePrefix =
              message.role === 'user' ? '**User:**' : '**Assistant:**';
            markdownText += `${rolePrefix}\n\n${message.content}\n\n`;
          });
          await copyToClipboard(
            markdownText,
            'Context copied to clipboard as Markdown'
          );
        }
      });
    }

    cmds.push({
      id: 'copy-children',
      title: 'Copy All Children',
      disabled: !currentNode || children.length === 0,
      execute: async () => {
        let text = '';
        for (let i = 0; i < children.length; i++) {
          text += `======= completion ${i} =======\n`;
          text += children[i].message.content + '\n';
          text += `======= end completion ${i} =======\n\n`;
        }
        await copyToClipboard(text, 'Children copied to clipboard');
      }
    });

    // Add preset commands
    cmds.push({
      id: 'activate-preset-default',
      title: `Activate Preset: Default Parameters ${activePresetName === null ? '✓' : ''}`,
      disabled: status.type === 'loading' || activePresetName === null,
      execute: async () => {
        await actions.setActivePreset(null);
      }
    });

    Object.entries(presets).forEach(([name, _preset]) => {
      const isActive = activePresetName === name;
      cmds.push({
        id: `activate-preset-${name}`,
        title: `Activate Preset: ${name} ${isActive ? '✓' : ''}`,
        disabled: status.type === 'loading' || isActive,
        execute: async () => {
          await actions.setActivePreset(name);
        }
      });
    });

    // Add model selection commands
    Object.entries(KNOWN_MODELS).forEach(([modelString, _config]) => {
      try {
        const { provider, model } = parseModelString(modelString);
        const isCurrentModel =
          currentProviderName === provider && currentModelName === model;
        cmds.push({
          id: `use-model-${modelString}`,
          title: `Use Model: ${modelString} ${isCurrentModel ? '✓' : ''}`,
          disabled: status.type === 'loading' || isCurrentModel,
          execute: async () => {
            actions.setCurrentModel(provider, model);
          }
        });
      } catch (error) {
        console.warn(
          'Failed to parse model string for command:',
          modelString,
          error
        );
      }
    });

    // Add utility commands
    cmds.push({
      id: 'create-new-conversation',
      title: 'Create New Conversation (System Prompt)...',
      disabled: status.type === 'loading' || status.type === 'initializing',
      execute: async () => {
        actions.openModelSwitcher();
      }
    });

    cmds.push({
      id: 'graph-view-mode-single-root',
      title: 'Graph View: Single Root',
      execute: async () => {
        actions.setGraphViewMode('single-root');
      }
    });

    cmds.push({
      id: 'graph-view-mode-multi-root',
      title: 'Graph View: Multi Root',
      execute: async () => {
        actions.setGraphViewMode('multi-root');
      }
    });

    cmds.push({
      id: 'graph-view-mode-compact',
      title: 'Graph View: Compact',
      execute: async () => {
        actions.setGraphViewMode('compact');
      }
    });

    cmds.push({
      id: 'toggle-rendering-mode',
      title: `Change to ${renderingMode === 'raw' ? 'Markdown' : 'Raw'} Rendering Mode`,
      execute: async () => {
        actions.toggleRenderingMode();
      }
    });

    return cmds;
  }, [
    currentNode,
    root,
    messages,
    status.type,
    bookmarks,
    roots,
    children,
    siblings,
    activePresetName,
    presets,
    currentBookmark,
    currentRootId,
    currentProviderName,
    currentModelName,
    renderingMode,
    actions,
    copyToClipboard
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Command palette
      if ((event.metaKey || event.ctrlKey) && event.key === 'p') {
        event.preventDefault();
        if (paletteStatus === 'closed') {
          actions.openPalette();
        } else {
          actions.closePalette();
        }
      }

      // Navigate to parent (Escape) only when palette is closed
      if (event.key === 'Escape' && paletteStatus === 'closed') {
        event.preventDefault();
        actions.navigateToParent();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions, paletteStatus]);

  return (
    <div className="flex flex-col h-screen bg-terminal-bg text-terminal-text">
      <NavigationManager />
      <StatusBar
        currentNodeId={currentNode?.id ?? null}
        siblings={siblings}
        bookmark={currentBookmark}
        status={status}
        currentProviderName={currentProviderName}
        currentModelName={currentModelName}
        onNavigateToParent={actions.navigateToParent}
      />

      <main className="flex-1 min-h-0">
        <Routes>
          <Route index element={<HomeView />} />
          <Route path="/nodes/:nodeId" element={<NodeView />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <CommandPalette commands={commands} />

      <ModelSwitcherModal
        isOpen={isModelSwitcherOpen}
        onClose={actions.closeModelSwitcher}
        onSwitch={actions.createNewRoot}
      />
    </div>
  );
}

export default App;
