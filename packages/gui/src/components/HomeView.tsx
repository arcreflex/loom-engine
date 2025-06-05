import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import {
  getEntireGraph,
  getPath,
  listBookmarks,
  listRoots,
  NodeStructure
} from '../api';
import { GraphView, type GraphViewState } from './GraphView';
import { HomeSidebar } from './HomeSidebar';
import type { Bookmark, NodeId, RootData } from '@ankhdt/loom-engine';

export default function HomeView() {
  const navigate = useNavigate();

  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [roots, setRoots] = useState<RootData[]>([]);
  const [topology, setTopology] = useState<NodeStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graphState, setGraphState] = useState<GraphViewState>({
    mode: 'multi-root',
    previewNodeId: null
  });

  useEffect(() => {
    (async () => {
      try {
        const [bms, rts, topo] = await Promise.all([
          listBookmarks(),
          listRoots(),
          getEntireGraph()
        ]);
        setBookmarks(
          bms.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        );
        setRoots(
          rts.sort((a, b) =>
            (a.config.systemPrompt ?? '').localeCompare(
              b.config.systemPrompt ?? ''
            )
          )
        );
        setTopology(topo);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
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

  return (
    <PanelGroup direction="horizontal" className="h-screen">
      <Panel
        defaultSize={25}
        minSize={20}
        className="border-r border-terminal-border/50 bg-terminal-bg/70"
      >
        <HomeSidebar
          bookmarks={bookmarks}
          roots={roots}
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
            bookmarks={bookmarks}
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
