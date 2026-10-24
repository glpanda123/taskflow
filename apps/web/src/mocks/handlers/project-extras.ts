/** Mock handlers for the draft endpoints: project activity log and AI task drafts. */
import { delay } from 'msw';
import { draftTasksFromText } from '../ai-drafter';
import { db } from '../db';
import {
  authenticate,
  canSeeProject,
  canWriteTasks,
  forbidden,
  http,
  notFound,
  roleIn,
  unauthorized,
  validationProblem,
} from '../http';
import { workspaceOfProject } from './tasks';

export const projectExtraHandlers = [
  http.get('/projects/{projectId}/activity', ({ params, query, request, response }) => {
    const caller = authenticate(request);
    if (!caller) return response(401).json(unauthorized());
    if (!canSeeProject(caller.userId, params.projectId))
      return response(404).json(notFound('Project'));

    const all = db.activity
      .filter((e) => e.projectId === params.projectId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    const limit = Number(query.get('limit') ?? 50);
    const cursor = query.get('cursor');
    const start = cursor ? Number(atob(cursor)) : 0;
    const next = start + limit;
    return response(200).json({
      items: all.slice(start, next),
      nextCursor: next < all.length ? btoa(String(next)) : null,
    });
  }),

  http.post('/projects/{projectId}/task-drafts', async ({ params, request, response }) => {
    const caller = authenticate(request);
    if (!caller) return response(401).json(unauthorized());
    if (!canSeeProject(caller.userId, params.projectId))
      return response(404).json(notFound('Project'));
    if (!canWriteTasks(roleIn(caller.userId, workspaceOfProject(params.projectId)!))) {
      return response(403).json(forbidden('Viewers cannot draft tasks'));
    }

    const { text } = await request.json();
    const trimmed = text?.trim() ?? '';
    if (trimmed.length < 10 || trimmed.length > 4000) {
      return response(422).json(
        validationProblem([{ field: 'text', message: 'Paste between 10 and 4,000 characters' }]),
      );
    }
    await delay(1400); // a model takes a moment; the UI should show it's working
    return response(200).json({ drafts: draftTasksFromText(trimmed) });
  }),
];
