import { useState, useCallback, useEffect } from 'react';
import type { NodeData } from '@ankhdt/loom-engine';
import { Prism } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

type NodeMetadata = NodeData['metadata'];

interface MetadataModalProps {
  isOpen: boolean;
  onClose: () => void;
  metadata: NodeMetadata | null;
}

export function MetadataModal({
  isOpen,
  onClose,
  metadata
}: MetadataModalProps) {
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  const handleCopy = useCallback(async () => {
    if (!metadata) return;

    try {
      const formattedJson = JSON.stringify(metadata, null, 2);
      await navigator.clipboard.writeText(formattedJson);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy metadata:', err);
    }
  }, [metadata]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        event.preventDefault();
      }
    },
    [onClose]
  );

  // Close modal on escape key
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen || !metadata) {
    return null;
  }

  const formattedJson = JSON.stringify(metadata, null, 2);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-terminal-bg border border-terminal-border rounded-lg shadow-xl w-full max-w-4xl overflow-hidden">
        <div className="p-4 border-b border-terminal-border flex justify-between items-center">
          <h2 className="text-lg font-semibold">Node Metadata</h2>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleCopy}
              className={`px-3 py-1 rounded text-sm border transition-colors ${
                copySuccess
                  ? 'border-green-500 bg-green-500/20 text-green-300'
                  : 'border-terminal-border hover:bg-terminal-border'
              }`}
            >
              {copySuccess ? 'Copied!' : 'Copy JSON'}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1 rounded text-sm border border-terminal-border hover:bg-terminal-border"
            >
              Close
            </button>
          </div>
        </div>

        <div className="p-4 max-h-[70vh] overflow-y-auto">
          <pre className="bg-terminal-bg/50 border border-terminal-border rounded p-4 text-sm font-mono whitespace-pre-wrap overflow-x-auto">
            <code className="text-terminal-text">
              <Prism
                PreTag={'div'}
                children={formattedJson}
                language={'json'}
                style={atomDark}
              />
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}
