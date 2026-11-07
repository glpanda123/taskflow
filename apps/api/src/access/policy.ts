/**
 * Who may do what: the whole permission rule of TaskFlow in one pure function.
 * No database, no NestJS: it gets facts and returns a decision, so it is easy to test.
 *
 * The rules (PRD v1.3, docs/architecture/02-data-model.md "Rules" 1 and 5):
 *
 * | Action           | owner | admin | member | viewer                       | not a member |
 * | ---------------- | ----- | ----- | ------ | ---------------------------- | ------------ |
 * | project:list     | allow | allow | allow  | allow (sees invited only)    | not-found    |
 * | project:create   | allow | allow | 403    | 403                          | not-found    |
 * | project:read     | allow | allow | allow  | allow if invited, else 404   | not-found    |
 * | task:create      | allow | allow | allow  | 403 if invited, else 404     | not-found    |
 * | task:update      | allow | allow | allow  | 403 if invited, else 404     | not-found    |
 *
 * Why two different "no" answers:
 * - 403 forbidden: you are inside the workspace and can see the thing, but your role
 *   doesn't allow this action (a member creating a project).
 * - 404 not-found: you must not even learn that it exists (someone outside the
 *   workspace, or a viewer asking for a project they weren't invited to).
 */
import type { Role } from '@prisma/client';

export type Action =
  'project:list' | 'project:create' | 'project:read' | 'task:create' | 'task:update';

export type Decision = 'allow' | 'forbidden' | 'not-found';

export type Facts = {
  /** The caller's role in the workspace, or null if they are not a member. */
  role: Role | null;
  /** For project-level actions: does the caller have a project_viewers row for this project? */
  invitedToProject?: boolean;
};

export function decide(action: Action, facts: Facts): Decision {
  // Outside the workspace: hide everything, for every action.
  if (facts.role === null) return 'not-found';

  switch (action) {
    case 'project:list':
      // Every member may list; viewers get a filtered list (done in the query).
      return 'allow';

    case 'project:create':
      return facts.role === 'owner' || facts.role === 'admin' ? 'allow' : 'forbidden';

    case 'project:read':
      if (facts.role !== 'viewer') return 'allow';
      // A viewer must not learn that a project they weren't invited to exists.
      return facts.invitedToProject === true ? 'allow' : 'not-found';

    case 'task:create':
    case 'task:update':
      if (facts.role === 'viewer') {
        return facts.invitedToProject ? 'forbidden' : 'not-found';
      } else {
        return 'allow';
      }
  }
}
