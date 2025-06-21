import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import fuzzysort from 'fuzzysort';
import { type Command } from '../types';
import { useAppStore } from '../state';

interface CommandPaletteProps {
  commands: Command[];
}

export function CommandPalette({ commands }: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Get state and actions directly from the store
  const isOpen = useAppStore(state => state.paletteState.status === 'open');
  const query = useAppStore(state =>
    state.paletteState.status === 'open' ? state.paletteState.query : ''
  );
  const selectedIndex = useAppStore(state =>
    state.paletteState.status === 'open' ? state.paletteState.selectedIndex : 0
  );
  const status = useAppStore(state => state.status);
  const {
    closePalette,
    updatePaletteQuery,
    setPaletteSelectedIndex,
    setStatusError
  } = useAppStore(state => state.actions);

  // State for the filtered/displayed commands
  const [displayedCommands, setDisplayedCommands] =
    useState<Command[]>(commands);

  // Debounced filtering effect
  useEffect(() => {
    if (!isOpen) return;

    // If the query is empty, show all commands immediately
    if (!query) {
      setDisplayedCommands(commands);
      return;
    }

    const debounceTimeout = setTimeout(() => {
      const results = fuzzysort
        .go(query, commands, {
          keys: ['title', 'description'],
          limit: 10,
          threshold: -10000 // Allow very low matches
        })
        .map(result => result.obj);
      setDisplayedCommands(results);
    }, 50); // 50ms debounce delay

    return () => clearTimeout(debounceTimeout);
  }, [query, commands, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Handle command execution
  const handleExecuteCommand = async (command: Command) => {
    closePalette();
    try {
      await command.execute();
    } catch (error) {
      console.error('Failed to execute command:', command.id, error);
      if (status.type !== 'error') {
        setStatusError(
          error instanceof Error
            ? error.message
            : `Command ${command.id} failed`
        );
      }
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (
      displayedCommands.length > 0 &&
      selectedIndex >= 0 &&
      selectedIndex < displayedCommands.length
    ) {
      const selectedItemElement = document.getElementById(
        `command-item-${displayedCommands[selectedIndex].id}`
      );
      if (selectedItemElement) {
        selectedItemElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, displayedCommands]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closePalette();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setPaletteSelectedIndex((selectedIndex + 1) % displayedCommands.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setPaletteSelectedIndex(
        selectedIndex === 0 ? displayedCommands.length - 1 : selectedIndex - 1
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = displayedCommands[selectedIndex];
      if (selected) {
        handleExecuteCommand(selected);
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
            onChange={e => updatePaletteQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="max-h-80 overflow-y-auto">
          {displayedCommands.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              No commands found
            </div>
          ) : (
            <ul className="divide-y divide-terminal-border">
              {displayedCommands.map((command, index) => (
                <li
                  key={command.id}
                  id={`command-item-${command.id}`} // Added id for scrolling
                  className={`p-3 cursor-pointer ${index === selectedIndex ? 'bg-terminal-selection' : 'hover:bg-terminal-border'}`}
                  onClick={() => {
                    setPaletteSelectedIndex(index);
                    handleExecuteCommand(command);
                  }}
                >
                  <div className="font-medium">{command.title}</div>
                  {command.description && (
                    <div className="text-xs text-gray-400 line-clamp-1">
                      {command.description}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
