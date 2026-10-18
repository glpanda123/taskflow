/**
 * Shared building blocks for mock handlers.
 */
import type { paths, Problem, Role, ValidationProblem } from '@taskflow/api-contract';
import { createOpenApiHttp } from 'openapi-msw';
import { db } from './db';

/**
 * MSW's `http`, typed from the contract: only paths in openapi.yaml are accepted,
 * `params`/`request.json()` are typed, and `response(status).json(body)` only compiles
 * if that status + body is declared for the endpoint.
 */
export const http = createOpenApiHttp<paths>({ baseUrl: '/api/v1' });

const PROBLEM_BASE = 'https://taskflow.dev/problems/';

/** Builds an RFC 9457 problem body. `type` is the stable machine-readable part. */
export function problem(status: number, type: string, title: string, detail?: string): Problem {
  return {
    type: PROBLEM_BASE + type,
    title,
    status,
    ...(detail === undefined ? {} : { detail }),
  };
}

export function validationProblem(errors: ValidationProblem['errors']): ValidationProblem {
  return { ...problem(422, 'validation', 'Validation failed'), errors };
}

export type Caller = { userId: string };

/** Reads `Authorization: Bearer <token>`. Returns null when missing or unknown (→ 401). */
export function authenticate(request: Request): Caller | null {
  const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
  const userId = token ? db.sessions.get(token) : undefined;
  return userId ? { userId } : null;
}

export function membershipOf(userId: string, workspaceId: string) {
  return db.memberships.get(workspaceId)?.find((m) => m.userId === userId) ?? null;
}

/** Can this member see the project? Viewers only see projects they were invited to. */
export function canSeeProject(userId: string, projectId: string): boolean {
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) return false;
  const m = membershipOf(userId, project.workspaceId);
  if (!m) return false;
  return m.role !== 'viewer' || (m.projectIds ?? []).includes(projectId);
}

export function roleIn(userId: string, workspaceId: string): Role | null {
  return membershipOf(userId, workspaceId)?.role ?? null;
}

export const canWriteTasks = (role: Role | null) => role !== null && role !== 'viewer';
export const canManage = (role: Role | null) => role === 'owner' || role === 'admin';

export const unauthorized = () => problem(401, 'unauthorized', 'Authentication required');
export const notFound = (what: string) => problem(404, 'not-found', `${what} not found`);
export const forbidden = (detail: string) => problem(403, 'forbidden', 'Not allowed', detail);
