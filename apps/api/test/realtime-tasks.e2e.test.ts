/**
 * Realtime, part 3: every committed task write is announced to the people watching
 * that project as { type: 'task.changed', change, task, actor, from? }. The task in
 * the message is the same object the REST call returned, so a client can put it
 * straight into its cache.
 */
import type { INestApplication } from '@nestjs/common';
import type { Role } from '@prisma/client';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { PrismaService } from '../src/prisma/prisma.service';
import { type Client, closeAll, connect, listen } from './realtime-client';

let app: INestApplication;
let prisma: PrismaService;
let url: string;
const api = () => request(app.getHttpServer());

type Person = { id: string; name: string; token: string };
let ly: Person, minh: Person, vy: Person;
let website: string, mobile: string;
let hero: { id: string; version: number };

async function signUp(name: string): Promise<Person> {
  const res = await api()
    .post('/api/v1/auth/register')
    .send({ name, email: `${name.toLowerCase()}@taskflow.dev`, password: 'password123' })
    .expect(201);
  return { id: res.body.user.id as string, name, token: res.body.accessToken as string };
}

const as = (p: Person) => ({ Authorization: `Bearer ${p.token}` });
const actor = (p: Person) => ({ id: p.id, name: p.name });

async function addMember(workspaceId: string, person: Person, role: Role) {
  await prisma.membership.create({ data: { workspaceId, userId: person.id, role } });
}

async function createProject(workspaceId: string, name: string): Promise<string> {
  const res = await api()
    .post(`/api/v1/workspaces/${workspaceId}/projects`)
    .set(as(ly))
    .send({ name })
    .expect(201);
  return res.body.id as string;
}

/** Opens a socket for `person` on `projectId` and waits until it is subscribed. */
async function watch(person: Person, projectId: string): Promise<Client> {
  const client = await connect(url);
  client.send({ type: 'auth', token: person.token });
  client.send({ type: 'subscribe', projectId });
  expect(await client.next()).toMatchObject({ type: 'presence' });
  return client;
}

/** Throws away what a client has received so far (presence updates from others joining). */
async function drain(client: Client) {
  while ((await client.next(100)) !== 'nothing') {
    // keep reading
  }
}

beforeAll(async () => {
  app = await createApp();
  url = await listen(app);
  prisma = app.get(PrismaService);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE users, workspaces CASCADE');
  ly = await signUp('Ly'); // owner
  minh = await signUp('Minh'); // member
  vy = await signUp('Vy'); // viewer, invited to Website
  const acme = (
    await api().post('/api/v1/workspaces').set(as(ly)).send({ name: 'Acme Studio' }).expect(201)
  ).body.id as string;
  await addMember(acme, minh, 'member');
  await addMember(acme, vy, 'viewer');
  website = await createProject(acme, 'Website');
  mobile = await createProject(acme, 'Mobile');
  await prisma.projectViewer.create({ data: { projectId: website, userId: vy.id } });
  const res = await api()
    .post(`/api/v1/projects/${website}/tasks`)
    .set(as(ly))
    .send({ title: 'Hero banner' })
    .expect(201);
  hero = { id: res.body.id as string, version: res.body.version as number };
});

afterEach(closeAll);

describe('task.changed reaches the people watching the project', () => {
  it('a move: change "moved", the task as REST returned it, who did it, and the old column', async () => {
    const lySocket = await watch(ly, website);
    const res = await api()
      .post(`/api/v1/tasks/${hero.id}/move`)
      .set(as(minh))
      .send({ status: 'in_progress', version: hero.version })
      .expect(200);
    expect(await lySocket.next()).toEqual({
      type: 'task.changed',
      projectId: website,
      change: 'moved',
      task: res.body,
      actor: actor(minh),
      from: 'todo',
    });
  });

  it('a new task: change "created"', async () => {
    const lySocket = await watch(ly, website);
    const res = await api()
      .post(`/api/v1/projects/${website}/tasks`)
      .set(as(minh))
      .send({ title: 'Footer links' })
      .expect(201);
    expect(await lySocket.next()).toEqual({
      type: 'task.changed',
      projectId: website,
      change: 'created',
      task: res.body,
      actor: actor(minh),
    });
  });

  it('an edit: change "updated"', async () => {
    const lySocket = await watch(ly, website);
    const res = await api()
      .patch(`/api/v1/tasks/${hero.id}`)
      .set(as(minh))
      .send({ title: 'Hero banner v2', version: hero.version })
      .expect(200);
    expect(await lySocket.next()).toEqual({
      type: 'task.changed',
      projectId: website,
      change: 'updated',
      task: res.body,
      actor: actor(minh),
    });
  });

  it('the person who made the change gets it too (their other tab needs it)', async () => {
    const minhSocket = await watch(minh, website);
    await api()
      .post(`/api/v1/tasks/${hero.id}/move`)
      .set(as(minh))
      .send({ status: 'done', version: hero.version })
      .expect(200);
    expect(await minhSocket.next()).toMatchObject({
      type: 'task.changed',
      change: 'moved',
      actor: actor(minh),
    });
  });

  it('a viewer who is watching gets it as well', async () => {
    const vySocket = await watch(vy, website);
    await api()
      .post(`/api/v1/tasks/${hero.id}/move`)
      .set(as(minh))
      .send({ status: 'done', version: hero.version })
      .expect(200);
    expect(await vySocket.next()).toMatchObject({ type: 'task.changed', change: 'moved' });
  });
});

describe('task.changed is not sent', () => {
  it('to someone watching another project', async () => {
    const elsewhere = await watch(ly, mobile);
    await api()
      .post(`/api/v1/tasks/${hero.id}/move`)
      .set(as(minh))
      .send({ status: 'done', version: hero.version })
      .expect(200);
    expect(await elsewhere.next()).toBe('nothing');
  });

  it('when the write is refused with 409 (stale version)', async () => {
    const lySocket = await watch(ly, website);
    await api()
      .post(`/api/v1/tasks/${hero.id}/move`)
      .set(as(minh))
      .send({ status: 'done', version: hero.version + 7 })
      .expect(409);
    await api()
      .patch(`/api/v1/tasks/${hero.id}`)
      .set(as(minh))
      .send({ title: 'Nope', version: hero.version + 7 })
      .expect(409);
    expect(await lySocket.next()).toBe('nothing');
  });

  it('when the write is refused with 403 (a viewer) or 422 (bad input)', async () => {
    const lySocket = await watch(ly, website);
    const vySocket = await watch(vy, website);
    await drain(lySocket);
    await api()
      .post(`/api/v1/tasks/${hero.id}/move`)
      .set(as(vy))
      .send({ status: 'done', version: hero.version })
      .expect(403);
    await api()
      .post(`/api/v1/projects/${website}/tasks`)
      .set(as(minh))
      .send({ title: '   ' })
      .expect(422);
    expect(await lySocket.next()).toBe('nothing');
    expect(await vySocket.next()).toBe('nothing');
  });
});
