interface ToolDefinition {
  name: string;
  description: string;
  parameters: object;
}

interface ToolsPanelProps {
  availableTools: ToolDefinition[];
  activeToolNames: string[];
  onToggleTool: (toolName: string) => void;
}

export function ToolsPanel({
  availableTools,
  activeToolNames,
  onToggleTool
}: ToolsPanelProps) {
  if (availableTools.length === 0) {
    return (
      <div className="tools-panel">
        <h3>Tools</h3>
        <p className="text-gray-500 text-sm">No tools available</p>
      </div>
    );
  }

  return (
    <div className="tools-panel">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold">Tools</h3>
        {activeToolNames.length > 0 && (
          <p className="text-xs text-gray-400">
            {activeToolNames.length} active
          </p>
        )}
      </div>
      <div className="space-y-2">
        {availableTools.map(tool => {
          const isActive = activeToolNames.includes(tool.name);
          return (
            <div key={tool.name} className="flex items-start space-x-2">
              <input
                type="checkbox"
                id={`tool-${tool.name}`}
                checked={isActive}
                onChange={() => onToggleTool(tool.name)}
                className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <label
                  htmlFor={`tool-${tool.name}`}
                  className="block text-sm text-gray-500 cursor-pointer leading-tight"
                >
                  {tool.name}: {tool.description}
                </label>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
