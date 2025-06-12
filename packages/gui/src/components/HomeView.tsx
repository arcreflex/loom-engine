import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { getEntireGraph, getPath, NodeStructure } from '../api';
import { GraphView, type GraphViewState } from './GraphView';
import { HomeSidebar } from './HomeSidebar';
import { useAppStore } from '../state';
import type { NodeId } from '@ankhdt/loom-engine';

export default function HomeView() {
  const navigate = useNavigate();

  // Get data from Zustand store
  const { bookmarks, roots, status } = useAppStore(state => ({
    bookmarks: state.bookmarks,
    roots: state.roots,
    status: state.status
  }));

  // Local state for HomeView-specific data
  const [topology, setTopology] = useState<NodeStructure[]>([]);
  const [graphState, setGraphState] = useState<GraphViewState>({
    mode: 'multi-root',
    previewNodeId: null
  });

  // Load data
  useEffect(() => {
    (async () => {
      try {
        const topo = await getEntireGraph();
        setTopology(topo);
      } catch (err) {
        console.error('Failed to load graph topology:', err);
      }
    })();
  }, []);

  const handleHover = useCallback(
    async (nodeId: NodeId | null) => {
      if (nodeId === graphState.previewNodeId) return;
      if (nodeId === null) {
        setGraphState({
          mode: 'multi-root',
          previewNodeId: null
        });
        return;
      }

      const path = await getPath(nodeId);
      const messages = path.messages;
      const root = path.root;
      setGraphState({
        mode: 'multi-root',
        previewNodeId: nodeId,
        previewRoot: root,
        previewMessages: messages
      });
    },
    [graphState.previewNodeId]
  );

  // Derived state for display
  const loading = status.type === 'loading' || status.type === 'initializing';
  const error = status.type === 'error' ? status.message : null;

  // Sort data for display
  const sortedBookmarks = bookmarks
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sortedRoots = roots
    .slice()
    .sort((a, b) =>
      (a.config.systemPrompt ?? '').localeCompare(b.config.systemPrompt ?? '')
    );

  return (
    <PanelGroup direction="horizontal" className="h-screen">
      <Panel
        defaultSize={25}
        minSize={20}
        className="border-r border-terminal-border/50 bg-terminal-bg/70"
      >
        <HomeSidebar
          bookmarks={sortedBookmarks}
          roots={sortedRoots}
          loading={loading}
          error={error}
        />
      </Panel>
      <PanelResizeHandle className="w-1 bg-terminal-border/20 hover:bg-terminal-border/40 cursor-col-resize" />
      <Panel>
        {loading ? null : topology.length === 0 ? (
          <div className="flex items-center justify-center h-full text-terminal-text/70">
            No conversations yet. Start chatting!
          </div>
        ) : (
          <GraphView
            state={graphState}
            topology={topology}
            bookmarks={sortedBookmarks}
            currentNodeId={null}
            currentPath={[]}
            currentRootId={null}
            onNodeClick={id => navigate(`/nodes/${encodeURIComponent(id)}`)}
            onNodeHover={handleHover}
          />
        )}
      </Panel>
    </PanelGroup>
  );
}
