/**
 * Tasks, part 1: create and list. Same cast as rbac.e2e: one user per role in Acme,
 * plus an outsider who owns Globex. Rules: openapi.yaml (createTask, listTasks) and
 * docs/architecture/02-data-model.md (rules 1 and 3).
 */
import type { INestApplication } from '@nestjs/common';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { PrismaService } from '../src/prisma/prisma.service';

let app: INestApplication;
let prisma: PrismaService;
const api = () => request(app.getHttpServer());

type Person = { id: string; token: string };
let owner: Person, member: Person, viewer: Person, outsider: Person;
let acme: string, website: string, mobile: string; // workspace + two projects

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

type TaskBody = { id: string; title: string; status: string; position: string };
const items = (res: request.Response) => (res.body as { items: TaskBody[] }).items;
const titles = (res: request.Response) => items(res).map((t) => t.title);

function createTask(projectId: string, by: Person, body: Record<string, unknown>) {
  return api().post(`/api/v1/projects/${projectId}/tasks`).set(as(by)).send(body);
}

beforeAll(async () => {
  app = await createApp();
  await app.init();
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE users, workspaces CASCADE');
  owner = await signUp('Ly');
  member = await signUp('Minh');
  viewer = await signUp('Vy');
  outsider = await signUp('Khoa');
  acme = (
    await api().post('/api/v1/workspaces').set(as(owner)).send({ name: 'Acme Studio' }).expect(201)
  ).body.id as string;
  await addMember(acme, member, 'member');
  await addMember(acme, viewer, 'viewer');
  await api().post('/api/v1/workspaces').set(as(outsider)).send({ name: 'Globex' }).expect(201);
  const project = (name: string) =>
    api()
      .post(`/api/v1/workspaces/${acme}/projects`)
      .set(as(owner))
      .send({ name })
      .expect(201)
      .then((r) => r.body.id as string);
  website = await project('Website');
  mobile = await project('Mobile');
  await prisma.projectViewer.create({ data: { projectId: website, userId: viewer.id } });
});

describe('POST /projects/:id/tasks — create', () => {
  it('creates a task with the contract defaults and a Location header', async () => {
    const res = await createTask(website, member, { title: '  Hero banner  ' }).expect(201);
    expect(res.body).toMatchObject({
      projectId: website,
      title: 'Hero banner',
      description: null,
      status: 'todo',
      priority: 'medium',
      assignee: null,
      dueDate: null,
      labels: [],
      version: 1,
      position: expect.any(String),
    });
    expect(res.headers.location).toBe(`/api/v1/tasks/${res.body.id}`);
  });

  it('keeps the fields it was given', async () => {
    const res = await createTask(website, owner, {
      title: 'Launch',
      description: 'Ship it',
      status: 'in_progress',
      priority: 'high',
      assigneeId: member.id,
      dueDate: '2026-11-20',
    }).expect(201);
    expect(res.body).toMatchObject({
      status: 'in_progress',
      priority: 'high',
      description: 'Ship it',
      dueDate: '2026-11-20',
      assignee: { id: member.id, name: 'Minh' },
    });
  });

  it('refuses a viewer with 403 on a project they can see, and 404 on one they cannot', async () => {
    await createTask(website, viewer, { title: 'Nope' }).expect(403);
    await createTask(mobile, viewer, { title: 'Nope' }).expect(404);
    expect(await prisma.task.count()).toBe(0);
  });

  it('answers an outsider with 404 and writes nothing', async () => {
    await createTask(website, outsider, { title: 'Hijack' }).expect(404);
    await createTask('not-a-uuid', outsider, { title: 'Hijack' }).expect(404);
    expect(await prisma.task.count()).toBe(0);
  });

  it('only assigns people who work in the workspace (422 on assigneeId)', async () => {
    for (const person of [outsider, viewer]) {
      const res = await createTask(website, owner, { title: 'X', assigneeId: person.id }).expect(
        422,
      );
      expect(res.body.errors).toContainEqual(expect.objectContaining({ field: 'assigneeId' }));
    }
  });

  it('validates against the contract: empty title, bad date', async () => {
    await createTask(website, owner, { title: '' }).expect(422);
    const blank = await createTask(website, owner, { title: '   ' }).expect(422);
    expect(blank.body.errors).toContainEqual(expect.objectContaining({ field: 'title' }));
    await createTask(website, owner, { title: 'X', dueDate: '20/11/2026' }).expect(422);
  });

  it('puts each new task at the bottom of its own column', async () => {
    for (const title of ['First', 'Second', 'Third']) {
      await createTask(website, owner, { title }).expect(201);
    }
    await createTask(website, owner, { title: 'Doing', status: 'in_progress' }).expect(201);
    const rows = await prisma.task.findMany({ where: { status: 'todo' } });
    const byTitle = Object.fromEntries(rows.map((t) => [t.title, t.position]));
    expect(byTitle.First! < byTitle.Second! && byTitle.Second! < byTitle.Third!).toBe(true);
  });
});

describe('GET /projects/:id/tasks — list', () => {
  it('returns tasks in board order: column by column, then by position', async () => {
    await createTask(website, owner, { title: 'Review me', status: 'in_review' });
    await createTask(website, owner, { title: 'Todo 1' });
    await createTask(website, owner, { title: 'Done', status: 'done' });
    await createTask(website, owner, { title: 'Todo 2' });
    const res = await api().get(`/api/v1/projects/${website}/tasks`).set(as(member)).expect(200);
    expect(titles(res)).toEqual(['Todo 1', 'Todo 2', 'Review me', 'Done']);
    expect(res.body.nextCursor).toBeNull();
  });

  it('sorts positions byte by byte (COLLATE "C"): "a0Z" comes before "a0a"', async () => {
    // A language collation would put "a0a" first; the client and the mock compare bytes.
    const base = { workspaceId: acme, projectId: website, createdById: owner.id };
    await prisma.task.createMany({
      data: [
        { ...base, title: 'lowercase', position: 'a0a' },
        { ...base, title: 'uppercase', position: 'a0Z' },
      ],
    });
    const res = await api().get(`/api/v1/projects/${website}/tasks`).set(as(owner)).expect(200);
    expect(titles(res)).toEqual(['uppercase', 'lowercase']);

    // The order above also holds on a database whose default collation is already "C";
    // this check fails on any database if the migration loses the COLLATE.
    const [column] = await prisma.$queryRaw<{ collation_name: string | null }[]>`
      SELECT collation_name FROM information_schema.columns
      WHERE table_name = 'tasks' AND column_name = 'position'`;
    expect(column?.collation_name).toBe('C');
  });

  it('lets an invited viewer read, and hides the project from everyone else', async () => {
    await createTask(website, owner, { title: 'Visible' });
    const seen = await api().get(`/api/v1/projects/${website}/tasks`).set(as(viewer)).expect(200);
    expect(titles(seen)).toEqual(['Visible']);
    await api().get(`/api/v1/projects/${mobile}/tasks`).set(as(viewer)).expect(404);
    await api().get(`/api/v1/projects/${website}/tasks`).set(as(outsider)).expect(404);
  });

  it('filters by status and by assignee', async () => {
    await createTask(website, owner, { title: 'A', assigneeId: member.id });
    await createTask(website, owner, { title: 'B', status: 'done' });
    await createTask(website, owner, { title: 'C', status: 'in_progress' });
    const byStatus = await api()
      .get(`/api/v1/projects/${website}/tasks?status=todo&status=done`)
      .set(as(owner))
      .expect(200);
    expect(titles(byStatus)).toEqual(['A', 'B']);
    const byAssignee = await api()
      .get(`/api/v1/projects/${website}/tasks?assigneeId=${member.id}`)
      .set(as(owner))
      .expect(200);
    expect(titles(byAssignee)).toEqual(['A']);
  });

  it('pages with a cursor across columns, without gaps or repeats', async () => {
    const expected = ['T1', 'T2', 'T3', 'P1', 'D1'];
    for (const title of ['T1', 'T2', 'T3']) await createTask(website, owner, { title });
    await createTask(website, owner, { title: 'P1', status: 'in_progress' });
    await createTask(website, owner, { title: 'D1', status: 'done' });

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const url: string = `/api/v1/projects/${website}/tasks?limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const res = await api().get(url).set(as(owner)).expect(200);
      seen.push(...titles(res));
      cursor = res.body.nextCursor as string | null;
      pages++;
    } while (cursor);
    expect(seen).toEqual(expected);
    expect(pages).toBe(3);
  });

  it('rejects a bad cursor, status or limit with 422', async () => {
    const base = `/api/v1/projects/${website}/tasks`;
    await api().get(`${base}?cursor=garbage`).set(as(owner)).expect(422);
    // well-formed JSON, but the id inside is not a UUID: must not reach the database
    const forged = Buffer.from(JSON.stringify({ s: 'todo', p: 'a0', i: 'not-a-uuid' })).toString(
      'base64url',
    );
    await api().get(`${base}?cursor=${forged}`).set(as(owner)).expect(422);
    await api().get(`${base}?status=archived`).set(as(owner)).expect(422);
    await api().get(`${base}?limit=0`).set(as(owner)).expect(422);
  });
});
