/**
 * Roles and tenant isolation, end to end. The cast: one workspace (Acme) with one
 * user per role, plus an outsider who owns a different workspace (Globex).
 * Rules: src/access/policy.ts and docs/architecture/02-data-model.md (rules 1 and 5).
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
let owner: Person, admin: Person, member: Person, viewer: Person, outsider: Person;
let acme: string; // workspace id
let globex: string; // the outsider's own workspace

async function signUp(name: string): Promise<Person> {
  const res = await api()
    .post('/api/v1/auth/register')
    .send({ name, email: `${name.toLowerCase()}@taskflow.dev`, password: 'password123' })
    .expect(201);
  return { id: res.body.user.id as string, token: res.body.accessToken as string };
}

/** The ids (or names) in a project list response, in order. */
const listed = (res: request.Response, key: 'id' | 'name' = 'id') =>
  (res.body as { items: { id: string; name: string }[] }).items.map((p) => p[key]);

const as = (p: Person) => ({ Authorization: `Bearer ${p.token}` });

async function addMember(workspaceId: string, person: Person, role: Role) {
  // Invitations come later; for now memberships are inserted directly.
  await prisma.membership.create({ data: { workspaceId, userId: person.id, role } });
}

async function createProject(workspaceId: string, by: Person, name: string): Promise<string> {
  const res = await api()
    .post(`/api/v1/workspaces/${workspaceId}/projects`)
    .set(as(by))
    .send({ name })
    .expect(201);
  return res.body.id as string;
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
  admin = await signUp('An');
  member = await signUp('Minh');
  viewer = await signUp('Vy');
  outsider = await signUp('Khoa');
  acme = (
    await api().post('/api/v1/workspaces').set(as(owner)).send({ name: 'Acme Studio' }).expect(201)
  ).body.id as string;
  await addMember(acme, admin, 'admin');
  await addMember(acme, member, 'member');
  await addMember(acme, viewer, 'viewer');
  globex = (
    await api().post('/api/v1/workspaces').set(as(outsider)).send({ name: 'Globex' }).expect(201)
  ).body.id as string;
});

describe('POST /workspaces', () => {
  it('makes the creator the owner', async () => {
    const me = await api().get('/api/v1/me').set(as(owner)).expect(200);
    expect(me.body.workspaces).toEqual([
      expect.objectContaining({ id: acme, name: 'Acme Studio', role: 'owner' }),
    ]);
  });

  it('needs a name (422) and a login (401)', async () => {
    await api().post('/api/v1/workspaces').set(as(owner)).send({ name: '' }).expect(422);
    await api().post('/api/v1/workspaces').set(as(owner)).send({ name: '   ' }).expect(422);
    await api().post('/api/v1/workspaces').send({ name: 'Nope' }).expect(401);
  });
});

describe('POST /workspaces/:id/projects — who may create', () => {
  it('lets the owner and an admin create a project', async () => {
    const res = await api()
      .post(`/api/v1/workspaces/${acme}/projects`)
      .set(as(owner))
      .send({ name: 'Website' })
      .expect(201);
    expect(res.body).toMatchObject({ name: 'Website', workspaceId: acme, id: expect.any(String) });

    await api()
      .post(`/api/v1/workspaces/${acme}/projects`)
      .set(as(admin))
      .send({ name: 'Mobile' })
      .expect(201);
  });

  it('refuses a member and a viewer with 403: they are inside, but the role is too low', async () => {
    for (const person of [member, viewer]) {
      const res = await api()
        .post(`/api/v1/workspaces/${acme}/projects`)
        .set(as(person))
        .send({ name: 'Sneaky' })
        .expect(403);
      expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    }
    expect(await prisma.project.count()).toBe(0);
  });

  it('rejects a name that is only spaces (422)', async () => {
    await api()
      .post(`/api/v1/workspaces/${acme}/projects`)
      .set(as(owner))
      .send({ name: '   ' })
      .expect(422);
  });
});

describe('GET /workspaces/:id/projects — who sees what', () => {
  let website: string, mobile: string;
  beforeEach(async () => {
    website = await createProject(acme, owner, 'Website');
    mobile = await createProject(acme, owner, 'Mobile');
    await prisma.projectViewer.create({ data: { projectId: website, userId: viewer.id } });
  });

  it('shows owner, admin and member every project in the workspace', async () => {
    for (const person of [owner, admin, member]) {
      const res = await api()
        .get(`/api/v1/workspaces/${acme}/projects`)
        .set(as(person))
        .expect(200);
      expect(listed(res)).toEqual([website, mobile]);
    }
  });

  it('shows a viewer only the projects they were invited to', async () => {
    const res = await api().get(`/api/v1/workspaces/${acme}/projects`).set(as(viewer)).expect(200);
    expect(listed(res)).toEqual([website]);
  });
});

describe('tenant isolation — another workspace is invisible', () => {
  it("never lists another workspace's projects", async () => {
    await createProject(globex, outsider, 'Globex secret plan');
    await createProject(acme, owner, 'Website');
    const res = await api().get(`/api/v1/workspaces/${acme}/projects`).set(as(owner)).expect(200);
    expect(listed(res, 'name')).toEqual(['Website']);
  });

  it('answers an outsider with 404, not 403, for both reading and writing', async () => {
    await api().get(`/api/v1/workspaces/${acme}/projects`).set(as(outsider)).expect(404);
    await api()
      .post(`/api/v1/workspaces/${acme}/projects`)
      .set(as(outsider))
      .send({ name: 'Hijack' })
      .expect(404);
    expect(await prisma.project.count({ where: { workspaceId: acme } })).toBe(0);
  });

  it('gives the same 404 for a real workspace you are not in and one that does not exist', async () => {
    const notYours = await api()
      .get(`/api/v1/workspaces/${acme}/projects`)
      .set(as(outsider))
      .expect(404);
    const missing = await api()
      .get('/api/v1/workspaces/00000000-0000-4000-8000-000000000000/projects')
      .set(as(outsider))
      .expect(404);
    const garbage = await api()
      .get('/api/v1/workspaces/not-a-uuid/projects')
      .set(as(outsider))
      .expect(404);
    expect(notYours.body.detail).toBe(missing.body.detail);
    expect(garbage.body.detail).toBe(missing.body.detail);
  });
});
