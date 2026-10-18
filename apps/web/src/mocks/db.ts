/**
 * In-memory "database" for the mock API.
 *
 * Lives in the browser tab's memory: every tab has its own copy, and a page reload
 * resets it to this seed. Shapes match the API contract exactly (types are generated
 * from openapi.yaml), so the UI can't tell it apart from the real backend.
 */
import type { Invitation, Project, Role, Task, User, Workspace } from '@taskflow/api-contract';
import { generateNKeysBetween } from 'fractional-indexing';

export const DEMO_PASSWORD = 'password123';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Date `days` from today as `YYYY-MM-DD`, so "overdue" and "due soon" always exist. */
function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const now = () => new Date().toISOString();

type Membership = { userId: string; role: Role; projectIds: string[] | null; joinedAt: string };

export type Db = {
  users: (User & { password: string })[];
  workspaces: Workspace[];
  memberships: Map<string, Membership[]>; // by workspaceId
  projects: Project[];
  tasks: Task[];
  invitations: (Invitation & { workspaceId: string })[];
  sessions: Map<string, string>; // access token → userId
};

function seed(): Db {
  const created = '2026-10-01T09:00:00.000Z';
  const users: Db['users'] = [
    {
      id: id(1),
      name: 'Ly Nguyen',
      email: 'ly@taskflow.dev',
      avatarUrl: null,
      password: DEMO_PASSWORD,
    },
    {
      id: id(2),
      name: 'Minh Tran',
      email: 'minh@taskflow.dev',
      avatarUrl: null,
      password: DEMO_PASSWORD,
    },
    {
      id: id(3),
      name: 'An Pham',
      email: 'an@taskflow.dev',
      avatarUrl: null,
      password: DEMO_PASSWORD,
    },
    {
      id: id(4),
      name: 'Client Viewer',
      email: 'viewer@client.dev',
      avatarUrl: null,
      password: DEMO_PASSWORD,
    },
  ];
  type Assignee = NonNullable<Task['assignee']>;
  const [ly, minh, an] = users.map(({ id, name }): Assignee => ({ id, name, avatarUrl: null }));

  const workspace: Workspace = { id: id(100), name: 'Acme Studio', createdAt: created };
  const website: Project = {
    id: id(200),
    workspaceId: workspace.id,
    name: 'Website redesign',
    createdAt: created,
  };
  const mobile: Project = {
    id: id(201),
    workspaceId: workspace.id,
    name: 'Mobile app',
    createdAt: created,
  };

  // [title, status, priority, assignee, due in N days (null = no date), labels]
  const rows: [
    string,
    Task['status'],
    Task['priority'],
    Assignee | null,
    number | null,
    string[],
  ][] = [
    ['Write homepage copy', 'todo', 'high', an!, -2, ['content']],
    ['Collect client logos', 'todo', 'low', null, 5, []],
    ['Set up analytics', 'todo', 'medium', null, null, ['tech']],
    ['Design pricing page', 'in_progress', 'high', minh!, 1, ['design']],
    ['Build navigation component', 'in_progress', 'medium', ly!, 3, ['frontend']],
    ['Fix contact form validation', 'in_progress', 'high', an!, -1, ['bug']],
    ['Review hero illustrations', 'in_review', 'medium', ly!, 2, ['design']],
    ['SEO meta tags', 'in_review', 'low', minh!, 6, ['tech']],
    ['Kick-off meeting notes', 'done', 'low', ly!, -5, []],
    ['Moodboard', 'done', 'medium', minh!, -3, ['design']],
  ];

  const tasks: Task[] = [];
  for (const status of ['todo', 'in_progress', 'in_review', 'done'] as const) {
    const inColumn = rows.filter((r) => r[1] === status);
    const keys = generateNKeysBetween(null, null, inColumn.length);
    inColumn.forEach(([title, , priority, assignee, due, labels], i) => {
      tasks.push({
        id: id(300 + tasks.length),
        projectId: website.id,
        title,
        description: null,
        status,
        priority,
        assignee,
        dueDate: due === null ? null : dayOffset(due),
        labels,
        position: keys[i]!,
        version: 1,
        createdAt: created,
        updatedAt: created,
      });
    });
  }

  return {
    users,
    workspaces: [workspace],
    memberships: new Map([
      [
        workspace.id,
        [
          { userId: id(1), role: 'owner', projectIds: null, joinedAt: created },
          { userId: id(2), role: 'member', projectIds: null, joinedAt: created },
          { userId: id(3), role: 'member', projectIds: null, joinedAt: created },
          { userId: id(4), role: 'viewer', projectIds: [website.id], joinedAt: created },
        ],
      ],
    ]),
    projects: [website, mobile],
    tasks,
    invitations: [],
    sessions: new Map(),
  };
}

export const db: Db = seed();

export function resetDb() {
  Object.assign(db, seed());
}

export { id as mockId, now };
