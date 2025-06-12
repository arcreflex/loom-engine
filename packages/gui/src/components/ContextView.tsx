// packages/gui/src/components/ContextView.tsx
import { useRef, useEffect, useState, useMemo } from 'react';
import { CoalescedMessage, MessageItem } from './MessageItem';
import { type DisplayMessage } from '../types';
import { NodeData, NodeId, RootConfig } from '@ankhdt/loom-engine';
import TextareaAutosize from 'react-textarea-autosize';

interface ContextViewProps {
  messages: DisplayMessage[];
  root: RootConfig | null;
  siblings: NodeData[];
  onNavigateToNode: (nodeId: NodeId) => void;
  previewChild: NodeData | null;
  onCopy?: (content: string, notice: string) => void;
  onEditSave: (nodeId: NodeId, content: string) => Promise<void>;
  onSystemPromptSave: (newPrompt: string) => Promise<void>;
}

export function ContextView({
  messages,
  root,
  siblings,
  previewChild,
  onCopy,
  onEditSave,
  onSystemPromptSave
}: ContextViewProps) {
  // When the head (current node) changes--and on initial load--we want to scroll to it.
  const [lastScrolledToHead, setLastScrolledToHead] = useState<NodeId | null>(
    null
  );

  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [promptText, setPromptText] = useState(root?.systemPrompt || '');

  // Update promptText when root changes
  useEffect(() => {
    setPromptText(root?.systemPrompt || '');
  }, [root?.systemPrompt]);

  const handleSystemPromptSave = async () => {
    try {
      await onSystemPromptSave(promptText);
      setIsEditingPrompt(false);
    } catch (error) {
      console.error('Failed to save system prompt:', error);
    }
  };

  const handleSystemPromptCancel = () => {
    setIsEditingPrompt(false);
    setPromptText(root?.systemPrompt || '');
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null); // Ref for the scroll container
  const previewContainerRef = useRef<HTMLDivElement | null>(null); // Ref for the preview child
  const lastMessageRef = useRef<HTMLDivElement | null>(null); // Ref for the last actual message
  const [showScrollButton, setShowScrollButton] = useState(false);

  const coalescedMessages = useMemo(() => {
    const coalesced = [];
    let current: CoalescedMessage | undefined;
    for (const message of messages) {
      if (current?.role === message.role) {
        current.messages.push(message);
      } else {
        if (current) {
          coalesced.push(current);
        }
        current = {
          role: message.role,
          messages: [message]
        };
      }
    }

    if (current) {
      coalesced.push(current);
    }

    return coalesced;
  }, [messages]);

  // Scroll handler to detect when user scrolls away from bottom
  const handleScroll = () => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    // Show button if scrolled up more than 200px from bottom
    setShowScrollButton(distanceFromBottom > 200);
  };

  // Scroll to bottom when messages or preview change
  useEffect(() => {
    if (previewContainerRef.current) {
      // For preview, scroll to top of the preview with smooth behavior
      previewContainerRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    } else if (
      messages.length &&
      lastScrolledToHead !== messages[messages.length - 1].nodeId
    ) {
      setLastScrolledToHead(messages[messages.length - 1].nodeId);
      lastMessageRef.current?.scrollIntoView({
        block: 'start'
      });
      return;
    } else if (containerRef.current) {
      // Check if user is scrolled near the bottom before auto-scrolling
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isScrolledNearBottom =
        scrollHeight - scrollTop - clientHeight < 100; // 100px threshold

      if (isScrolledNearBottom || messages.length < 10) {
        // If near bottom OR messages are few, scroll to the last message item
        if (lastMessageRef.current) {
          lastMessageRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        } else if (messagesEndRef.current) {
          // Fallback to messagesEndRef if lastMessageRef is not set
          messagesEndRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'end'
          });
        }
      }
    }
    // Depend on messages array length and previewChild identity
  }, [messages.length, previewChild, lastScrolledToHead, messages]);

  const messagesToRender = coalescedMessages;

  return (
    // Add ref to the scrollable container
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4"
      onScroll={handleScroll}
    >
      <div className="max-w-4xl mx-auto w-full">
        {/* System message */}
        {(root?.systemPrompt || isEditingPrompt) && (
          <div className="system-prompt">
            <div className="flex justify-between items-center mb-2">
              <div className="font-bold text-terminal-text/80">
                System Prompt
              </div>
              {!isEditingPrompt && (
                <button
                  onClick={() => setIsEditingPrompt(true)}
                  className="text-xs px-2 py-1 btn opacity-50 hover:opacity-100"
                  title="Edit system prompt"
                >
                  edit
                </button>
              )}
            </div>
            {!isEditingPrompt ? (
              <div className="whitespace-pre-wrap">{root?.systemPrompt}</div>
            ) : (
              <div className="space-y-2">
                <TextareaAutosize
                  value={promptText}
                  onChange={e => setPromptText(e.target.value)}
                  className="w-full p-2 text-sm bg-gray-800 border border-gray-600 rounded resize-none focus:outline-none focus:border-blue-500"
                  placeholder="Enter system prompt..."
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleSystemPromptSave}
                    disabled={promptText === (root?.systemPrompt || '')}
                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                  <button
                    onClick={handleSystemPromptCancel}
                    className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Regular messages */}
        {messagesToRender.map((message, index) => {
          if (message.messages.length === 0) return null;
          return (
            <MessageItem
              key={message.messages[0].nodeId}
              message={message}
              isLast={index === messagesToRender.length - 1 && !previewChild}
              siblings={
                index === messagesToRender.length - 1 ? siblings : undefined
              }
              ref={
                index === messagesToRender.length - 1
                  ? lastMessageRef
                  : undefined
              }
              onCopy={onCopy}
              onEditSave={onEditSave}
            />
          );
        })}

        {/* --- Child Preview --- */}
        {previewChild && (
          <div
            ref={previewContainerRef}
            className="mt-4 pt-4 border-t-2 border-dashed border-terminal-border/30"
          >
            <MessageItem
              key={`preview-${previewChild.id}`}
              message={{
                role: previewChild.message.role,
                messages: [{ ...previewChild.message, nodeId: previewChild.id }]
              }}
              isLast={true}
              siblings={undefined}
              isPreview={true} // Add isPreview prop
              onEditSave={async () => {}} // No-op for preview
            />
          </div>
        )}

        {/* Empty state */}
        {messagesToRender.length === 0 &&
          !root?.systemPrompt &&
          !previewChild && (
            <div className="text-center p-8 text-terminal-text/50">
              No messages yet. Start a new conversation below.
            </div>
          )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to Latest button (fixed position at bottom-right) */}
      {showScrollButton && (
        <button
          onClick={() =>
            messagesEndRef.current?.scrollIntoView({
              behavior: 'smooth',
              block: 'end'
            })
          }
          className="fixed bottom-28 right-8 bg-terminal-border/80 hover:bg-terminal-border text-terminal-text rounded-full p-2 shadow-md transition-all duration-200"
          title="Scroll to Latest"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      )}
    </div>
  );
}
