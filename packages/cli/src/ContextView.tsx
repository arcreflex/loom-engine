import { Box, measureElement, Text } from 'ink';
import type { DisplayMessage } from './App.tsx';
import { useEffect, useRef, useState } from 'react';
import wrapAnsi from 'wrap-ansi';
import type { Role } from '@ankhdt/loom-engine';

export function getRoleColor(role: Role | 'system') {
  return role === 'user' ? 'green' : role === 'system' ? 'magenta' : 'cyan';
}

function formatLines(
  messages: DisplayMessage[],
  { width, height, offset }: { width: number; height: number; offset: number }
) {
  const counted = [];
  let totalLineCount = 0;
  for (const msg of messages) {
    const text =
      msg.role == 'user' ? `[USER] ${msg.content}` : `${msg.content}`;
    const wrapped = wrapAnsi(text, width);
    const color = msg.isChildPreview ? 'gray' : getRoleColor(msg.role);

    const lines = wrapped.split('\n');
    totalLineCount += lines.length;
    counted.push({
      lines: lines,
      color,
      key: msg.role === 'system' ? 'system' : msg.nodeId
    });
  }

  const startLine = Math.max(0, totalLineCount - height - offset);

  const out = [];
  let line = 0;

  for (const item of counted) {
    const msgEnd = line + item.lines.length;
    if (msgEnd <= startLine) {
      line += item.lines.length;
      continue;
    }
    let lines = item.lines;
    if (line < startLine) {
      lines = lines.slice(startLine - line);
    }
    if (msgEnd > startLine + height) {
      lines = lines.slice(0, height - line);
    }
    line += item.lines.length;
    out.push({
      color: item.color,
      lines,
      key: item.key
    });
  }

  if (startLine > 0) {
    out.unshift({
      color: 'gray',
      lines: [`(... ${startLine} more lines)`],
      key: 'ellipsis-top'
    });
  }
  if (startLine + height < totalLineCount) {
    out.push({
      color: 'gray',
      lines: [`(... ${totalLineCount - startLine - height} more lines)`],
      key: 'ellipsis-bottom'
    });
  }

  return out;
}

export function ContextView({
  context,
  height
}: {
  context: DisplayMessage[];
  height: number;
}) {
  const [width, setWidth] = useState(Infinity);
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const measured = measureElement(ref.current);
    setWidth(measured.width);
  }, []);

  const items = formatLines(context, {
    width,
    height: height - 2,
    offset: 0
  });

  return (
    <Box ref={ref} flexDirection="column" height={height} overflowY="hidden">
      {items.map(item => {
        return (
          <Text key={item.key} color={item.color}>
            {item.lines.join('\n')}
          </Text>
        );
      })}
      <Box flexGrow={1} />
    </Box>
  );
}
