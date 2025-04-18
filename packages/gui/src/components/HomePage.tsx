import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listBookmarks, listRoots } from '../api';
import type { Bookmark, RootData } from '@ankhdt/loom-engine';

export function HomePage() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [roots, setRoots] = useState<RootData[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    Promise.all([listBookmarks(), listRoots()])
      .then(([fetchedBookmarks, fetchedRoots]) => {
        if (isMounted) {
          // API returns roots sorted by most recent first already
          setBookmarks(fetchedBookmarks);
          setRoots(fetchedRoots);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('Failed to load home page data:', err);
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load data');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        Loading...
      </div>
    );
  }

  if (error) {
    return <div className="p-4 text-red-400">Error loading data: {error}</div>;
  }

  const truncate = (str: string | undefined, len: number) => {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto text-terminal-text font-mono h-screen overflow-y-auto">
      <section className="mb-8">
        <h2 className="text-xl font-medium mb-3 text-terminal-focus">
          Bookmarks
        </h2>
        {bookmarks.length === 0 ? (
          <p className="text-terminal-text/70">No bookmarks saved yet.</p>
        ) : (
          <ul className="space-y-2">
            {bookmarks.map(bookmark => (
              <li key={bookmark.title}>
                <Link
                  to={`/nodes/${encodeURIComponent(bookmark.nodeId)}`}
                  className="text-terminal-text hover:text-terminal-focus hover:underline transition-colors block p-2 bg-terminal-bg/50 hover:bg-terminal-selection/30 rounded border border-terminal-border/50"
                >
                  📖 {bookmark.title}
                  <span className="text-xs text-terminal-text/50 ml-2">
                    ({bookmark.nodeId.split('/').pop()})
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-xl font-medium mb-3 text-terminal-focus">
          Roots (mode + system prompt)
        </h2>
        {roots.length === 0 ? (
          <p className="text-terminal-text/70">No conversations found.</p>
        ) : (
          <ul className="space-y-2">
            {roots.map(root => (
              <li key={root.id}>
                <Link
                  to={`/nodes/${encodeURIComponent(root.id)}`}
                  className="text-terminal-text hover:text-terminal-focus hover:underline transition-colors block p-2 bg-terminal-bg/50 hover:bg-terminal-selection/30 rounded border border-terminal-border/50"
                >
                  <span className="font-semibold">
                    {root.config.provider}/{root.config.model}
                  </span>
                  <span className="text-sm text-terminal-text/70 ml-2">
                    {truncate(root.config.systemPrompt, 80) ||
                      '(No system prompt)'}
                  </span>
                  <span className="text-xs text-terminal-text/50 ml-2 float-right">
                    {new Date(root.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
