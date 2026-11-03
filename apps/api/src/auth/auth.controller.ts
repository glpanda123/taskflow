import { Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { LoginRequest, RegisterRequest, Session } from '@taskflow/api-contract/schema';
import type { Request, Response } from 'express';
import { assertBody } from '../common/contract';
import { AuthService, type IssuedSession } from './auth.service';
import { REFRESH_TOKEN_TTL_SECONDS } from './tokens';

const COOKIE = 'refresh_token';
const COOKIE_PATH = '/api/v1/auth'; // the browser sends it only to the auth endpoints

function setRefreshCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true, // page JavaScript can't read it, so an XSS bug can't steal it
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    sameSite: 'strict', // not sent on requests from other sites (CSRF)
    path: COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

function send(res: Response, session: IssuedSession): Session {
  setRefreshCookie(res, session.refreshToken);
  return session.body;
}

const cookieOf = (req: Request): string | undefined =>
  (req.cookies as Record<string, string | undefined>)[COOKIE];

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(201)
  async register(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const body = assertBody<RegisterRequest>('RegisterRequest', req.body);
    return send(res, await this.auth.register(body));
  }

  @Post('login')
  @HttpCode(200)
  async login(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const body = assertBody<LoginRequest>('LoginRequest', req.body);
    return send(res, await this.auth.login(body));
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return send(res, await this.auth.refresh(cookieOf(req)));
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(cookieOf(req));
    res.clearCookie(COOKIE, { path: COOKIE_PATH });
  }
}
