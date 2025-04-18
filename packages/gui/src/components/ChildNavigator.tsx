import { NodeData, NodeId, Role } from '@ankhdt/loom-engine';

interface ChildNavigatorProps {
  children: NodeData[];
  onNavigate: (nodeId: NodeId) => void;
  onFocusChange: (nodeData: NodeData | null) => void;
  previewChild: NodeData | null;
  disabled?: boolean;
}

function getRoleColorClass(role: Role): string {
  return role === 'user' ? 'text-terminal-user' : 'text-terminal-assistant';
}

export function ChildNavigator({
  children,
  onNavigate,
  onFocusChange,
  previewChild,
  disabled = false
}: ChildNavigatorProps) {
  if (children.length === 0) {
    return null;
  }

  const handleFocus = (child: NodeData) => {
    onFocusChange(child);
  };

  const handleBlur = () => {
    onFocusChange(null);
  };

  return (
    <div className="border border-terminal-border rounded p-1 mt-2 mx-4 mb-2">
      <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
        {children.map(child => {
          const isFocused = previewChild?.id === child.id;

          return (
            <button
              key={child.id}
              onClick={() => onNavigate(child.id)}
              disabled={disabled}
              onMouseEnter={() => handleFocus(child)}
              onMouseLeave={handleBlur}
              onFocus={() => handleFocus(child)}
              onBlur={handleBlur}
              className={`
                block max-w-4xl mx-auto w-full text-left p-1 rounded text-xs transition-colors
                hover:bg-terminal-selection focus:outline-none focus:ring-1 focus:ring-terminal-focus focus:bg-terminal-selection
                ${isFocused ? 'bg-terminal-selection/80' : ''} // Highlight focused item
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent
                overflow-hidden text-ellipsis whitespace-nowrap
              `}
            >
              <span
                className={`font-medium ${getRoleColorClass(child.message.role)}`}
              >
                {child.message.role === 'user' ? 'User: ' : ''}
              </span>
              <span className="text-terminal-text/90">
                {child.message.content.replace(/\n/g, ' ')}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
