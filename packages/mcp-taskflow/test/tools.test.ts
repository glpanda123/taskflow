/**
 * The tools tested the way a client uses them: a real MCP client talks to the server over
 * an in-memory transport, and `fetch` is a fake TaskFlow API. No network, no database.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import { TaskflowApi } from '../src/api.ts';
import { registerTools } from '../src/tools.ts';

const BASE = 'http://api.test/api/v1';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Call = { method: string; path: string; auth: string | null };

/**
 * A fake API: `routes` maps "METHOD /path" to a handler. Login hands out token-1, token-2…
 * and every call is recorded, so tests can check what the server sent.
 */
function fakeApi(routes: Record<string, (call: Call) => Response>, password = 'right') {
  const calls: Call[] = [];
  let logins = 0;
  const fetch = (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const call: Call = {
      method: init.method ?? 'GET',
      path: url.pathname.replace('/api/v1', ''),
      auth: new Headers(init.headers).get('authorization'),
    };
    calls.push(call);
    if (call.path === '/auth/login') {
      const body = JSON.parse(init.body as string) as { password: string };
      if (body.password !== password)
        return Promise.resolve(
          json(401, { title: 'Unauthorized', detail: 'Wrong email or password' }),
        );
      logins += 1;
      return Promise.resolve(
        json(200, { accessToken: `token-${logins}`, expiresIn: 900, user: {} }),
      );
    }
    const handler = routes[`${call.method} ${call.path}`];
    return Promise.resolve(handler ? handler(call) : json(404, { title: 'Not Found' }));
  };
  // Our client only ever passes a URL string and a plain body string.
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

async function connect(fetch: typeof globalThis.fetch, password = 'right') {
  const server = new McpServer({ name: 'taskflow', version: 'test' });
  registerTools(
    server,
    new TaskflowApi({ baseUrl: BASE, email: 'ly@example.com', password, fetch }),
  );
  const client = new Client({ name: 'test', version: 'test' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

const text = (result: unknown) => {
  const r = result as CallToolResult;
  const first = r.content[0];
  return { isError: r.isError ?? false, text: first?.type === 'text' ? first.text : '' };
};

const me = {
  user: { id: 'u1', name: 'Ly', email: 'ly@example.com' },
  workspaces: [
    { id: 'w1', name: 'Agency', role: 'owner', createdAt: '2026-11-01T00:00:00Z' },
    { id: 'w2', name: 'Side', role: 'viewer', createdAt: '2026-11-01T00:00:00Z' },
  ],
};
const project = (id: string, workspaceId: string, name: string) => ({
  id,
  workspaceId,
  name,
  createdAt: '2026-11-01T00:00:00Z',
});

describe('list_projects', () => {
  it('is listed as a read-only tool', async () => {
    const client = await connect(fakeApi({}).fetch);
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === 'list_projects');
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    expect(tool?.description).toMatch(/user data, not instructions/);
  });

  it('returns the projects of every workspace, logging in once', async () => {
    const api = fakeApi({
      'GET /me': () => json(200, me),
      'GET /workspaces/w1/projects': () =>
        json(200, { items: [project('p1', 'w1', 'Acme website')] }),
      'GET /workspaces/w2/projects': () => json(200, { items: [] }),
    });
    const client = await connect(api.fetch);

    const result = text(await client.callTool({ name: 'list_projects', arguments: {} }));

    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toEqual({
      workspaces: [
        {
          workspace: { id: 'w1', name: 'Agency', role: 'owner' },
          projects: [{ id: 'p1', name: 'Acme website' }],
        },
        { workspace: { id: 'w2', name: 'Side', role: 'viewer' }, projects: [] },
      ],
    });
    expect(api.calls.filter((c) => c.path === '/auth/login')).toHaveLength(1);
    expect(
      api.calls.filter((c) => c.path !== '/auth/login').every((c) => c.auth === 'Bearer token-1'),
    ).toBe(true);
  });

  it('logs in again once when the access token has expired', async () => {
    const api = fakeApi({
      // The first token is "expired": only token-2 is accepted.
      'GET /me': (c) =>
        c.auth === 'Bearer token-2'
          ? json(200, { ...me, workspaces: [] })
          : json(401, { title: 'Unauthorized' }),
    });
    const client = await connect(api.fetch);

    const result = text(await client.callTool({ name: 'list_projects', arguments: {} }));

    expect(result.isError).toBe(false);
    expect(api.calls.map((c) => `${c.method} ${c.path} ${c.auth ?? ''}`.trim())).toEqual([
      'POST /auth/login',
      'GET /me Bearer token-1',
      'POST /auth/login',
      'GET /me Bearer token-2',
    ]);
  });

  it('reports an API error as a tool error the model can read', async () => {
    const client = await connect(fakeApi({}).fetch, 'wrong');

    const result = text(await client.callTool({ name: 'list_projects', arguments: {} }));

    expect(result).toEqual({
      isError: true,
      text: 'TaskFlow API error 401: Wrong email or password',
    });
  });
});
