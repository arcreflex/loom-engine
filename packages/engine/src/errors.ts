export class ToolsOnlySupportNSingletonError extends Error {
  constructor(n: number) {
    super(`Tool calling currently only supports n=1 (received n=${n}).`);
    this.name = 'ToolsOnlySupportNSingletonError';
  }
}

export class MaxToolIterationsExceededError extends Error {
  constructor(limit: number) {
    super(
      `Tool recursion exceeded the maximum of ${limit} iterations. This guard prevents runaway tool execution.`
    );
    this.name = 'MaxToolIterationsExceededError';
  }
}

export class UnexpectedToolCallTypeError extends Error {
  constructor(actualType: string, expectedType: string = 'function') {
    super(
      `Unexpected tool call type '${actualType}', expected '${expectedType}'`
    );
    this.name = 'UnexpectedToolCallTypeError';
  }
}

export function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

export function createAbortError(reason?: unknown): Error {
  if (reason instanceof Error) {
    return reason;
  }
  const message =
    typeof reason === 'string'
      ? reason
      : reason != null
        ? String(reason)
        : 'The operation was aborted';
  // DOMException is available in Node 20+, but guard just in case.
  if (typeof DOMException !== 'undefined') {
    return new DOMException(message, 'AbortError');
  }
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError(signal.reason);
  }
}
