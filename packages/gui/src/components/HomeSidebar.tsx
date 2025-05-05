import type { Bookmark, RootData } from '@ankhdt/loom-engine';
import { BookmarksList } from './BookmarksList';
import { RootsList } from './RootsList';

interface Props {
  bookmarks: Bookmark[];
  roots: RootData[];
  loading: boolean;
  error: string | null;
}

export function HomeSidebar({ bookmarks, roots, loading, error }: Props) {
  if (loading) return <div className="p-4">Loading…</div>;
  if (error) return <div className="p-4 text-red-400">{error}</div>;

  return (
    <div className="p-6 space-y-8 overflow-y-auto text-terminal-text font-mono h-screen">
      <section>
        <h2 className="text-xl mb-3 text-terminal-focus">Bookmarks</h2>
        <BookmarksList bookmarks={bookmarks} />
      </section>
      <section>
        <h2 className="text-xl mb-3 text-terminal-focus">
          Roots (mode + system prompt)
        </h2>
        <RootsList roots={roots} />
      </section>
    </div>
  );
}
