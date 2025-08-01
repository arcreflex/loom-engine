// packages/gui/src/components/InputArea.tsx
import { Role } from '@ankhdt/loom-engine';
import { KeyboardEvent, useState, useRef, useEffect } from 'react'; // Modified import
import TextareaAutosize from 'react-textarea-autosize';
import type { GenerateOptions } from '../types';

interface InputAreaProps {
  onSend: (
    role: Role,
    content: string,
    generateAfter: boolean // This comes from App's state now
  ) => Promise<void>;
  role: Role; // Receive current role from App
  requestOnSubmit: boolean; // Receive status from App
  currentNodeId?: string | null; // Added currentNodeId prop
  disabled?: boolean;
  generationParams: GenerateOptions | null; // Generation parameters to display
  contextTokens?: number; // Token count for current context
  handleLargePaste?: (content: string) => void | Promise<void>; // Function to handle large paste events
}

export function InputArea({
  onSend,
  role, // Use prop
  requestOnSubmit, // Use prop
  currentNodeId, // Use prop
  disabled = false,
  generationParams,
  contextTokens,
  handleLargePaste
}: InputAreaProps) {
  const PASTE_THRESHOLD_CHARS = 500; // Threshold for what constitutes a "large" paste
  const [content, setContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null); // Added ref for the textarea

  // useEffect to focus the textarea when the currentNodeId changes or it becomes enabled
  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [currentNodeId, disabled]); // Dependencies: currentNodeId and disabled status

  const handleSubmit = async () => {
    if (disabled) return;
    setContent('');
    try {
      // Use the requestOnSubmit prop directly
      await onSend(role, content, requestOnSubmit);
    } catch (error) {
      console.error('Failed to send message:', error);
      // Maybe show an error indication here later?
    }
  };

  const handleKeyDown = async (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      // ctrl-enter = submit but don't generate
      if (event.ctrlKey) {
        try {
          event.preventDefault();
          setContent('');
          await onSend(role, content, false);
        } catch (error) {
          console.error('Failed to send message:', error);
        }
        return;
      }

      // cmd-enter = submit
      if (event.metaKey) {
        event.preventDefault();
        handleSubmit();
      }
    }
  };

  return (
    // Main container with padding
    <div className="border-t border-terminal-border p-4">
      {/* Small status line above the input */}
      <div className="flex items-center justify-between text-xs mb-1 text-terminal-text/60">
        <span>
          <span className="font-semibold uppercase">{role}</span>
        </span>
        <div className="flex items-center gap-1">
          <div
            className={`flex items-center justify-end text-xs mb-1 space-x-2 pr-1
          ${requestOnSubmit ? 'text-terminal-text' : 'text-terminal-text/50'}
            `}
          >
            {contextTokens !== undefined && (
              <span className="text-terminal-text/80 mr-2">
                ctx: {contextTokens.toLocaleString()} tok
              </span>
            )}
            {generationParams ? (
              <>
                <span>n: {generationParams.n}</span>
                <span>temp: {generationParams.temperature.toFixed(1)}</span>
                <span>max: {generationParams.max_tokens}</span>
              </>
            ) : (
              <span>Loading params...</span>
            )}
          </div>
          <span
            title={`Generate on Submit: ${requestOnSubmit ? 'ON' : 'OFF'}`}
            className={`
              inline-block w-2 h-2 rounded-full mb-1
              ${requestOnSubmit ? 'bg-green-500' : 'bg-gray-500'}
            `}
          ></span>
        </div>
      </div>

      {/* Input area container with focus ring */}
      <div className="input-area flex items-end relative">
        {' '}
        {/* Use items-end */}
        <TextareaAutosize
          ref={textareaRef} // Assigned ref to TextareaAutosize
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={event => {
            const pastedText = event.clipboardData.getData('text');
            if (
              content.trim() === '' &&
              pastedText.length > PASTE_THRESHOLD_CHARS &&
              handleLargePaste
            ) {
              event.preventDefault();
              handleLargePaste(pastedText);
            }
          }}
          disabled={disabled}
          placeholder="Type message... (Cmd+Enter to send & generate, Ctrl+Enter to send w/o generating)"
          className="w-full resize-none p-2 bg-transparent outline-none min-h-[40px]"
          minRows={1} // Start smaller
          maxRows={10} // Limit excessive growth
        />
        {/* Send button stays aligned to the bottom right */}
        <button
          onClick={handleSubmit}
          disabled={disabled}
          style={{ height: '1.675rem' }}
          className={`absolute right-2 top-2 bottom-0
                    text-sm px-2 leading-none mx-1 btn
                    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          ⌘⏎
        </button>
      </div>
    </div>
  );
}
