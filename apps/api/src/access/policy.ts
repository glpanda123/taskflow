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
 *
 * Why two different "no" answers:
 * - 403 forbidden: you are inside the workspace and can see the thing, but your role
 *   doesn't allow this action (a member creating a project).
 * - 404 not-found: you must not even learn that it exists (someone outside the
 *   workspace, or a viewer asking for a project they weren't invited to).
 */
import type { Role } from '@prisma/client';

export type Action = 'project:list' | 'project:create' | 'project:read';

export type Decision = 'allow' | 'forbidden' | 'not-found';

export type Facts = {
  /** The caller's role in the workspace, or null if they are not a member. */
  role: Role | null;
  /** Only for project:read: does the caller have a project_viewers row for this project? */
  invitedToProject?: boolean;
};

export function decide(action: Action, facts: Facts): Decision {
  // TODO(Ly): write this function so that every row of the table above holds.
  // Run `pnpm --filter @taskflow/api test:unit` to check: no database needed.
  throw new Error(`decide(${action}) is not written yet`);
}
