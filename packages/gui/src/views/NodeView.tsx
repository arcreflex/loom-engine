import { useEffect, useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { ContextView } from '../components/ContextView';
import { GraphView } from '../components/GraphView';
import { InputArea } from '../components/InputArea';
import { ChildNavigator } from '../components/ChildNavigator';
import { ToolsPanel } from '../components/ToolsPanel';
import { useAppStore } from '../state';
import { getGraphTopology, NodeStructure } from '../api';
import type { NodeId } from '@ankhdt/loom-engine';

export function NodeView() {
  const { nodeId: nodeIdFromUrl } = useParams<{ nodeId: string }>();

  // Get state and actions from Zustand store
  const {
    currentNode,
    root,
    messages,
    children,
    siblings,
    inputRole,
    requestOnSubmit,
    previewChild,
    status,
    graphViewState,
    tools,
    defaultParameters,
    presets,
    activePresetName,
    actions
  } = useAppStore();

  // Local state for graph topology
  const [graphTopology, setGraphTopology] = useState<NodeStructure[]>([]);

  const currentRootId =
    currentNode?.parent_id === undefined
      ? currentNode?.id
      : currentNode?.root_id;

  // Calculate effective generation parameters
  const effectiveGenerationParams = useMemo(() => {
    if (!defaultParameters) return null;

    if (activePresetName && presets[activePresetName]) {
      return { ...defaultParameters, ...presets[activePresetName] };
    }

    return defaultParameters;
  }, [presets, activePresetName, defaultParameters]);

  // Fetch graph topology
  const fetchTopology = useCallback(async () => {
    try {
      const topologyData = await getGraphTopology();
      setGraphTopology(topologyData);
    } catch (error) {
      console.error('Failed to fetch graph topology:', error);
    }
  }, []);

  // Preview node for graph hover
  const previewNode = useCallback(
    async (nodeId: NodeId | null) => {
      actions.setGraphHoverPreview(nodeId);
    },
    [actions]
  );

  // Handle URL changes - load node data when URL changes
  useEffect(() => {
    if (nodeIdFromUrl && nodeIdFromUrl !== currentNode?.id) {
      console.log(`URL changed to: ${nodeIdFromUrl}, loading data...`);
      actions.navigateToNode(nodeIdFromUrl as NodeId);
    }
  }, [nodeIdFromUrl, currentNode?.id, actions]);

  // Refresh topology when current node changes
  useEffect(() => {
    if (currentNode?.id) {
      fetchTopology();
    }
  }, [currentNode, fetchTopology]);

  // Navigation helper
  const navigateToNode = useCallback(
    (nodeId: NodeId) => {
      if (nodeId === nodeIdFromUrl) return;
      console.log(`Setting pending navigation to node: ${nodeId}`);
      actions.setPendingNavigation(nodeId);
    },
    [actions, nodeIdFromUrl]
  );

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

  const isLoading = status.type === 'loading' || status.type === 'initializing';

  return (
    <div className="flex flex-col h-full">
      {/* Panel Group takes up remaining flexible space */}
      <PanelGroup direction="horizontal" className="flex-1">
        <Panel defaultSize={40} minSize={20}>
          <PanelGroup
            direction="vertical"
            className="h-full border-l border-terminal-border"
          >
            <Panel defaultSize={70} minSize={30}>
              <GraphView
                state={graphViewState}
                topology={graphTopology}
                bookmarks={useAppStore.getState().bookmarks}
                currentPath={messages.map(m => m.nodeId)}
                currentNodeId={currentNode?.id ?? null}
                currentRootId={currentRootId ?? null}
                onNodeClick={navigateToNode}
                onNodeHover={previewNode}
              />
            </Panel>
            <PanelResizeHandle className="h-2 bg-terminal-border hover:bg-terminal-focus transition-colors" />
            <Panel defaultSize={30} minSize={15}>
              <div className="p-4 h-full overflow-y-auto border-t border-terminal-border">
                <ToolsPanel
                  availableTools={tools.available}
                  toolGroups={tools.groups}
                  ungroupedTools={tools.ungroupedTools}
                  activeToolNames={tools.active}
                  onToggleTool={actions.toggleTool}
                  onToggleToolGroup={actions.toggleToolGroup}
                />
              </div>
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle className="w-2 bg-terminal-border hover:bg-terminal-focus transition-colors" />
        <Panel defaultSize={60} minSize={30}>
          <div className="flex flex-col h-full">
            <ContextView
              messages={messages}
              root={root}
              siblings={siblings}
              onNavigateToNode={navigateToNode}
              previewChild={previewChild}
              onCopy={copyToClipboard}
              onEditSave={actions.handleEditSave}
              onSystemPromptSave={actions.handleSystemPromptSave}
            />
          </div>
        </Panel>
      </PanelGroup>

      <InputArea
        onSend={actions.submitInput}
        disabled={isLoading}
        requestOnSubmit={requestOnSubmit}
        role={inputRole}
        generationParams={effectiveGenerationParams}
        handleLargePaste={actions.handleLargePasteSubmit}
        currentNodeId={currentNode?.id}
      />

      <ChildNavigator
        children={children}
        onNavigate={navigateToNode}
        disabled={isLoading}
        onFocusChange={nodeData => actions.setPreviewChild(nodeData)}
        previewChild={previewChild}
      />
    </div>
  );
}
