import React, {
  useEffect,
  useCallback,
  useMemo,
  useState,
  useRef
} from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node as ReactFlowNode,
  type Edge,
  MarkerType,
  Position,
  BackgroundVariant,
  ReactFlowProvider
} from 'reactflow';
import dagre from '@dagrejs/dagre'; // Import dagre
import { NodeStructure } from '../api';
import type {
  Bookmark,
  NodeId,
  Role,
  RootConfig,
  RootId
} from '@ankhdt/loom-engine';

import 'reactflow/dist/style.css';
import './GraphView.css';
import { DisplayMessage } from '../types';
import { HoverPreviewTooltip } from './HoverPreviewTooltip';

type GraphMode = 'single-root' | 'multi-root' | 'compact';
export type GraphViewState = {
  mode: GraphMode;
} & (
  | {
      previewNodeId: NodeId;
      previewRoot: RootConfig;
      previewMessages: DisplayMessage[];
    }
  | {
      previewNodeId: null;
    }
);

// Props definition
interface GraphViewProps {
  state: GraphViewState;
  topology: NodeStructure[]; // Receive topology data from parent
  currentNodeId: NodeId | null;
  currentPath: NodeId[];
  currentRootId: RootId | null;
  bookmarks: Bookmark[];
  onNodeClick: (nodeId: NodeId) => void; // Callback for node clicks
  onNodeHover: (nodeId: NodeId | null) => void; // Callback for node hover
}

type Node = ReactFlowNode<{
  role: Role | 'system';
  isCurrent: boolean;
  originalId: NodeId;
  timestamp: string;
}>;

// Dagre layout setup
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));
const nodeWidth = 30;
const nodeHeight = 30;

const getLayoutedElements = (
  nodes: Node[],
  edges: Edge[],
  direction = 'TB'
) => {
  // Configure dagre graph
  dagreGraph.setGraph({ rankdir: direction, nodesep: 30, ranksep: 50 });

  nodes.forEach(node => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach(edge => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Calculate layout
  dagre.layout(dagreGraph);

  // Apply calculated positions to nodes
  nodes.forEach(node => {
    const nodeWithPosition = dagreGraph.node(node.id);

    // Set connection points based on layout direction
    if (direction === 'TB') {
      node.targetPosition = Position.Top;
      node.sourcePosition = Position.Bottom;
    } else {
      node.targetPosition = Position.Left;
      node.sourcePosition = Position.Right;
    }

    // Center the node
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2
    };

    return node;
  });

  return { nodes, edges };
};

export function GraphView(props: GraphViewProps) {
  return (
    <ReactFlowProvider>
      <GraphViewInner {...props} />
    </ReactFlowProvider>
  );
}

function GraphViewInner({
  state,
  topology: rawTopology,
  bookmarks,
  currentNodeId,
  currentPath,
  currentRootId,
  onNodeClick,
  onNodeHover
}: GraphViewProps) {
  // useNodesState/useEdgesState for React Flow internal state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [tooltipPosition, setTooltipPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const topology = useMemo(() => {
    let filteredTopology = rawTopology;
    if (state.mode === 'single-root') {
      filteredTopology = rawTopology.filter(n => n.root_id === currentRootId);
    } else if (state.mode === 'compact') {
      filteredTopology = rawTopology.filter(n => {
        if (currentNodeId === n.id) return true;
        if (currentPath.includes(n.id)) return true;
        if (currentRootId === n.id) return true;
        if (n.parent_id && currentPath.includes(n.parent_id)) return true;
      });
    }
    return filteredTopology;
  }, [rawTopology, currentNodeId, currentPath, currentRootId, state.mode]);

  const bookmarkMap = useMemo(() => {
    const map = new Map<NodeId, Bookmark>();
    for (const bookmark of bookmarks) {
      map.set(bookmark.nodeId, bookmark);
    }
    return map;
  }, [bookmarks]);

  // Effect to process topology data and update React Flow state
  useEffect(() => {
    if (topology.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    // --- Transformation Logic ---
    const rfNodes: Node[] = topology.map((nodeStruct): Node => {
      const isCurrent = nodeStruct.id === currentNodeId;
      const isAncestor =
        !isCurrent &&
        (currentPath.includes(nodeStruct.id) ||
          nodeStruct.id === currentRootId);

      const isBookmark = bookmarkMap.has(nodeStruct.id);

      // Format date if timestamp is available
      let formattedDate = '';
      try {
        if (nodeStruct.timestamp) {
          const date = new Date(nodeStruct.timestamp);
          formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
      } catch (_error) {
        console.warn('Invalid timestamp format', nodeStruct.timestamp);
      }

      const width = isBookmark || isCurrent ? nodeWidth * 1.333 : nodeWidth;
      const height = isBookmark || isCurrent ? nodeHeight * 1.333 : nodeHeight;

      const style: React.CSSProperties = {
        width,
        height,
        borderRadius: Math.min(width, height) / 2
      };

      // Basic node definition - position is set by layout later
      return {
        id: nodeStruct.id,
        position: { x: 0, y: 0 }, // Placeholder position
        data: {
          role: nodeStruct.role,
          isCurrent,
          originalId: nodeStruct.id,
          timestamp: formattedDate
        },
        style,
        className: `
          role-${nodeStruct.role}
          ${isCurrent ? `current` : ''}
          ${isAncestor ? `ancestor` : ''}
          ${isBookmark ? `bookmark` : ''}
        `
      };
    });

    const rfEdges: Edge[] = topology
      .filter(nodeStruct => nodeStruct.parent_id) // Only create edges for nodes with parents
      .map(nodeStruct => {
        // Determine edge styling based on role
        let edgeStyle: React.CSSProperties = {};
        let markerColor = '#666';

        if (nodeStruct.role === 'user') {
          edgeStyle = {
            strokeWidth: 1,
            stroke: 'rgba(86, 182, 194, 0.6)' // User color with opacity
          };
          markerColor = 'rgba(86, 182, 194, 0.6)';
        } else if (nodeStruct.role === 'assistant') {
          edgeStyle = {
            strokeWidth: 1,
            stroke: 'rgba(188, 148, 246, 0.6)' // Assistant color with opacity
          };
          markerColor = 'rgba(188, 148, 246, 0.6)';
        } else {
          edgeStyle = {
            strokeWidth: 1,
            stroke: 'rgba(170, 170, 170, 0.6)' // Default/System color
          };
          markerColor = 'rgba(170, 170, 170, 0.6)';
        }

        // Check if edge connects to current node
        const isCurrentNodeEdge =
          nodeStruct.id === currentNodeId ||
          nodeStruct.parent_id === currentNodeId;
        if (isCurrentNodeEdge) {
          edgeStyle.strokeWidth = 2; // Make current path thicker
          edgeStyle.stroke = 'rgba(88, 166, 255, 0.7)'; // Highlight color
          markerColor = 'rgba(88, 166, 255, 0.7)';
        }

        return {
          id: `e-${nodeStruct.parent_id}-${nodeStruct.id}`,
          source: nodeStruct.parent_id!, // Non-null assertion as we filtered
          target: nodeStruct.id,
          style: edgeStyle,
          animated: isCurrentNodeEdge, // Animate current path edges
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 8,
            height: 8,
            color: markerColor
          }
        };
      });
    // --- End Transformation ---

    // Calculate layout using current layout direction
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      rfNodes,
      rfEdges,
      'TB'
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [
    topology,
    currentNodeId,
    currentPath,
    currentRootId,
    setNodes,
    setEdges,
    bookmarkMap
  ]);

  // Click handler for nodes
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Extract original ID from node data and call the prop
      if (node.data.originalId) {
        onNodeClick(node.data.originalId);
      }
    },
    [onNodeClick] // Dependency array for useCallback
  );

  const { previewNodeId, previewRoot, previewMessages } = state.previewNodeId
    ? state
    : {};

  // Prepare the content for the tooltip
  const tooltipContent = useMemo(() => {
    if (!previewNodeId || !previewMessages || !previewRoot) {
      return null;
    }
    const maxMessagesToShow = 3;
    const relevantMessages = [];
    if (previewMessages.length) {
      relevantMessages.push(previewMessages[0]);
      const remaining = Math.min(
        maxMessagesToShow - 1,
        previewMessages.length - 1
      );
      if (remaining > 0) {
        relevantMessages.push(...previewMessages.slice(-remaining));
      }
    }

    const renderedMessages = [];
    for (let i = 0; i < relevantMessages.length; i++) {
      const msg = relevantMessages[i];
      renderedMessages.push(
        <div
          key={msg.nodeId}
          className={`
            pt-1 pl-2 border-l
            ${msg.role === 'user' ? 'border-terminal-user' : 'border-terminal-assistant'}
            ${i < relevantMessages.length - 1 ? 'text-gray-400' : ''}
          `}
        >
          <div className="line-clamp-3">
            <span className={`font-semibold uppercase text-xs`}>
              {msg.role === 'user' ? 'User: ' : ''}
            </span>
            {msg.content}
          </div>
        </div>
      );
    }

    const bookmark = bookmarkMap.get(previewNodeId);

    return (
      <div className="flex flex-col text-sm leading-tight">
        {bookmark && (
          <div className="text-terminal-focus text-xs">{bookmark.title}</div>
        )}
        <div className="text-gray-300 text-xs mb-2 line-clamp-2">
          [{previewRoot.model}] {previewRoot.systemPrompt}
        </div>
        {renderedMessages[0]}
        {previewMessages.length > maxMessagesToShow && (
          <div className="text-gray-400 text-xs mt-1">
            ...({previewMessages.length - maxMessagesToShow} more messages)
          </div>
        )}
        {renderedMessages.slice(1)}
      </div>
    );
  }, [previewNodeId, bookmarkMap, previewMessages, previewRoot]);

  const onNodeHoverRef = useRef(onNodeHover);
  useEffect(() => {
    onNodeHoverRef.current = onNodeHover;
  }, [onNodeHover]);

  const debouncedUpdateTooltip = useMemo(
    () =>
      debounce((e: React.MouseEvent) => {
        const nodeId = findNodeUnderMouse(e);
        if (nodeId) {
          onNodeHoverRef.current(nodeId);
          setTooltipPosition({ x: e.clientX, y: e.clientY });
        } else {
          onNodeHoverRef.current(null);
          setTooltipPosition(null);
        }
      }, 50),
    []
  );

  // cancel debounced function on unmount
  useEffect(() => {
    return () => debouncedUpdateTooltip.cancel();
  }, [debouncedUpdateTooltip]);

  return (
    <div
      style={{ height: '100%', width: '100%' }}
      onMouseMove={debouncedUpdateTooltip}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick} // Attach the click handler
        fitView // Automatically fits the view on load/change
        fitViewOptions={{ padding: 0.2 }} // Add some padding
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        minZoom={0.1}
        maxZoom={2}
        className="bg-terminal-bg/50" // Use Tailwind classes for background
      >
        <Controls showInteractive={false} />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>
      <HoverPreviewTooltip
        isVisible={state.previewNodeId !== null}
        content={tooltipContent}
        position={tooltipPosition}
      />
    </div>
  );
}

function findNodeUnderMouse(event: React.MouseEvent) {
  // Find using the .react-flow__node class and grab the data-id, assuming it's a NodeId
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  const nodeElement = target.closest('.react-flow__node');
  if (nodeElement) {
    const nodeId = nodeElement.getAttribute('data-id');
    if (nodeId) {
      return nodeId as NodeId;
    }
  }
  return null;
}

function debounce<Args extends unknown[]>(
  func: (...args: Args) => void,
  delay: number
): ((...args: Args) => void) & { cancel: () => void } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let timeoutId: any;
  const debouncedFunc: ((...args: Args) => void) & { cancel: () => void } = (
    ...args: Args
  ) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func(...args);
    }, delay);
  };
  debouncedFunc.cancel = () => {
    clearTimeout(timeoutId);
  };
  return debouncedFunc;
}
