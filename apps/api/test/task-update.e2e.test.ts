/**
 * Tasks, part 2: read one task and edit it with optimistic locking.
 * Rule (docs/architecture/02-data-model.md, rule 2): a write names the version it
 * was based on; if someone saved in between, the answer is 409 with the current task.
 */
import type { INestApplication } from '@nestjs/common';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { PrismaService } from '../src/prisma/prisma.service';
import { TasksService } from '../src/tasks/tasks.service';

let app: INestApplication;
let prisma: PrismaService;
const api = () => request(app.getHttpServer());

type Person = { id: string; token: string };
let owner: Person, member: Person, viewer: Person, outsider: Person;
let acme: string, website: string, mobile: string;
let taskId: string; // "Hero banner" in Website, version 1

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

const patch = (by: Person, body: Record<string, unknown>, id = taskId) =>
  api().patch(`/api/v1/tasks/${id}`).set(as(by)).send(body);

const stored = () => prisma.task.findUniqueOrThrow({ where: { id: taskId } });

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
  taskId = (
    await api()
      .post(`/api/v1/projects/${website}/tasks`)
      .set(as(owner))
      .send({
        title: 'Hero banner',
        description: 'Big picture',
        assigneeId: member.id,
        dueDate: '2026-11-20',
      })
      .expect(201)
  ).body.id as string;
});

describe('GET /tasks/:id', () => {
  it('returns the task to anyone who can see its project', async () => {
    for (const person of [owner, member, viewer]) {
      const res = await api().get(`/api/v1/tasks/${taskId}`).set(as(person)).expect(200);
      expect(res.body).toMatchObject({ id: taskId, title: 'Hero banner', version: 1 });
    }
  });

  it('hides it (404) from an uninvited viewer and from outsiders', async () => {
    const hidden = await api()
      .post(`/api/v1/projects/${mobile}/tasks`)
      .set(as(owner))
      .send({ title: 'Secret' })
      .expect(201);
    await api().get(`/api/v1/tasks/${hidden.body.id}`).set(as(viewer)).expect(404);
    await api().get(`/api/v1/tasks/${taskId}`).set(as(outsider)).expect(404);
    await api().get('/api/v1/tasks/not-a-uuid').set(as(owner)).expect(404);
  });
});

describe('PATCH /tasks/:id — edit with the version you read', () => {
  it('changes only the fields sent, bumps the version, keeps the rest', async () => {
    const res = await patch(member, { version: 1, title: '  New hero  ', priority: 'high' }).expect(
      200,
    );
    expect(res.body).toMatchObject({
      title: 'New hero',
      priority: 'high',
      description: 'Big picture',
      dueDate: '2026-11-20',
      assignee: { id: member.id },
      version: 2,
    });
  });

  it('clears nullable fields with null', async () => {
    const res = await patch(owner, {
      version: 1,
      description: null,
      assigneeId: null,
      dueDate: null,
    }).expect(200);
    expect(res.body).toMatchObject({
      description: null,
      assignee: null,
      dueDate: null,
      version: 2,
    });
  });

  it('rejects a stale version with 409 and the current task, and writes nothing', async () => {
    await patch(owner, { version: 1, title: 'Owner was first' }).expect(200);

    const res = await patch(member, { version: 1, title: 'Member overwrites?' }).expect(409);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.body.current).toMatchObject({ id: taskId, title: 'Owner was first', version: 2 });

    const row = await stored();
    expect(row).toMatchObject({ title: 'Owner was first', version: 2 }); // no lost update
  });

  it('lets the loser retry with the version from the 409 body', async () => {
    await patch(owner, { version: 1, title: 'Owner was first' }).expect(200);
    const conflict = await patch(member, { version: 1, priority: 'low' }).expect(409);
    const retry = await patch(member, {
      version: conflict.body.current.version as number,
      priority: 'low',
    }).expect(200);
    expect(retry.body).toMatchObject({ title: 'Owner was first', priority: 'low', version: 3 });
  });

  it('applies a version at most once, even when two writes both read it', async () => {
    // The race, made deterministic: both callers believe version 1 is current.
    const tasks = app.get(TasksService);
    const results = await Promise.all([
      tasks.updateIfVersion(taskId, 1, { title: 'A' }),
      tasks.updateIfVersion(taskId, 1, { title: 'B' }),
    ]);
    expect(results.sort()).toEqual([false, true]);
    expect((await stored()).version).toBe(2);
  });

  it('lets exactly one of two simultaneous edits win over HTTP', async () => {
    const results = await Promise.all([
      patch(owner, { version: 1, title: 'From Ly' }),
      patch(member, { version: 1, title: 'From Minh' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await stored()).version).toBe(2);
  });

  it('does not bump the version on a 409', async () => {
    await patch(owner, { version: 7, title: 'From the future' }).expect(409);
    expect((await stored()).version).toBe(1);
  });
});

describe('PATCH /tasks/:id — who may edit, and what is valid', () => {
  it('refuses an invited viewer (403) and hides the task from outsiders (404)', async () => {
    await patch(viewer, { version: 1, title: 'Nope' }).expect(403);
    await patch(outsider, { version: 1, title: 'Nope' }).expect(404);
    expect((await stored()).version).toBe(1);
  });

  it('validates the body: version required, at least one change, real values', async () => {
    await patch(owner, { title: 'No version' }).expect(422);
    await patch(owner, { version: 1 }).expect(422); // nothing to change
    await patch(owner, { version: 1, title: '   ' }).expect(422);
    const res = await patch(owner, { version: 1, assigneeId: outsider.id }).expect(422);
    expect(res.body.errors).toContainEqual(expect.objectContaining({ field: 'assigneeId' }));
    expect((await stored()).version).toBe(1);
  });
});
