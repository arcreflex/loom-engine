import type { JSONSchema7 } from 'json-schema';

/**
 * A handler function that executes a tool's logic.
 * @param args - The arguments for the tool, validated against its schema.
 * @returns A promise that resolves to a string (typically JSON) representing the tool's output.
 */
export type ToolHandler = (args: object) => Promise<string>;

/**
 * Defines a tool, including its schema and handler.
 * This structure is compatible with the MCP `Tool` object and provider-native tool definitions.
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema7;
  handler: ToolHandler;
}
