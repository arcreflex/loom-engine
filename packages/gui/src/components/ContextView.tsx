// packages/gui/src/components/ContextView.tsx
import { useRef, useEffect, useState } from 'react';
import { MessageItem } from './MessageItem';
import { type DisplayMessage } from '../types';
import { NodeData, NodeId, RootConfig } from '@ankhdt/loom-engine';

interface ContextViewProps {
  messages: DisplayMessage[];
  root: RootConfig | null;
  siblings: NodeData[];
  onNavigateToNode: (nodeId: NodeId) => void;
  previewChild: NodeData | null;
  onCopy?: (content: string, notice: string) => void;
}

export function ContextView({
  messages,
  root,
  siblings,
  previewChild,
  onCopy
}: ContextViewProps) {
  // When the head (current node) changes--and on initial load--we want to scroll to it.
  const [lastScrolledToHead, setLastScrolledToHead] = useState<NodeId | null>(
    null
  );

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null); // Ref for the scroll container
  const previewContainerRef = useRef<HTMLDivElement | null>(null); // Ref for the preview child
  const lastMessageRef = useRef<HTMLDivElement | null>(null); // Ref for the last actual message
  const [showScrollButton, setShowScrollButton] = useState(false);

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

  return (
    // Add ref to the scrollable container
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4"
      onScroll={handleScroll}
    >
      <div className="max-w-4xl mx-auto w-full">
        {/* System message */}
        {root?.systemPrompt && (
          <div className="system-prompt">
            <div className="font-bold mb-2 text-terminal-text/80">
              System Prompt
            </div>
            <div className="whitespace-pre-wrap">{root.systemPrompt}</div>
          </div>
        )}

        {/* Regular messages */}
        {messages.map((message, index) => (
          <MessageItem
            key={message.nodeId}
            message={message}
            isLast={index === messages.length - 1 && !previewChild}
            siblings={index === messages.length - 1 ? siblings : undefined}
            ref={index === messages.length - 1 ? lastMessageRef : undefined}
            onCopy={onCopy}
          />
        ))}

        {/* --- Child Preview --- */}
        {previewChild && (
          <div
            ref={previewContainerRef}
            className="mt-4 pt-4 border-t-2 border-dashed border-terminal-border/30"
          >
            <MessageItem
              key={`preview-${previewChild.id}`}
              message={{ ...previewChild.message, nodeId: previewChild.id }}
              isLast={true}
              siblings={undefined}
              isPreview={true} // Add isPreview prop
            />
          </div>
        )}

        {/* Empty state */}
        {messages.length === 0 && !root?.systemPrompt && !previewChild && (
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
