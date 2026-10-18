/**
 * Mock handlers for workspaces, the Today overview and projects.
 */
import type { Project, Task, Workspace } from '@taskflow/api-contract';
import { db, mockId, now } from '../db';
import {
  authenticate,
  canManage,
  canSeeProject,
  forbidden,
  http,
  membershipOf,
  notFound,
  unauthorized,
  validationProblem,
} from '../http';

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export const workspaceHandlers = [
  http.post('/workspaces', async ({ request, response }) => {
    const caller = authenticate(request);
    if (!caller) return response(401).json(unauthorized());
    const { name } = await request.json();
    if (!name.trim()) {
      return response(422).json(
        validationProblem([{ field: 'name', message: 'Name is required' }]),
      );
    }
    const workspace: Workspace = {
      id: mockId(600 + db.workspaces.length),
      name: name.trim(),
      createdAt: now(),
    };
    db.workspaces.push(workspace);
    db.memberships.set(workspace.id, [
      { userId: caller.userId, role: 'owner', projectIds: null, joinedAt: now() },
    ]);
    return response(201).json(workspace);
  }),

  http.get('/workspaces/{workspaceId}/today', ({ params, request, response }) => {
    const caller = authenticate(request);
    if (!caller) return response(401).json(unauthorized());
    if (!membershipOf(caller.userId, params.workspaceId))
      return response(404).json(notFound('Workspace'));

    const visible = db.tasks.filter(
      (t) =>
        db.projects.find((p) => p.id === t.projectId)?.workspaceId === params.workspaceId &&
        canSeeProject(caller.userId, t.projectId),
    );
    const open = visible.filter((t) => t.status !== 'done');
    const byDue = (a: Task, b: Task) => (a.dueDate! < b.dueDate! ? -1 : 1);
    const overdue = open.filter((t) => t.dueDate && t.dueDate < today()).sort(byDue);
    const dueSoon = open
      .filter((t) => t.dueDate && t.dueDate >= today() && t.dueDate <= inDays(7))
      .sort(byDue);

    return response(200).json({
      overdue: overdue.slice(0, 20),
      dueSoon: dueSoon.slice(0, 20),
      counts: {
        overdue: overdue.length,
        dueSoon: dueSoon.length,
        inProgress: visible.filter((t) => t.status === 'in_progress').length,
        unassigned: open.filter((t) => !t.assignee).length,
        doneThisWeek: visible.filter((t) => t.status === 'done').length,
      },
    });
  }),

  http.get('/workspaces/{workspaceId}/projects', ({ params, request, response }) => {
    const caller = authenticate(request);
    if (!caller) return response(401).json(unauthorized());
    if (!membershipOf(caller.userId, params.workspaceId))
      return response(404).json(notFound('Workspace'));
    const items = db.projects.filter(
      (p) => p.workspaceId === params.workspaceId && canSeeProject(caller.userId, p.id),
    );
    return response(200).json({ items });
  }),

  http.post('/workspaces/{workspaceId}/projects', async ({ params, request, response }) => {
    const caller = authenticate(request);
    if (!caller) return response(401).json(unauthorized());
    const m = membershipOf(caller.userId, params.workspaceId);
    if (!m) return response(404).json(notFound('Workspace'));
    if (!canManage(m.role))
      return response(403).json(forbidden('Only owners and admins create projects'));
    const { name } = await request.json();
    if (!name.trim()) {
      return response(422).json(
        validationProblem([{ field: 'name', message: 'Name is required' }]),
      );
    }
    const project: Project = {
      id: mockId(700 + db.projects.length),
      workspaceId: params.workspaceId,
      name: name.trim(),
      createdAt: now(),
    };
    db.projects.push(project);
    return response(201).json(project);
  }),
];
