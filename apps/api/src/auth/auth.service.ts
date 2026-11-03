import { Injectable } from '@nestjs/common';
import type { LoginRequest, RegisterRequest, Session } from '@taskflow/api-contract/schema';
import { Prisma, type User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as argon2 from 'argon2';
import { ProblemException, unauthorized } from '../common/problem';
import { PrismaService } from '../prisma/prisma.service';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  hashRefreshToken,
  newRefreshToken,
  signAccessToken,
} from './tokens';

/** What a login hands back: the JSON body, plus the refresh token for the cookie. */
export type IssuedSession = { body: Session; refreshToken: string };

// Verifying against this when the email is unknown makes "no such user" take as long
// as "wrong password", so response time doesn't reveal which emails have accounts.
const DUMMY_HASH = argon2.hash('not-a-real-password');

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(input: RegisterRequest): Promise<IssuedSession> {
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    try {
      const user = await this.prisma.user.create({
        data: { name: input.name.trim(), email: input.email, passwordHash },
      });
      return this.startSession(user, randomUUID());
    } catch (error) {
      // The UNIQUE constraint on the citext email column decides, not a lookup first:
      // two simultaneous sign-ups with the same email can't both pass.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ProblemException(
          409,
          'email-taken',
          'Email already registered',
          'This email is already registered.',
        );
      }
      throw error;
    }
  }

  async login(input: LoginRequest): Promise<IssuedSession> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const ok = await argon2.verify(user?.passwordHash ?? (await DUMMY_HASH), input.password);
    if (!user || !ok) throw unauthorized('Wrong email or password.');
    return this.startSession(user, randomUUID()); // a new login starts a new family
  }

  /**
   * Rotation: every refresh token works once. Using it marks it used and issues the
   * next one in the same family. Seeing a used token again means two parties hold it
   * (one of them is probably an attacker), so the whole family is revoked.
   */
  async refresh(rawToken: string | undefined): Promise<IssuedSession> {
    if (!rawToken) throw unauthorized();
    const now = new Date();
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(rawToken) },
      include: { user: true },
    });
    if (!token || token.revokedAt || token.expiresAt <= now) throw unauthorized();

    if (token.usedAt) {
      await this.revokeFamily(token.familyId, now);
      throw unauthorized('This session was ended for safety. Please log in again.');
    }

    if (!(await this.claim(token.id, now))) {
      await this.revokeFamily(token.familyId, now);
      throw unauthorized('This session was ended for safety. Please log in again.');
    }

    return this.startSession(token.user, token.familyId);
  }

  /**
   * Marks a token used, but only if it is still unused, in ONE statement. If two
   * requests both read "unused" a moment ago, only one of them gets true here.
   * (Read-then-write in two steps would let both pass: the race behind the 409 rule.)
   */
  async claim(tokenId: string, at: Date): Promise<boolean> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id: tokenId, usedAt: null },
      data: { usedAt: at },
    });
    return result.count === 1;
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(rawToken) },
    });
    if (token) await this.revokeFamily(token.familyId, new Date());
  }

  private async revokeFamily(familyId: string, at: Date) {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: at },
    });
  }

  private async startSession(user: User, familyId: string): Promise<IssuedSession> {
    const refreshToken = newRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });
    return {
      refreshToken,
      body: {
        accessToken: await signAccessToken(user.id),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl },
      },
    };
  }
}
