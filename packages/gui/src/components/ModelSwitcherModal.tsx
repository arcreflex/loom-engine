import { useState, useEffect, useCallback } from 'react';
import { listModels } from '../api';

interface ModelSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitch: (modelString: string, systemPrompt?: string) => Promise<void>;
}

export function ModelSwitcherModal({
  isOpen,
  onClose,
  onSwitch
}: ModelSwitcherModalProps) {
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [selectedModelString, setSelectedModelString] = useState<string>('');
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      let isMounted = true;
      setIsLoading(true); // Start loading when opening and fetching
      setError(null); // Clear previous errors
      setSystemPrompt(''); // Clear system prompt

      listModels()
        .then(models => {
          if (isMounted) {
            setModelOptions(models);
            // Set default selection *after* models are loaded
            if (models.length > 0) {
              setSelectedModelString(models[0]);
            }
            setIsLoading(false); // Stop loading after fetching
          }
        })
        .catch(err => {
          if (isMounted) {
            console.error('Failed to fetch models:', err);
            setError('Failed to load available models.');
            setIsLoading(false); // Stop loading on error
          }
        });

      return () => {
        isMounted = false;
      }; // Cleanup function
    }
  }, [isOpen]); // Re-fetch if modal re-opens

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setIsLoading(true);
      setError(null);

      try {
        await onSwitch(selectedModelString, systemPrompt.trim() || undefined);
        // No need to call onClose here, the parent component will handle it via onSwitch success/failure
      } catch (err) {
        console.error('Switch model error:', err);
        setError(
          err instanceof Error ? err.message : 'An unknown error occurred'
        );
        setIsLoading(false); // Stop loading on error
      }
      // Do not set isLoading to false on success, parent will close modal
    },
    [selectedModelString, systemPrompt, onSwitch]
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-terminal-bg border border-terminal-border rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
        <form onSubmit={handleSubmit}>
          <div className="p-4 border-b border-terminal-border">
            <h2 className="text-lg font-semibold">
              Switch Model / Conversation
            </h2>
          </div>

          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {error && (
              <div className="p-3 bg-red-900/50 border border-red-700 text-red-200 rounded">
                Error: {error}
              </div>
            )}

            <div>
              <label
                htmlFor="model-select"
                className="block text-sm font-medium mb-1"
              >
                Model:
              </label>
              <select
                id="model-select"
                value={selectedModelString}
                onChange={e => setSelectedModelString(e.target.value)}
                disabled={isLoading || modelOptions.length === 0} // Disable if loading or no models
                className="w-full p-2 bg-terminal-bg/50 border border-terminal-border rounded focus:outline-none focus:ring-1 focus:ring-terminal-focus"
              >
                {isLoading && <option>Loading models...</option>}
                {!isLoading && modelOptions.length === 0 && (
                  <option>No models found</option>
                )}
                {modelOptions.map(modelString => (
                  <option key={modelString} value={modelString}>
                    {modelString}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="system-prompt"
                className="block text-sm font-medium mb-1"
              >
                System Prompt (Optional):
              </label>
              <textarea
                id="system-prompt"
                rows={5}
                value={systemPrompt}
                onChange={e => setSystemPrompt(e.target.value)}
                disabled={isLoading}
                placeholder="Enter system prompt for new conversation or leave blank..."
                className="w-full p-2 bg-terminal-bg/50 border border-terminal-border rounded focus:outline-none focus:ring-1 focus:ring-terminal-focus font-mono text-sm"
              />
            </div>
          </div>

          <div className="p-4 border-t border-terminal-border flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 rounded border border-terminal-border hover:bg-terminal-border disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 rounded bg-terminal-focus/80 hover:bg-terminal-focus text-white disabled:opacity-50"
            >
              {isLoading ? 'Switching...' : 'Switch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
