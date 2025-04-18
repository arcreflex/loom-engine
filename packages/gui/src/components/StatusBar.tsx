import { Bookmark, NodeData, RootConfig } from '@ankhdt/loom-engine';
import { Status } from '../state';

interface StatusBarProps {
  currentNodeId: string | null;
  siblings: NodeData[];
  root: RootConfig | null;
  bookmark: Bookmark | null;
  status: Status;
  onNavigateToParent: () => void;
}

export function StatusBar({
  currentNodeId,
  siblings,
  root,
  bookmark,
  status,
  onNavigateToParent
}: StatusBarProps) {
  // Find current index in siblings
  const currentIndex = currentNodeId
    ? siblings.findIndex(s => s.id === currentNodeId)
    : -1;

  const shortNodeId = currentNodeId?.includes('/')
    ? currentNodeId.split('/').pop()
    : currentNodeId;

  let statusDisplay = null;
  if (status.type === 'loading' || status.type === 'initializing') {
    statusDisplay = (
      <span className="text-yellow-400 animate-pulse">
        {status.type === 'initializing'
          ? 'Initializing...'
          : status.operation
            ? `${status.operation}...`
            : 'Processing...'}
      </span>
    );
  } else if (status.type === 'error') {
    statusDisplay = (
      <span className="text-red-400" title={status.message}>
        Error: {status.message.split('\n')[0]}
      </span>
    );
  }

  return (
    <div className="border-b border-terminal-border p-2 flex items-center justify-between text-sm bg-terminal-bg/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center space-x-4">
        {root && <span title={`Provider: ${root.provider}`}>{root.model}</span>}

        {currentNodeId && (
          <span className="font-mono text-gray-400" title={currentNodeId}>
            {shortNodeId}
          </span>
        )}

        <button
          onClick={onNavigateToParent}
          className="btn text-xl"
          disabled={!currentNodeId}
        >
          ↑
        </button>

        {siblings.length > 1 && currentIndex >= 0 && (
          <span>
            {currentIndex + 1}/{siblings.length}
          </span>
        )}
      </div>

      <div className="flex items-center space-x-4">
        {bookmark && (
          <span className="text-terminal-focus">📖 {bookmark.title}</span>
        )}

        {statusDisplay}
      </div>
    </div>
  );
}
