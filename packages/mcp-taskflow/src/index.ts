/**
 * TaskFlow MCP server, stdio transport: the MCP client (Claude Code) starts this file as a
 * child process and talks to it over stdin/stdout. Nothing listens on the network.
 *
 * stdout carries the protocol, so never `console.log` here: log with `console.error`.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TaskflowApi } from './api.ts';
import { registerTools } from './tools.ts';

function env(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value) {
    console.error(`[taskflow-mcp] ${name} is not set`);
    process.exit(1);
  }
  return value;
}

const api = new TaskflowApi({
  baseUrl: env('TASKFLOW_API_URL', 'http://localhost:3001/api/v1').replace(/\/$/, ''),
  email: env('TASKFLOW_EMAIL'),
  password: env('TASKFLOW_PASSWORD'),
});

const server = new McpServer({ name: 'taskflow', version: '0.1.0' });
registerTools(server, api);
await server.connect(new StdioServerTransport());
console.error('[taskflow-mcp] ready on stdio');
