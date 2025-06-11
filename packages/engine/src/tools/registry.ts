import type { ToolDefinition, ToolHandler } from './types.ts';
import type { JSONSchema7 } from 'json-schema';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  /**
   * Registers a new tool.
   * @param name - The name of the tool.
   * @param description - A description of what the tool does.
   * @param parameters - The JSON schema for the tool's arguments.
   * @param handler - The function to execute for this tool.
   */
  public register(
    name: string,
    description: string,
    parameters: JSONSchema7 & { type: 'object'; [k: string]: unknown },
    handler: ToolHandler
  ): void {
    if (this.tools.has(name)) {
      console.warn(`Tool "${name}" is being overwritten.`);
    }
    this.tools.set(name, { name, description, parameters, handler });
  }

  /**
   * Retrieves a tool's definition.
   * @param name - The name of the tool to retrieve.
   * @returns The tool's definition, or undefined if not found.
   */
  public get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Lists all registered tools in a format suitable for an LLM provider.
   * @returns An array of tool definitions without their handlers.
   */
  public list(): Omit<ToolDefinition, 'handler'>[] {
    return Array.from(this.tools.values()).map(
      ({ handler: _, ...rest }) => rest
    );
  }

  /**
   * Executes a tool.
   * @param name - The name of the tool to execute.
   * @param args - The arguments for the tool.
   * @returns The result of the tool's execution.
   */
  public async execute(name: string, args: object): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found.`);
    }

    // TODO: Add JSON schema validation for `args` against `tool.parameters`.

    return tool.handler(args);
  }
}
