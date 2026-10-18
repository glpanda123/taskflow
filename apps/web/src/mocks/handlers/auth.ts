/**
 * Mock auth. Any seeded user logs in with `password123`.
 * The real API sets the refresh token as an httpOnly cookie; the mock skips that
 * and keeps sessions in memory (a reload logs you out — fine for a prototype).
 */
import type { Session, User } from '@taskflow/api-contract';
import { db, mockId } from '../db';
import { authenticate, http, problem, unauthorized, validationProblem } from '../http';

function startSession(user: User): Session {
  const token = `mock-${crypto.randomUUID()}`;
  db.sessions.set(token, user.id);
  return { accessToken: token, expiresIn: 900, user: publicUser(user) };
}

function publicUser({ id, name, email, avatarUrl }: User): User {
  return { id, name, email, avatarUrl: avatarUrl ?? null };
}

export const authHandlers = [
  http.post('/auth/register', async ({ request, response }) => {
    const body = await request.json();
    if (body.password.length < 8) {
      return response(422).json(
        validationProblem([{ field: 'password', message: 'At least 8 characters' }]),
      );
    }
    if (db.users.some((u) => u.email === body.email)) {
      return response(409).json(problem(409, 'email-taken', 'Email already registered'));
    }
    const user = {
      id: mockId(500 + db.users.length),
      name: body.name,
      email: body.email,
      avatarUrl: null,
      password: body.password,
    };
    db.users.push(user);
    return response(201).json(startSession(user));
  }),

  http.post('/auth/login', async ({ request, response }) => {
    const { email, password } = await request.json();
    const user = db.users.find((u) => u.email === email);
    // Same answer for "no such email" and "wrong password": no account enumeration.
    if (!user || user.password !== password) {
      return response(401).json(problem(401, 'invalid-credentials', 'Wrong email or password'));
    }
    return response(200).json(startSession(user));
  }),

  http.post('/auth/refresh', ({ response }) =>
    // No refresh cookie in the mock: the client should send the user to log in again.
    response(401).json(unauthorized()),
  ),

  http.post('/auth/logout', ({ request, response }) => {
    const token = request.headers.get('authorization')?.replace(/^Bearer /, '');
    if (token) db.sessions.delete(token);
    return response(204).empty();
  }),

  http.get('/me', ({ request, response }) => {
    const caller = authenticate(request);
    const user = caller && db.users.find((u) => u.id === caller.userId);
    if (!user) return response(401).json(unauthorized());
    const workspaces = db.workspaces.flatMap((w) => {
      const m = db.memberships.get(w.id)?.find((x) => x.userId === user.id);
      return m ? [{ ...w, role: m.role }] : [];
    });
    return response(200).json({ user: publicUser(user), workspaces });
  }),
];
