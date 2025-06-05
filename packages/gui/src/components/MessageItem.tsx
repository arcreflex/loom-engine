import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { NodeData } from '@ankhdt/loom-engine';
import { type DisplayMessage } from '../types';
import { useState, useEffect, forwardRef, ForwardedRef } from 'react';
import { Link } from 'react-router-dom';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Threshold for collapsing messages (number of lines)
const LINE_THRESHOLD = 30;

interface MessageItemProps {
  message: DisplayMessage;
  isLast: boolean;
  siblings?: NodeData[];
  isPreview?: boolean;
  onCopy?: (content: string, notice: string) => void;
}

export const MessageItem = forwardRef(
  (
    { message, siblings, isPreview, isLast, onCopy }: MessageItemProps,
    ref: ForwardedRef<HTMLDivElement>
  ) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    const messageClass =
      message.role === 'user' ? 'message-user' : 'message-assistant';
    const previewClass = isPreview ? 'opacity-70 border-l-terminal-border' : '';

    // Find current index in siblings if available
    const currentIndex =
      siblings?.findIndex(s => s.id === message.nodeId) ?? -1;

    const lineCount = message.content.split('\n').length;

    // Calculate line count and set initial collapsed state
    useEffect(() => {
      setIsCollapsed(!isLast && lineCount > LINE_THRESHOLD);
    }, [lineCount, isLast]);

    // Handle navigation between siblings
    const previousSibling =
      siblings && currentIndex > 0 && siblings[currentIndex - 1].id;
    const nextSibling =
      siblings &&
      currentIndex < siblings.length - 1 &&
      siblings[currentIndex + 1].id;

    // Toggle collapsed state
    const toggleCollapsed = () => {
      setIsCollapsed(!isCollapsed);
    };

    const renderMarkdown = (raw: string) => {
      return (
        <div>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={{
              pre({ node: _node, ...props }) {
                return <pre className="p-0 m-0 relative">{props.children}</pre>;
              },
              code(props) {
                const {
                  children,
                  className,
                  node: _node,
                  ref: _ref,
                  ...rest
                } = props;
                const match = /language-(\w+)/.exec(className || '');
                const content = String(children).replace(/\n$/, '');
                const lineCount = content.split('\n').length;
                return match || lineCount > 1 ? (
                  <>
                    <SyntaxHighlighter
                      {...rest}
                      PreTag={'div'}
                      children={content}
                      language={match?.[1]}
                      style={atomDark}
                    />
                    {onCopy && (
                      <button
                        onClick={() =>
                          onCopy(content, `Copied ${lineCount} lines`)
                        }
                        className="text-xs px-2 py-1 ml-2 btn opacity-50 hover:opacity-100 absolute right-2 bottom-2"
                        title="Copy code content"
                      >
                        copy
                      </button>
                    )}
                  </>
                ) : (
                  <code {...rest} className={className}>
                    {children}
                  </code>
                );
              }
            }}
          >
            {raw}
          </ReactMarkdown>
        </div>
      );
    };

    // Prepare content based on collapsed state
    const renderContent = (_role: 'user' | 'assistant') => {
      if (lineCount <= LINE_THRESHOLD || !isCollapsed) {
        return renderMarkdown(message.content);
      }

      // Split content into lines
      const lines = message.content.split('\n');

      // Show first 5 and last 5 lines when collapsed
      const prefixLines = 3;
      const suffixLines = 3;
      const firstLines = lines.slice(0, prefixLines).join('\n');
      const lastLines = lines.slice(-suffixLines).join('\n');

      return (
        <>
          <div className="whitespace-pre-wrap">{firstLines}</div>
          <div
            className="bg-terminal-bg/20 p-2 my-2 text-center rounded cursor-pointer hover:bg-terminal-bg/30 transition-colors"
            onClick={toggleCollapsed}
          >
            <span className="text-xs font-semibold">
              {lineCount - prefixLines - suffixLines} more lines - Click to
              expand
            </span>
          </div>
          <div className="whitespace-pre-wrap">{lastLines}</div>
        </>
      );
    };

    return (
      <div ref={ref} className={`p-4 mb-4 ${messageClass} ${previewClass}`}>
        <div
          className={`
          text-sm max-w-none
          prose prose-terminal prose-sm prose-invert
          prose-p:whitespace-pre-wrap
          prose-code:px-1
          prose-code:py-0.5
          prose-code:m-0
          `}
        >
          {renderContent(message.role)}
        </div>

        {!isPreview && (
          <div className="flex justify-between items-center">
            <div className="flex flex-row text-xs text-gray-500 mt-2">
              {message.sourceModelName && (
                <span className="mr-2">{message.sourceModelName}</span>
              )}
              <span className="mr-4">
                {message.timestamp && (
                  <Link
                    to={`/nodes/${encodeURIComponent(message.nodeId)}`}
                    className="cursor-pointer hover:underline"
                  >
                    {new Date(message.timestamp).toLocaleString()}
                  </Link>
                )}
              </span>
              {previousSibling && (
                <Link to={`/nodes/${encodeURIComponent(previousSibling)}`}>
                  &lt;
                </Link>
              )}
              {siblings && siblings.length > 1 && (
                <div className="mx-1">
                  {currentIndex + 1}/{siblings.length}
                </div>
              )}
              {nextSibling && (
                <Link to={`/nodes/${encodeURIComponent(nextSibling)}`}>
                  &gt;
                </Link>
              )}
            </div>
            {onCopy && (
              <button
                onClick={() =>
                  onCopy(message.content, 'Message content copied')
                }
                className="text-xs px-2 py-1 ml-2 btn opacity-50 hover:opacity-100"
                title="Copy message content"
              >
                copy
              </button>
            )}
          </div>
        )}
      </div>
    );
  }
);
