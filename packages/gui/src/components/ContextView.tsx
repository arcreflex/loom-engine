// packages/gui/src/components/ContextView.tsx
import { useRef, useEffect, useState, useMemo } from 'react';
import { CoalescedMessage, MessageItem } from './MessageItem';
import { PENDING_GENERATION, type DisplayMessage } from '../types';
import {
  NodeData,
  NodeId,
  RootConfig,
  type ContentBlock
} from '@ankhdt/loom-engine';
import TextareaAutosize from 'react-textarea-autosize';

interface ContextViewProps {
  messages: DisplayMessage[];
  root: RootConfig | null;
  siblings: NodeData[];
  onNavigateToNode: (nodeId: NodeId) => void;
  previewChild: typeof PENDING_GENERATION | NodeData | null;
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
  const [lastScrolledToHead, setLastScrolledToHead] = useState<NodeId | null>(
    null
  );
  const [containerHeight, setContainerHeight] = useState(0);

  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [promptText, setPromptText] = useState(root?.systemPrompt || '');

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
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMessageRef = useRef<HTMLDivElement | null>(null);
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

  const handleScroll = () => {
    if (!containerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

    setShowScrollButton(distanceFromBottom > 200);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(entries => {
      const entry = entries[0];
      if (entry) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (
      messages.length &&
      lastScrolledToHead !== messages[messages.length - 1].nodeId
    ) {
      setLastScrolledToHead(messages[messages.length - 1].nodeId);
      lastMessageRef.current?.scrollIntoView({
        block: 'start'
      });
      return;
    } else if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isScrolledNearBottom =
        scrollHeight - scrollTop - clientHeight < 100;

      if (isScrolledNearBottom || messages.length < 10) {
        if (lastMessageRef.current) {
          lastMessageRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        } else if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'end'
          });
        }
      }
    }
  }, [messages.length, previewChild, lastScrolledToHead, messages]);

  const messagesToRender = coalescedMessages;

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4"
      onScroll={handleScroll}
    >
      <div className="max-w-4xl mx-auto w-full pt-12">
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

        {previewChild === PENDING_GENERATION && (
          <div>
            <div
              className={`animate-pulse mt-2 px-3 py-2
                        text-terminal-text/50 bg-terminal-bg
                          border border-dashed border-terminal-border/80`}
            >
              ...
            </div>
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

        <div
          className="relative overflow-hidden"
          style={{ height: `${containerHeight / 2}px` }}
          ref={messagesEndRef}
        >
          {previewChild && previewChild !== PENDING_GENERATION && (
            <div className={` absolute inset-0 `}>
              <MessageItem
                key={`preview-${previewChild.id}`}
                message={{
                  role: previewChild.message.role,
                  messages: [
                    {
                      ...legacyToV2Preview(previewChild),
                      nodeId: previewChild.id
                    } as unknown as import('../types').DisplayMessage
                  ]
                }}
                isLast={true}
                siblings={undefined}
                isPreview={true}
                onEditSave={async () => {}}
              />
            </div>
          )}
        </div>
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

// Convert a legacy NodeData.message into a minimal V2-shaped message for preview rendering only
function legacyToV2Preview(node: NodeData): {
  role: 'user' | 'assistant' | 'tool';
  content: ContentBlock[];
  tool_call_id?: string;
} {
  const m = node.message as unknown as {
    role: 'user' | 'assistant' | 'tool';
    content: string | ContentBlock[] | null;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
    tool_call_id?: string;
  };

  // If already V2 (content is an array), just return as-is with proper typing
  if (Array.isArray(m.content)) {
    const out = {
      role: m.role,
      content: m.content
    } as {
      role: 'user' | 'assistant' | 'tool';
      content: ContentBlock[];
    } & Partial<{ tool_call_id: string }>;
    if (m.role === 'tool' && m.tool_call_id) out.tool_call_id = m.tool_call_id;
    return out;
  }

  const blocks: ContentBlock[] = [];
  if (typeof m.content === 'string' && m.content.trim().length > 0) {
    blocks.push({ type: 'text', text: m.content });
  }
  if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
    for (const tc of m.tool_calls) {
      let params: Record<string, unknown> = {};
      try {
        params = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
      } catch (e) {
        // surface parse errors in preview rather than silently dropping details
         
        console.warn(
          'Failed to parse tool arguments JSON in preview:',
          e,
          tc.function.arguments
        );
        params = {
          _raw: tc.function.arguments,
          _parseError: true
        } as Record<string, unknown>;
      }
      blocks.push({
        type: 'tool-use',
        id: tc.id,
        name: tc.function.name,
        parameters: params
      });
    }
  }

  // Ensure non-empty: if still empty, insert an empty text block for user/tool to satisfy rendering
  if (blocks.length === 0) {
    blocks.push({ type: 'text', text: '' });
  }

  const out: {
    role: 'user' | 'assistant' | 'tool';
    content: ContentBlock[];
    tool_call_id?: string;
  } = {
    role: m.role,
    content: blocks
  };
  if (m.role === 'tool' && m.tool_call_id) {
    out.tool_call_id = m.tool_call_id;
  }
  return out;
}
