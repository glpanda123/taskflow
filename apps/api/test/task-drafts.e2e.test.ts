/**
 * AI drafting: POST /projects/:projectId/task-drafts turns a brief into task drafts.
 * Nothing is saved; the client creates the drafts the user keeps with createTask.
 * Flow: docs/architecture/03-sequences.md, section 2.
 *
 * Claude is never called here. Every test replaces `draft()` on the TaskDrafter the
 * app holds, so the tests are free, fast and give the same answer every run.
 */
import type { INestApplication } from '@nestjs/common';
import type { Role } from '@prisma/client';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { TaskDrafter } from '../src/ai/task-drafter';
import { createApp } from '../src/app';
import { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication;
let prisma: PrismaService;
let draft: MockInstance<TaskDrafter['draft']>;
const api = () => request(app.getHttpServer());

type Person = { id: string; token: string };
let owner: Person, member: Person, viewer: Person, outsider: Person;
let website: string, mobile: string;

const BRIEF =
  'We launch the new landing page next Friday: hero banner, pricing table, footer links.';

const hero = {
  title: 'Hero banner',
  description: 'Full-width image',
  priority: 'high',
  dueDate: '2026-11-27',
};
const footer = { title: 'Footer links', description: null, priority: 'low', dueDate: null };

async function signUp(name: string): Promise<Person> {
  const res = await api()
    .post('/api/v1/auth/register')
    .send({ name, email: `${name.toLowerCase()}@taskflow.dev`, password: 'password123' })
    .expect(201);
  return { id: res.body.user.id as string, token: res.body.accessToken as string };
}

const as = (p: Person) => ({ Authorization: `Bearer ${p.token}` });

async function addMember(workspaceId: string, person: Person, role: Role) {
  await prisma.membership.create({ data: { workspaceId, userId: person.id, role } });
}

async function createProject(workspaceId: string, name: string): Promise<string> {
  const res = await api()
    .post(`/api/v1/workspaces/${workspaceId}/projects`)
    .set(as(owner))
    .send({ name })
    .expect(201);
  return res.body.id as string;
}

const draftFor = (projectId: string, by: Person | null, body: unknown = { text: BRIEF }) => {
  const req = api().post(`/api/v1/projects/${projectId}/task-drafts`);
  return (by ? req.set(as(by)) : req).send(body as object);
};

const todayUtc = () => new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  // The real drafter is built with the app but never called (see beforeEach).
  process.env.ANTHROPIC_API_KEY ??= 'test-key-never-used';
  app = await createApp();
  await app.init();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  vi.restoreAllMocks();
  // A test that forgets to say what the drafter returns fails loudly instead of calling Claude.
  draft = vi
    .spyOn(app.get(TaskDrafter), 'draft')
    .mockRejectedValue(new Error('draft() was not stubbed in this test'));

  await prisma.$executeRawUnsafe('TRUNCATE users, workspaces CASCADE');
  owner = await signUp('Ly');
  member = await signUp('Minh');
  viewer = await signUp('Vy'); // viewer, invited to Website only
  outsider = await signUp('Khoa'); // not in Acme
  const acme = (
    await api().post('/api/v1/workspaces').set(as(owner)).send({ name: 'Acme Studio' }).expect(201)
  ).body.id as string;
  await addMember(acme, member, 'member');
  await addMember(acme, viewer, 'viewer');
  website = await createProject(acme, 'Website');
  mobile = await createProject(acme, 'Mobile');
  await prisma.projectViewer.create({ data: { projectId: website, userId: viewer.id } });
});

describe('who may draft (refused before any call to the AI provider)', () => {
  it('needs a login (401)', async () => {
    await draftFor(website, null).expect(401);
    expect(draft).not.toHaveBeenCalled();
  });

  it('hides the project (404) from an outsider, a viewer not invited to it, and for an unknown id', async () => {
    await draftFor(website, outsider).expect(404);
    await draftFor(mobile, viewer).expect(404);
    await draftFor('00000000-0000-4000-8000-000000000000', owner).expect(404);
    expect(draft).not.toHaveBeenCalled();
  });

  it('refuses a viewer on the project they can see (403)', async () => {
    await draftFor(website, viewer).expect(403);
    expect(draft).not.toHaveBeenCalled();
  });
});

describe('what may be sent', () => {
  it('needs text of 10 to 4000 characters (422)', async () => {
    await draftFor(website, owner, {}).expect(422);
    await draftFor(website, owner, { text: 'too short' }).expect(422);
    await draftFor(website, owner, { text: 'x'.repeat(4001) }).expect(422);
    expect(draft).not.toHaveBeenCalled();
  });
});

describe('the drafts', () => {
  it('returns the drafts for an owner and for a member', async () => {
    draft.mockResolvedValue([hero, footer]);
    const res = await draftFor(website, owner).expect(200);
    expect(res.body).toEqual({ drafts: [hero, footer] });
    await draftFor(website, member).expect(200);
  });

  it("gives the drafter the brief exactly as written and today's date", async () => {
    draft.mockResolvedValue([hero]);
    await draftFor(website, owner).expect(200);
    expect(draft).toHaveBeenCalledTimes(1);
    expect(draft).toHaveBeenCalledWith({ brief: BRIEF, today: todayUtc() });
  });

  it('drops drafts that break the TaskDraft contract and keeps the rest, in order', async () => {
    draft.mockResolvedValue([
      'not an object',
      { ...hero, title: '' },
      { ...hero, title: '   ' }, // createTask would refuse a blank title too
      { ...hero, title: 'x'.repeat(201) },
      { ...hero, priority: 'urgent' },
      { ...hero, dueDate: 'next Friday' },
      { title: 'No priority', description: null, dueDate: null },
      hero,
      footer,
    ]);
    const res = await draftFor(website, owner).expect(200);
    expect(res.body).toEqual({ drafts: [hero, footer] });
  });

  it('returns at most 20 drafts, the first 20', async () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ ...footer, title: `Task ${i + 1}` }));
    draft.mockResolvedValue(many);
    const res = await draftFor(website, owner).expect(200);
    expect(res.body.drafts).toEqual(many.slice(0, 20));
  });

  it('saves nothing', async () => {
    draft.mockResolvedValue([hero, footer]);
    await draftFor(website, owner).expect(200);
    expect(await prisma.task.count({ where: { projectId: website } })).toBe(0);
  });
});

describe('when the AI provider fails', () => {
  it('answers 503 drafting-unavailable and saves nothing', async () => {
    draft.mockRejectedValue(new Error('provider timed out'));
    const res = await draftFor(website, owner).expect(503);
    expect(res.body).toMatchObject({
      type: 'https://taskflow.dev/problems/drafting-unavailable',
      status: 503,
    });
    expect(await prisma.task.count({ where: { projectId: website } })).toBe(0);
  });
});
