/**
 * In-memory "database" for the mock API.
 *
 * Lives in the browser tab's memory: every tab has its own copy, and a page reload
 * resets it to this seed. Shapes match the API contract exactly (types are generated
 * from openapi.yaml), so the UI can't tell it apart from the real backend.
 */
import type {
  ActivityEvent,
  Invitation,
  Project,
  Role,
  Task,
  User,
  Workspace,
} from '@taskflow/api-contract';
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
  activity: ActivityEvent[];
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
      name: 'Hana Le',
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
  const brand: Project = {
    id: id(202),
    workspaceId: workspace.id,
    name: 'Brand guidelines',
    createdAt: created,
  };

  // Demo data: three client projects at different stages, so Today has something to say.
  // [title, status, priority, assignee, due in N days (null = no date), labels, description]
  type Row = [
    string,
    Task['status'],
    Task['priority'],
    Assignee | null,
    number | null,
    string[],
    string?,
  ];
  const seedRows: [Project, Row[]][] = [
    [
      website,
      [
        [
          'Write homepage copy',
          'todo',
          'high',
          an!,
          -2,
          ['content'],
          'Hero headline, three benefit blocks and the signup CTA. Client wants a friendly, short tone.',
        ],
        ['Collect client logos', 'todo', 'low', null, 5, []],
        ['Set up analytics', 'todo', 'medium', null, null, ['tech']],
        [
          'Design pricing page',
          'in_progress',
          'high',
          minh!,
          1,
          ['design'],
          'Two plans plus an FAQ. Reuse the card style from the homepage.',
        ],
        ['Build navigation component', 'in_progress', 'medium', ly!, 3, ['frontend']],
        [
          'Fix contact form validation',
          'in_progress',
          'high',
          an!,
          -1,
          ['bug'],
          'Phone numbers with spaces are rejected. Client reported it twice.',
        ],
        ['Review hero illustrations', 'in_review', 'medium', ly!, 2, ['design']],
        ['SEO meta tags', 'in_review', 'low', minh!, 6, ['tech']],
        ['Kick-off meeting notes', 'done', 'low', ly!, -5, []],
        ['Moodboard', 'done', 'medium', minh!, -3, ['design']],
      ],
    ],
    [
      mobile,
      [
        ['App store screenshots', 'todo', 'medium', minh!, 4, ['design']],
        ['Push notification copy', 'todo', 'low', an!, 8, ['content']],
        [
          'Login with phone number',
          'in_progress',
          'high',
          ly!,
          -1,
          ['frontend'],
          'OTP via SMS. Blocked until the client confirms the SMS provider.',
        ],
        ['Offline mode for order list', 'in_progress', 'medium', an!, 6, ['frontend']],
        ['Beta build for client QA', 'in_review', 'high', ly!, 2, ['release']],
        ['Wireframes v2', 'done', 'medium', minh!, -9, ['design']],
        ['Tech stack decision', 'done', 'low', ly!, -12, []],
      ],
    ],
    [
      brand,
      [
        ['Colour palette options', 'in_review', 'medium', minh!, 1, ['design']],
        ['Typography pairing', 'in_progress', 'low', minh!, 5, ['design']],
        ['Logo usage page', 'todo', 'medium', null, 9, ['design']],
        ['Client feedback round 1', 'done', 'medium', ly!, -4, []],
      ],
    ],
  ];

  const tasks: Task[] = [];
  for (const [project, rows] of seedRows) {
    for (const status of ['todo', 'in_progress', 'in_review', 'done'] as const) {
      const inColumn = rows.filter((r) => r[1] === status);
      const keys = generateNKeysBetween(null, null, inColumn.length);
      inColumn.forEach(([title, , priority, assignee, due, labels, description], i) => {
        tasks.push({
          id: id(300 + tasks.length),
          projectId: project.id,
          title,
          description: description ?? null,
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
  }

  // A little history so the activity log isn't empty on first open.
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
  const byTitle = (title: string) => tasks.find((t) => t.title === title)!;
  const activity: ActivityEvent[] = [];
  const log = (
    type: ActivityEvent['type'],
    actor: Assignee,
    title: string,
    changes: ActivityEvent['changes'],
    at: string,
  ) => {
    const task = byTitle(title);
    activity.push({
      id: id(20_000 + activity.length),
      projectId: task.projectId,
      type,
      actor,
      task: { id: task.id, title: task.title },
      changes,
      createdAt: at,
    });
  };
  for (const t of tasks) log('task.created', ly!, t.title, [], created);
  log(
    'task.moved',
    ly!,
    'Kick-off meeting notes',
    [{ field: 'status', from: 'in_progress', to: 'done' }],
    hoursAgo(120),
  );
  log(
    'task.moved',
    minh!,
    'Moodboard',
    [{ field: 'status', from: 'in_review', to: 'done' }],
    hoursAgo(50),
  );
  log(
    'task.updated',
    ly!,
    'Write homepage copy',
    [{ field: 'assignee', from: null, to: 'An Pham' }],
    hoursAgo(30),
  );
  log(
    'task.moved',
    ly!,
    'Review hero illustrations',
    [{ field: 'status', from: 'in_progress', to: 'in_review' }],
    hoursAgo(20),
  );
  log(
    'task.updated',
    an!,
    'Fix contact form validation',
    [{ field: 'priority', from: 'medium', to: 'high' }],
    hoursAgo(6),
  );
  log(
    'task.moved',
    minh!,
    'Design pricing page',
    [{ field: 'status', from: 'todo', to: 'in_progress' }],
    hoursAgo(2),
  );

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
    projects: [website, mobile, brand],
    tasks,
    invitations: [],
    activity,
    sessions: new Map(),
  };
}

export const db: Db = seed();

export function resetDb() {
  Object.assign(db, seed());
}

export { id as mockId, now };
