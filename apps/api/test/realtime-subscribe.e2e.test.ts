/**
 * Realtime, part 2: subscribing to a project and presence.
 * { type: 'subscribe', projectId } follows the same rule as GET on the project: whoever
 * may not read it gets `not_found`. Everyone watching a board is told who else is there.
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
let ly: Person, minh: Person, vy: Person, khoa: Person;
let website: string, mobile: string;

async function signUp(name: string): Promise<Person> {
  const res = await api()
    .post('/api/v1/auth/register')
    .send({ name, email: `${name.toLowerCase()}@taskflow.dev`, password: 'password123' })
    .expect(201);
  return { id: res.body.user.id as string, name, token: res.body.accessToken as string };
}

const as = (p: Person) => ({ Authorization: `Bearer ${p.token}` });

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

/** Opens a socket for `person` and sends `auth`. */
async function join(person: Person): Promise<Client> {
  const client = await connect(url);
  client.send({ type: 'auth', token: person.token });
  return client;
}

/** Opens a socket for `person`, subscribes to `projectId` and returns it with the first reply. */
async function watch(person: Person, projectId: string) {
  const client = await join(person);
  client.send({ type: 'subscribe', projectId });
  return { client, first: await client.next() };
}

const presence = (projectId: string, people: Person[]) => ({
  type: 'presence',
  projectId,
  users: people.map((p) => ({ id: p.id, name: p.name })),
});

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
  ly = await signUp('Ly'); // owner of Acme
  minh = await signUp('Minh'); // member of Acme
  vy = await signUp('Vy'); // viewer in Acme, invited to Website only
  khoa = await signUp('Khoa'); // not in Acme at all
  const acme = (
    await api().post('/api/v1/workspaces').set(as(ly)).send({ name: 'Acme Studio' }).expect(201)
  ).body.id as string;
  await addMember(acme, minh, 'member');
  await addMember(acme, vy, 'viewer');
  website = await createProject(acme, 'Website');
  mobile = await createProject(acme, 'Mobile');
  await prisma.projectViewer.create({ data: { projectId: website, userId: vy.id } });
});

afterEach(closeAll);

describe('subscribe: who is on the board', () => {
  it('a member gets presence with only themselves when nobody else is watching', async () => {
    const { first } = await watch(ly, website);
    expect(first).toEqual(presence(website, [ly]));
  });

  it('when a second person joins, both get presence with both names', async () => {
    const a = await watch(ly, website);
    const b = await watch(minh, website);
    expect(b.first).toEqual(presence(website, [ly, minh]));
    expect(await a.client.next()).toEqual(presence(website, [ly, minh]));
  });

  it('when someone closes their socket, the others get presence without them', async () => {
    const a = await watch(ly, website);
    const b = await watch(minh, website);
    await a.client.next(); // presence with both
    b.client.socket.close();
    expect(await a.client.next()).toEqual(presence(website, [ly]));
  });

  it('one person with two tabs on the same board is listed once', async () => {
    const tab1 = await watch(ly, website);
    const tab2 = await watch(ly, website);
    expect(tab2.first).toEqual(presence(website, [ly]));
    expect(await tab1.client.next()).toEqual(presence(website, [ly]));
    // Closing one tab does not make Ly disappear for Minh.
    const other = await watch(minh, website);
    await tab1.client.next();
    await tab2.client.next();
    tab1.client.socket.close();
    expect(await other.client.next()).toEqual(presence(website, [ly, minh]));
  });
});

describe('subscribe: who may watch', () => {
  it('someone outside the workspace gets not_found and is not listed', async () => {
    const outsider = await watch(khoa, website);
    expect(outsider.first).toEqual({ type: 'error', code: 'not_found' });
    const { first } = await watch(ly, website);
    expect(first).toEqual(presence(website, [ly]));
  });

  it('a project that does not exist, or a malformed id, gets not_found', async () => {
    const client = await join(ly);
    client.send({ type: 'subscribe', projectId: '00000000-0000-4000-8000-000000000000' });
    expect(await client.next()).toEqual({ type: 'error', code: 'not_found' });
    client.send({ type: 'subscribe', projectId: 'not-a-uuid' });
    expect(await client.next()).toEqual({ type: 'error', code: 'not_found' });
    client.send({ type: 'subscribe' });
    expect(await client.next()).toEqual({ type: 'error', code: 'not_found' });
  });

  it('a viewer may watch the project they were invited to, and no other', async () => {
    const invited = await watch(vy, website);
    expect(invited.first).toEqual(presence(website, [vy]));
    const notInvited = await watch(vy, mobile);
    expect(notInvited.first).toEqual({ type: 'error', code: 'not_found' });
  });
});

describe('subscribe: one board per socket', () => {
  it('subscribing to another project leaves the first one', async () => {
    const a = await watch(ly, website);
    const b = await watch(minh, website);
    await a.client.next(); // presence with both
    b.client.send({ type: 'subscribe', projectId: mobile });
    expect(await b.client.next()).toEqual(presence(mobile, [minh]));
    expect(await a.client.next()).toEqual(presence(website, [ly]));
  });
});
