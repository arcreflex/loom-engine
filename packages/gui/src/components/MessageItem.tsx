import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { NodeData } from '@ankhdt/loom-engine';
import { type DisplayMessage } from '../types';
import {
  useState,
  useEffect,
  forwardRef,
  ForwardedRef,
  useCallback
} from 'react';
import { useAppContext } from '../state';
import { Link } from 'react-router-dom';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Threshold for collapsing messages (number of lines)
const LINE_THRESHOLD = 30;

interface MessageItemProps {
  message: CoalescedMessage;
  isLast: boolean;
  siblings?: NodeData[];
  isPreview?: boolean;
  onCopy?: (content: string, notice: string) => void;
}

export type CoalescedMessage = {
  role: 'user' | 'assistant' | 'tool';
  messages: DisplayMessage[];
};

type ToolCallInfo = NonNullable<DisplayMessage['tool_calls']>[number];

export const MessageItem = forwardRef(
  (
    { message, siblings, isPreview, isLast, onCopy }: MessageItemProps,
    ref: ForwardedRef<HTMLDivElement>
  ) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const { state } = useAppContext();

    const messageClass =
      message.role === 'user'
        ? 'message-user'
        : message.role === 'tool'
          ? 'message-tool' // No border for tool results - they'll be full width
          : 'message-assistant';
    const previewClass = isPreview ? 'opacity-70 border-l-terminal-border' : '';
    const spacing = message.role === 'tool' ? '' : 'p-4 mb-4';

    const end = message.messages[message.messages.length - 1];
    const currentIndex = siblings?.findIndex(s => s.id === end.nodeId) ?? -1;

    const combinedText = message.messages.map(msg => msg.content).join('');
    const lineCount = combinedText.split('\n').length;

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

    const toggleCollapsed = useCallback(() => {
      setIsCollapsed(!isCollapsed);
    }, [isCollapsed, setIsCollapsed]);

    // Check if any message has tool calls or is a tool result
    const hasToolCalls = message.messages.some(
      msg => msg.tool_calls && msg.tool_calls.length > 0
    );
    const isToolResult = message.role === 'tool';

    return (
      <div ref={ref} className={`${spacing} ${messageClass} ${previewClass}`}>
        {/* Render tool calls for assistant messages */}
        {hasToolCalls &&
          message.messages.map(
            (msg, index) =>
              msg.tool_calls &&
              msg.tool_calls.length > 0 && (
                <div key={`${msg.nodeId}-tools-${index}`} className="mb-4">
                  {msg.tool_calls.map(toolCall => (
                    <ToolCall toolCall={toolCall} key={toolCall.id} />
                  ))}
                </div>
              )
          )}

        {/* Render tool result for tool messages */}
        {isToolResult && (
          <ToolResultDisplay
            content={combinedText}
            toolCallId={message.messages[0]?.tool_call_id}
          />
        )}

        {/* Render normal content if present and not a tool result */}
        {combinedText &&
          !isToolResult &&
          (state.renderingMode === 'raw' ? (
            <RawContent
              role={message.role}
              content={combinedText}
              isCollapsed={isCollapsed}
              toggleCollapsed={toggleCollapsed}
            />
          ) : (
            <MarkdownContent
              content={combinedText}
              isCollapsed={isCollapsed}
              onCopy={onCopy}
              toggleCollapsed={toggleCollapsed}
            />
          ))}

        {!isPreview && (
          <div className="flex justify-between items-center">
            <div className="flex flex-row text-xs text-gray-500 mt-2">
              {end.sourceModelName && (
                <span className="mr-2">{end.sourceModelName}</span>
              )}
              <span className="mr-4">
                {end.timestamp && (
                  <Link
                    to={`/nodes/${encodeURIComponent(end.nodeId)}`}
                    className="cursor-pointer hover:underline"
                  >
                    {new Date(end.timestamp).toLocaleString()}
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
                onClick={() => {
                  onCopy(combinedText, 'Message content copied');
                }}
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

const ToolCall = ({ toolCall }: { toolCall: ToolCallInfo }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <div className="bg-gray-800/50 p-2 rounded">
      <button
        className="flex items-center"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="mr-2">{isExpanded ? '▼' : '▶'}</span>
        <div className="text-xs font-mono text-gray-400">🔧 Tool Call</div>
        <div className="ml-2 text-xs text-gray-300">
          {toolCall.function.name}
        </div>
        {toolCall.id && (
          <span className="ml-2 text-xs text-gray-500">ID: {toolCall.id}</span>
        )}
      </button>
      {isExpanded && toolCall.function.arguments && (
        <pre className="text-xs text-gray-300 bg-gray-900/50 p-2 rounded">
          {JSON.stringify(JSON.parse(toolCall.function.arguments), null, 2)}
        </pre>
      )}
    </div>
  );
};

const ToolResultDisplay = ({
  content,
  toolCallId
}: {
  content: string;
  toolCallId?: string;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center text-sm text-green-400 hover:text-green-300 w-full text-left"
      >
        <span className="mr-2">{isExpanded ? '▼' : '▶'}</span>
        <span className="font-mono">✅ Tool Result</span>
        {toolCallId && (
          <span className="ml-2 text-xs text-gray-500">ID: {toolCallId}</span>
        )}
      </button>
      {isExpanded && content && (
        <pre className="text-xs text-gray-300 bg-gray-800/50 p-2 rounded whitespace-pre-wrap mt-2">
          {content}
        </pre>
      )}
    </div>
  );
};

const MarkdownContent = ({
  content,
  isCollapsed,
  onCopy,
  toggleCollapsed
}: {
  content: string;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
  onCopy?: (content: string, notice: string) => void;
}) => {
  const lines = content.split('\n');
  const lineCount = lines.length;

  if (lineCount <= LINE_THRESHOLD || !isCollapsed) {
    return (
      <div
        className={`
    text-sm max-w-none
    prose prose-terminal prose-sm prose-invert
    prose-p:whitespace-pre-wrap
    prose-code:px-1
    prose-code:py-0.5
    prose-code:m-0`}
      >
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
          {content}
        </ReactMarkdown>
      </div>
    );
  }

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
          {lineCount - prefixLines - suffixLines} more lines - Click to expand
        </span>
      </div>
      <div className="whitespace-pre-wrap">{lastLines}</div>
    </>
  );
};

const RawContent = ({
  role,
  content,
  isCollapsed,
  toggleCollapsed
}: {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  isCollapsed: boolean;
  toggleCollapsed: () => void;
}) => {
  const lines = content.split('\n');
  const lineCount = lines.length;

  const bgClass = role === 'user' ? 'bg-transparent' : '';

  const preClass = `whitespace-pre-wrap font-mono text-sm ${bgClass}`;

  if (lineCount <= LINE_THRESHOLD || !isCollapsed) {
    return <pre className={preClass}>{content}</pre>;
  }

  // Show first 3 and last 3 lines when collapsed
  const prefixLines = 3;
  const suffixLines = 3;
  const firstLines = lines.slice(0, prefixLines).join('\n');
  const lastLines = lines.slice(-suffixLines).join('\n');

  return (
    <>
      <pre className={preClass}>{firstLines}</pre>
      <div
        className="bg-terminal-bg/20 p-2 my-2 text-center rounded cursor-pointer hover:bg-terminal-bg/30 transition-colors"
        onClick={toggleCollapsed}
      >
        <span className="text-xs font-semibold">
          {lineCount - prefixLines - suffixLines} more lines - Click to expand
        </span>
      </div>
      <pre className={preClass}>{lastLines}</pre>
    </>
  );
};
