import { Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { InvitationPreview, WorkspaceMembership } from '@taskflow/api-contract/schema';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard';
import { MembersService } from './members.service';

/**
 * An invitation is addressed by the secret token in its link. The person holding the
 * link is not a member yet, so there is no workspace role to check: the token is the
 * permission to look, and the matching email is the permission to join.
 */
@Controller('invitations/:token')
export class InvitationsController {
  constructor(private readonly members: MembersService) {}

  /** No login needed: the invite page shows this before the person has an account. */
  @Get()
  preview(@Param('token') token: string): Promise<InvitationPreview> {
    return this.members.preview(token);
  }

  @Post('accept')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  accept(@Req() req: AuthedRequest, @Param('token') token: string): Promise<WorkspaceMembership> {
    return this.members.accept(token, req.userId);
  }
}
