import { Link } from 'react-router-dom';
import type { RootData } from '@ankhdt/loom-engine';

const truncate = (str: string | undefined, len: number) =>
  !str ? '' : str.length > len ? str.slice(0, len) + '…' : str;

export function RootsList({ roots }: { roots: RootData[] }) {
  if (!roots.length)
    return <p className="text-terminal-text/70">No conversations found.</p>;
  return (
    <ul className="space-y-2">
      {roots.map(rt => (
        <li key={rt.id}>
          <Link
            to={`/nodes/${encodeURIComponent(rt.id)}`}
            className="block p-2 bg-terminal-bg/50 hover:bg-terminal-selection/30 rounded border border-terminal-border/50 hover:underline"
          >
            <span className="font-semibold">Conversation</span>
            <span className="text-sm text-terminal-text/70 ml-2">
              {truncate(rt.config.systemPrompt, 80) || '(No system prompt)'}
            </span>
            <span className="text-xs text-terminal-text/50 ml-2 float-right">
              {new Date(rt.createdAt).toLocaleDateString()}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
