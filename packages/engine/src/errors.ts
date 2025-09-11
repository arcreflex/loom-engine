/**
 * Engine-level error classes shared across subsystems.
 *
 * This module centralizes reusable error types that do not belong to a single
 * provider or store implementation. Prefer adding new shared error classes
 * here when they capture a cross-cutting concern or a boundary validation
 * failure that multiple adapters may surface.
 */

/**
 * Thrown when an unexpected tool call type is encountered by an adapter
 */
export class UnexpectedToolCallTypeError extends Error {
  constructor(actualType: string, expectedType: string = 'function') {
    super(
      `Unexpected tool call type '${actualType}', expected '${expectedType}'`
    );
    this.name = 'UnexpectedToolCallTypeError';
  }
}
