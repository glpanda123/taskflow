import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { unauthorized } from '../common/problem';
import { verifyAccessToken } from './tokens';

export type AuthedRequest = Request & { userId: string };

/** Requires `Authorization: Bearer <access token>`; puts the user id on the request. */
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    const userId = scheme === 'Bearer' && token ? await verifyAccessToken(token) : null;
    if (!userId) throw unauthorized();
    req.userId = userId;
    return true;
  }
}
