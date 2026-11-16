import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type {
  Invitation,
  InvitationCreated,
  InviteMemberRequest,
  Member,
} from '@taskflow/api-contract/schema';
import { AccessService } from '../access/access.service';
import { AuthGuard, type AuthedRequest } from '../auth/auth.guard';
import { assertBody } from '../common/contract';
import { MembersService } from './members.service';

@Controller('workspaces/:workspaceId')
@UseGuards(AuthGuard)
export class MembersController {
  constructor(
    private readonly access: AccessService,
    private readonly members: MembersService,
  ) {}

  @Get('members')
  async list(
    @Req() req: AuthedRequest,
    @Param('workspaceId') workspaceId: string,
  ): Promise<{ members: Member[]; invitations: Invitation[] }> {
    await this.access.requireWorkspace(req.userId, workspaceId, 'member:list');
    return this.members.list(workspaceId);
  }

  @Post('invitations')
  @HttpCode(201)
  async invite(
    @Req() req: AuthedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: unknown,
  ): Promise<InvitationCreated> {
    const role = await this.access.requireWorkspace(req.userId, workspaceId, 'member:invite');
    const input = assertBody<InviteMemberRequest>('InviteMemberRequest', body);
    return this.members.invite(workspaceId, { id: req.userId, role }, input);
  }
}
