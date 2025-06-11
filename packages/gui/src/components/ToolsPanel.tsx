import { useState } from 'react';

interface ToolDefinition {
  name: string;
  description: string;
  parameters: object;
  group?: string;
}

interface ToolGroup {
  name: string;
  description?: string;
  tools: string[];
}

interface ToolsPanelProps {
  availableTools: ToolDefinition[];
  toolGroups: ToolGroup[];
  ungroupedTools: string[];
  activeToolNames: string[];
  onToggleTool: (toolName: string) => void;
  onToggleToolGroup: (groupName: string) => void;
}

export function ToolsPanel({
  availableTools,
  toolGroups,
  ungroupedTools,
  activeToolNames,
  onToggleTool,
  onToggleToolGroup
}: ToolsPanelProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const toggleGroupExpansion = (groupName: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName);
    } else {
      newExpanded.add(groupName);
    }
    setExpandedGroups(newExpanded);
  };

  const getToolByName = (toolName: string) =>
    availableTools.find(tool => tool.name === toolName);

  // Helper to check if all tools in a group are active
  const isGroupFullyActive = (group: ToolGroup) =>
    group.tools.every(toolName => activeToolNames.includes(toolName));

  // Helper to check if any tools in a group are active
  const isGroupPartiallyActive = (group: ToolGroup) =>
    group.tools.some(toolName => activeToolNames.includes(toolName));

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

      <div className="space-y-3">
        {/* Tool Groups */}
        {toolGroups.map(group => {
          const isExpanded = expandedGroups.has(group.name);
          const isFullyActive = isGroupFullyActive(group);
          const isPartiallyActive = isGroupPartiallyActive(group);

          return (
            <div key={group.name} className="border border-gray-600">
              {/* Group Header */}
              <div className="flex items-center space-x-2 p-2">
                <input
                  type="checkbox"
                  id={`group-${group.name}`}
                  checked={isFullyActive}
                  ref={input => {
                    if (input)
                      input.indeterminate = isPartiallyActive && !isFullyActive;
                  }}
                  onChange={() => onToggleToolGroup(group.name)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <label
                    htmlFor={`group-${group.name}`}
                    className="block text-sm font-medium text-gray-400 cursor-pointer"
                  >
                    {group.name} ({group.tools.length} tools)
                  </label>
                </div>
                <button
                  onClick={() => toggleGroupExpansion(group.name)}
                  className="text-gray-400 hover:text-gray-600 text-xs"
                >
                  {isExpanded ? '▼' : '▶'}
                </button>
              </div>

              {/* Expanded Group Tools */}
              {isExpanded && (
                <div className="p-2 space-y-2">
                  {group.tools.map(toolName => {
                    const tool = getToolByName(toolName);
                    if (!tool) return null;
                    const isActive = activeToolNames.includes(toolName);
                    return (
                      <div
                        key={toolName}
                        className="flex items-start space-x-2 pl-4"
                      >
                        <input
                          type="checkbox"
                          id={`tool-${toolName}`}
                          checked={isActive}
                          onChange={() => onToggleTool(toolName)}
                          className="mt-0.5 h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <label
                            htmlFor={`tool-${toolName}`}
                            className="block text-xs text-gray-500 cursor-pointer leading-tight"
                          >
                            {tool.name}: {tool.description}
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Ungrouped Tools */}
        {ungroupedTools.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-gray-600 mb-2">
              Individual Tools
            </h4>
            <div className="space-y-2">
              {ungroupedTools.map(toolName => {
                const tool = getToolByName(toolName);
                if (!tool) return null;
                const isActive = activeToolNames.includes(toolName);
                return (
                  <div key={toolName} className="flex items-start space-x-2">
                    <input
                      type="checkbox"
                      id={`tool-${toolName}`}
                      checked={isActive}
                      onChange={() => onToggleTool(toolName)}
                      className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <label
                        htmlFor={`tool-${toolName}`}
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
        )}
      </div>
    </div>
  );
}
