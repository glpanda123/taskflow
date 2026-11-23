/**
 * A small client for the TaskFlow REST API, used by the MCP tools.
 *
 * The MCP server is just another client of the API, like the web app: it logs in as a
 * real user and goes through the same access checks, tenant isolation and validation.
 * It never touches the database.
 */
import type { Me, Problem, Project, Session } from '@taskflow/api-contract/schema';

export type ApiConfig = {
  /** For example `http://localhost:3001/api/v1` (no trailing slash). */
  baseUrl: string;
  email: string;
  password: string;
  /** Injected in tests; the real `fetch` otherwise. */
  fetch?: typeof fetch;
};

/** An API answer that is not 2xx, with the RFC 9457 problem the API sent back. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: Partial<Problem>;

  constructor(status: number, problem: Partial<Problem>) {
    super(problem.detail ?? problem.title ?? `HTTP ${status}`);
    this.status = status;
    this.problem = problem;
  }
}

export class TaskflowApi {
  // Plain fields, not constructor parameter properties: Node runs this file by stripping
  // the types, and parameter properties are TypeScript syntax that generates code.
  private readonly config: ApiConfig;
  private readonly fetch: typeof fetch;
  private accessToken: string | undefined;

  constructor(config: ApiConfig) {
    this.config = config;
    this.fetch = config.fetch ?? fetch;
  }

  /** The user and the workspaces they belong to. */
  me(): Promise<Me> {
    return this.request<Me>('GET', '/me');
  }

  /** Projects the user can see in one workspace (viewers see only invited ones). */
  async listProjects(workspaceId: string): Promise<Project[]> {
    const page = await this.request<{ items: Project[] }>(
      'GET',
      `/workspaces/${encodeURIComponent(workspaceId)}/projects`,
    );
    return page.items;
  }

  /**
   * Calls the API with the access token. The token lives 15 minutes; on a 401 we log in
   * again once and retry, instead of handling the refresh cookie (each login is a new
   * session on the server, which is fine for a local tool).
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    this.accessToken ??= await this.login();
    let res = await this.send(method, path, body);
    if (res.status === 401) {
      this.accessToken = await this.login();
      res = await this.send(method, path, body);
    }
    return this.parse<T>(res);
  }

  private async login(): Promise<string> {
    const res = await this.fetch(`${this.config.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: this.config.email, password: this.config.password }),
    });
    const session = await this.parse<Session>(res);
    return session.accessToken;
  }

  private send(method: string, path: string, body: unknown): Promise<Response> {
    return this.fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  private async parse<T>(res: Response): Promise<T> {
    if (res.ok) return (await res.json()) as T;
    const problem = (await res.json().catch(() => ({}))) as Partial<Problem>;
    throw new ApiError(res.status, problem);
  }
}
