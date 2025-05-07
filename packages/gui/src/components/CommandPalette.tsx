import { useEffect, useRef, KeyboardEvent } from 'react';
import fuzzysort from 'fuzzysort';
import { type Command } from '../types';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: Command[];
  onExecuteCommand: (command: Command) => void;
  // New controlled component props
  query: string;
  selectedIndex: number;
  onQueryChange: (query: string) => void;
  onSelectedIndexChange: (index: number) => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  commands,
  onExecuteCommand,
  query,
  selectedIndex,
  onQueryChange,
  onSelectedIndexChange
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter commands based on query
  const filteredCommands = query
    ? fuzzysort
        .go(query, commands, {
          keys: ['title', 'category'],
          limit: 10,
          threshold: -10000 // Allow very low matches
        })
        .map(result => result.obj)
    : commands;

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    if (
      filteredCommands.length > 0 &&
      selectedIndex >= 0 &&
      selectedIndex < filteredCommands.length
    ) {
      const selectedItemElement = document.getElementById(
        `command-item-${filteredCommands[selectedIndex].id}`
      );
      if (selectedItemElement) {
        selectedItemElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, filteredCommands]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      onSelectedIndexChange((selectedIndex + 1) % filteredCommands.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      onSelectedIndexChange(
        selectedIndex === 0 ? filteredCommands.length - 1 : selectedIndex - 1
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = filteredCommands[selectedIndex];
      if (selected) {
        onExecuteCommand(selected);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-terminal-bg border border-terminal-border rounded-lg shadow-xl w-full max-w-md overflow-hidden">
        <div className="p-2 border-b border-terminal-border">
          <input
            ref={inputRef}
            type="text"
            className="w-full bg-transparent p-2 outline-none"
            placeholder="Type a command or search..."
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="max-h-80 overflow-y-auto">
          {filteredCommands.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              No commands found
            </div>
          ) : (
            <ul className="divide-y divide-terminal-border">
              {filteredCommands.map((command, index) => (
                <li
                  key={command.id}
                  id={`command-item-${command.id}`} // Added id for scrolling
                  className={`p-3 cursor-pointer ${index === selectedIndex ? 'bg-terminal-selection' : 'hover:bg-terminal-border'}`}
                  onClick={() => {
                    onSelectedIndexChange(index);
                    onExecuteCommand(command);
                  }}
                >
                  <div className="font-medium">{command.title}</div>
                  <div className="text-xs text-gray-400">
                    {command.category}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
