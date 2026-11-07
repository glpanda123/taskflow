/**
 * Tasks, part 3: drag and drop. The client names the neighbours; the server picks the
 * key. Rules: openapi.yaml (moveTask) and docs/architecture/02-data-model.md (rules 2, 3).
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
let owner: Person, viewer: Person, outsider: Person;
let acme: string, website: string, mobile: string;
const ids: Record<string, string> = {}; // title → id

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

async function create(projectId: string, title: string, status = 'todo') {
  const res = await api()
    .post(`/api/v1/projects/${projectId}/tasks`)
    .set(as(owner))
    .send({ title, status })
    .expect(201);
  ids[title] = res.body.id as string;
}

const move = (title: string, body: Record<string, unknown>, by: Person = owner) =>
  api().post(`/api/v1/tasks/${ids[title]}/move`).set(as(by)).send(body);

/** The board as the client sees it: { todo: [titles…], in_progress: […], … }. */
async function board(): Promise<Record<string, string[]>> {
  const res = await api().get(`/api/v1/projects/${website}/tasks`).set(as(owner)).expect(200);
  const columns: Record<string, string[]> = {};
  for (const t of res.body.items as { title: string; status: string }[]) {
    (columns[t.status] ??= []).push(t.title);
  }
  return columns;
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
  viewer = await signUp('Vy');
  outsider = await signUp('Khoa');
  acme = (
    await api().post('/api/v1/workspaces').set(as(owner)).send({ name: 'Acme Studio' }).expect(201)
  ).body.id as string;
  await addMember(acme, viewer, 'viewer');
  const project = async (name: string) =>
    (
      await api()
        .post(`/api/v1/workspaces/${acme}/projects`)
        .set(as(owner))
        .send({ name })
        .expect(201)
    ).body.id as string;
  website = await project('Website');
  mobile = await project('Mobile');
  await prisma.projectViewer.create({ data: { projectId: website, userId: viewer.id } });
  // Website board: todo [A, B, C], in_progress [P]
  for (const title of ['A', 'B', 'C']) await create(website, title);
  await create(website, 'P', 'in_progress');
  await create(mobile, 'M');
});

describe('POST /tasks/:id/move — where the card lands', () => {
  it('reorders inside a column, writing only the moved card', async () => {
    const before = await prisma.task.findMany({ where: { title: { in: ['A', 'B'] } } });
    const res = await move('C', { version: 1, status: 'todo', afterId: ids.A }).expect(200);
    expect(res.body).toMatchObject({ status: 'todo', version: 2 });
    expect((await board()).todo).toEqual(['A', 'C', 'B']);

    // A and B kept their keys and versions: no renumbering of the column
    const after = await prisma.task.findMany({ where: { title: { in: ['A', 'B'] } } });
    expect(after.map((t) => [t.position, t.version]).sort()).toEqual(
      before.map((t) => [t.position, t.version]).sort(),
    );
  });

  it('moves to another column at the bottom when no neighbour is given', async () => {
    await move('A', { version: 1, status: 'in_progress' }).expect(200);
    expect(await board()).toEqual({ todo: ['B', 'C'], in_progress: ['P', 'A'] });
  });

  it('moves to the top of a column with only beforeId', async () => {
    await move('A', { version: 1, status: 'in_progress', beforeId: ids.P }).expect(200);
    expect((await board()).in_progress).toEqual(['A', 'P']);
  });

  it('moves between two given neighbours', async () => {
    await move('P', { version: 1, status: 'todo', afterId: ids.B, beforeId: ids.C }).expect(200);
    expect((await board()).todo).toEqual(['A', 'B', 'P', 'C']);
  });

  it('moves into an empty column', async () => {
    await move('B', { version: 1, status: 'done' }).expect(200);
    expect((await board()).done).toEqual(['B']);
  });
});

describe('POST /tasks/:id/move — conflicts and stale boards', () => {
  it('answers a stale version with 409 and the current task, and moves nothing', async () => {
    await move('A', { version: 1, status: 'in_progress' }).expect(200);
    const res = await move('A', { version: 1, status: 'done' }).expect(409);
    expect(res.body.current).toMatchObject({ status: 'in_progress', version: 2 });
    expect((await board()).done).toBeUndefined();
  });

  it('rejects a neighbour from another column, another project, or the card itself (422)', async () => {
    const wrongColumn = await move('A', { version: 1, status: 'todo', afterId: ids.P }).expect(422);
    expect(wrongColumn.body.errors).toContainEqual(expect.objectContaining({ field: 'afterId' }));
    await move('A', { version: 1, status: 'todo', beforeId: ids.M }).expect(422);
    await move('A', { version: 1, status: 'todo', afterId: ids.A }).expect(422);
    expect((await board()).todo).toEqual(['A', 'B', 'C']);
  });

  it('rejects neighbours in the wrong order (422)', async () => {
    await move('P', { version: 1, status: 'todo', afterId: ids.C, beforeId: ids.A }).expect(422);
  });

  it('validates the body against the contract', async () => {
    await move('A', { status: 'todo' }).expect(422); // no version
    await move('A', { version: 1, status: 'archived' }).expect(422);
    await move('A', { version: 1, status: 'todo', afterId: 'not-a-uuid' }).expect(422);
  });
});

describe('POST /tasks/:id/move — who may move', () => {
  it('refuses an invited viewer (403) and hides the task from outsiders (404)', async () => {
    await move('A', { version: 1, status: 'done' }, viewer).expect(403);
    await move('A', { version: 1, status: 'done' }, outsider).expect(404);
    expect((await board()).todo).toEqual(['A', 'B', 'C']);
  });
});
