/**
 * Members and invitations. Rules: openapi.yaml (Members) and
 * docs/architecture/02-data-model.md (invitations: 7 days, token hash only, one pending
 * invitation per email).
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

type Person = { id: string; name: string; email: string; token: string };
let owner: Person, admin: Person, member: Person, viewer: Person, outsider: Person;
let acme: string, website: string, mobile: string, globexProject: string;

async function signUp(name: string): Promise<Person> {
  const email = `${name.toLowerCase()}@taskflow.dev`;
  const res = await api()
    .post('/api/v1/auth/register')
    .send({ name, email, password: 'password123' })
    .expect(201);
  return { id: res.body.user.id as string, name, email, token: res.body.accessToken as string };
}

const as = (p: Person) => ({ Authorization: `Bearer ${p.token}` });

// Join dates are stored to the millisecond; spacing them out keeps the list order certain.
let joinOrder = 0;
async function addMember(workspaceId: string, person: Person, role: Role) {
  const joinedAt = new Date(Date.now() + ++joinOrder * 10);
  await prisma.membership.create({ data: { workspaceId, userId: person.id, role, joinedAt } });
}

async function createProject(workspaceId: string, by: Person, name: string): Promise<string> {
  const res = await api()
    .post(`/api/v1/workspaces/${workspaceId}/projects`)
    .set(as(by))
    .send({ name })
    .expect(201);
  return res.body.id as string;
}

const invite = (body: Record<string, unknown>, by: Person = owner) =>
  api().post(`/api/v1/workspaces/${acme}/invitations`).set(as(by)).send(body);

const list = (by: Person = owner) => api().get(`/api/v1/workspaces/${acme}/members`).set(as(by));

const preview = (token: string) => api().get(`/api/v1/invitations/${token}`);
const accept = (token: string, by: Person) =>
  api().post(`/api/v1/invitations/${token}/accept`).set(as(by));

/** Invites `email` and returns the token from the response. */
async function invitationFor(email: string, body: Record<string, unknown> = { role: 'member' }) {
  const res = await invite({ email, ...body }).expect(201);
  return res.body.token as string;
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
  joinOrder = 0;
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
  website = await createProject(acme, owner, 'Website');
  mobile = await createProject(acme, owner, 'Mobile');
  await prisma.projectViewer.create({ data: { projectId: website, userId: viewer.id } });
  const globex = (
    await api().post('/api/v1/workspaces').set(as(outsider)).send({ name: 'Globex' }).expect(201)
  ).body.id as string;
  globexProject = await createProject(globex, outsider, 'Secret');
});

describe('GET /workspaces/:id/members', () => {
  it('shows every member with role and join date, and the pending invitations', async () => {
    await invitationFor('new@taskflow.dev');
    for (const person of [owner, admin, member, viewer]) {
      const res = await list(person).expect(200);
      const names = (res.body.members as { user: { name: string } }[]).map((m) => m.user.name);
      expect(names).toEqual(['Ly', 'An', 'Minh', 'Vy']);
      expect(res.body.members[0]).toEqual({
        user: { id: owner.id, name: 'Ly', avatarUrl: null },
        role: 'owner',
        projectIds: null,
        joinedAt: expect.any(String),
      });
      expect(res.body.invitations).toEqual([
        {
          id: expect.any(String),
          email: 'new@taskflow.dev',
          role: 'member',
          projectIds: null,
          expiresAt: expect.any(String),
        },
      ]);
    }
  });

  it('lists the projects a viewer was invited to; other roles have null', async () => {
    const res = await list().expect(200);
    const byName = Object.fromEntries(
      (res.body.members as { user: { name: string }; projectIds: string[] | null }[]).map((m) => [
        m.user.name,
        m.projectIds,
      ]),
    );
    expect(byName).toEqual({ Ly: null, An: null, Minh: null, Vy: [website] });
  });

  it('hides the workspace (404) from someone outside it, and needs a login (401)', async () => {
    await list(outsider).expect(404);
    await api().get(`/api/v1/workspaces/${acme}/members`).expect(401);
    await api().get('/api/v1/workspaces/not-a-uuid/members').set(as(owner)).expect(404);
  });
});

describe('POST /workspaces/:id/invitations — who may invite', () => {
  it('lets the owner invite: 201 with the invitation and a token, valid for 7 days', async () => {
    const before = Date.now();
    const res = await invite({ email: 'new@taskflow.dev', role: 'member' }).expect(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      email: 'new@taskflow.dev',
      role: 'member',
      projectIds: null,
      expiresAt: expect.any(String),
      token: expect.any(String),
    });
    expect((res.body.token as string).length).toBeGreaterThanOrEqual(40);
    const days = (new Date(res.body.expiresAt as string).getTime() - before) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
  });

  it('lets an admin invite a member or a viewer, but only the owner invites an admin', async () => {
    await invite({ email: 'a@taskflow.dev', role: 'member' }, admin).expect(201);
    await invite({ email: 'b@taskflow.dev', role: 'viewer', projectIds: [website] }, admin).expect(
      201,
    );
    await invite({ email: 'c@taskflow.dev', role: 'admin' }, admin).expect(403);
    await invite({ email: 'c@taskflow.dev', role: 'admin' }, owner).expect(201);
  });

  it('refuses a member and a viewer (403), an outsider (404) and no login (401)', async () => {
    const body = { email: 'new@taskflow.dev', role: 'member' };
    await invite(body, member).expect(403);
    await invite(body, viewer).expect(403);
    await invite(body, outsider).expect(404);
    await api().post(`/api/v1/workspaces/${acme}/invitations`).send(body).expect(401);
  });
});

describe('POST /workspaces/:id/invitations — what may be sent', () => {
  it('needs projects for a viewer and refuses them for other roles (422)', async () => {
    const noProjects = await invite({ email: 'v@taskflow.dev', role: 'viewer' }).expect(422);
    expect(noProjects.body.errors).toEqual([expect.objectContaining({ field: 'projectIds' })]);
    await invite({ email: 'm@taskflow.dev', role: 'member', projectIds: [website] }).expect(422);
  });

  it("refuses a project that isn't in this workspace (422)", async () => {
    const res = await invite({
      email: 'v@taskflow.dev',
      role: 'viewer',
      projectIds: [website, globexProject],
    }).expect(422);
    expect(res.body.errors).toEqual([expect.objectContaining({ field: 'projectIds' })]);
  });

  it('refuses a malformed email, an unknown role and the owner role (422)', async () => {
    await invite({ email: 'not-an-email', role: 'member' }).expect(422);
    await invite({ email: 'x@taskflow.dev', role: 'boss' }).expect(422);
    await invite({ email: 'x@taskflow.dev', role: 'owner' }).expect(422);
  });

  it('answers 409 for someone who is already a member or already invited', async () => {
    await invite({ email: member.email, role: 'member' }).expect(409);
    await invite({ email: 'new@taskflow.dev', role: 'member' }).expect(201);
    await invite({ email: 'new@taskflow.dev', role: 'viewer', projectIds: [website] }).expect(409);
  });

  it('treats emails that differ only by case as the same', async () => {
    await invite({ email: 'MINH@taskflow.dev', role: 'member' }).expect(409);
    await invite({ email: 'New@Taskflow.dev', role: 'member' }).expect(201);
    await invite({ email: 'new@taskflow.dev', role: 'member' }).expect(409);
  });

  it('stores only a hash of the token', async () => {
    const token = await invitationFor('new@taskflow.dev');
    const rows = await prisma.invitation.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).not.toBe(token);
    expect(JSON.stringify(rows)).not.toContain(token);
  });
});

describe('GET /invitations/:token', () => {
  it('tells what the link is for, without a login', async () => {
    const token = await invitationFor('new@taskflow.dev');
    const res = await preview(token).expect(200);
    expect(res.body).toEqual({
      workspaceName: 'Acme Studio',
      email: 'new@taskflow.dev',
      role: 'member',
      expiresAt: expect.any(String),
    });
  });

  it('answers 404 for an unknown token', async () => {
    await preview('no-such-token').expect(404);
  });
});

describe('POST /invitations/:token/accept', () => {
  let newcomer: Person;
  beforeEach(async () => {
    newcomer = await signUp('Hoa');
  });

  it('makes the invited person a member with the invited role', async () => {
    const token = await invitationFor(newcomer.email, { role: 'member' });
    const res = await accept(token, newcomer).expect(200);
    expect(res.body).toEqual({
      id: acme,
      name: 'Acme Studio',
      createdAt: expect.any(String),
      role: 'member',
    });

    const me = await api().get('/api/v1/me').set(as(newcomer)).expect(200);
    expect(me.body.workspaces).toEqual([expect.objectContaining({ id: acme, role: 'member' })]);
    const members = await list().expect(200);
    expect(members.body.members).toContainEqual(
      expect.objectContaining({ role: 'member', user: expect.objectContaining({ name: 'Hoa' }) }),
    );
    expect(members.body.invitations).toEqual([]);
  });

  it('gives an invited viewer exactly the invited projects', async () => {
    const token = await invitationFor(newcomer.email, { role: 'viewer', projectIds: [website] });
    await accept(token, newcomer).expect(200);
    const projects = await api()
      .get(`/api/v1/workspaces/${acme}/projects`)
      .set(as(newcomer))
      .expect(200);
    const names = (projects.body.items as { name: string }[]).map((p) => p.name);
    expect(names).toEqual(['Website']);
    await api().get(`/api/v1/projects/${mobile}/tasks`).set(as(newcomer)).expect(404);
  });

  it('refuses an account with another email (403) and leaves the invitation usable', async () => {
    const token = await invitationFor(newcomer.email);
    await accept(token, outsider).expect(403);
    await accept(token, newcomer).expect(200);
  });

  it('works once: the same token is 404 afterwards, for the preview too', async () => {
    const token = await invitationFor(newcomer.email);
    await accept(token, newcomer).expect(200);
    await accept(token, newcomer).expect(404);
    await preview(token).expect(404);
  });

  it('is 404 after it expired, and the same email can then be invited again', async () => {
    const token = await invitationFor(newcomer.email);
    await prisma.invitation.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await preview(token).expect(404);
    await accept(token, newcomer).expect(404);
    expect((await list().expect(200)).body.invitations).toEqual([]);

    const fresh = await invitationFor(newcomer.email);
    await accept(fresh, newcomer).expect(200);
  });

  it('needs a login (401) and a real token (404)', async () => {
    const token = await invitationFor(newcomer.email);
    await api().post(`/api/v1/invitations/${token}/accept`).expect(401);
    await accept('no-such-token', newcomer).expect(404);
  });
});
