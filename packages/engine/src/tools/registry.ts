import type {
  ToolDefinition,
  ToolHandler,
  ToolGroup,
  ToolInfo
} from './types.ts';
import type { JSONSchema7 } from 'json-schema';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  /**
   * Registers a new tool.
   * @param name - The name of the tool.
   * @param description - A description of what the tool does.
   * @param parameters - The JSON schema for the tool's arguments.
   * @param handler - The function to execute for this tool.
   * @param group - Optional group name for organizing related tools.
   */
  public register(
    name: string,
    description: string,
    parameters: JSONSchema7 & { type: 'object'; [k: string]: unknown },
    handler: ToolHandler,
    group?: string
  ): void {
    if (this.tools.has(name)) {
      console.warn(`Tool "${name}" is being overwritten.`);
    }
    this.tools.set(name, { name, description, parameters, handler, group });
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
  public list(): ToolInfo[] {
    return Array.from(this.tools.values()).map(
      ({ handler: _, ...rest }) => rest
    );
  }

  /**
   * Gets all tool groups.
   * @returns An array of tool groups with their associated tools.
   */
  public getGroups(): ToolGroup[] {
    const groups = new Map<string, ToolGroup>();

    for (const tool of this.tools.values()) {
      if (tool.group) {
        if (!groups.has(tool.group)) {
          groups.set(tool.group, {
            name: tool.group,
            tools: []
          });
        }
        groups.get(tool.group)!.tools.push(tool.name);
      }
    }

    return Array.from(groups.values());
  }

  /**
   * Gets all tools in a specific group.
   * @param groupName - The name of the group.
   * @returns An array of tool names in the group.
   */
  public getToolsInGroup(groupName: string): string[] {
    return Array.from(this.tools.values())
      .filter(tool => tool.group === groupName)
      .map(tool => tool.name);
  }

  /**
   * Gets all ungrouped tools.
   * @returns An array of tool names that don't belong to any group.
   */
  public getUngroupedTools(): string[] {
    return Array.from(this.tools.values())
      .filter(tool => !tool.group)
      .map(tool => tool.name);
  }

  /**
   * Executes a tool.
   * @param name - The name of the tool to execute.
   * @param args - The arguments for the tool.
   * @returns The result of the tool's execution.
   */
  public async execute(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found.`);
    }

    // TODO: Add JSON schema validation for `args` against `tool.parameters`.

    return tool.handler(args);
  }
}
