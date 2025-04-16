import { Box, Text } from 'ink';
import type { DisplayMessage } from './App.tsx';

export function ContextView({
  context,
  height
}: {
  context: DisplayMessage[];
  height: number;
}) {
  const lineCounts = context.map(msg => msg.content.split('\n').length);
  let totalLineCount = 0;
  const cumulativeLineCounts: number[] = [];
  for (const count of lineCounts) {
    totalLineCount += count;
    cumulativeLineCounts.push(totalLineCount);
  }

  let startLine = totalLineCount - height;
  if (startLine < 0) {
    startLine = 0;
  }
  // If we're omitting lines, add 1 to startLine to account for the ellipsis
  if (startLine > 0) {
    startLine += 1;
  }

  return (
    <Box flexDirection="column" height={height} overflowY="hidden">
      {startLine > 0 && (
        <Text color="gray">{`(... ${totalLineCount - height} more lines ...)\n`}</Text>
      )}
      {context.map((msg, index) => {
        const msgStartLine = cumulativeLineCounts[index] - lineCounts[0];
        const msgEndLine = cumulativeLineCounts[index];
        if (msgEndLine < startLine) {
          return null; // Skip this message
        }
        let text =
          msg.role == 'user' ? `[USER] ${msg.content}` : `${msg.content}`;
        if (msgStartLine < startLine) {
          // Remove the top (startLine - msgStartLine) lines
          const lines = msg.content.split('\n');
          const linesToRemove = startLine - msgStartLine;
          lines.splice(0, linesToRemove);
          text = lines.join('\n');
        }
        const key = msg.role === 'system' ? 'system' : msg.nodeId;

        const color = msg.isChildPreview
          ? 'gray'
          : msg.role === 'user'
            ? 'green'
            : msg.role === 'system'
              ? 'magenta'
              : 'cyan';

        return (
          <Text key={key} color={color}>
            {text}
          </Text>
        );
      })}
      {totalLineCount <= height && <Box flexGrow={1} />}
    </Box>
  );
}
