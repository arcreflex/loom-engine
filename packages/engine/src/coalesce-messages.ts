import type { Message } from './types.ts';

/**
 * Combines adjacent messages of the same role by concatenating their content with a separator.
 *
 * Deprecated: This helper operates on the legacy Message shape and coalesces purely by role adjacency.
 * It does not inspect tool-use semantics and therefore MUST NOT be used when building provider context
 * or anywhere tool correlation matters. For V2 `ContentBlock[]` messages, use
 * `coalesceTextOnlyAdjacent` (engine-utils) which only coalesces adjacent text-only user/assistant
 * messages and never across tool-use or tool messages.
 *
 * @deprecated Use V2-aware coalescing (`coalesceTextOnlyAdjacent`) in engine/provider contexts.
 * @param messages The array of messages to coalesce
 * @param separator The string to use as separator between coalesced message contents, defaults to '\n\n'
 * @returns A new array with coalesced messages, preserving the original order and non-adjacent messages
 */
export function coalesceMessages(
  messages: Message[],
  separator = ''
): Message[] {
  if (!messages.length) return [];

  return messages.reduce((result: Message[], currentMsg: Message) => {
    const prevMsg = result[result.length - 1];

    // If this is the first message or the roles don't match, add it as a new message
    if (!prevMsg || prevMsg.role !== currentMsg.role) {
      result.push({ ...currentMsg });
      return result;
    }

    // If the roles match, combine the content with the separator
    // Handle null content by treating it as empty string
    const prevContent = prevMsg.content ?? '';
    const currentContent = currentMsg.content ?? '';
    prevMsg.content = prevContent + separator + currentContent;
    return result;
  }, []);
}
