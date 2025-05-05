import { Link } from 'react-router-dom';
import type { Bookmark } from '@ankhdt/loom-engine';

export function BookmarksList({ bookmarks }: { bookmarks: Bookmark[] }) {
  if (!bookmarks.length)
    return <p className="text-terminal-text/70">No bookmarks saved yet.</p>;
  return (
    <ul className="space-y-2">
      {bookmarks.map(bm => (
        <li key={bm.title}>
          <Link
            to={`/nodes/${encodeURIComponent(bm.nodeId)}`}
            className="block p-2 bg-terminal-bg/50 hover:bg-terminal-selection/30 rounded border border-terminal-border/50 hover:underline"
          >
            📖 {bm.title}
            <span className="text-xs text-terminal-text/50 ml-2">
              ({bm.nodeId.split('/').pop()})
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
