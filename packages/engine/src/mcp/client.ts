import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ToolRegistry } from '../tools/registry.ts';
import type { JSONSchema7 } from 'json-schema';
import type { ConfigStore } from '../config.ts';

/**
 * Configuration for connecting to an MCP server
 */
export type McpServerConfig =
  | {
      name: string;
      transport: 'stdio';
      command: string;
      args: string[];
      env?: Record<string, string>;
    }
  | {
      name: string;
      transport: 'http';
      url: string;
    };

/**
 * Discovers tools from an MCP server and registers them with the ToolRegistry
 */
async function discoverAndRegisterMcpTools(
  configStore: ConfigStore,
  registry: ToolRegistry,
  serverConfig: McpServerConfig
): Promise<void> {
  configStore.log(
    `[MCP] Connecting to server: ${serverConfig.name} ${JSON.stringify(serverConfig)}`
  );

  try {
    // Create client
    const client = new Client({
      name: 'loom-engine',
      version: '1.0.0'
    });

    // Create transport based on configuration
    if (serverConfig.transport === 'stdio') {
      configStore.log(
        `[MCP] Using stdio transport. CWD: ${configStore.getDataDir()}`
      );
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args || [],
        env: {
          ...serverConfig.env,
          PATH: process.env.PATH || ''
        },
        cwd: configStore.getDataDir()
      });

      await client.connect(transport);
      configStore.log(
        `[MCP] Connected to server via stdio: ${serverConfig.name}`
      );
    } else if (serverConfig.transport === 'http') {
      // HTTP transport implementation would go here
      // For now, we'll focus on stdio which is most common
      throw new Error('HTTP transport not yet implemented');
    } else {
      serverConfig satisfies never;
      throw new Error(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        `Unsupported transport: ${(serverConfig as any).transport}`
      );
    }

    // List available tools from the server
    const toolsResponse = await client.listTools();
    configStore.log(
      `[MCP] Discovered ${toolsResponse.tools.length} tools from ${serverConfig.name}`
    );

    // Register each discovered tool
    for (const tool of toolsResponse.tools) {
      const qualifiedName = `${serverConfig.name}_${tool.name}`;
      // Create a handler that calls back to the MCP server
      const handler = async (args: Record<string, unknown>) => {
        try {
          const result = await client.callTool({
            name: tool.name,
            arguments: args
          });

          if (result.content) {
            if (
              // TODO: this is annoying. `client.callTool`'s type is giving us `unknown` for content.
              // I can see from the code that it's just calling `client.request` and validating & returning the
              // result, but `client.request` gives a better-typed result.
              // Reported the issue here: https://github.com/modelcontextprotocol/typescript-sdk/issues/823
              Array.isArray(result.content) &&
              result.content.length === 1 &&
              result.content[0].type === 'text'
            ) {
              return result.content[0].text;
            }
            return JSON.stringify(result.content);
          } else {
            // If no content, return empty result
            return JSON.stringify({ result: 'Tool executed successfully' });
          }
        } catch (error) {
          configStore.log(
            `[MCP] Tool execution failed for ${qualifiedName}:` + error
          );
          throw error;
        }
      };

      // Register the tool with our registry
      // Ensure the input schema has the required type: 'object' constraint

      // TODO: is this cast valid? is there a more type-safe way to get from this zod object to a JSON schema object?
      const parameters = tool.inputSchema as JSONSchema7 & {
        type: 'object';
        [k: string]: unknown;
      };

      registry.register(
        qualifiedName,
        tool.description ||
          `Tool from MCP server: ${serverConfig.name || 'unknown'}`,
        parameters,
        handler,
        serverConfig.name // Use server name as group
      );

      configStore.log(`[MCP] Registered tool: ${qualifiedName}`);
    }
  } catch (error) {
    configStore.log(
      `[MCP] Failed to discover tools from ${serverConfig.name || 'server'}:` +
        (error instanceof Error ? error.stack : error)
    );
    // Don't throw - allow the engine to continue with other servers or built-in tools
  } finally {
    // Note: We intentionally don't disconnect here because we need to keep the connection
    // alive for tool calls. The client and transport will be cleaned up when the process exits.
    // In a production environment, you might want to implement proper lifecycle management.
  }
}

/**
 * Discovers tools from multiple MCP servers
 */
export async function discoverMcpTools(
  registry: ToolRegistry,
  configStore: ConfigStore
): Promise<void> {
  const config = configStore.get();
  const serverConfigs: McpServerConfig[] = config.mcp_servers || [];

  configStore.log(
    `[MCP] Starting discovery from ${serverConfigs.length} servers`
  );

  // Process servers in parallel for faster startup
  const discoveries = serverConfigs.map(config =>
    discoverAndRegisterMcpTools(configStore, registry, config)
  );

  await Promise.allSettled(discoveries);
  configStore.log('[MCP] Tool discovery completed');
}
