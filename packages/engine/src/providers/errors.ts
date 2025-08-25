/**
 * Provider-specific error classes for better error handling and observability
 */

/**
 * Thrown when a provider returns an empty response
 */
export class EmptyProviderResponseError extends Error {
  constructor(provider: string) {
    super(`${provider} returned empty response content`);
    this.name = 'EmptyProviderResponseError';
  }
}

/**
 * Thrown when a tool message is malformed
 */
export class MalformedToolMessageError extends Error {
  constructor(
    message: string,
    details?: { index?: number; tool_call_id?: string }
  ) {
    const indexPart =
      details?.index !== undefined ? ` at index ${details.index}` : '';
    const toolIdPart = details?.tool_call_id
      ? ` (tool_call_id: ${details.tool_call_id})`
      : '';
    super(`${message}${indexPart}${toolIdPart}`);
    this.name = 'MalformedToolMessageError';
  }
}

/**
 * Thrown when a message is missing required content
 */
export class MissingMessageContentError extends Error {
  constructor(role: string, index?: number) {
    const indexPart = index !== undefined ? ` at index ${index}` : '';
    super(
      `${role} message${indexPart} has no text content. ${role} messages must contain text.`
    );
    this.name = 'MissingMessageContentError';
  }
}

/**
 * Thrown when Google provider encounters duplicate function names
 */
export class GoogleDuplicateFunctionError extends Error {
  constructor(functionName: string) {
    super(
      `Google provider limitation: Multiple tool calls to the same function '${functionName}' in a single message are not supported. ` +
        `The Google Gemini API does not preserve tool call IDs, making it impossible to correlate tool results correctly. ` +
        `Consider using a different provider or restructuring to avoid multiple calls to the same tool in one turn.`
    );
    this.name = 'GoogleDuplicateFunctionError';
  }
}

/**
 * Thrown when an unexpected tool call type is encountered
 */
export class UnexpectedToolCallTypeError extends Error {
  constructor(actualType: string, expectedType: string = 'function') {
    super(
      `Unexpected tool call type '${actualType}', expected '${expectedType}'`
    );
    this.name = 'UnexpectedToolCallTypeError';
  }
}

/**
 * Thrown when validation fails for assistant messages
 */
export class InvalidAssistantMessageError extends Error {
  constructor(
    message: string = 'Assistant message must have either text content or tool-use blocks'
  ) {
    super(message);
    this.name = 'InvalidAssistantMessageError';
  }
}
